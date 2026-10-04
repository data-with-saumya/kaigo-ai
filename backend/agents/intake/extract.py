"""Intake agent: Gemini reads a credential document (image or PDF) into structured fields."""

from __future__ import annotations

import difflib
from datetime import date

from agents.verification.verify import check
from models.ai_schemas import CredentialExtraction, ExtractedField
from models.domain import ActorType, Caregiver, Credential, CredentialFields, FieldEvidence
from services import audit, clock
from services.gemini import GeminiService
from services.prompts import prompt
from services.repository import Store

FIELDS = ("caregiver_name", "credential_type", "registration_number", "issuing_authority", "issue_date", "valid_until")


def extract_credential(gemini: GeminiService, store: Store, data: bytes, mime_type: str, document_name: str,
                       caregiver_id: str | None) -> Credential:
    from google.genai import types

    out = gemini.structured(
        "credential_extraction", CredentialExtraction,
        [types.Part.from_bytes(data=data, mime_type=mime_type), "Extract the credential fields from this document."],
        system=prompt("credential_extraction"), store=store)

    evidence, values = [], {}
    for name in FIELDS:
        field: ExtractedField = getattr(out, name)
        value, confidence = field.value, field.confidence
        if name in ("issue_date", "valid_until") and value:
            value = _parse_date(value)
            if value is None:
                confidence = 0.0  # Gemini returned something that isn't a valid date: treat as unreadable
        values[name] = value
        evidence.append(FieldEvidence(field=name, confidence=round(confidence, 2), source_text=field.source_text))

    fields = CredentialFields(**values, skills=out.skills)
    caregiver_id = caregiver_id or _match_caregiver(store, fields.caregiver_name)
    credential = Credential(id=audit.new_id("CRD"), caregiver_id=caregiver_id, document_name=document_name,
                            fields=fields, evidence=evidence, extraction_source="gemini", uploaded_at=clock.now())

    read = sum(1 for n in FIELDS if values.get(n))
    note = "" if out.is_credential_document else " (doesn't look like a credential document)"
    audit.record(store, ActorType.AI, "Gemini", "credential.extracted",
                 f"Read {document_name}: {read} of {len(FIELDS)} fields extracted{note}", "credential", credential.id,
                 {"document_kind": out.document_kind, "notes": out.notes})
    return check(store, credential)


def manual_credential(store: Store, caregiver_id: str | None, document_name: str, fields: CredentialFields) -> Credential:
    """Deterministic fallback when Gemini is unavailable: a coordinator types the fields in."""
    evidence = [FieldEvidence(field=n, confidence=1.0, source_text="Entered by coordinator") for n in FIELDS]
    credential = Credential(id=audit.new_id("CRD"), caregiver_id=caregiver_id, document_name=document_name,
                            fields=fields, evidence=evidence, extraction_source="manual", uploaded_at=clock.now())
    audit.record(store, ActorType.HUMAN, "Care coordinator", "credential.entered",
                 f"Entered credential fields for {document_name} manually", "credential", credential.id)
    return check(store, credential)


def _parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def _match_caregiver(store: Store, name: str | None) -> str | None:
    if not name:
        return None
    best, ratio = None, 0.0
    for cg in store.all(Caregiver):
        r = difflib.SequenceMatcher(None, name.lower(), cg.name.lower()).ratio()
        if r > ratio:
            best, ratio = cg, r
    return best.id if best and ratio >= 0.9 else None
