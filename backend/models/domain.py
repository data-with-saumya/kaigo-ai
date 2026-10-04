"""Core domain models. Every record is synthetic in the competition prototype."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, computed_field

Day = date  # alias: a field named `date` would otherwise shadow the type inside its class


class Vertical(StrEnum):
    HOME_NURSING = "home_nursing"
    HOSPICE = "hospice"


class ActorType(StrEnum):
    AI = "ai"
    RULE = "rule"
    HUMAN = "human"
    SYSTEM = "system"


class VerificationStatus(StrEnum):
    PENDING = "pending"            # uploaded, not yet checked
    BLOCKED = "blocked"            # a blocking rule failed (e.g. expired)
    NEEDS_REVIEW = "needs_review"  # rules passed except items a person must look at
    READY = "ready"                # every rule passed; waiting for coordinator approval
    VERIFIED = "verified"          # approved by a coordinator
    REJECTED = "rejected"          # rejected by a coordinator


class Location(BaseModel):
    area: str
    city: str = "Bengaluru"
    lat: float
    lng: float


class SkillClaim(BaseModel):
    skill: str
    evidenced: bool = False
    evidence: str | None = None  # e.g. the supporting document name


class Window(BaseModel):
    start: datetime
    end: datetime


class Caregiver(BaseModel):
    id: str
    name: str
    credential_type: str
    years_experience: int
    skills: list[SkillClaim] = Field(default_factory=list)
    location: Location
    verticals: list[Vertical]
    availability: list[Window] = Field(default_factory=list)
    credential_id: str | None = None
    credential_valid_until: date | None = None
    verification_status: VerificationStatus = VerificationStatus.PENDING

    def evidenced_skills(self) -> set[str]:
        return {s.skill for s in self.skills if s.evidenced}

    def claimed_skills(self) -> set[str]:
        return {s.skill for s in self.skills}


class Client(BaseModel):
    id: str
    name: str
    location: Location
    vertical: Vertical
    prefer_familiar: bool = True
    visit_history: dict[str, int] = Field(default_factory=dict)  # caregiver_id -> completed visits
    care_notes: str | None = None  # operational notes only, never clinical detail


# ---------------------------------------------------------------- credentials

class CredentialFields(BaseModel):
    caregiver_name: str | None = None
    credential_type: str | None = None
    registration_number: str | None = None
    issuing_authority: str | None = None
    issue_date: date | None = None
    valid_until: date | None = None
    skills: list[str] = Field(default_factory=list)


class FieldEvidence(BaseModel):
    field: str
    confidence: float
    source_text: str | None = None  # where on the document the value was read


Severity = Literal["ok", "info", "review", "block"]


class CheckResult(BaseModel):
    rule_id: str
    label: str
    passed: bool
    severity: Severity
    detail: str
    reference_id: str | None = None


class Credential(BaseModel):
    id: str
    caregiver_id: str | None = None
    document_name: str
    fields: CredentialFields
    evidence: list[FieldEvidence] = Field(default_factory=list)
    extraction_source: Literal["gemini", "seed", "manual"] = "gemini"
    checks: list[CheckResult] = Field(default_factory=list)
    status: VerificationStatus = VerificationStatus.PENDING
    uploaded_at: datetime
    decided_at: datetime | None = None
    decision_note: str | None = None
    storage_path: str | None = None  # private Cloud Storage object for uploaded originals
    mime_type: str | None = None


# ---------------------------------------------------------------- care requests

Priority = Literal["low", "normal", "high"]


class Ambiguity(BaseModel):
    field: str
    reason: str
    choices: list[str] = Field(default_factory=list)


class Requirements(BaseModel):
    care_type: Vertical
    required_credentials: list[str]
    required_skills: list[str]
    shift_start: str  # "HH:MM", local time
    shift_end: str
    start_date: date
    duration_days: int = Field(ge=1, le=60)
    location_area: str
    prefer_familiar: bool = True
    priority: Priority = "normal"
    needs_review: list[str] = Field(default_factory=list)


class CareRequest(BaseModel):
    id: str
    client_id: str
    raw_text: str | None = None
    requirements: Requirements
    field_confidence: dict[str, float] = Field(default_factory=dict)
    ambiguities: list[Ambiguity] = Field(default_factory=list)
    extraction_source: Literal["gemini", "manual", "seed"] = "gemini"
    status: Literal["draft", "confirmed", "assigned"] = "draft"
    created_at: datetime


# ---------------------------------------------------------------- assignments and shifts

class Segment(BaseModel):
    caregiver_id: str | None  # None = uncovered
    start: datetime
    end: datetime


class Shift(BaseModel):
    id: str
    assignment_id: str
    client_id: str
    index: int  # 1-based position within the assignment, e.g. night 2 of 5
    start: datetime
    end: datetime
    segments: list[Segment]

    @computed_field
    @property
    def status(self) -> Literal["covered", "partial", "uncovered"]:
        covered = [s for s in self.segments if s.caregiver_id]
        if not covered:
            return "uncovered"
        if all(s.caregiver_id for s in self.segments):
            return "covered"
        return "partial"


class Assignment(BaseModel):
    id: str
    care_request_id: str | None
    client_id: str
    vertical: Vertical
    required_skills: list[str]
    required_credentials: list[str]
    status: Literal["active", "completed", "cancelled"] = "active"
    version: int = 1
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- scoring and replanning

class Factor(BaseModel):
    key: str
    label: str
    layer: Literal["trust", "fit", "continuity"]
    points: int
    max_points: int
    detail: str


class ScoreBreakdown(BaseModel):
    factors: list[Factor]

    @property
    def total(self) -> int:
        return sum(f.points for f in self.factors)

    @property
    def max_total(self) -> int:
        return sum(f.max_points for f in self.factors)


class ReplanOption(BaseModel):
    id: str  # "A", "B", "C"
    kind: Literal["single", "split", "partial"]
    title: str
    segments: list[Segment]
    caregiver_ids: list[str]
    feasible: bool
    violations: list[CheckResult] = Field(default_factory=list)
    factors: list[Factor]
    total: int
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)


class EventType(StrEnum):
    CANCELLATION = "caregiver_cancellation"
    SHIFT_CHANGE = "shift_change"
    REQUIREMENT_CHANGE = "requirement_change"
    URGENT_COVERAGE = "urgent_coverage_request"
    CREDENTIAL_EXPIRY = "credential_expiry"
    OTHER = "other"


class ParsedEvent(BaseModel):
    event_type: EventType
    caregiver_id: str | None = None
    caregiver_name: str | None = None
    client_id: str | None = None
    date: Day | None = None
    confidence: float
    summary: str


class OptionExplanation(BaseModel):
    summary: str
    per_option: dict[str, str] = Field(default_factory=dict)
    caveat: str | None = None


class Decision(BaseModel):
    action: Literal["approved", "rejected"]
    option_id: str | None = None
    note: str | None = None
    actor: str
    at: datetime


class ChangeEvent(BaseModel):
    id: str
    raw_text: str | None = None
    source: Literal["sms", "manual", "system"]
    received_at: datetime
    parsed: ParsedEvent | None = None
    parse_source: Literal["gemini", "manual", "rule"] = "gemini"
    status: Literal["needs_review", "open", "no_feasible_option", "resolved", "rejected", "no_impact"] = "open"
    review_reason: str | None = None
    affected_shift_ids: list[str] = Field(default_factory=list)
    assignment_id: str | None = None
    assignment_version: int | None = None  # optimistic lock: the version the options were built against
    impact_summary: str | None = None
    options: list[ReplanOption] = Field(default_factory=list)
    recommended_option_id: str | None = None
    recommendation_note: str | None = None  # why the rules recommend it, in plain words
    excluded: list[dict] = Field(default_factory=list)  # caregivers ruled out, with the rule that did it
    explanation: OptionExplanation | None = None
    decision: Decision | None = None
    handover_notes: dict[str, str] = Field(default_factory=dict)  # caregiver_id -> note for the incoming caregiver


class AuditEntry(BaseModel):
    id: str
    at: datetime
    actor_type: ActorType
    actor: str
    action: str
    entity_type: str
    entity_id: str | None = None
    summary: str
    details: dict = Field(default_factory=dict)


class AICall(BaseModel):
    id: str
    at: datetime
    task: str
    model: str
    latency_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    ok: bool
    error: str | None = None
