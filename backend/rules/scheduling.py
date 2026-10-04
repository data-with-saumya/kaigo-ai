"""Deterministic interval maths for availability, overlap and coverage."""

from __future__ import annotations

from datetime import datetime, timedelta

Interval = tuple[datetime, datetime]


def overlaps(a: Interval, b: Interval) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def intersect(a: Interval, b: Interval) -> Interval | None:
    start, end = max(a[0], b[0]), min(a[1], b[1])
    return (start, end) if start < end else None


def merge(intervals: list[Interval]) -> list[Interval]:
    ordered = sorted(intervals)
    merged: list[Interval] = []
    for start, end in ordered:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def subtract(intervals: list[Interval], busy: list[Interval]) -> list[Interval]:
    result = merge(intervals)
    for b_start, b_end in merge(busy):
        next_result: list[Interval] = []
        for start, end in result:
            if b_end <= start or b_start >= end:
                next_result.append((start, end))
                continue
            if start < b_start:
                next_result.append((start, b_start))
            if b_end < end:
                next_result.append((b_end, end))
        result = next_result
    return result


def total_hours(intervals: list[Interval]) -> float:
    return sum((end - start).total_seconds() for start, end in merge(intervals)) / 3600


def free_within(
    window: Interval,
    availability: list[Interval],
    busy: list[Interval],
    min_rest_hours: float = 0,
) -> list[Interval]:
    """The parts of `window` a caregiver can work: declared availability, minus existing
    shifts padded by the minimum rest period on both sides."""
    available = [part for a in availability if (part := intersect(window, a))]
    rest = timedelta(hours=min_rest_hours)
    padded = [(start - rest, end + rest) for start, end in busy]
    return subtract(available, padded)


def covers(window: Interval, intervals: list[Interval]) -> bool:
    return any(start <= window[0] and end >= window[1] for start, end in merge(intervals))
