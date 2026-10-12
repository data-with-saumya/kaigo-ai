"""Busy Gemini (429/5xx) is retried briefly; anything else fails straight away, and nothing is guessed."""

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from services import gemini
from services.gemini import AIUnavailable, GeminiService


class Answer(BaseModel):
    value: int


class Busy(Exception):
    def __init__(self, code):
        super().__init__(f"status {code}")
        self.code = code


class FakeModels:
    def __init__(self, failures):
        self.failures = list(failures)
        self.calls = 0

    def generate_content(self, **_):
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return SimpleNamespace(text='{"value": 7}', usage_metadata=None)


def service(failures):
    svc = GeminiService.__new__(GeminiService)
    svc.model, svc.backend, svc._timeout_ms, svc._thinking_level = "test-model", "vertex", 1000, None
    svc._client = SimpleNamespace(models=FakeModels(failures))
    return svc


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch):
    monkeypatch.setattr(gemini.time, "sleep", lambda _s: None)


def test_busy_then_answer_is_retried():
    svc = service([Busy(429), Busy(503)])
    assert svc.structured("t", Answer, ["hi"], "sys").value == 7
    assert svc._client.models.calls == 3


def test_busy_every_time_gives_up_as_unavailable():
    svc = service([Busy(429)] * 10)
    with pytest.raises(AIUnavailable):
        svc.structured("t", Answer, ["hi"], "sys")
    assert svc._client.models.calls == len(gemini.RETRY_DELAYS_S) + 1


def test_other_errors_are_not_retried():
    svc = service([Busy(400)])
    with pytest.raises(AIUnavailable):
        svc.structured("t", Answer, ["hi"], "sys")
    assert svc._client.models.calls == 1
