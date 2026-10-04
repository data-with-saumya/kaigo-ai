"""Read models for the UI: the dashboard and schedule views, assembled from stored state."""

from __future__ import annotations

from datetime import timedelta

from models.domain import (
    AICall,
    Assignment,
    AuditEntry,
    Caregiver,
    CareRequest,
    ChangeEvent,
    Client,
    Credential,
    Message,
    Shift,
    VerificationStatus,
)
from services import clock
from services.repository import Store

OPEN_EVENT_STATES = ("open", "needs_review", "no_feasible_option")


def shift_view(shift: Shift, names: dict[str, str], clients: dict[str, Client],
               expiry: dict[str, object] | None = None) -> dict:
    client = clients.get(shift.client_id)
    risk = None
    for seg in shift.segments:
        valid_until = (expiry or {}).get(seg.caregiver_id) if seg.caregiver_id else None
        if valid_until and valid_until < seg.end.date():
            risk = f"{names.get(seg.caregiver_id)}'s registration expires {clock.day_label(valid_until)} (rule E-02)"
    return {
        "risk": risk,
        "id": shift.id, "assignment_id": shift.assignment_id, "index": shift.index,
        "client_id": shift.client_id, "client_name": client.name if client else shift.client_id,
        "vertical": client.vertical.value if client else None,
        "start": shift.start, "end": shift.end, "status": shift.status,
        "segments": [{"caregiver_id": s.caregiver_id, "caregiver_name": names.get(s.caregiver_id) if s.caregiver_id else None,
                      "start": s.start, "end": s.end} for s in shift.segments],
    }


def dashboard(store: Store) -> dict:
    now = clock.now()
    caregivers = store.all(Caregiver)
    names = {c.id: c.name for c in caregivers}
    clients = {c.id: c for c in store.all(Client)}
    shifts = sorted((s for s in store.all(Shift) if s.end > now), key=lambda s: s.start)
    expiry = {c.id: c.credential_valid_until for c in caregivers}
    assignments = [a for a in store.all(Assignment) if a.status == "active"]
    requests = store.all(CareRequest)
    events = sorted(store.all(ChangeEvent), key=lambda e: e.received_at, reverse=True)
    credentials = {c.id: c for c in store.all(Credential)}
    next_day = [s for s in shifts if s.start <= now + timedelta(hours=24)]

    pending = []
    for cg in caregivers:
        if cg.verification_status == VerificationStatus.VERIFIED:
            continue
        cred = credentials.get(cg.credential_id) if cg.credential_id else None
        issue = next((c for c in (cred.checks if cred else []) if c.severity in ("block", "review")), None)
        pending.append({
            "caregiver_id": cg.id, "name": cg.name, "status": cg.verification_status,
            "credential_id": cg.credential_id,
            "reason": issue.detail if issue else "Registration document not uploaded yet",
        })

    open_requests = [r for r in requests if r.status in ("draft", "confirmed")]
    alerts = [e for e in events if e.status in OPEN_EVENT_STATES]
    by_vertical: dict[str, int] = {}
    for a in assignments:
        by_vertical[a.vertical.value] = by_vertical.get(a.vertical.value, 0) + 1

    audit_entries = sorted(store.all(AuditEntry), key=lambda a: a.at, reverse=True)[:12]
    return {
        "now": now,
        "kpis": {
            "active_assignments": len(assignments),
            "assignments_by_vertical": by_vertical,
            "shifts_next_24h": len(next_day),
            "uncovered_next_24h": sum(1 for s in next_day if s.status != "covered"),
            "uncovered_upcoming": sum(1 for s in shifts if s.status != "covered"),
            "pending_verifications": len(pending),
            "blocked_credentials": sum(1 for p in pending if p["status"] == VerificationStatus.BLOCKED),
            "open_requests": len(open_requests),
            "requests_needing_confirmation": sum(1 for r in open_requests if r.requirements.needs_review),
            "continuity_alerts": len(alerts),
            "at_risk_shifts": sum(1 for s in shifts if shift_view(s, names, clients, expiry)["risk"]),
            "unread_messages": sum(1 for m in store.all(Message) if not m.read_by_coordinator),
        },
        "alerts": [{
            "event_id": e.id, "status": e.status, "received_at": e.received_at,
            "caregiver_name": names.get(e.parsed.caregiver_id) if e.parsed and e.parsed.caregiver_id else None,
            "summary": e.impact_summary or e.review_reason or (e.parsed.summary if e.parsed else e.raw_text),
            "options": len(e.options),
        } for e in alerts],
        "upcoming_shifts": [shift_view(s, names, clients, expiry) for s in shifts[:12]],
        "pending_verifications": pending,
        "open_requests": [{
            "id": r.id, "client_name": clients[r.client_id].name if r.client_id in clients else r.client_id,
            "summary": r.raw_text, "status": r.status, "needs_review": r.requirements.needs_review,
        } for r in open_requests],
        "recent_audit": audit_entries,
    }


def metrics(store: Store) -> dict:
    calls = store.all(AICall)
    by_task: dict[str, dict] = {}
    for call in calls:
        t = by_task.setdefault(call.task, {"calls": 0, "ok": 0, "latency_ms": [], "input_tokens": 0, "output_tokens": 0})
        t["calls"] += 1
        t["ok"] += int(call.ok)
        t["latency_ms"].append(call.latency_ms)
        t["input_tokens"] += call.input_tokens or 0
        t["output_tokens"] += call.output_tokens or 0
    for t in by_task.values():
        lat = sorted(t.pop("latency_ms"))
        t["median_latency_ms"] = lat[len(lat) // 2] if lat else None
    return {"ai_calls": len(calls), "by_task": by_task}
