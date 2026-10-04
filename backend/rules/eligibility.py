"""Hard matching rules. A caregiver who fails any of these is excluded, with the reason shown."""

from __future__ import annotations

from datetime import date

from models.domain import Caregiver, CheckResult, VerificationStatus, Vertical
from rules.config import skill_label


def hard_check(
    caregiver: Caregiver,
    *,
    vertical: Vertical,
    required_credentials: list[str],
    required_skills: list[str],
    work_until: date,
    today: date,
) -> CheckResult | None:
    """Return the first failed hard rule, or None if the caregiver is eligible."""
    if vertical not in caregiver.verticals:
        return _fail("M-04", "Not set up for this care type",
                     f"{caregiver.name} isn't registered for {vertical.value.replace('_', ' ')} work.")

    valid_until = caregiver.credential_valid_until
    if valid_until is not None and valid_until < today:
        return _fail("V-01", "Registration expired", f"Registration expired {valid_until:%d %b %Y}.")
    if caregiver.verification_status != VerificationStatus.VERIFIED:
        return _fail("M-01", "Verification not approved",
                     "Credential verification hasn't been approved by a coordinator yet.")

    if required_credentials and caregiver.credential_type not in required_credentials:
        return _fail("M-03", "Credential type not accepted",
                     f"{caregiver.credential_type} isn't one of {', '.join(required_credentials)}.")

    missing = [s for s in required_skills if s not in caregiver.evidenced_skills()]
    if missing:
        names = ", ".join(skill_label(s) for s in missing)
        claimed = [s for s in missing if s in caregiver.claimed_skills()]
        detail = (f"{names.capitalize()} claimed but not evidenced." if claimed
                  else f"No evidence of {names} skill.")
        return _fail("M-02", "Required skill missing", detail)
    # Checked last, so a caregiver who is unsuitable anyway is reported for the more basic reason.
    if valid_until is not None and valid_until < work_until:
        return _fail("V-01", "Registration expires before the work ends",
                     f"Registration expires {valid_until:%d %b %Y}, before the last shift.")
    return None


def _fail(rule_id: str, label: str, detail: str) -> CheckResult:
    return CheckResult(rule_id=rule_id, label=label, passed=False, severity="block", detail=detail)
