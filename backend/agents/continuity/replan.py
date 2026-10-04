"""Continuity agent: from a change event to an approved, updated care state.

understand event -> find affected shifts -> recheck constraints -> generate options
-> coordinator decides -> revalidate -> write new state + audit
"""

from __future__ import annotations

from agents.scheduling.availability import free_parts
from agents.simulation.options import generate
from models.domain import (
    ActorType,
    Assignment,
    Caregiver,
    ChangeEvent,
    Client,
    Decision,
    EventType,
    Segment,
    Shift,
)
from rules.config import load_vertical
from rules.eligibility import hard_check
from rules.scheduling import covers
from services import audit, clock
from services.repository import Store


class DecisionError(Exception):
    """The decision can't be applied as asked (wrong state, infeasible option)."""


class StaleStateError(Exception):
    """The care state changed since the options were built; fresh options were generated."""

    def __init__(self, message: str, event: ChangeEvent):
        super().__init__(message)
        self.event = event


def find_affected(store: Store, event: ChangeEvent) -> list[Shift]:
    parsed = event.parsed
    if not parsed or not parsed.caregiver_id:
        return []
    now = clock.now()
    mine = [s for s in store.all(Shift)
            if s.end > now and any(seg.caregiver_id == parsed.caregiver_id for seg in s.segments)]
    if parsed.event_type in (EventType.CANCELLATION, EventType.SHIFT_CHANGE, EventType.URGENT_COVERAGE):
        return sorted((s for s in mine if parsed.date and s.start.date() == parsed.date), key=lambda s: s.start)
    if parsed.event_type == EventType.CREDENTIAL_EXPIRY:
        return sorted((s for s in mine if parsed.date and s.end.date() >= parsed.date), key=lambda s: s.start)
    return []


def open_event(store: Store, event: ChangeEvent, threshold: float = 0.85) -> ChangeEvent:
    """Detect impact and build replacement options. Low-confidence events wait for a person."""
    parsed = event.parsed
    if parsed is None or parsed.confidence < threshold or parsed.caregiver_id is None or parsed.date is None:
        event.status = "needs_review"
        event.review_reason = _review_reason(event)
        store.put(event)
        audit.record(store, ActorType.RULE, "Rule E-01", "event.review",
                     f"Sent message to a person to confirm: {event.review_reason}", "event", event.id)
        return event

    affected = find_affected(store, event)
    caregivers = {c.id: c for c in store.all(Caregiver)}
    who = caregivers.get(parsed.caregiver_id)
    if not affected:
        event.status = "no_impact"
        event.impact_summary = f"No upcoming shifts for {who.name if who else parsed.caregiver_name} on {clock.day_label(parsed.date)}."
        store.put(event)
        audit.record(store, ActorType.RULE, "Rule S-04", "event.no_impact", event.impact_summary, "event", event.id)
        return event

    shift = affected[0]
    assignment = store.get(Assignment, shift.assignment_id)
    client = store.get(Client, shift.client_id)
    nights = len([s for s in store.all(Shift) if s.assignment_id == assignment.id])
    released = [seg for seg in shift.segments if seg.caregiver_id == parsed.caregiver_id]
    shift.segments = sorted(
        [seg for seg in shift.segments if seg.caregiver_id != parsed.caregiver_id]
        + [Segment(caregiver_id=None, start=seg.start, end=seg.end) for seg in released],
        key=lambda seg: seg.start)
    store.put(shift)

    gap = ", ".join(f"{seg.start:%H:%M}–{seg.end:%H:%M}" for seg in released)
    event.affected_shift_ids = [s.id for s in affected]
    event.assignment_id = assignment.id
    event.assignment_version = assignment.version
    event.impact_summary = (f"{who.name} was the only caregiver on shift {shift.index} of {nights} for {client.name} "
                            f"({clock.day_label(shift.start)}), so {gap} is now uncovered.")
    if len(affected) > 1:
        event.impact_summary += f" {len(affected) - 1} more shift(s) are affected and listed for follow-up."
    audit.record(store, ActorType.RULE, "Rule S-04", "event.impact",
                 f"Found affected assignment: {client.name}, shift {shift.index} of {nights}; marked {gap} uncovered",
                 "shift", shift.id, {"event_id": event.id})

    _attach_options(store, event, shift, assignment, client, exclude={parsed.caregiver_id})
    store.put(event)
    return event


