"""Request agent: plain-language care request -> structured, editable requirements.

Gemini reads the language. Rules fill in what the agency already knows (credentials, location,
priority) and route anything ambiguous to the coordinator before matching.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from models.ai_schemas import RequestExtraction
from models.domain import ActorType, Ambiguity, CareRequest, Client, Requirements, Vertical
from rules.config import load_vertical, normalise_skill, skill_label
from services import audit, clock
from services.gemini import GeminiService
from services.prompts import prompt
from services.repository import Store

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# Rule R-01: "for the next five days" says how long, not when. Without a stated start, a person must confirm.
RELATIVE_WINDOW = re.compile(r"\b(next|coming|following)\s+(\d+|one|two|three|four|five|six|seven|few|couple of)\s+(days?|nights?)\b"
                             r"|\bthis week\b|\bfew (days|nights)\b", re.I)
STATED_START = re.compile(r"\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
                          r"\d{1,2}(st|nd|rd|th)|\d{1,2}[/-]\d{1,2})\b", re.I)


class RequestError(Exception):
    pass


def extract_request(gemini: GeminiService, store: Store, client_id: str, text: str) -> CareRequest:
    if not client_id:
        raise RequestError("Choose a client first.")
    client = store.get(Client, client_id)
    if client is None:
        raise RequestError("Client not found.")
    now = clock.now()
    out = gemini.structured(
        "request_extraction", RequestExtraction, [text],
        system=prompt("request_extraction", today=now.date().isoformat(), weekday=f"{now:%A}",
                      time=f"{now:%H:%M}", city=client.location.city, client_name=client.name,
                      client_vertical=client.vertical.value),
        store=store)

    confidence = {c.field: round(c.confidence, 2) for c in out.confidences}
    ambiguities = [Ambiguity(field=a.field, reason=a.reason, choices=a.choices) for a in out.ambiguities]

    care_type = Vertical(out.care_type) if out.care_type != "unknown" else client.vertical
    if out.care_type == "unknown":
        ambiguities.append(Ambiguity(field="care_type", reason="Care type wasn't stated; using the client's profile.",
                                     choices=[client.vertical.value]))
    config = load_vertical(care_type)

    skills, unknown = [], []
    for phrase in out.skills_mentioned:
        skill = normalise_skill(phrase)
        (skills if skill else unknown).append(skill or phrase)
    if unknown:
        ambiguities.append(Ambiguity(field="skills", reason=f"Not in the skills catalogue: {', '.join(unknown)}.",
                                     choices=[]))
    skills = list(dict.fromkeys([*skills, *config.default_required_skills]))

    shift_start = out.shift_start if out.shift_start and HHMM.match(out.shift_start) else None
    shift_end = out.shift_end if out.shift_end and HHMM.match(out.shift_end) else None
    if not (shift_start and shift_end):
        ambiguities.append(Ambiguity(field="shift_times", reason="Shift times weren't clear.", choices=[]))
    start = _date(out.start_date)
    if RELATIVE_WINDOW.search(text) and not STATED_START.search(text) \
            and not any(a.field == "start_date" for a in ambiguities):
        ambiguities.append(Ambiguity(
            field="start_date", reason="The request gives a length (“next few days”) but not a start day. (Rule R-01)",
            choices=[now.date().isoformat(), (now.date() + timedelta(days=1)).isoformat()]))
    if start is None:
        ambiguities.append(Ambiguity(field="start_date", reason="Start date wasn't clear.",
                                     choices=[now.date().isoformat(), (now.date() + timedelta(days=1)).isoformat()]))

    requirements = Requirements(
        care_type=care_type, required_credentials=list(config.accepted_credential_types), required_skills=skills,
        shift_start=shift_start or "09:00", shift_end=shift_end or "17:00", start_date=start or now.date(),
        duration_days=max(1, min(out.duration_days or 1, 60)), location_area=client.location.area,
        prefer_familiar=client.prefer_familiar, priority="normal")
    requirements.priority = _priority(requirements)
    requirements.needs_review = _needs_review(confidence, ambiguities, config.ai_confidence_threshold)
    if out.duration_days is None and "duration_days" not in requirements.needs_review:
        requirements.needs_review.append("duration_days")

    request = CareRequest(id=audit.new_id("CR"), client_id=client.id, raw_text=text, requirements=requirements,
                          field_confidence=confidence, ambiguities=ambiguities, extraction_source="gemini",
                          created_at=now)
    store.put(request)
    detail = f"; {', '.join(requirements.needs_review)} need{'s' if len(requirements.needs_review) == 1 else ''} confirming" \
        if requirements.needs_review else ""
    omitted = " Clinical details in the text were left out." if out.clinical_details_omitted else ""
    audit.record(store, ActorType.AI, "Gemini", "care_request.extracted",
                 f"Turned {client.name}'s request into requirements: {', '.join(skill_label(s) for s in skills) or 'no specialist skills'}, "
                 f"{requirements.shift_start}–{requirements.shift_end}, {requirements.duration_days} days{detail}.{omitted}",
                 "care_request", request.id)
    return request


def manual_request(store: Store, client_id: str, requirements: Requirements, text: str | None) -> CareRequest:
    if store.get(Client, client_id) is None:
        raise RequestError("Client not found.")
    _validate(requirements)
    requirements.priority = _priority(requirements)
    requirements.needs_review = []
    request = CareRequest(id=audit.new_id("CR"), client_id=client_id, raw_text=text, requirements=requirements,
                          extraction_source="manual", created_at=clock.now())
    store.put(request)
    audit.record(store, ActorType.HUMAN, "Care coordinator", "care_request.created",
                 "Created a care request manually", "care_request", request.id)
    return request


def update_requirements(store: Store, request_id: str, requirements: Requirements, confirmed_fields: list[str],
                        actor: str) -> CareRequest:
    request = _editable(store, request_id)
    _validate(requirements)
    remaining = [f for f in request.requirements.needs_review if f not in confirmed_fields]
    requirements.priority = _priority(requirements)
    requirements.needs_review = remaining
    request.requirements = requirements
    request.status = "draft"
    store.put(request)
    audit.record(store, ActorType.HUMAN, actor, "care_request.edited",
                 "Edited requirements" + (f"; confirmed {', '.join(confirmed_fields)}" if confirmed_fields else ""),
                 "care_request", request.id)
    return request


def confirm(store: Store, request_id: str, actor: str) -> CareRequest:
    request = _editable(store, request_id)
    if request.requirements.needs_review:
        raise RequestError("Confirm " + ", ".join(f.replace("_", " ") for f in request.requirements.needs_review)
                           + " before searching for caregivers.")
    request.status = "confirmed"
    store.put(request)
    audit.record(store, ActorType.HUMAN, actor, "care_request.confirmed", "Confirmed requirements",
                 "care_request", request.id)
    return request


def _editable(store: Store, request_id: str) -> CareRequest:
    request = store.get(CareRequest, request_id)
    if request is None:
        raise RequestError("Care request not found.")
    if request.status == "assigned":
        raise RequestError("This request is already assigned.")
    return request


def _validate(r: Requirements) -> None:
    if not (HHMM.match(r.shift_start) and HHMM.match(r.shift_end)):
        raise RequestError("Shift times must be HH:MM.")
    window = clock.shift_window(r.start_date, r.shift_start, r.shift_end)
    if clock.hours(*window) > load_vertical(r.care_type).max_shift_hours:
        raise RequestError(f"Shifts over {load_vertical(r.care_type).max_shift_hours:g} hours aren't allowed.")
    if r.start_date < clock.today() - timedelta(days=1):
        raise RequestError("Start date is in the past.")


def _priority(r: Requirements) -> str:
    """Rule P-01: anything starting within 24 hours is high priority."""
    start = clock.shift_window(r.start_date, r.shift_start, r.shift_end)[0]
    return "high" if start - clock.now() <= timedelta(hours=24) else "normal"


def _needs_review(confidence: dict[str, float], ambiguities: list[Ambiguity], threshold: float) -> list[str]:
    fields = [f for f, c in confidence.items() if c < threshold]
    fields += [a.field for a in ambiguities]
    return list(dict.fromkeys(fields))


def _date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if value else None
    except ValueError:
        return None
