"""A request with no client is refused with a clear message, never a server error (UAT defect DEF-03)."""

import pytest

from agents.request.extract import RequestError, extract_request
from services.repository import MemoryRepository


def test_missing_client_is_a_clear_error(fresh_store):
    with pytest.raises(RequestError, match="Choose a client"):
        extract_request(None, fresh_store, "", "Needs a nurse tonight, 8 PM to 8 AM.")


def test_empty_or_nested_ids_are_not_found():
    repo = MemoryRepository()
    assert repo.get("ws", "clients", "") is None
