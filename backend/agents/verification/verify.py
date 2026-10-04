"""Verification agent: runs the credential rules and applies the coordinator's decision."""

from __future__ import annotations

from models.domain import ActorType, Caregiver, Credential, SkillClaim, VerificationStatus, Vertical
from rules.config import load_vertical, normalise_credential_type, normalise_skill
from rules.verification import run_checks, status_from_checks
from services import audit, clock
from services.reference import load_reference
from services.repository import Store


class VerificationError(Exception):
    pass


def check(store: Store, credential: Credential) -> Credential:
    caregiver = store.get(Caregiver, credential.caregiver_id) if credential.caregiver_id else None
    vertical = caregiver.verticals[0] if caregiver and caregiver.verticals else Vertical.HOME_NURSING
    credential.checks = run_checks(credential.fields, credential.evidence, caregiver, load_vertical(vertical),
                                   load_reference(), clock.today())
    credential.status = status_from_checks(credential.checks)
    store.put(credential)

    failed = [c for c in credential.checks if c.severity in ("review", "block")]
    passed = sum(1 for c in credential.checks if c.passed)
    summary = f"Checked {credential.document_name}: {passed} of {len(credential.checks)} rules passed"
    if failed:
        summary += "; " + "; ".join(f"{c.rule_id} {c.label.lower()}" for c in failed)
    audit.record(store, ActorType.RULE, "Verification rules", "credential.checked", summary, "credential",
                 credential.id, {"status": credential.status, "failed": [c.rule_id for c in failed]})
    if caregiver and caregiver.verification_status != VerificationStatus.VERIFIED:
        caregiver.verification_status = credential.status
        store.put(caregiver)
    return credential


def decide(store: Store, credential_id: str, action: str, note: str | None, actor: str) -> Credential:
    credential = store.get(Credential, credential_id)
    if credential is None:
        raise VerificationError("Credential not found.")
    if credential.status in (VerificationStatus.VERIFIED, VerificationStatus.REJECTED):
        raise VerificationError(f"Already {credential.status.value}.")
    caregiver = store.get(Caregiver, credential.caregiver_id) if credential.caregiver_id else None
    now = clock.now()

    if action == "approve":
        if credential.status == VerificationStatus.BLOCKED:
            blocking = next(c for c in credential.checks if c.severity == "block")
            raise VerificationError(f"Can't approve: {blocking.detail}")
        if caregiver is None:
            raise VerificationError("Link this document to a caregiver profile before approving.")
        credential.status = VerificationStatus.VERIFIED
        caregiver.verification_status = VerificationStatus.VERIFIED
        caregiver.credential_id = credential.id
        caregiver.credential_valid_until = credential.fields.valid_until
        caregiver.credential_type = normalise_credential_type(credential.fields.credential_type) or caregiver.credential_type
        # Skills the document itself certifies become evidenced on the profile.
        for raw in credential.fields.skills:
            skill = normalise_skill(raw)
            if not skill:
                continue
            existing = next((s for s in caregiver.skills if s.skill == skill), None)
            if existing:
                existing.evidenced, existing.evidence = True, credential.document_name
            else:
                caregiver.skills.append(SkillClaim(skill=skill, evidenced=True, evidence=credential.document_name))
        flagged = [c.label for c in credential.checks if c.severity == "review"]
        summary = f"Approved verification for {caregiver.name}"
        if flagged:
            summary += f" (still flagged: {'; '.join(flagged)})"
    elif action == "reject":
        credential.status = VerificationStatus.REJECTED
        if caregiver and caregiver.verification_status != VerificationStatus.VERIFIED:
            caregiver.verification_status = VerificationStatus.REJECTED
        summary = f"Rejected {credential.document_name}"
    else:
        raise VerificationError("Unknown action.")

    credential.decided_at, credential.decision_note = now, note
    store.put(credential)
    if caregiver:
        store.put(caregiver)
    audit.record(store, ActorType.HUMAN, actor, f"credential.{action}d",
                 summary + (f". Note: {note}" if note else ""), "credential", credential.id)
    return credential
