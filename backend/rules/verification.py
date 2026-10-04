"""Credential verification rules (V-01 … V-07). Deterministic: same input, same result.

Gemini reads the document; these rules decide. A coordinator approves the outcome.
"""

from __future__ import annotations

import difflib
from datetime import date

from models.domain import (
    Caregiver,
    CheckResult,
    CredentialFields,
    FieldEvidence,
    VerificationStatus,
)
from rules.config import VerticalConfig, normalise_credential_type, normalise_skill, skill_label
from services.reference import ReferenceCorpus

FIELD_LABELS = {
    "caregiver_name": "name",
    "credential_type": "credential type",
    "registration_number": "registration number",
    "issuing_authority": "issuing authority",
    "issue_date": "issue date",
    "valid_until": "expiry date",
}


def run_checks(
    fields: CredentialFields,
    evidence: list[FieldEvidence],
    caregiver: Caregiver | None,
    config: VerticalConfig,
    reference: ReferenceCorpus,
    today: date,
    extra_evidenced_skills: set[str] | None = None,
) -> list[CheckResult]:
    checks = [
        _v01_in_date(fields, config, today),
        _v02_number_format(fields, reference),
        _v03_type_eligible(fields, config),
        _v04_name_matches(fields, caregiver),
        _v05_complete_and_confident(fields, evidence, config),
        _v06_skill_evidence(fields, caregiver, config, extra_evidenced_skills or set()),
        _v07_authority_recognised(fields, reference),
    ]
    return checks


def status_from_checks(checks: list[CheckResult]) -> VerificationStatus:
    if any(c.severity == "block" for c in checks):
        return VerificationStatus.BLOCKED
    if any(c.severity == "review" for c in checks):
        return VerificationStatus.NEEDS_REVIEW
    return VerificationStatus.READY


def _v01_in_date(fields: CredentialFields, config: VerticalConfig, today: date) -> CheckResult:
    rule, label = "V-01", "Registration is in date"
    if fields.valid_until is None:
        return CheckResult(rule_id=rule, label=label, passed=False, severity="review",
                           detail="Expiry date is missing or unreadable, so validity can't be confirmed.",
                           reference_id="karnataka-renewal-guide")
    days_left = (fields.valid_until - today).days
    if days_left < 0:
        return CheckResult(rule_id=rule, label="Registration has expired", passed=False, severity="block",
                           detail=f"Expired on {fields.valid_until:%d %b %Y}. Cannot be matched until renewed.",
                           reference_id="karnataka-renewal-guide")
    if days_left <= config.expiry_warning_days:
        return CheckResult(rule_id=rule, label=label, passed=True, severity="info",
                           detail=f"Valid until {fields.valid_until:%d %b %Y}: expires in {days_left} days. Renewal reminder due.",
                           reference_id="karnataka-renewal-guide")
    months = days_left // 30
    return CheckResult(rule_id=rule, label=label, passed=True, severity="ok",
                       detail=f"Valid until {fields.valid_until:%d %b %Y}, about {months} months left.",
                       reference_id="karnataka-renewal-guide")


def _v02_number_format(fields: CredentialFields, reference: ReferenceCorpus) -> CheckResult:
    rule = "V-02"
    authority = reference.find_authority(fields.issuing_authority)
    if authority is None:
        return CheckResult(rule_id=rule, label="Registration number format not checked", passed=True, severity="info",
                           detail="Issuing authority isn't in the reference list, so there is no format to compare against.")
    result = reference.matches_pattern(authority, fields.registration_number)
    if result is None:
        return CheckResult(rule_id=rule, label="Registration number format not checked", passed=True, severity="info",
                           detail=f"No published number format on file for {authority.name}. Confirm on the council register.",
                           reference_id=authority.id)
    if result:
        return CheckResult(rule_id=rule, label="Registration number format matches the council", passed=True,
                           severity="ok", detail=f"Matches the format on file for {authority.name}.",
                           reference_id=authority.id)
    return CheckResult(rule_id=rule, label="Registration number format doesn't match", passed=False, severity="review",
                       detail=f"“{fields.registration_number}” doesn't match the format on file for {authority.name}.",
                       reference_id=authority.id)


def _v03_type_eligible(fields: CredentialFields, config: VerticalConfig) -> CheckResult:
    rule = "V-03"
    ctype = normalise_credential_type(fields.credential_type)
    accepted = ", ".join(config.accepted_credential_types)
    if ctype is None:
        return CheckResult(rule_id=rule, label="Credential type unknown", passed=False, severity="review",
                           detail=f"Couldn't read the credential type. {config.label} accepts {accepted}.")
    if ctype in config.accepted_credential_types:
        return CheckResult(rule_id=rule, label=f"Credential type is eligible for {config.label.lower()}", passed=True,
                           severity="ok", detail=f"{ctype} is accepted ({config.label} accepts {accepted}).")
    return CheckResult(rule_id=rule, label=f"Credential type not eligible for {config.label.lower()}", passed=False,
                       severity="block", detail=f"{ctype} isn't accepted. {config.label} requires {accepted}.")


