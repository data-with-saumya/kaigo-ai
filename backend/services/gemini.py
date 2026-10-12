"""Gemini access. Structured output only: every response must validate against a schema.

If Gemini is off or failing, callers get AIUnavailable and show that state. Nothing is invented.
"""

from __future__ import annotations

import logging
import time
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from config import Settings
from models.domain import AICall
from services import audit, clock
from services.repository import Store

log = logging.getLogger("kaigo.gemini")
T = TypeVar("T", bound=BaseModel)

# Vertex AI sometimes answers "try again later" (429 resource exhausted, or a 5xx) when shared capacity is busy.
# Those are retried briefly with backoff; anything else fails straight away, as before.
TRANSIENT_CODES = {429, 500, 503, 504}
RETRY_DELAYS_S = (1.0, 2.5, 4.5)


def _is_transient(exc: Exception) -> bool:
    return getattr(exc, "code", None) in TRANSIENT_CODES


class AIUnavailable(Exception):
    """Gemini isn't configured or didn't answer. The UI shows a clear unavailable state."""


class AIOutputInvalid(Exception):
    """Gemini answered, but the answer failed schema or grounding validation. Routed to a person."""


class GeminiService:
    def __init__(self, settings: Settings) -> None:
        self.model = settings.gemini_model
        self.backend = settings.gemini_backend
        self._client = None
        self._timeout_ms = int(settings.gemini_timeout_s * 1000)
        self._thinking_level = settings.gemini_thinking_level.upper() or None
        try:
            if self.backend == "vertex":
                from google import genai
                self._client = genai.Client(vertexai=True, project=settings.google_cloud_project,
                                            location=settings.gemini_location)
            elif self.backend == "api_key" and settings.gemini_api_key:
                from google import genai
                self._client = genai.Client(api_key=settings.gemini_api_key)
        except Exception as exc:  # missing credentials etc. The app keeps running without AI.
            log.warning("Gemini client not initialised: %s", exc)
            self._client = None

    @property
    def available(self) -> bool:
        return self._client is not None

    def structured(self, task: str, schema: type[T], contents: list, system: str, store: Store | None = None,
                   temperature: float = 0.0, thinking_level: str | None = None) -> T:
        if self._client is None:
            raise AIUnavailable("Gemini isn't connected, so this step can't run right now. "
                                "Records, rules and schedules still work.")
        from google.genai import types

        level = thinking_level or self._thinking_level
        config = types.GenerateContentConfig(
            system_instruction=system, response_mime_type="application/json", response_schema=schema,
            temperature=temperature, http_options=types.HttpOptions(timeout=self._timeout_ms),
            thinking_config=types.ThinkingConfig(thinking_level=level) if level else None,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
        last_error = None
        for _attempt in range(2):  # one retry on an invalid response
            started = time.perf_counter()
            usage, ok, error = None, False, None
            try:
                response = self._generate(task, contents, config)
                usage = response.usage_metadata
                result = schema.model_validate_json(response.text or "")
                ok = True
                return result
            except ValidationError as exc:
                last_error, error = exc, "schema_validation_failed"
            except Exception as exc:
                error = f"{type(exc).__name__}"
                log.warning("Gemini call failed for %s: %s", task, exc)
                raise AIUnavailable("Gemini didn't respond, so this step can't run right now. "
                                    "Nothing was guessed. Try again, or continue manually.") from exc
            finally:
                if store is not None:
                    store.put(AICall(
                        id=audit.new_id("AI"), at=clock.now(), task=task, model=self.model,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        input_tokens=getattr(usage, "prompt_token_count", None),
                        output_tokens=getattr(usage, "candidates_token_count", None),
                        ok=ok, error=error))
        raise AIOutputInvalid(f"Gemini's answer didn't match the required format twice ({last_error}). "
                              "Sent to a person instead.")

    def _generate(self, task: str, contents: list, config):
        for delay in (*RETRY_DELAYS_S, None):
            try:
                return self._client.models.generate_content(model=self.model, contents=contents, config=config)
            except Exception as exc:
                if delay is None or not _is_transient(exc):
                    raise
                log.warning("Gemini busy for %s (%s); retrying in %.1f s", task, getattr(exc, "code", "?"), delay)
                time.sleep(delay)
