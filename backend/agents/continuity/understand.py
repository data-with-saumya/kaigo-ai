"""Event understanding: Gemini reads the message; rules resolve who and when, and double-check the date."""

from __future__ import annotations

from datetime import date, timedelta

from agents.continuity.replan import open_event
from models.ai_schemas import EventExtraction
from models.domain import ActorType, Caregiver, ChangeEvent, Client, EventType, ParsedEvent
from services import audit, clock
from services.gemini import GeminiService
from services.prompts import prompt
from services.repository import Store

REVIEW_THRESHOLD = 0.85


def read_message(gemini: GeminiService, store: Store, text: str, sender: Caregiver | None = None) -> ParsedEvent:
    """Gemini reads the words; rules decide who and which day, and cross-check relative dates."""
    now = clock.now()
    caregivers = store.all(Caregiver)
    clients = store.all(Client)
    system = prompt("event_understanding", today=now.date().isoformat(), weekday=f"{now:%A}", time=f"{now:%H:%M}",
                    roster=", ".join(c.name for c in caregivers), clients=", ".join(c.name for c in clients))
    if sender:
        system += (f"\n\nThis message was sent by {sender.name} through the KaigoAI app, so 'I' and 'me' mean "
                   f"{sender.name}. Ordinary chat that changes nothing (thanks, running a few minutes late, "
                   f"questions) is event_type 'other'.")
    out = gemini.structured("event_understanding", EventExtraction, [text], system=system, store=store)

    named = _match(out.caregiver_name, caregivers)
    confidence = out.confidence
    if sender is not None:
        # In-app chat: the sender is known for certain. If the message names a different caregiver,
        # it's about someone else; keep that, but have a person confirm.
        caregiver = sender if named is None or named.id == sender.id else named
        if caregiver is not sender:
            confidence = min(confidence, 0.8)
    else:
        caregiver = named
    day = _date(out.date)
    # Deterministic cross-check of relative dates: the model's resolved date must agree with the words.
    expected = _relative_day(out.date_phrase, now.date())
    if expected and day and expected != day:
        confidence = min(confidence, 0.5)
    return ParsedEvent(event_type=EventType(out.event_type), caregiver_id=caregiver.id if caregiver else None,
                       caregiver_name=caregiver.name if caregiver else out.caregiver_name,
                       client_id=_match_client(out.client_name, clients), date=day,
                       confidence=round(confidence, 2), summary=out.summary)


def open_from_message(store: Store, parsed: ParsedEvent, text: str, source: str) -> ChangeEvent:
    event = ChangeEvent(id=audit.new_id("EV"), raw_text=text, source=source, received_at=clock.now(), parsed=parsed,
                        parse_source="gemini")
    who = parsed.caregiver_name or "unknown sender"
    audit.record(store, ActorType.AI, "Gemini", "event.understood",
                 f"Read {'chat message' if source == 'chat' else 'message'} as "
                 f"{parsed.event_type.value.replace('_', ' ')} from {who}"
                 f"{' for ' + clock.day_label(parsed.date) if parsed.date else ''} (confidence {parsed.confidence:.2f})",
                 "event", event.id)
    return open_event(store, event, REVIEW_THRESHOLD)


def interpret_message(gemini: GeminiService, store: Store, text: str, source: str = "sms") -> ChangeEvent:
    return open_from_message(store, read_message(gemini, store, text), text, source)


def manual_event(store: Store, caregiver_id: str, day: date, event_type: EventType, note: str | None,
                 actor: str) -> ChangeEvent:
    """Deterministic path: works with Gemini switched off."""
    caregiver = store.get(Caregiver, caregiver_id)
    if caregiver is None:
        raise ValueError("Caregiver not found.")
    parsed = ParsedEvent(event_type=event_type, caregiver_id=caregiver.id, caregiver_name=caregiver.name, date=day,
                         confidence=1.0, summary=note or f"{caregiver.name}: {event_type.value.replace('_', ' ')}")
    event = ChangeEvent(id=audit.new_id("EV"), raw_text=note, source="manual", received_at=clock.now(),
                        parsed=parsed, parse_source="manual")
    audit.record(store, ActorType.HUMAN, actor, "event.reported",
                 f"Reported {event_type.value.replace('_', ' ')} for {caregiver.name} on {clock.day_label(day)}",
                 "event", event.id)
    return open_event(store, event, REVIEW_THRESHOLD)


def _match(name: str | None, caregivers: list[Caregiver]) -> Caregiver | None:
    if not name:
        return None
    wanted = name.lower().strip()
    exact = [c for c in caregivers if c.name.lower() == wanted]
    if exact:
        return exact[0]
    by_first = [c for c in caregivers if c.name.lower().split()[0] == wanted.split()[0]]
    return by_first[0] if len(by_first) == 1 else None  # ambiguous first names go to a person


def _match_client(name: str | None, clients: list[Client]) -> str | None:
    if not name:
        return None
    surname = name.lower().replace("mrs", "").replace("mr", "").replace(".", "").strip().split()[-1]
    hits = [c for c in clients if c.name.lower().split()[-1] == surname]
    return hits[0].id if len(hits) == 1 else None


def _relative_day(phrase: str | None, today: date) -> date | None:
    if not phrase:
        return None
    p = phrase.lower()
    if "day after tomorrow" in p:
        return today + timedelta(days=2)
    if "tomorrow" in p:
        return today + timedelta(days=1)
    if "tonight" in p or "today" in p:
        return today
    return None


def _date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if value else None
    except ValueError:
        return None