def _attach_options(store: Store, event: ChangeEvent, shift: Shift, assignment: Assignment, client: Client,
                    exclude: set[str]) -> None:
    caregivers = store.all(Caregiver)
    options, excluded = generate(shift, assignment, client, caregivers, store.all(Shift),
                                 {c.id: c for c in store.all(Client)}, exclude, clock.today())
    event.options = options
    event.excluded = excluded
    event.explanation = None
    feasible = [o for o in options if o.feasible]
    event.recommended_option_id = feasible[0].id if feasible else None
    event.status = "open" if feasible else "no_feasible_option"
    checked = len(caregivers) - len(exclude)
    summary = (f"Rechecked {checked} caregivers: {len(feasible)} feasible plan{'s' if len(feasible) != 1 else ''}"
               + (f", {len(options) - len(feasible)} partial" if len(options) > len(feasible) else "")
               + ("" if feasible else ". No feasible replacement: escalate or widen the search"))
    audit.record(store, ActorType.RULE, "Rule C-01", "event.options", summary, "event", event.id,
                 {"options": [{"id": o.id, "title": o.title, "total": o.total, "feasible": o.feasible} for o in options]})


def decide(store: Store, event_id: str, action: str, option_id: str | None, note: str | None, actor: str) -> ChangeEvent:
    event = store.get(ChangeEvent, event_id)
    if event is None:
        raise DecisionError("Event not found.")
    if event.status not in ("open", "no_feasible_option"):
        raise DecisionError(f"This event is already {event.status.replace('_', ' ')}.")
    assignment = store.get(Assignment, event.assignment_id)
    shift = store.get(Shift, event.affected_shift_ids[0])
    client = store.get(Client, shift.client_id)
    now = clock.now()

    if assignment.version != event.assignment_version:
        _attach_options(store, event, shift, assignment, client, exclude={event.parsed.caregiver_id})
        event.assignment_version = assignment.version
        store.put(event)
        raise StaleStateError("The schedule changed since these options were built. Fresh options are ready.", event)

    if action == "rejected":
        event.status = "rejected"
        event.decision = Decision(action="rejected", note=note, actor=actor, at=now)
        store.put(event)
        store.put(event.decision, doc_id=f"AP-{event.id}")
        audit.record(store, ActorType.HUMAN, actor, "event.rejected",
                     "Rejected all options and asked for a wider search" + (f": {note}" if note else ""),
                     "event", event.id)
        return event

    option = next((o for o in event.options if o.id == option_id), None)
    if option is None:
        raise DecisionError("Choose one of the listed options.")
    if not option.feasible:
        raise DecisionError(f"Option {option.id} can't be approved: " + "; ".join(v.detail for v in option.violations))

    # Revalidate against the live state: availability can change between proposal and approval.
    config = load_vertical(assignment.vertical)
    caregivers = {c.id: c for c in store.all(Caregiver)}
    shifts = store.all(Shift)
    for seg in option.segments:
        if seg.caregiver_id is None:
            continue
        cg = caregivers[seg.caregiver_id]
        failed = hard_check(cg, vertical=assignment.vertical, required_credentials=assignment.required_credentials,
                            required_skills=assignment.required_skills, work_until=shift.end.date(), today=clock.today())
        window = (seg.start, seg.end)
        if failed or not covers(window, free_parts(cg, window, shifts, config, {shift.id})):
            _attach_options(store, event, shift, assignment, client, exclude={event.parsed.caregiver_id})
            store.put(event)
            raise StaleStateError(f"{cg.name} can no longer cover {seg.start:%H:%M}–{seg.end:%H:%M}. "
                                  "Fresh options are ready.", event)

    kept = [s for s in shift.segments if s.caregiver_id is not None]
    shift.segments = sorted(kept + [s for s in option.segments if s.caregiver_id], key=lambda s: s.start)
    assignment.version += 1
    assignment.updated_at = now
    event.status = "resolved"
    event.decision = Decision(action="approved", option_id=option.id, note=note, actor=actor, at=now)
    store.put_many([shift, assignment, event])
    store.put(event.decision, doc_id=f"AP-{event.id}")

    plan = ", ".join(f"{caregivers[s.caregiver_id].name} {s.start:%H:%M}–{s.end:%H:%M}"
                     for s in option.segments if s.caregiver_id)
    audit.record(store, ActorType.HUMAN, actor, "event.approved",
                 f"Approved option {option.id}: {plan}" + (f". Note: {note}" if note else ""),
                 "assignment", assignment.id,
                 {"event_id": event.id, "option_id": option.id, "assignment_version": assignment.version,
                  "recommended": event.recommended_option_id})
    return event


def _review_reason(event: ChangeEvent) -> str:
    p = event.parsed
    if p is None:
        return "Couldn't understand the message"
    if p.caregiver_id is None:
        return f"Couldn't match “{p.caregiver_name or 'the sender'}” to a caregiver on the roster"
    if p.date is None:
        return "Couldn't tell which day the change applies to"
    return f"Low confidence ({p.confidence:.2f}) in reading the message"

