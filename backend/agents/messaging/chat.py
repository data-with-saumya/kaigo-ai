"""In-app chat between caregivers and the agency (one thread per caregiver).

A caregiver's message is read by Gemini. If it reports a change (cancellation, new hours, urgent cover), Kaigo
opens a change event exactly as for any other channel, but the sender is known for certain, so nobody has to
guess who wrote. Kaigo's own replies are fixed templates, not generated text. After a coordinator approves a
replacement, the people involved are told in their threads and the handover notes are delivered there.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from agents.continuity.understand import open_from_message, read_message
from models.domain import Caregiver, ChangeEvent, Client, EventType, Message, Shift
from services import clock
from services.gemini import AIOutputInvalid, AIUnavailable, GeminiService
from services.repository import Store

OPEN_STATES = ("open", "needs_review", "no_feasible_option")


def post(store: Store, caregiver_id: str, sender: str, text: str, kind: str = "text",
         event_id: str | None = None) -> Message:
    message = Message(id=f"MSG-{uuid.uuid4().hex[:8].upper()}", caregiver_id=caregiver_id, sender=sender, kind=kind,
                      text=text.strip(), at=datetime.now(clock.TZ), event_id=event_id,
                      read_by_coordinator=sender != "caregiver", read_by_caregiver=sender == "caregiver")
    store.put(message)
    return message


def thread(store: Store, caregiver_id: str) -> list[Message]:
    return sorted((m for m in store.all(Message) if m.caregiver_id == caregiver_id), key=lambda m: m.at)


def inbox(store: Store) -> list[dict]:
    messages = store.all(Message)
    rows = []
    for cg in store.all(Caregiver):
        mine = sorted((m for m in messages if m.caregiver_id == cg.id), key=lambda m: m.at)
        rows.append({
            "caregiver_id": cg.id, "name": cg.name, "area": cg.location.area,
            "last": mine[-1] if mine else None,
            "unread": sum(1 for m in mine if not m.read_by_coordinator),
        })
    rows.sort(key=lambda r: (r["last"] is None, -(r["last"].at.timestamp() if r["last"] else 0), r["name"]))
    return rows


def mark_read(store: Store, caregiver_id: str, by: str) -> int:
    changed = []
    for m in thread(store, caregiver_id):
        if by == "coordinator" and not m.read_by_coordinator:
            m.read_by_coordinator = True
            changed.append(m)
        elif by == "caregiver" and not m.read_by_caregiver:
            m.read_by_caregiver = True
            changed.append(m)
    if changed:
        store.put_many(changed)
    return len(changed)


def caregiver_says(gemini: GeminiService, store: Store, caregiver_id: str, text: str) -> dict:
    caregiver = store.get(Caregiver, caregiver_id)
    if caregiver is None:
        raise ValueError("Caregiver not found.")
    message = post(store, caregiver_id, "caregiver", text)
    first = caregiver.name.split()[0]
    try:
        parsed = read_message(gemini, store, text, sender=caregiver)
    except (AIUnavailable, AIOutputInvalid):
        # The message is safely in the thread; the coordinator reads it and can report the change manually.
        return {"message": message, "event": None, "reply": None, "understood": False}
    if parsed.event_type == EventType.OTHER:
        return {"message": message, "event": None, "reply": None, "understood": True}

    duplicate = next((e for e in store.all(ChangeEvent)
                      if e.status in OPEN_STATES and e.parsed and e.parsed.caregiver_id == parsed.caregiver_id
                      and e.parsed.date == parsed.date and e.parsed.event_type == parsed.event_type), None)
    if duplicate:
        message.event_id = duplicate.id
        store.put(message)
        reply = post(store, caregiver_id, "kaigo", f"Thanks, {first}. Your coordinator already has this and will "
                     "confirm here.", kind="acknowledgement", event_id=duplicate.id)
        return {"message": message, "event": duplicate, "reply": reply, "understood": True}

    event = open_from_message(store, parsed, text, "chat")
    message.event_id = event.id
    store.put(message)
    reply = post(store, caregiver_id, "kaigo", _acknowledgement(store, event, first), kind="acknowledgement",
                 event_id=event.id)
    return {"message": message, "event": event, "reply": reply, "understood": True}


def _shift_text(store: Store, event: ChangeEvent) -> str | None:
    if not event.affected_shift_ids:
        return None
    shift = store.get(Shift, event.affected_shift_ids[0])
    client = store.get(Client, shift.client_id)
    return f"{clock.day_label(shift.start)}, {shift.start:%H:%M}–{shift.end:%H:%M} with {client.name}"


def _acknowledgement(store: Store, event: ChangeEvent, first: str) -> str:
    shift = _shift_text(store, event)
    if event.status == "needs_review":
        return f"Thanks, {first}. I've passed this to your coordinator, who'll check the details with you here."
    if event.status == "no_impact":
        day = clock.day_label(event.parsed.date) if event.parsed and event.parsed.date else "that day"
        return f"Thanks, {first}. I couldn't find a shift of yours on {day}. Your coordinator will check and reply here."
    kind = event.parsed.event_type if event.parsed else EventType.OTHER
    if kind == EventType.CANCELLATION and shift:
        return (f"Thanks for letting us know, {first}. I've told your coordinator you can't do {shift}. "
                "They'll arrange cover and confirm here. There's nothing else you need to do.")
    if kind == EventType.SHIFT_CHANGE and shift:
        return f"Thanks, {first}. I've passed your change for {shift} to your coordinator. They'll confirm the plan here."
    if kind == EventType.URGENT_COVERAGE:
        return f"Thanks, {first}. I've flagged this as urgent to your coordinator."
    return f"Thanks, {first}. I've passed this to your coordinator."


def notify_decision(store: Store, event: ChangeEvent) -> None:
    """After approval: confirm bookings to the incoming caregivers and tell the original caregiver."""
    if not event.decision or event.decision.action != "approved" or not event.affected_shift_ids:
        return
    option = next((o for o in event.options if o.id == event.decision.option_id), None)
    shift = store.get(Shift, event.affected_shift_ids[0])
    client = store.get(Client, shift.client_id)
    caregivers = {c.id: c for c in store.all(Caregiver)}
    for seg in (option.segments if option else []):
        if not seg.caregiver_id:
            continue
        first = caregivers[seg.caregiver_id].name.split()[0]
        post(store, seg.caregiver_id, "kaigo",
             f"Hi {first}, you're booked: {client.name}, {clock.day_label(seg.start)}, {seg.start:%H:%M}–{seg.end:%H:%M} "
             f"({client.location.area}). Your handover note will follow here.", kind="confirmation", event_id=event.id)
    original = caregivers.get(event.parsed.caregiver_id) if event.parsed and event.parsed.caregiver_id else None
    if original is None:
        return
    first = original.name.split()[0]
    if event.parsed.event_type == EventType.CREDENTIAL_EXPIRY and original.credential_valid_until:
        text = (f"Hi {first}, your registration expires {clock.day_label(original.credential_valid_until)}, so your "
                f"{clock.day_label(shift.start)} visit with {client.name} has been reassigned. Please share your renewed "
                "registration when you have it, so we can book you again.")
    else:
        text = (f"Thanks, {first}. Your shift on {clock.day_label(shift.start)} with {client.name} is now covered. "
                "Nothing more you need to do.")
    post(store, original.id, "kaigo", text, kind="notice", event_id=event.id)


def deliver_handover(store: Store, event: ChangeEvent) -> None:
    for caregiver_id, note in event.handover_notes.items():
        post(store, caregiver_id, "kaigo", note, kind="handover", event_id=event.id)
