"""API behaviour with Gemini switched off: everything deterministic still works, AI steps say so clearly."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from main import app
from services import clock


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers.update({"X-Workspace-Id": "api-test"})
    c.post("/api/workspace/reset", json={"scenario": "after_assignment"})
    return c


def test_health_reports_ai_state(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["gemini"] in ("available", "unavailable")


def test_dashboard_without_ai(client):
    body = client.get("/api/dashboard").json()
    assert body["kpis"]["active_assignments"] == 3
    assert body["kpis"]["pending_verifications"] >= 2
    assert body["upcoming_shifts"]


def test_ai_steps_return_clear_unavailable_state(client):
    r = client.post("/api/events/interpret", json={"text": "Anjali here, can't make tomorrow night"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "ai_unavailable"
    r = client.post("/api/care-requests/extract", json={"client_id": "CL-0031", "text": "Wound care nurse tonight"})
    assert r.status_code == 503


def test_manual_continuity_flow_end_to_end(client):
    tomorrow = (clock.today() + timedelta(days=1)).isoformat()
    event = client.post("/api/events/manual", json={"caregiver_id": "CG-0101", "date": tomorrow}).json()
    assert event["status"] == "open" and len(event["options"]) == 3
    assert client.get("/api/dashboard").json()["kpis"]["continuity_alerts"] == 1
    r = client.post(f"/api/events/{event['id']}/decision",
                    json={"action": "approved", "option_id": event["recommended_option_id"]})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    shift = client.get("/api/shifts", params={"assignment_id": "AS-0142"}).json()[1]
    assert shift["status"] == "covered"
    assert client.get("/api/audit").json()[0]["actor_type"] == "human"


def test_manual_credential_and_approval(client):
    body = {"caregiver_id": "CG-0108", "document_name": "fatima-khan-registration.png", "fields": {
        "caregiver_name": "Fatima Khan", "credential_type": "Registered Nurse",
        "registration_number": "DSNC-RN-2022-08802", "issuing_authority": "Demo State Nursing Council",
        "issue_date": "2022-01-24", "valid_until": (clock.today() + timedelta(days=700)).isoformat(),
        "skills": []}}
    cred = client.post("/api/credentials/manual", json=body).json()
    assert cred["status"] == "ready"
    approved = client.post(f"/api/credentials/{cred['id']}/decision", json={"action": "approve"}).json()
    assert approved["status"] == "verified"
    fatima = next(c for c in client.get("/api/caregivers").json() if c["id"] == "CG-0108")
    assert fatima["verification_status"] == "verified"


def test_blocked_credential_cannot_be_approved(client):
    r = client.post("/api/credentials/CRD-0104/decision", json={"action": "approve"})
    assert r.status_code == 409


def test_workspaces_are_isolated(client):
    other = TestClient(app)
    other.headers.update({"X-Workspace-Id": "someone-else"})
    other.post("/api/workspace/reset", json={"scenario": "fresh"})
    assert other.get("/api/dashboard").json()["kpis"]["active_assignments"] == 2
    assert client.get("/api/dashboard").json()["kpis"]["active_assignments"] == 3


def test_matches_and_assignment_via_api(client):
    client.post("/api/workspace/reset", json={"scenario": "fresh"})
    req = {"client_id": "CL-0031", "text": "Wound care nurse, nights", "requirements": {
        "care_type": "home_nursing", "required_credentials": ["RN", "RN-RM"], "required_skills": ["wound_care"],
        "shift_start": "18:00", "shift_end": "06:00", "start_date": clock.today().isoformat(), "duration_days": 5,
        "location_area": "Jayanagar"}}
    created = client.post("/api/care-requests", json=req).json()
    result = client.get(f"/api/care-requests/{created['id']}/matches").json()
    assert result["candidates"][0]["name"] == "Anjali Rao"
    r = client.post(f"/api/care-requests/{created['id']}/assign", json={"caregiver_id": "CG-0101"})
    assert r.status_code == 200 and "5 of 5" in r.json()["summary"]
