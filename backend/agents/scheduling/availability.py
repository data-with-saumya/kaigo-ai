"""Scheduling agent: availability, conflicts and rest periods. Fully deterministic."""

from __future__ import annotations

from models.domain import Caregiver, CheckResult, Client, Shift
from rules.config import VerticalConfig
from rules.scheduling import Interval, free_within, intersect, overlaps
from services import clock


def busy_intervals(caregiver_id: str, shifts: list[Shift], exclude_shift_ids: set[str] = frozenset()) -> list[Interval]:
    return [(seg.start, seg.end)
            for shift in shifts if shift.id not in exclude_shift_ids
            for seg in shift.segments if seg.caregiver_id == caregiver_id]


def free_parts(caregiver: Caregiver, window: Interval, shifts: list[Shift], config: VerticalConfig,
               exclude_shift_ids: set[str] = frozenset()) -> list[Interval]:
    availability = [(w.start, w.end) for w in caregiver.availability]
    busy = busy_intervals(caregiver.id, shifts, exclude_shift_ids)
    return free_within(window, availability, busy, min_rest_hours=config.min_rest_hours)


def why_unavailable(caregiver: Caregiver, window: Interval, shifts: list[Shift], clients: dict[str, Client],
                    config: VerticalConfig, exclude_shift_ids: set[str] = frozenset()) -> CheckResult:
    """Explain, with the rule that applies, why a caregiver can't work any part of `window`."""
    hhmm = f"{window[0]:%H:%M}–{window[1]:%H:%M}"
    for shift in shifts:
        if shift.id in exclude_shift_ids:
            continue
        for seg in shift.segments:
            if seg.caregiver_id == caregiver.id and overlaps((seg.start, seg.end), window):
                who = clients.get(shift.client_id)
                return CheckResult(rule_id="S-01", label="Overlapping shift", passed=False, severity="block",
                                   detail=f"Already working {seg.start:%H:%M}–{seg.end:%H:%M}"
                                          f"{' for ' + who.name if who else ''}.")
    if not any(intersect(window, (w.start, w.end)) for w in caregiver.availability):
        return CheckResult(rule_id="S-02", label="Not available", passed=False, severity="block",
                           detail=f"Not available {hhmm} on {clock.day_label(window[0])}.")
    return CheckResult(rule_id="S-03", label="Rest period", passed=False, severity="block",
                       detail=f"Needs {config.min_rest_hours:g} hours' rest between shifts.")
