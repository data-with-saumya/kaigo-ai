"""HTTP API for the coordinator UI. Thin: validation and error mapping only; logic lives in agents/."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from agents.continuity.replan import DecisionError, StaleStateError
from agents.continuity.replan import decide as decide_event
from agents.continuity.understand import interpret_message, manual_event
from agents.intake.extract import extract_credential, manual_credential
from agents.matching.match import AssignmentError, assign, find_candidates
from agents.request.extract import (
    RequestError,
    confirm,
    extract_request,
    manual_request,
    update_requirements,
)
from agents.simulation.explain import explain_matches, explain_options
from agents.verification.verify import VerificationError
from agents.verification.verify import decide as decide_credential
from api.deps import get_gemini, get_settings, get_store, reset_workspace
from config import Settings
from models.domain import (
    Assignment,
    AuditEntry,
    Caregiver,
    CareRequest,
    ChangeEvent,
    Client,
    Credential,
    CredentialFields,
    EventType,
    Requirements,
    Shift,
)
from services import views
from services.gemini import GeminiService
from services.reference import load_reference
from services.repository import Store

router = APIRouter(prefix="/api")
SAMPLES_DIR = Path(__file__).resolve().parents[2] / "data" / "synthetic" / "documents"
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp", "application/pdf"}
ACTOR = "Care coordinator"


def fail(status: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


# ------------------------------------------------------------------ system


@router.get("/health")
def health(gemini: GeminiService = Depends(get_gemini), settings: Settings = Depends(get_settings)):
    return {"status": "ok", "gemini": "available" if gemini.available else "unavailable",
            "model": gemini.model if gemini.available else None, "storage": settings.storage_backend}


class ResetBody(BaseModel):
    scenario: Literal["fresh", "after_assignment"] = "fresh"


@router.post("/workspace/reset")
def reset(body: ResetBody, store: Store = Depends(get_store)):
    return reset_workspace(store, body.scenario)


@router.get("/workspace")
def workspace(store: Store = Depends(get_store)):
    return {"id": store.ws, **(store.repo.get_meta(store.ws) or {})}


@router.get("/dashboard")
def dashboard(store: Store = Depends(get_store)):
    return views.dashboard(store)


@router.get("/metrics")
def metrics(store: Store = Depends(get_store)):
    return views.metrics(store)


@router.get("/audit")
def audit_log(limit: int = 50, store: Store = Depends(get_store)):
    return sorted(store.all(AuditEntry), key=lambda a: a.at, reverse=True)[:max(1, min(limit, 200))]


@router.get("/caregivers")
def caregivers(store: Store = Depends(get_store)):
    return sorted(store.all(Caregiver), key=lambda c: c.name)


@router.get("/clients")
def clients(store: Store = Depends(get_store)):
    return sorted(store.all(Client), key=lambda c: c.name)


@router.get("/shifts")
def shifts(client_id: str | None = None, assignment_id: str | None = None, store: Store = Depends(get_store)):
    names = {c.id: c.name for c in store.all(Caregiver)}
    clients_by_id = {c.id: c for c in store.all(Client)}
    items = [s for s in store.all(Shift)
             if (client_id is None or s.client_id == client_id)
             and (assignment_id is None or s.assignment_id == assignment_id)]
    return [views.shift_view(s, names, clients_by_id) for s in sorted(items, key=lambda s: s.start)]


@router.get("/assignments")
def assignments(store: Store = Depends(get_store)):
    return sorted(store.all(Assignment), key=lambda a: a.created_at, reverse=True)


@router.get("/reference")
def reference():
    return load_reference()


# ------------------------------------------------------------------ trust: credentials


@router.get("/samples")
def samples():
    manifest = SAMPLES_DIR / "manifest.json"
    return json.loads(manifest.read_text()) if manifest.exists() else []


@router.get("/samples/{name}")
def sample_file(name: str):
    path = (SAMPLES_DIR / name).resolve()
    if path.parent != SAMPLES_DIR.resolve() or path.suffix not in (".png", ".jpg", ".jpeg", ".webp", ".pdf") \
            or not path.exists():
        raise fail(404, "not_found", "Sample document not found.")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/credentials")
def credentials(store: Store = Depends(get_store)):
    return sorted(store.all(Credential), key=lambda c: c.uploaded_at, reverse=True)


@router.get("/credentials/{credential_id}")
def credential(credential_id: str, store: Store = Depends(get_store)):
    found = store.get(Credential, credential_id)
    if not found:
        raise fail(404, "not_found", "Credential not found.")
    return found


@router.post("/credentials/extract")
async def extract(file: UploadFile | None = File(default=None), sample: str | None = Form(default=None),
                  caregiver_id: str | None = Form(default=None), store: Store = Depends(get_store),
                  gemini: GeminiService = Depends(get_gemini), settings: Settings = Depends(get_settings)):
    if sample:
        path = (SAMPLES_DIR / sample).resolve()
        if path.parent != SAMPLES_DIR.resolve() or not path.exists():
            raise fail(404, "not_found", "Sample document not found.")
        data, name = path.read_bytes(), path.name
        mime = "application/pdf" if path.suffix == ".pdf" else f"image/{path.suffix.lstrip('.').replace('jpg', 'jpeg')}"
    elif file is not None:
        if file.content_type not in ALLOWED_TYPES:
            raise fail(415, "unsupported_type", "Upload a PNG, JPEG, WebP or PDF.")
        data, name, mime = await file.read(), file.filename or "document", file.content_type
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise fail(413, "too_large", f"Files must be under {settings.max_upload_mb} MB.")
    else:
        raise fail(400, "no_file", "Attach a document or choose a sample.")
    if caregiver_id and not store.get(Caregiver, caregiver_id):
        raise fail(404, "not_found", "Caregiver not found.")
    return extract_credential(gemini, store, data, mime, name, caregiver_id)


class ManualCredentialBody(BaseModel):
    caregiver_id: str | None = None
    document_name: str = "Entered manually"
    fields: CredentialFields


@router.post("/credentials/manual")
def manual(body: ManualCredentialBody, store: Store = Depends(get_store)):
    return manual_credential(store, body.caregiver_id, body.document_name, body.fields)


class CredentialDecisionBody(BaseModel):
    action: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=500)


@router.post("/credentials/{credential_id}/decision")
def credential_decision(credential_id: str, body: CredentialDecisionBody, store: Store = Depends(get_store)):
    try:
        return decide_credential(store, credential_id, body.action, body.note, ACTOR)
    except VerificationError as exc:
        raise fail(409, "cannot_decide", str(exc))


# ------------------------------------------------------------------ fit: requests and matching


@router.get("/care-requests")
def care_requests(store: Store = Depends(get_store)):
    return sorted(store.all(CareRequest), key=lambda r: r.created_at, reverse=True)


@router.get("/care-requests/{request_id}")
def care_request(request_id: str, store: Store = Depends(get_store)):
    found = store.get(CareRequest, request_id)
    if not found:
        raise fail(404, "not_found", "Care request not found.")
    return found


class ExtractRequestBody(BaseModel):
    client_id: str
    text: str = Field(min_length=5, max_length=2000)


@router.post("/care-requests/extract")
def extract_care_request(body: ExtractRequestBody, store: Store = Depends(get_store),
                         gemini: GeminiService = Depends(get_gemini)):
    try:
        return extract_request(gemini, store, body.client_id, body.text)
    except RequestError as exc:
        raise fail(400, "invalid_request", str(exc))


class ManualRequestBody(BaseModel):
    client_id: str
    requirements: Requirements
    text: str | None = None


@router.post("/care-requests")
def create_care_request(body: ManualRequestBody, store: Store = Depends(get_store)):
    try:
        return manual_request(store, body.client_id, body.requirements, body.text)
    except RequestError as exc:
        raise fail(400, "invalid_request", str(exc))


class UpdateRequirementsBody(BaseModel):
    requirements: Requirements
    confirmed_fields: list[str] = []


@router.put("/care-requests/{request_id}/requirements")
def edit_requirements(request_id: str, body: UpdateRequirementsBody, store: Store = Depends(get_store)):
    try:
        return update_requirements(store, request_id, body.requirements, body.confirmed_fields, ACTOR)
    except RequestError as exc:
        raise fail(400, "invalid_request", str(exc))


@router.post("/care-requests/{request_id}/confirm")
def confirm_request(request_id: str, store: Store = Depends(get_store)):
    try:
        return confirm(store, request_id, ACTOR)
    except RequestError as exc:
        raise fail(409, "needs_confirmation", str(exc))


def _request_or_404(store: Store, request_id: str) -> CareRequest:
    found = store.get(CareRequest, request_id)
    if not found:
        raise fail(404, "not_found", "Care request not found.")
    return found


@router.get("/care-requests/{request_id}/matches")
def matches(request_id: str, store: Store = Depends(get_store)):
    return find_candidates(store, _request_or_404(store, request_id))


@router.post("/care-requests/{request_id}/matches/explain")
def explain_request_matches(request_id: str, store: Store = Depends(get_store),
                            gemini: GeminiService = Depends(get_gemini)):
    result = find_candidates(store, _request_or_404(store, request_id))
    return {"explanations": explain_matches(gemini, store, result)}


class AssignBody(BaseModel):
    caregiver_id: str


@router.post("/care-requests/{request_id}/assign")
def assign_caregiver(request_id: str, body: AssignBody, store: Store = Depends(get_store)):
    request = _request_or_404(store, request_id)
    try:
        assignment, shifts, summary = assign(store, request, body.caregiver_id, ACTOR)
    except AssignmentError as exc:
        raise fail(409, "cannot_assign", str(exc))
    return {"assignment": assignment, "shifts": shifts, "summary": summary}


# ------------------------------------------------------------------ continuity: events and decisions


@router.get("/events")
def events(store: Store = Depends(get_store)):
    return sorted(store.all(ChangeEvent), key=lambda e: e.received_at, reverse=True)


@router.get("/events/{event_id}")
def event(event_id: str, store: Store = Depends(get_store)):
    found = store.get(ChangeEvent, event_id)
    if not found:
        raise fail(404, "not_found", "Event not found.")
    return found


class InterpretBody(BaseModel):
    text: str = Field(min_length=3, max_length=2000)
    source: Literal["sms", "manual"] = "sms"


@router.post("/events/interpret")
def interpret(body: InterpretBody, store: Store = Depends(get_store), gemini: GeminiService = Depends(get_gemini)):
    return interpret_message(gemini, store, body.text, body.source)


class ManualEventBody(BaseModel):
    caregiver_id: str
    date: date
    event_type: EventType = EventType.CANCELLATION
    note: str | None = Field(default=None, max_length=500)


@router.post("/events/manual")
def report_event(body: ManualEventBody, store: Store = Depends(get_store)):
    try:
        return manual_event(store, body.caregiver_id, body.date, body.event_type, body.note, ACTOR)
    except ValueError as exc:
        raise fail(404, "not_found", str(exc))


@router.post("/events/{event_id}/explain")
def explain_event(event_id: str, store: Store = Depends(get_store), gemini: GeminiService = Depends(get_gemini)):
    found = store.get(ChangeEvent, event_id)
    if not found:
        raise fail(404, "not_found", "Event not found.")
    return explain_options(gemini, store, found)


class EventDecisionBody(BaseModel):
    action: Literal["approved", "rejected"]
    option_id: str | None = None
    note: str | None = Field(default=None, max_length=500)


@router.post("/events/{event_id}/decision")
def event_decision(event_id: str, body: EventDecisionBody, store: Store = Depends(get_store)):
    try:
        return decide_event(store, event_id, body.action, body.option_id, body.note, ACTOR)
    except StaleStateError as exc:
        raise fail(409, "stale_options", str(exc), event=exc.event.model_dump(mode="json"))
    except DecisionError as exc:
        raise fail(409, "cannot_decide", str(exc))
