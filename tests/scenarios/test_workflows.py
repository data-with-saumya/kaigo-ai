"""End-to-end scenarios from the evaluation framework (README §15), run against the rules engine."""


import pytest

from agents.continuity.replan import DecisionError, StaleStateError, decide, open_event
from agents.matching.match import AssignmentError, assign, find_candidates
from models.domain import (
    Assignment,
    AuditEntry,
    Caregiver,
    CareRequest,
    Segment,
    Shift,
    VerificationStatus,
    Vertical,
)


def test_matching_ranks_familiar_caregiver_first_and_explains_exclusions(assigned_store):
    request = assigned_store.get(CareRequest, "CR-0142")
    result = find_candidates(assigned_store, request)
    ranked = [c.name for c in result.candidates]
    assert ranked[0] == "Anjali Rao"                     # familiar, full coverage
    assert "Priya Nair" in ranked
    deepa = next(c for c in result.candidates if c.name == "Deepa Kurian")
    assert not deepa.full_coverage and deepa.nights_full == 3  # partial-coverage candidate
    reasons = {e.name: e.rule_id for e in result.excluded}
    assert reasons["Rahul Menon"] == "V-01"              # expired credential
    assert reasons["Sana Sheikh"] == "M-02"              # required skill missing
    assert reasons["Kiran D'Souza"] == "S-01"            # overlapping shift
    assert reasons["Neha Joshi"] == "S-02"               # unavailable
    assert result.checked == len(result.candidates) + len(result.excluded)


def test_unverified_caregiver_is_excluded_until_approved(fresh_store):
    request = CareRequest.model_validate({**fresh_store.get(CareRequest, "CR-0150").model_dump(),
                                          "id": "CR-X"})
    request.requirements.care_type = Vertical.HOME_NURSING
    request.requirements.required_skills = ["wound_care"]
    result = find_candidates(fresh_store, request)
    assert {e.name: e.rule_id for e in result.excluded}["Priya Nair"] == "M-01"


def test_assignment_persists_and_cannot_double_assign(fresh_store, anchor):
    request = fresh_store.get(CareRequest, "CR-0150")
    request.requirements.care_type = Vertical.HOME_NURSING
    request.requirements.required_skills = ["wound_care"]
    request.requirements.start_date = anchor
    request.requirements.shift_start, request.requirements.shift_end = "18:00", "06:00"
    request.client_id = "CL-0031"
    request.requirements.needs_review = []
    fresh_store.put(request)
    assignment, shifts, summary = assign(fresh_store, request, "CG-0101", "Care coordinator")
    assert fresh_store.get(Assignment, assignment.id) is not None
    assert all(s.status == "covered" for s in shifts)
    assert fresh_store.get(CareRequest, "CR-0150").status == "assigned"
    with pytest.raises(AssignmentError):
        assign(fresh_store, fresh_store.get(CareRequest, "CR-0150"), "CG-0101", "Care coordinator")


def test_partial_assignment_leaves_visible_gaps(fresh_store, anchor):
    request = fresh_store.get(CareRequest, "CR-0150")
    request.requirements.care_type = Vertical.HOME_NURSING
    request.requirements.required_skills = ["wound_care"]
    request.requirements.start_date = anchor
    request.requirements.duration_days = 5
    request.requirements.shift_start, request.requirements.shift_end = "18:00", "06:00"
    request.client_id = "CL-0031"
    request.requirements.needs_review = []
    _, shifts, summary = assign(fresh_store, request, "CG-0103", "Care coordinator")  # Deepa: 3 of 5 nights
    statuses = [s.status for s in shifts]
    assert statuses.count("covered") == 3 and "uncovered" in statuses and "partial" in statuses
    assert "still need cover" in summary


