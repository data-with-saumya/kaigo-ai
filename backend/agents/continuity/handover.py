"""Handover notes: after a replacement is approved, Gemini briefs each incoming caregiver.

Built only from the approved plan and the client's operational preferences; checked so it cannot
introduce names or figures that aren't in the facts. Never clinical.
"""

from __future__ import annotations

import json
from datetime import timedelta

from agents.simulation.explain import EventGone
from models.ai_schemas import HandoverOut
from models.domain import ActorType, Assignment, Caregiver, ChangeEvent, Client, Shift
from rules.config import skill_label
from services import audit, clock
from services.gemini import AIOutputInvalid, GeminiService
from services.grounding import unsupported_numbers
from services.prompts import prompt
from services.repository import Store


class HandoverError(Exception):
    pass


def write_handover(gemini: GeminiService, store: Store, event: ChangeEvent) -> ChangeEvent:
    if event.status != "resolved" or not event.decision or event.decision.action != "approved":
        raise HandoverError("Handover notes are written after a replacement is approved.")
    shift = store.get(Shift, event.affected_shift_ids[0])
    client = store.get(Client, shift.client_id)
    names = {c.id: c.name for c in store.all(Caregiver)}
    siblings = sorted((s for s in store.all(Shift) if s.assignment_id == shift.assignment_id), key=lambda s: s.start)
    # Only a back-to-back shift is a real handover; otherwise the family is with the client.
    adjacent = timedelta(minutes=30)
    before = next((s for s in siblings if s.id != shift.id and abs(s.end - shift.start) <= adjacent), None)
    after = next((s for s in siblings if s.id != shift.id and abs(s.start - shift.end) <= adjacent), None)
    assignment = store.get(Assignment, shift.assignment_id)

    def who(s: Shift | None) -> str | None:
        return ", ".join(names.get(seg.caregiver_id, "") for seg in s.segments if seg.caregiver_id) if s else None

    incoming = [seg for seg in shift.segments if seg.caregiver_id]
    facts = {
        "client": client.name,
        "area": client.location.area,
        "client_preferences": client.care_notes,
        "care_required": [skill_label(s) for s in assignment.required_skills],
        "shift_date": (f"the night of {clock.day_label(shift.start)} (into {clock.day_label(shift.end)})"
                       if shift.end.date() > shift.start.date() else clock.day_label(shift.start)),
        "plan": [{"caregiver_id": seg.caregiver_id, "caregiver": names.get(seg.caregiver_id),
                  "from": f"{seg.start:%H:%M}", "to": f"{seg.end:%H:%M}"} for seg in incoming],
        "first_caregiver_takes_over_from": who(before) or "the family (no caregiver on duty before this shift)",
        "last_caregiver_hands_over_to": who(after) or "the family (no caregiver on duty after this shift)",
        "reason_for_change": "the usual caregiver is unavailable",
    }
    facts_text = json.dumps(facts, ensure_ascii=False)
    out = gemini.structured("handover_note", HandoverOut, ["Write the handover notes for:\n" + facts_text],
                            system=prompt("handover_note"), store=store)

    wanted = {seg.caregiver_id for seg in incoming}
    notes = {n.caregiver_id: n.note.strip() for n in out.notes if n.caregiver_id in wanted}
    if set(notes) != wanted:
        raise AIOutputInvalid("A handover note was missing for one of the caregivers, so the notes were withheld.")
    stray = unsupported_numbers(" ".join(notes.values()), facts_text)
    if stray:
        raise AIOutputInvalid(f"The handover notes included figures not in the plan ({', '.join(sorted(stray))}), "
                              "so they were withheld.")
    event.handover_notes = notes
    if store.get(ChangeEvent, event.id) is None:  # removed while Gemini was writing (e.g. a demo reset)
        raise EventGone("This change no longer exists, so the handover notes were discarded.")
    store.put(event)
    from agents.messaging.chat import deliver_handover

    deliver_handover(store, event)
    audit.record(store, ActorType.AI, "Gemini", "event.handover",
                 f"Wrote handover notes for {', '.join(names.get(c, c) for c in notes)} (grounding check passed)",
                 "event", event.id)
    return event
