"""A reset never leaves a moment where the workspace looks missing, so a request mid-reset can't start a second seed."""

from api.deps import get_store, reset_workspace
from services.repository import MemoryRepository, Store


def test_workspace_stays_marked_during_reset():
    repo = MemoryRepository()
    store = Store(repo, "ws1")
    reset_workspace(store, "fresh")
    seen = []
    original = repo.put_many

    def put_many_and_peek(ws, items):
        seen.append(repo.get_meta(ws))  # what a request arriving now would see
        original(ws, items)

    repo.put_many = put_many_and_peek
    reset_workspace(store, "after_assignment")
    assert seen and all(m is not None for m in seen)
    assert repo.get_meta("ws1")["scenario"] == "after_assignment"
    assert "resetting" not in repo.get_meta("ws1")


def test_request_mid_reset_does_not_reseed():
    repo = MemoryRepository()
    store = Store(repo, "ws1")
    reset_workspace(store, "fresh")
    original = repo.put_many

    def put_many_with_interruption(ws, items):
        get_store("ws1", repo)  # the Today page polling in the middle of the reset
        original(ws, items)

    repo.put_many = put_many_with_interruption
    reset_workspace(store, "after_assignment")
    repo.put_many = original
    assignments = repo.list("ws1", "assignments")
    assert assignments, "the after_assignment scenario should survive a request that arrives mid-reset"