def test_cancellation_detects_impact_and_builds_tradeoff_options(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation())
    assert event.status == "open"
    shift = assigned_store.get(Shift, event.affected_shift_ids[0])
    assert shift.status == "uncovered" and shift.index == 2
    kinds = {o.kind for o in event.options}
    assert {"single", "split", "partial"} <= kinds
    recommended = next(o for o in event.options if o.id == event.recommended_option_id)
    assert recommended.feasible and recommended.id == "A"
    partial = next(o for o in event.options if o.kind == "partial")
    assert not partial.feasible and partial.violations[0].rule_id == "C-01"
    split = next(o for o in event.options if o.kind == "split")
    familiarity = {o.kind: next(f.points for f in o.factors if f.key == "familiarity") for o in event.options}
    assert familiarity["split"] > familiarity["single"]   # familiar vs unfamiliar trade-off is visible
    assert any("handover" in c for c in split.cons)


def test_approval_updates_state_version_and_audit(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation())
    split = next(o for o in event.options if o.kind == "split")
    decided = decide(assigned_store, event.id, "approved", split.id, "Family is fine with a midnight handover",
                     "Care coordinator")
    assert decided.status == "resolved"
    shift = assigned_store.get(Shift, event.affected_shift_ids[0])
    assert shift.status == "covered" and len(shift.segments) == 2
    assert assigned_store.get(Assignment, event.assignment_id).version == 2
    assert any(a.action == "event.approved" for a in assigned_store.all(AuditEntry))
    with pytest.raises(DecisionError):
        decide(assigned_store, event.id, "approved", split.id, None, "Care coordinator")


def test_infeasible_option_cannot_be_approved(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation())
    partial = next(o for o in event.options if o.kind == "partial")
    with pytest.raises(DecisionError):
        decide(assigned_store, event.id, "approved", partial.id, None, "Care coordinator")


def test_rejection_keeps_shift_uncovered_and_is_logged(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation())
    decide(assigned_store, event.id, "rejected", None, "Try agency partners", "Care coordinator")
    assert assigned_store.get(Shift, event.affected_shift_ids[0]).status == "uncovered"
    assert any(a.action == "event.rejected" for a in assigned_store.all(AuditEntry))


def test_stale_option_is_refused_and_refreshed(assigned_store, cancellation, anchor):
    event = open_event(assigned_store, cancellation())
    option_a = next(o for o in event.options if o.id == "A")
    # Meanwhile Priya is booked elsewhere for the same night.
    night = assigned_store.get(Shift, event.affected_shift_ids[0])
    other = Shift(id="SH-OTHER-01", assignment_id="AS-0127", client_id="CL-0027", index=99,
                  start=night.start, end=night.end,
                  segments=[Segment(caregiver_id=option_a.caregiver_ids[0], start=night.start, end=night.end)])
    assigned_store.put(other)
    with pytest.raises(StaleStateError) as err:
        decide(assigned_store, event.id, "approved", "A", None, "Care coordinator")
    assert all(option_a.caregiver_ids[0] not in o.caregiver_ids or not o.feasible
               for o in err.value.event.options if o.feasible)


def test_no_feasible_replacement(assigned_store, cancellation):
    priya = assigned_store.get(Caregiver, "CG-0107")
    priya.verification_status = VerificationStatus.PENDING
    assigned_store.put(priya)
    event = open_event(assigned_store, cancellation())
    assert event.status == "no_feasible_option"
    assert event.recommended_option_id is None


def test_low_confidence_event_waits_for_a_person(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation(confidence=0.6))
    assert event.status == "needs_review"
    assert assigned_store.get(Shift, "SH-0142-02").status == "covered"  # nothing changed automatically


def test_event_with_no_matching_shift_has_no_impact(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation(days_ahead=9))
    assert event.status == "no_impact"


def test_unconfirmed_request_cannot_be_assigned(fresh_store):
    request = fresh_store.get(CareRequest, "CR-0150")
    assert request.requirements.needs_review
    with pytest.raises(AssignmentError):
        assign(fresh_store, request, "CG-0105", "Care coordinator")
