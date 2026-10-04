"""Time helpers. All operational times are timezone-aware, in the agency's local zone."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Kolkata")


def now() -> datetime:
    return datetime.now(TZ).replace(microsecond=0)


def today() -> date:
    return now().date()


def parse_hhmm(value: str) -> time:
    hours, minutes = value.strip().split(":")
    return time(int(hours), int(minutes))


def at(day: date, hhmm: str) -> datetime:
    return datetime.combine(day, parse_hhmm(hhmm), tzinfo=TZ)


def shift_window(day: date, start: str, end: str) -> tuple[datetime, datetime]:
    """A shift that starts on `day`. An end time at or before the start rolls over to the next day."""
    begin = at(day, start)
    finish = at(day, end)
    if finish <= begin:
        finish += timedelta(days=1)
    return begin, finish


def hours(start: datetime, end: datetime) -> float:
    return max(0.0, (end - start).total_seconds() / 3600)


def day_label(value: date | datetime) -> str:
    return f"{value:%a} {value.day} {value:%b}"
