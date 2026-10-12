"""A slow Gemini explanation must not bring back a change that was removed meanwhile (UAT defect DEF-04)."""

import pytest

from agents.continuity.replan import open_event
from agents.simulation.explain import EventGone, explain_options
from api.deps import reset_workspace
from models.ai_schemas import ExplanationOut, OptionNote
from models.domain import ChangeEvent


class ResetWhileThinking:
    """Stands in for Gemini: the workspace is reset while it is 'thinking'."""

    def __init__(self, store):
        self.store = store

    def structured(self, task, schema, contents, system, store=None, **_):
        reset_workspace(self.store, "after_assignment")
        event_options = ["A", "B", "C"]
        return ExplanationOut(summary="Option A keeps one nurse all night.",
                              options=[OptionNote(option_id=o, explanation="See the factors.") for o in event_options])


def test_explanation_after_reset_is_discarded(assigned_store, cancellation):
    event = open_event(assigned_store, cancellation())
    assert event.options, "the hero scenario should produce options"
    with pytest.raises(EventGone):
        explain_options(ResetWhileThinking(assigned_store), assigned_store, event)
    assert assigned_store.get(ChangeEvent, event.id) is None
