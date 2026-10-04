"""Request-scoped dependencies: settings, storage, Gemini and the caller's workspace."""

from __future__ import annotations

import logging
from functools import lru_cache

from fastapi import Depends, Header, HTTPException

from config import Settings, get_settings
from services import clock, seed
from services.gemini import GeminiService
from services.repository import FirestoreRepository, MemoryRepository, Repository, Store

log = logging.getLogger("kaigo.api")


@lru_cache
def get_repository() -> Repository:
    settings = get_settings()
    if settings.storage_backend == "firestore":
        return FirestoreRepository(project=settings.google_cloud_project, root=settings.firestore_root)
    return MemoryRepository()


@lru_cache
def get_gemini() -> GeminiService:
    return GeminiService(get_settings())


@lru_cache
def _firebase_app():
    import firebase_admin

    return firebase_admin.initialize_app(options={"projectId": get_settings().google_cloud_project})


def workspace_id(
    authorization: str | None = Header(default=None),
    x_workspace_id: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> str:
    """Each signed-in visitor (anonymous Firebase user) gets an isolated synthetic workspace."""
    if settings.auth_mode == "firebase":
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Sign-in required."})
        from firebase_admin import auth

        try:
            claims = auth.verify_id_token(authorization.split(" ", 1)[1], app=_firebase_app())
        except Exception:
            raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Session expired. Reload the page."})
        return claims["uid"]
    ws = (x_workspace_id or "local").strip()
    if not ws.replace("-", "").replace("_", "").isalnum() or len(ws) > 64:
        raise HTTPException(status_code=400, detail={"code": "bad_workspace", "message": "Invalid workspace id."})
    return ws


def get_store(ws: str = Depends(workspace_id), repo: Repository = Depends(get_repository)) -> Store:
    store = Store(repo, ws)
    if repo.get_meta(ws) is None:
        reset_workspace(store, "fresh")
    return store


def reset_workspace(store: Store, scenario: str) -> dict:
    store.repo.clear(store.ws)
    anchor = clock.today()
    store.put_many(seed.build(anchor, scenario))
    meta = {"scenario": scenario, "anchor": anchor.isoformat(), "seeded_at": clock.now().isoformat()}
    store.repo.set_meta(store.ws, meta)
    log.info("Seeded workspace %s with scenario %s", store.ws, scenario)
    return meta