def _v04_name_matches(fields: CredentialFields, caregiver: Caregiver | None) -> CheckResult:
    rule = "V-04"
    if caregiver is None:
        return CheckResult(rule_id=rule, label="No caregiver profile linked", passed=True, severity="info",
                           detail="Link this document to a caregiver profile to compare names.")
    if not fields.caregiver_name:
        return CheckResult(rule_id=rule, label="Name missing on document", passed=False, severity="review",
                           detail="Couldn't read a name to compare with the profile.")
    ratio = difflib.SequenceMatcher(None, fields.caregiver_name.lower().strip(), caregiver.name.lower().strip()).ratio()
    if ratio >= 0.92:
        return CheckResult(rule_id=rule, label="Name matches caregiver profile", passed=True, severity="ok",
                           detail=f"Matches profile {caregiver.id} ({caregiver.name}).")
    return CheckResult(rule_id=rule, label="Name differs from caregiver profile", passed=False, severity="review",
                       detail=f"Document says “{fields.caregiver_name}”, profile says “{caregiver.name}”.")


def _v05_complete_and_confident(fields: CredentialFields, evidence: list[FieldEvidence],
                                config: VerticalConfig) -> CheckResult:
    rule = "V-05"
    data = fields.model_dump()
    missing = [f for f in config.required_fields if not data.get(f)]
    confidence = {e.field: e.confidence for e in evidence}
    low = [f for f in config.required_fields
           if data.get(f) and confidence.get(f, 1.0) < config.ai_confidence_threshold]
    if missing:
        names = ", ".join(FIELD_LABELS.get(f, f) for f in missing)
        return CheckResult(rule_id=rule, label="Document is incomplete", passed=False, severity="review",
                           detail=f"Missing or unreadable: {names}. Ask for a clearer copy.")
    if low:
        names = ", ".join(f"{FIELD_LABELS.get(f, f)} ({confidence[f]:.2f})" for f in low)
        return CheckResult(rule_id=rule, label="Some values were read with low confidence", passed=False,
                           severity="review",
                           detail=f"Below the {config.ai_confidence_threshold:.2f} threshold: {names}. A person should confirm them.")
    return CheckResult(rule_id=rule, label="Required fields present and readable", passed=True, severity="ok",
                       detail=f"{len(config.required_fields)} of {len(config.required_fields)} required fields extracted with high confidence.")


def _v06_skill_evidence(fields: CredentialFields, caregiver: Caregiver | None, config: VerticalConfig,
                        extra_evidenced: set[str]) -> CheckResult:
    rule = "V-06"
    # Skills printed on the uploaded document are evidenced by that document.
    # Skills only claimed on the caregiver's profile need their own evidence.
    on_document: set[str] = {s for s in (normalise_skill(x) for x in fields.skills) if s}
    claimed: set[str] = set(on_document)
    evidenced: set[str] = set(extra_evidenced) | on_document
    if caregiver:
        claimed |= caregiver.claimed_skills()
        evidenced |= caregiver.evidenced_skills()
    gated = sorted(s for s in claimed if s in config.evidence_required_skills)
    unbacked = [s for s in gated if s not in evidenced]
    if unbacked:
        names = ", ".join(skill_label(s) for s in unbacked)
        return CheckResult(rule_id=rule, label=f"{names.capitalize()}: no supporting evidence", passed=False,
                           severity="review",
                           detail="Claimed on the profile without a certificate or training record. Won't count for matching until reviewed.")
    if gated:
        names = ", ".join(skill_label(s) for s in gated)
        return CheckResult(rule_id=rule, label="Specialist skills are evidenced", passed=True, severity="ok",
                           detail=f"Backed by documents: {names}.")
    return CheckResult(rule_id=rule, label="No specialist skills claimed", passed=True, severity="ok",
                       detail="Nothing here needs extra evidence.")


def _v07_authority_recognised(fields: CredentialFields, reference: ReferenceCorpus) -> CheckResult:
    rule = "V-07"
    authority = reference.find_authority(fields.issuing_authority)
    if authority is None:
        return CheckResult(rule_id=rule, label="Issuing authority not recognised", passed=False, severity="review",
                           detail=f"“{fields.issuing_authority or 'unknown'}” isn't in the approved reference list.")
    note = " (synthetic demo council)" if authority.synthetic else ""
    return CheckResult(rule_id=rule, label="Issuing authority recognised", passed=True, severity="ok",
                       detail=f"{authority.name}{note} is in the approved reference list.", reference_id=authority.id)
