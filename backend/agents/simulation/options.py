"""Simulation agent: builds and scores alternative staffing plans for an uncovered shift.

Plans are generated and judged by rules. Gemini only explains them afterwards.
"""

from __future__ import annotations

from datetime import date

from agents.scheduling.availability import free_parts, why_unavailable
from models.domain import (
    Assignment,
    Caregiver,
    CheckResult,
    Client,
    ReplanOption,
    Segment,
    Shift,
)
from rules.config import VerticalConfig, load_vertical
from rules.eligibility import hard_check
from rules.scheduling import Interval, covers, merge, subtract
from rules.scoring import Piece, score_plan
from services.travel import TravelEstimate
from services.travel import get_service as travel_service

MIN_PARTIAL_HOURS = 2
MAX_OPTIONS = 3


def uncovered_parts(shift: Shift) -> list[Interval]:
    return merge([(s.start, s.end) for s in shift.segments if s.caregiver_id is None])


def generate(
    shift: Shift,
    assignment: Assignment,
    client: Client,
    caregivers: list[Caregiver],
    shifts: list[Shift],
    clients: dict[str, Client],
    exclude_ids: set[str],
    today: date,
) -> tuple[list[ReplanOption], list[dict]]:
    """Return up to three options (feasible first, best first) and the caregivers ruled out."""
    config = load_vertical(assignment.vertical)
    demand = uncovered_parts(shift)
    if not demand:
        return [], []
    window: Interval = (demand[0][0], demand[-1][1])
    work_until = shift.end.date()

    eligible: list[tuple[Caregiver, list[Interval]]] = []
    excluded: list[dict] = []
    for cg in caregivers:
        if cg.id in exclude_ids:
            continue
        failed = hard_check(cg, vertical=assignment.vertical, required_credentials=assignment.required_credentials,
                            required_skills=assignment.required_skills, work_until=work_until, today=today)
        if failed:
            excluded.append({"caregiver_id": cg.id, "name": cg.name, "rule_id": failed.rule_id, "reason": failed.detail})
            continue
        parts = [p for d in demand for p in free_parts(cg, d, shifts, config, {shift.id})]
        if not parts:
            why = why_unavailable(cg, window, shifts, clients, config, {shift.id})
            excluded.append({"caregiver_id": cg.id, "name": cg.name, "rule_id": why.rule_id, "reason": why.detail})
            continue
        eligible.append((cg, parts))

    travel = travel_service().estimates({cg.id: cg.location for cg, _ in eligible}, client.location)
    plans: list[tuple[str, list[Piece]]] = []
    for cg, parts in eligible:
        if all(covers(d, parts) for d in demand):
            plans.append(("single", [Piece(cg, s, e) for s, e in demand]))

    # Partial cover anchored at either end of a single gap, completed by a second caregiver.
    if len(demand) == 1:
        start, end = demand[0]
        for cg, parts in eligible:
            for p_start, p_end in merge(parts):
                hours = (p_end - p_start).total_seconds() / 3600
                if hours < MIN_PARTIAL_HOURS or (p_start == start and p_end == end):
                    continue
                if p_start == start or p_end == end:
                    plans.append(("partial", [Piece(cg, p_start, p_end)]))
                    rest = subtract([(start, end)], [(p_start, p_end)])
                    if len(rest) != 1:
                        continue
                    for other, other_parts in eligible:
                        if other.id != cg.id and covers(rest[0], other_parts):
                            pieces = sorted([Piece(cg, p_start, p_end), Piece(other, *rest[0])], key=lambda p: p.start)
                            plans.append(("split", pieces))

    unique: dict[tuple, tuple[str, list[Piece]]] = {}
    for kind, pieces in plans:
        unique.setdefault(tuple((p.caregiver.id, p.start, p.end) for p in pieces), (kind, pieces))
    options = [_build(kind, pieces, demand, client, assignment, config, work_until, travel)
               for kind, pieces in unique.values()]
    feasible = sorted((o for o in options if o.feasible), key=lambda o: (-o.total, len(o.caregiver_ids)))
    infeasible = sorted((o for o in options if not o.feasible), key=lambda o: (-_familiarity(o), -o.total))

    # One partial plan stays visible for transparency when it keeps a familiar face.
    keep_partial = bool(infeasible) and _familiarity(infeasible[0]) > 0
    limit = MAX_OPTIONS - (1 if keep_partial else 0)
    chosen: list[ReplanOption] = feasible[:1]
    # Then the best plan of a different shape, so the coordinator sees a real trade-off.
    shape = next((o for o in feasible[1:] if o.kind != chosen[0].kind), None) if chosen else None
    if shape is not None and len(chosen) < limit:
        chosen.append(shape)
    for option in feasible:
        if len(chosen) >= limit:
            break
        if all(option is not c for c in chosen):
            chosen.append(option)
    if keep_partial:
        chosen.append(infeasible[0])

    for label, option in zip("ABC", chosen, strict=False):
        option.id = label
    excluded.sort(key=lambda e: e["rule_id"])
    return chosen, excluded


