"""Kaigo AI API: care-agency operations with Care Continuity Intelligence."""

from __future__ import annotations

import json
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes import router
from config import get_settings
from services import travel
from services.gemini import AIOutputInvalid, AIUnavailable


class JsonFormatter(logging.Formatter):
    """One JSON object per line, which Cloud Logging parses into structured entries."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {"severity": record.levelname, "message": record.getMessage(), "logger": record.name}
        payload.update(getattr(record, "fields", {}))
        return json.dumps(payload)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
log = logging.getLogger("kaigo")

settings = get_settings()
travel.configure(travel.TravelService(settings.travel_backend, settings.google_cloud_project))
app = FastAPI(title="Kaigo AI", version="0.1.0",
              description="AI operations for care agencies: verify, match, and keep care running when circumstances change.")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.middleware("http")
async def request_log(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    log.info("request", extra={"fields": {
        "path": request.url.path, "method": request.method, "status": response.status_code,
        "latency_ms": int((time.perf_counter() - started) * 1000)}})
    return response


@app.exception_handler(AIUnavailable)
async def ai_unavailable(_: Request, exc: AIUnavailable):
    return JSONResponse(status_code=503, content={"detail": {"code": "ai_unavailable", "message": str(exc)}})


@app.exception_handler(AIOutputInvalid)
async def ai_invalid(_: Request, exc: AIOutputInvalid):
    return JSONResponse(status_code=422, content={"detail": {"code": "ai_output_invalid", "message": str(exc)}})


@app.exception_handler(Exception)
async def unexpected(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": {
        "code": "server_error", "message": "Something went wrong on our side. Your data is unchanged; please try again."}})


@app.get("/")
def root():
    return {"service": "kaigo-api", "docs": "/docs"}
