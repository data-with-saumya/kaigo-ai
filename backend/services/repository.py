"""Persistence. Every record lives inside a workspace (one per demo visitor, later one per agency).

Firestore layout: workspaces/{workspace_id}/{collection}/{doc_id}
"""

from __future__ import annotations

import threading
from typing import Protocol, TypeVar

from pydantic import BaseModel

from models.domain import (
    AICall,
    Assignment,
    AuditEntry,
    Caregiver,
    CareRequest,
    ChangeEvent,
    Client,
    Credential,
    Decision,
    Shift,
)

COLLECTIONS: dict[type[BaseModel], str] = {
    Caregiver: "caregivers",
    Credential: "credentials",
    Client: "clients",
    CareRequest: "care_requests",
    Assignment: "assignments",
    Shift: "shifts",
    ChangeEvent: "events",
    Decision: "approvals",
    AuditEntry: "audit_logs",
    AICall: "ai_calls",
}

M = TypeVar("M", bound=BaseModel)


class Repository(Protocol):
    def get(self, ws: str, collection: str, doc_id: str) -> dict | None: ...
    def list(self, ws: str, collection: str) -> list[dict]: ...
    def put(self, ws: str, collection: str, doc_id: str, data: dict) -> None: ...
    def put_many(self, ws: str, items: list[tuple[str, str, dict]]) -> None: ...
    def delete(self, ws: str, collection: str, doc_id: str) -> None: ...
    def clear(self, ws: str) -> None: ...
    def get_meta(self, ws: str) -> dict | None: ...
    def workspaces(self) -> list[tuple[str, dict]]: ...
    def set_meta(self, ws: str, data: dict) -> None: ...


class MemoryRepository:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, dict[str, dict]]] = {}
        self._meta: dict[str, dict] = {}
        self._lock = threading.RLock()

    def get(self, ws, collection, doc_id):
        with self._lock:
            doc = self._data.get(ws, {}).get(collection, {}).get(doc_id)
            return dict(doc) if doc else None

    def list(self, ws, collection):
        with self._lock:
            return [dict(d) for d in self._data.get(ws, {}).get(collection, {}).values()]

    def put(self, ws, collection, doc_id, data):
        with self._lock:
            self._data.setdefault(ws, {}).setdefault(collection, {})[doc_id] = dict(data)

    def put_many(self, ws, items):
        with self._lock:
            for collection, doc_id, data in items:
                self.put(ws, collection, doc_id, data)

    def delete(self, ws, collection, doc_id):
        with self._lock:
            self._data.get(ws, {}).get(collection, {}).pop(doc_id, None)

    def clear(self, ws):
        with self._lock:
            self._data.pop(ws, None)
            self._meta.pop(ws, None)

    def get_meta(self, ws):
        with self._lock:
            return self._meta.get(ws)

    def workspaces(self):
        with self._lock:
            return [(ws, dict(meta)) for ws, meta in self._meta.items()]

    def set_meta(self, ws, data):
        with self._lock:
            self._meta[ws] = dict(data)


class FirestoreRepository:
    def __init__(self, project: str | None = None, database: str = "(default)", root: str = "workspaces") -> None:
        from google.cloud import firestore

        self._db = firestore.Client(project=project, database=database)
        self._root = root

    def _col(self, ws: str, collection: str):
        return self._db.collection(self._root).document(ws).collection(collection)

    def get(self, ws, collection, doc_id):
        snap = self._col(ws, collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    def list(self, ws, collection):
        return [s.to_dict() for s in self._col(ws, collection).stream()]

    def put(self, ws, collection, doc_id, data):
        self._col(ws, collection).document(doc_id).set(data)

    def put_many(self, ws, items):
        for start in range(0, len(items), 400):  # Firestore batches cap at 500 writes
            batch = self._db.batch()
            for collection, doc_id, data in items[start:start + 400]:
                batch.set(self._col(ws, collection).document(doc_id), data)
            batch.commit()

    def delete(self, ws, collection, doc_id):
        self._col(ws, collection).document(doc_id).delete()

    def clear(self, ws):
        root = self._db.collection(self._root).document(ws)
        for collection in COLLECTIONS.values():
            docs = list(root.collection(collection).list_documents())
            for start in range(0, len(docs), 400):
                batch = self._db.batch()
                for ref in docs[start:start + 400]:
                    batch.delete(ref)
                batch.commit()
        root.delete()

    def get_meta(self, ws):
        snap = self._db.collection(self._root).document(ws).get()
        return snap.to_dict() if snap.exists else None

    def workspaces(self):
        return [(snap.id, snap.to_dict() or {}) for snap in self._db.collection(self._root).stream()]

    def set_meta(self, ws, data):
        self._db.collection(self._root).document(ws).set(data)


class Store:
    """Typed access to one workspace."""

    def __init__(self, repo: Repository, workspace: str) -> None:
        self.repo = repo
        self.ws = workspace

    def get(self, model: type[M], doc_id: str) -> M | None:
        raw = self.repo.get(self.ws, COLLECTIONS[model], doc_id)
        return model.model_validate(raw) if raw else None

    def all(self, model: type[M]) -> list[M]:
        return [model.model_validate(r) for r in self.repo.list(self.ws, COLLECTIONS[model])]

    def put(self, obj: BaseModel, doc_id: str | None = None) -> None:
        self.repo.put(self.ws, COLLECTIONS[type(obj)], doc_id or obj.id, obj.model_dump(mode="json"))

    def put_many(self, objs: list[BaseModel]) -> None:
        self.repo.put_many(self.ws, [(COLLECTIONS[type(o)], o.id, o.model_dump(mode="json")) for o in objs])

    def delete(self, model: type[BaseModel], doc_id: str) -> None:
        self.repo.delete(self.ws, COLLECTIONS[model], doc_id)
