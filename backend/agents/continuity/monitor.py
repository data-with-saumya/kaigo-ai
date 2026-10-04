"""Proactive continuity: find shifts that will break before anyone cancels.

Rule E-02: a caregiver's registration must be valid through the end of every shift they hold.
The monitor runs nightly (Cloud Scheduler) and on demand. For each caregiver whose registration
lapses before an upcoming shift ends, it opens a change event so a replacement can be approved
early, instead of discovering the gap on the night.
"""

from __future__ import annotations

from datetime import timedelta

from agents.continuity.replan import open_event
from models.domain import ActorType, Caregiver, ChangeEvent, EventType, ParsedEvent, Shift
from services import audit, clock
from services.repository import Store

OPEN_STATES = ("open", "needs_review", "no_feasible_option")


def at_risk(store: Store, horizon_days: int | None = None) -> list[tuple[Shift, Caregiver]]:
    """Upcoming shifts held by a caregiver whose registration expires before the shift ends."""
    now = clock.now()
    limit = now + timedelta(days=horizon_days) if horizon_days else None
    caregivers = {c.id: c for c in store.all(Caregiver)}
    risky = []
    for shift in sorted(store.all(Shift), key=lambda s: s.start):
        if shift.end <= now or (limit and shift.start > limit):
            continue
        for seg in shift.segments:
            cg = caregivers.get(seg.caregiver_id) if seg.caregiver_id else None
            if cg and cg.credential_valid_until and cg.credential_valid_until < seg.end.date():
                risky.append((shift, cg))
                break
    return risky


def scan(store: Store, horizon_days: int = 14) -> list[ChangeEvent]:
    """Open one event per affected caregiver (skipping any already being handled)."""
    risky = at_risk(store, horizon_days)
    handled = {e.parsed.caregiver_id for e in store.all(ChangeEvent)
               if e.status in OPEN_STATES and e.parsed and e.parsed.event_type == EventType.CREDENTIAL_EXPIRY}
    first_shift: dict[str, Shift] = {}
    counts: dict[str, int] = {}
    people: dict[str, Caregiver] = {}
    for shift, cg in risky:
        counts[cg.id] = counts.get(cg.id, 0) + 1
        people[cg.id] = cg
        first_shift.setdefault(cg.id, shift)

    opened = []
    for cid, shift in first_shift.items():
        if cid in handled:
            continue
        cg = people[cid]
        n = counts[cid]
        summary = (f"{cg.name}'s registration expires {clock.day_label(cg.credential_valid_until)}; "
                   f"{n} upcoming shift{'s' if n > 1 else ''} end after that.")
        event = ChangeEvent(
            id=audit.new_id("EV"), raw_text=None, source="system", received_at=clock.now(), parse_source="rule",
            parsed=ParsedEvent(event_type=EventType.CREDENTIAL_EXPIRY, caregiver_id=cg.id, caregiver_name=cg.name,
                               client_id=shift.client_id, date=shift.start.date(), confidence=1.0, summary=summary))
        audit.record(store, ActorType.RULE, "Rule E-02", "event.detected", f"Expiry monitor: {summary}", "event",
                     event.id, {"caregiver_id": cg.id, "at_risk_shifts": n})
        opened.append(open_event(store, event))
    return opened