def _familiarity(option: ReplanOption) -> int:
    return next(f.points for f in option.factors if f.key == "familiarity")


def _build(kind: str, pieces: list[Piece], demand: list[Interval], client: Client, assignment: Assignment,
           config: VerticalConfig, work_until: date, travel: dict[str, TravelEstimate]) -> ReplanOption:
    covered = [(p.start, p.end) for p in pieces]
    gaps = subtract(demand, covered)
    people = list(dict.fromkeys(p.caregiver.id for p in pieces))
    extra_handoffs = (len(pieces) - 1) + (1 if gaps else 0)
    factors = score_plan(pieces, demand, client, config, assignment.required_skills, work_until, extra_handoffs,
                         travel=travel)

    violations = []
    if gaps and config.require_full_coverage:
        span = ", ".join(f"{a:%H:%M}–{b:%H:%M}" for a, b in gaps)
        violations.append(CheckResult(rule_id="C-01", label="Fails the full-coverage rule", passed=False,
                                      severity="block", detail=f"Leaves {span} uncovered."))

    first = {p.caregiver.id: p.caregiver.name.split()[0] for p in pieces}
    if kind == "split":
        title = f"{first[pieces[0].caregiver.id]}, then {first[pieces[1].caregiver.id]} at {pieces[1].start:%H:%M}"
    elif kind == "partial":
        title = f"{pieces[0].caregiver.name} only"
    else:
        title = f"{pieces[0].caregiver.name}, full shift"

    pros, cons = [], []
    total_hours = sum((b - a).total_seconds() for a, b in demand) / 3600
    if not gaps:
        pros.append(f"Covers all {total_hours:g} hours" + (" with one caregiver" if len(people) == 1 else ""))
    for p in pieces:
        visits = client.visit_history.get(p.caregiver.id, 0)
        name = first[p.caregiver.id]
        if visits:
            when = "" if len(pieces) == 1 else f" for {p.start:%H:%M}–{p.end:%H:%M}"
            pros.append(f"{name} knows {client.name} from {visits} visit{'s' if visits > 1 else ''}{when}")
        elif len(pieces) == 1:
            cons.append(f"{name} has never cared for {client.name}")
        est = travel.get(p.caregiver.id)
        if est and est.minutes is not None and est.minutes <= config.travel_full_within_min:
            pros.append(f"{name} is close by, {est.minutes:.0f} min by road")
        elif est and est.minutes is None and est.km <= 3:
            pros.append(f"{name} is close by, {est.km:.1f} km away")
    if len(pieces) > 1:
        cons.append(f"One extra handover at {pieces[1].start:%H:%M}")
    for v in violations:
        cons.append(f"{v.detail.rstrip('.')} (rule {v.rule_id})")

    return ReplanOption(
        id="?", kind=kind, title=title,
        segments=[Segment(caregiver_id=p.caregiver.id, start=p.start, end=p.end) for p in pieces]
                 + [Segment(caregiver_id=None, start=a, end=b) for a, b in gaps],
        caregiver_ids=people, feasible=not violations, violations=violations, factors=factors,
        total=sum(f.points for f in factors), pros=pros, cons=cons)
