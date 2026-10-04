"""Deterministic rules: verification, eligibility, scheduling and scoring."""

from datetime import date, timedelta

from models.domain import CredentialFields, FieldEvidence, VerificationStatus, Vertical
from rules.config import load_vertical, normalise_credential_type, normalise_skill
from rules.eligibility import hard_check
from rules.scheduling import free_within, subtract
from rules.verification import run_checks, status_from_checks
from services import clock
from services.reference import load_reference

CONFIG = load_vertical(Vertical.HOME_NURSING)
REFERENCE = load_reference()
TODAY = date(2026, 10, 3)


def fields(**overrides):
    base = dict(caregiver_name="Priya Nair", credential_type="Registered Nurse & Registered Midwife",
                registration_number="DSNC-RNRM-2019-04417", issuing_authority="Demo State Nursing Council",
                issue_date=date(2019, 6, 12), valid_until=date(2027, 6, 11), skills=["wound care"])
    base.update(overrides)
    return CredentialFields(**base)


def evidence(conf=0.97, **per_field):
    names = ["caregiver_name", "credential_type", "registration_number", "issuing_authority", "issue_date", "valid_until"]
    return [FieldEvidence(field=n, confidence=per_field.get(n, conf)) for n in names]


def by_rule(checks):
    return {c.rule_id: c for c in checks}


def test_valid_credential_is_ready_for_approval():
    checks = run_checks(fields(), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert status_from_checks(checks) == VerificationStatus.READY
    assert by_rule(checks)["V-02"].severity == "ok"  # synthetic council number format matches
    assert by_rule(checks)["V-07"].reference_id == "demo-snc"


def test_expired_credential_is_blocked():
    checks = run_checks(fields(valid_until=date(2026, 8, 14)), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-01"].severity == "block"
    assert status_from_checks(checks) == VerificationStatus.BLOCKED


def test_expiring_soon_is_flagged_but_valid():
    checks = run_checks(fields(valid_until=TODAY + timedelta(days=30)), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-01"].severity == "info"
    assert status_from_checks(checks) == VerificationStatus.READY


def test_incomplete_credential_needs_review():
    checks = run_checks(fields(valid_until=None), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-05"].severity == "review"
    assert status_from_checks(checks) == VerificationStatus.NEEDS_REVIEW


def test_low_confidence_value_goes_to_a_person():
    checks = run_checks(fields(), evidence(registration_number=0.6), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-05"].severity == "review"
    assert "0.60" in by_rule(checks)["V-05"].detail


def test_wrong_number_format_needs_review():
    checks = run_checks(fields(registration_number="12345"), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-02"].severity == "review"


def test_unknown_authority_needs_review():
    checks = run_checks(fields(issuing_authority="Nursing Board of Atlantis"), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-07"].severity == "review"


def test_ineligible_credential_type_is_blocked():
    checks = run_checks(fields(credential_type="ANM"), evidence(), None, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-03"].severity == "block"


def test_real_council_is_recognised_without_inventing_a_number_format():
    checks = run_checks(fields(issuing_authority="Karnataka State Nursing Council"), evidence(), None, CONFIG,
                        REFERENCE, TODAY)
    assert by_rule(checks)["V-07"].severity == "ok"
    assert by_rule(checks)["V-02"].severity == "info"


def test_skill_claim_without_evidence_needs_review(fresh_store):
    from models.domain import Caregiver
    priya = fresh_store.get(Caregiver, "CG-0107")
    checks = run_checks(fields(skills=[]), evidence(), priya, CONFIG, REFERENCE, TODAY)
    assert by_rule(checks)["V-06"].severity == "review"
    assert "Palliative care" in by_rule(checks)["V-06"].label


def test_normalisers():
    assert normalise_credential_type("Registered Nurse & Registered Midwife") == "RN-RM"
    assert normalise_credential_type("Registered Nurse") == "RN"
    assert normalise_skill("Wound-care") == "wound_care"
    assert normalise_skill("diabetes management") == "diabetic_care"
    assert normalise_skill("post-operative dressing") == "post_operative_care"
    assert normalise_skill("astrophysics") is None


def test_hard_check_reports_the_rule(fresh_store, anchor):
    from models.domain import Caregiver
    args = dict(vertical=Vertical.HOME_NURSING, required_credentials=["RN", "RN-RM"], required_skills=["wound_care"],
                work_until=anchor + timedelta(days=5), today=anchor)
    assert hard_check(fresh_store.get(Caregiver, "CG-0101"), **args) is None
    assert hard_check(fresh_store.get(Caregiver, "CG-0104"), **args).rule_id == "V-01"   # expired
    assert hard_check(fresh_store.get(Caregiver, "CG-0106"), **args).rule_id == "M-02"   # skill not evidenced
    assert hard_check(fresh_store.get(Caregiver, "CG-0107"), **args).rule_id == "M-01"   # not yet approved
    assert hard_check(fresh_store.get(Caregiver, "CG-0108"), **args).rule_id == "M-01"


def test_interval_maths(anchor):
    night = clock.shift_window(anchor, "18:00", "06:00")
    assert night[1] - night[0] == timedelta(hours=12)
    first_half = (night[0], night[0] + timedelta(hours=6))
    assert subtract([night], [first_half]) == [(first_half[1], night[1])]
    # A shift ending 10:00 the same day blocks 18:00 when 8 hours' rest is required.
    busy = [(clock.at(anchor, "04:00"), clock.at(anchor, "12:00"))]
    assert free_within(night, [night], busy, min_rest_hours=8) == [(clock.at(anchor, "20:00"), night[1])]


def test_rule_r01_relative_window_without_start_is_ambiguous():
    from agents.request.extract import RELATIVE_WINDOW, STATED_START

    def ambiguous(text):
        return bool(RELATIVE_WINDOW.search(text)) and not STATED_START.search(text)

    assert ambiguous("Mrs Sharma needs a wound-care nurse from 6 PM to 6 AM for the next five days.")
    assert ambiguous("A nurse for my mother for a few nights")
    assert not ambiguous("Nights for the next three days starting tomorrow")
    assert not ambiguous("Next 4 nights from Monday, 7pm-7am")
