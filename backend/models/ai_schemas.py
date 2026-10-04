"""Response schemas Gemini must follow. Kept flat and simple so they map cleanly to Gemini's
structured-output schema. Every response is validated against these before anything is stored."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExtractedField(BaseModel):
    value: str | None = Field(description="The value exactly as normalised by the instructions, or null if absent/unreadable.")
    confidence: float = Field(ge=0, le=1, description="0-1. How sure you are the value is read correctly.")
    source_text: str | None = Field(default=None, description="The verbatim text on the document the value came from.")


class CredentialExtraction(BaseModel):
    is_credential_document: bool
    document_kind: Literal["registration_certificate", "training_certificate", "other"]
    caregiver_name: ExtractedField
    credential_type: ExtractedField
    registration_number: ExtractedField
    issuing_authority: ExtractedField
    issue_date: ExtractedField = Field(description="value as YYYY-MM-DD")
    valid_until: ExtractedField = Field(description="value as YYYY-MM-DD")
    skills: list[str] = Field(description="Skills or trainings explicitly stated on the document. Empty if none.")
    notes: str | None = Field(default=None, description="Anything a verifier should know (damage, illegible areas).")


class FieldConfidence(BaseModel):
    field: Literal["care_type", "skills", "shift_times", "start_date", "duration_days"]
    confidence: float = Field(ge=0, le=1)


class AmbiguityOut(BaseModel):
    field: Literal["care_type", "skills", "shift_times", "start_date", "duration_days"]
    reason: str
    choices: list[str] = Field(description="Possible readings. For start_date use YYYY-MM-DD values.")


class RequestExtraction(BaseModel):
    care_type: Literal["home_nursing", "hospice", "unknown"]
    skills_mentioned: list[str] = Field(description="Care skills the request asks for, in plain words.")
    shift_start: str | None = Field(description="24h HH:MM, or null")
    shift_end: str | None = Field(description="24h HH:MM, or null")
    start_date: str | None = Field(description="Most likely first day, YYYY-MM-DD, or null")
    duration_days: int | None
    clinical_details_omitted: bool = Field(
        description="True if the text contained diagnoses or medical details that you deliberately left out.")
    confidences: list[FieldConfidence]
    ambiguities: list[AmbiguityOut]


class EventExtraction(BaseModel):
    event_type: Literal["caregiver_cancellation", "shift_change", "requirement_change",
                        "urgent_coverage_request", "credential_expiry", "other"]
    caregiver_name: str | None = Field(description="Name of the caregiver the message is from or about.")
    client_name: str | None
    date: str | None = Field(description="The calendar day affected, YYYY-MM-DD, resolved from today's date.")
    date_phrase: str | None = Field(description="The words in the message that indicate the day, verbatim.")
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(description="One neutral sentence. No medical details, no personal reasons.")


class OptionNote(BaseModel):
    option_id: str
    explanation: str = Field(description="One or two sentences using only the facts provided.")


class ExplanationOut(BaseModel):
    summary: str = Field(description="Two to four sentences comparing the options for a care coordinator.")
    options: list[OptionNote]
    caveat: str | None = Field(default=None, description="When a different option could be preferable, say when.")


class CandidateNote(BaseModel):
    caregiver_id: str
    explanation: str


class MatchExplanationOut(BaseModel):
    candidates: list[CandidateNote]
