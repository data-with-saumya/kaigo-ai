"""v2: proactive expiry monitoring, tie-break rule C-02, travel fallback, handover guard, document isolation."""

import pytest

from agents.continuity.handover import HandoverError, write_handover
from agents.continuity.monitor import at_risk, scan
from agents.continuity.replan import _recommendation_note, decide, open_event
from models.domain import ChangeEvent, EventType, Location, ReplanOption, Shift
from services import travel
from services.documents import DocumentStore
from services.gemini import GeminiService


def test_expiry_monitor_finds_shifts_that_will_break(fresh_store):
    risky = at_risk(fresh_store, 14)
    assert [s.index for s, _ in risky] == [4, 5]                 # Sana's last two visits to Lakshmi
    assert {cg.name for _, cg in risky} == {"Sana Sheikh"}


def test_scan_opens_one_event_releases_first_shift_and_never_duplicates(fresh_store):
    opened = scan(fresh_store, 14)
    assert len(opened) == 1
    event = opened[0]
    assert event.parse_source == "rule" and event.parsed.event_type == EventType.CREDENTIAL_EXPIRY
    assert "registration expires" in event.impact_summary
    assert fresh_store.get(Shift, "SH-0119-04").status == "uncovered"
    assert fresh_store.get(Shift, "SH-0119-05").status == "covered"   # handled next, one at a time
    assert event.recommended_option_id == "A"
    assert scan(fresh_store, 14) == []                                 # already being handled


def test_approving_an_expiry_replacement_opens_the_next_shift(fresh_store):
    event = scan(fresh_store, 14)[0]
    decide(fresh_store, event.id, "approved", event.recommended_option_id, None, "Care coordinator")
    assert fresh_store.get(Shift, "SH-0119-04").status == "covered"
    follow_up = [e for e in fresh_store.all(ChangeEvent) if e.status == "open"]
    assert len(follow_up) == 1 and follow_up[0].affected_shift_ids == ["SH-0119-05"]


def _option(oid, total, people):
    return ReplanOption(id=oid, kind="single" if people == 1 else "split", title=oid, segments=[],
                        caregiver_ids=[f"c{i}" for i in range(people)], feasible=True, factors=[], total=total)


def test_rule_c02_explains_ties():
    note = _recommendation_note([_option("A", 81, 1), _option("B", 81, 2)])
    assert "tied" in note and "C-02" in note
    assert "highest" in _recommendation_note([_option("A", 83, 1), _option("B", 81, 2)])


def test_travel_falls_back_to_straight_line_when_maps_is_off():
    svc = travel.TravelService("straight_line")
    est = svc.estimates({"x": Location(area="a", lat=12.90, lng=77.60)}, Location(area="b", lat=12.92, lng=77.60))
    assert est["x"].source == "straight_line" and est["x"].minutes is None and 2.0 < est["x"].km < 2.5


def test_handover_only_after_approval(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation())
    with pytest.raises(HandoverError):
        write_handover(GeminiService.__new__(GeminiService), assigned_store, event)


def test_documents_are_scoped_to_their_workspace():
    docs = DocumentStore("bucket", root="workspaces_v2")
    assert docs.belongs_to("workspaces_v2/ws1/credentials/C1/file.png", "ws1")
    assert not docs.belongs_to("workspaces_v2/ws2/credentials/C1/file.png", "ws1")
    assert not docs.belongs_to("workspaces/ws1/credentials/C1/file.png", "ws1")


def test_at_risk_shift_is_flagged_on_the_dashboard(fresh_store):
    from services.views import dashboard
    d = dashboard(fresh_store)
    assert d["kpis"]["at_risk_shifts"] == 2
    flagged = [s for s in d["upcoming_shifts"] if s["risk"]]
    assert flagged and "E-02" in flagged[0]["risk"]


def test_scan_ignores_shifts_beyond_horizon(fresh_store):
    assert at_risk(fresh_store, horizon_days=1) == []
    assert len(at_risk(fresh_store, horizon_days=None)) == 2
