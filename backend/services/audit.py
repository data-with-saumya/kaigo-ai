"""Audit trail: every AI proposal, rule result and human decision that changes state."""

from __future__ import annotations

import uuid

from models.domain import ActorType, AuditEntry
from services import clock
from services.repository import Store


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"


def record(
    store: Store,
    actor_type: ActorType,
    actor: str,
    action: str,
    summary: str,
    entity_type: str,
    entity_id: str | None = None,
    details: dict | None = None,
) -> AuditEntry:
    entry = AuditEntry(
        id=new_id("AL"),
        at=clock.now(),
        actor_type=actor_type,
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        details=details or {},
    )
    store.put(entry)
    return entry
