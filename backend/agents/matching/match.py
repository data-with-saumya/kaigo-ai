"""Matching agent: who can take a care request, and why. Eligibility is decided by rules only."""

from __future__ import annotations

from datetime import datetime, timedelta

from pydantic import BaseModel

from agents.scheduling.availability import free_parts, why_unavailable
from models.domain import (
    ActorType,
    Assignment,
    Caregiver,
    CareRequest,
    Client,
    Factor,
    Segment,
    Shift,
)
from rules.config import load_vertical
from rules.eligibility import hard_check
from rules.scheduling import Interval, covers, merge, subtract, total_hours
from rules.scoring import Piece, score_plan
from services import audit, clock
from services.repository import Store
from services.travel import get_service as travel_service


class NightCoverage(BaseModel):
    index: int
    start: datetime
    end: datetime
    status: str  # full | partial | none
    covered: list[tuple[datetime, datetime]]


class Candidate(BaseModel):
    caregiver_id: str
    name: str
    credential_type: str
    years_experience: int
    area: str
    distance_km: float
    travel_minutes: float | None = None
    travel_source: str = "straight_line"
    previous_visits: int
    nights_full: int
    nights_total: int
    hours_covered: float
    hours_demanded: float
    full_coverage: bool
    nights: list[NightCoverage]
    factors: list[Factor]
    total: int


class Exclusion(BaseModel):
    caregiver_id: str
    name: str
    rule_id: str
    reason: str


class MatchResult(BaseModel):
    request_id: str
    checked: int
    candidates: list[Candidate]
    excluded: list[Exclusion]


def demand_windows(request: CareRequest) -> list[Interval]:
    r = request.requirements
    return [clock.shift_window(r.start_date + timedelta(days=i), r.shift_start, r.shift_end)
            for i in range(r.duration_days)]


def find_candidates(store: Store, request: CareRequest) -> MatchResult:
    r = request.requirements
    config = load_vertical(r.care_type)
    client = store.get(Client, request.client_id)
    shifts = [s for s in store.all(Shift)]
    clients = {c.id: c for c in store.all(Client)}
    own_shift_ids = {s.id for s in shifts if _belongs_to(s, request, store)}
    nights = demand_windows(request)
    work_until = nights[-1][1].date()
    today = clock.today()

    candidates, excluded, eligible = [], [], []
    caregivers = store.all(Caregiver)
    for cg in caregivers:
        failed = hard_check(cg, vertical=r.care_type, required_credentials=r.required_credentials,
                            required_skills=r.required_skills, work_until=work_until, today=today)
        if failed:
            excluded.append(Exclusion(caregiver_id=cg.id, name=cg.name, rule_id=failed.rule_id, reason=failed.detail))
            continue

        pieces, coverage, nights_full, partial_nights = [], [], 0, 0
        for i, night in enumerate(nights, start=1):
            parts = free_parts(cg, night, shifts, config, own_shift_ids)
            pieces += [Piece(cg, s, e) for s, e in parts]
            if covers(night, parts):
                status, nights_full = "full", nights_full + 1
            elif parts:
                status, partial_nights = "partial", partial_nights + 1
            else:
                status = "none"
            coverage.append(NightCoverage(index=i, start=night[0], end=night[1], status=status, covered=parts))
        if not pieces:
            reason = why_unavailable(cg, nights[0], shifts, clients, config, own_shift_ids)
            excluded.append(Exclusion(caregiver_id=cg.id, name=cg.name, rule_id=reason.rule_id, reason=reason.detail))
            continue
        eligible.append((cg, pieces, coverage, nights_full, partial_nights))

    # One route-matrix call for everyone still in the running.
    travel = travel_service().estimates({cg.id: cg.location for cg, *_ in eligible}, client.location)
    for cg, pieces, coverage, nights_full, partial_nights in eligible:
        factors = score_plan(pieces, nights, client, config, r.required_skills, work_until,
                             extra_handoffs=partial_nights, travel=travel)
        covered = total_hours([(p.start, p.end) for p in pieces])
        est = travel[cg.id]
        candidates.append(Candidate(
            caregiver_id=cg.id, name=cg.name, credential_type=cg.credential_type,
            years_experience=cg.years_experience, area=cg.location.area, distance_km=est.km,
            travel_minutes=est.minutes, travel_source=est.source,
            previous_visits=client.visit_history.get(cg.id, 0), nights_full=nights_full,
            nights_total=len(nights), hours_covered=round(covered, 1),
            hours_demanded=round(total_hours(nights), 1), full_coverage=nights_full == len(nights),
            nights=coverage, factors=factors, total=sum(f.points for f in factors)))

    candidates.sort(key=lambda c: (not c.full_coverage, -c.total, c.travel_minutes or c.distance_km))
    return MatchResult(request_id=request.id, checked=len(caregivers), candidates=candidates, excluded=excluded)


def _belongs_to(shift: Shift, request: CareRequest, store: Store) -> bool:
    assignment = store.get(Assignment, shift.assignment_id)
    return bool(assignment and assignment.care_request_id == request.id)


class AssignmentError(Exception):
    pass


def assign(store: Store, request: CareRequest, caregiver_id: str, actor: str) -> tuple[Assignment, list[Shift], str]:
    """Create the assignment and its shifts. Nights the caregiver can't cover stay visibly uncovered."""
    if request.status == "assigned":
        raise AssignmentError("This request already has an assignment.")
    if request.requirements.needs_review:
        raise AssignmentError("Confirm " + ", ".join(f.replace("_", " ") for f in request.requirements.needs_review)
                              + " before assigning.")
    result = find_candidates(store, request)
    candidate = next((c for c in result.candidates if c.caregiver_id == caregiver_id), None)
    if candidate is None:
        reason = next((e.reason for e in result.excluded if e.caregiver_id == caregiver_id), "not eligible")
        raise AssignmentError(f"Can't assign: {reason}")

    now = clock.now()
    r = request.requirements
    assignment = Assignment(id=audit.new_id("AS"), care_request_id=request.id, client_id=request.client_id,
                            vertical=r.care_type, required_skills=r.required_skills,
                            required_credentials=r.required_credentials, created_at=now, updated_at=now)
    shifts = []
    for night in candidate.nights:
        start, end = night.start, night.end
        worked = list(night.covered)
        gaps = subtract([(start, end)], worked)
        segments = [Segment(caregiver_id=caregiver_id, start=a, end=b) for a, b in merge(worked)]
        segments += [Segment(caregiver_id=None, start=a, end=b) for a, b in gaps]
        segments.sort(key=lambda s: s.start)
        shifts.append(Shift(id=f"SH-{assignment.id[3:]}-{night.index:02d}", assignment_id=assignment.id,
                            client_id=request.client_id, index=night.index, start=start, end=end, segments=segments))

    request.status = "assigned"
    store.put_many([assignment, *shifts, request])
    summary = (f"Assigned {candidate.name} to {store.get(Client, request.client_id).name} for "
               f"{candidate.nights_full} of {candidate.nights_total} nights")
    if not candidate.full_coverage:
        summary += f"; {candidate.nights_total - candidate.nights_full} still need cover"
    audit.record(store, ActorType.HUMAN, actor, "assignment.approved", summary, "assignment", assignment.id,
                 {"caregiver_id": caregiver_id, "care_request_id": request.id, "score": candidate.total})
    return assignment, shifts, summary
