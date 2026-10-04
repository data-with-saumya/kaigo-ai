"""v2 in-app chat: caregiver messages become change events; decisions and handovers are delivered in threads."""

from datetime import timedelta

from agents.continuity.replan import decide
from agents.messaging import chat
from models.ai_schemas import EventExtraction
from models.domain import ChangeEvent, Message
from services import clock
from services.gemini import AIUnavailable


class FakeGemini:
    """Stands in for Gemini: returns a fixed reading of the message."""

    available = True

    def __init__(self, event_type="caregiver_cancellation", days_ahead=1, name=None, confidence=0.95):
        self.out = EventExtraction(event_type=event_type, caregiver_name=name, client_name="Mrs Sharma",
                                   date=(clock.today() + timedelta(days=days_ahead)).isoformat(),
                                   date_phrase="tomorrow night" if days_ahead == 1 else None,
                                   confidence=confidence, summary="Caregiver can't work the shift.")

    def structured(self, *args, **kwargs):
        return self.out


class DownGemini:
    available = False

    def structured(self, *args, **kwargs):
        raise AIUnavailable("down")


def test_cancellation_in_chat_opens_event_for_the_known_sender(assigned_store):
    result = chat.caregiver_says(FakeGemini(), assigned_store, "CG-0101", "Can't do tomorrow night, sorry")
    event = result["event"]
    assert event.source == "chat" and event.parsed.caregiver_id == "CG-0101"   # sender known, no name needed
    assert event.status == "open" and result["message"].event_id == event.id
    assert result["reply"].sender == "kaigo" and "coordinator" in result["reply"].text
    assert [m.sender for m in chat.thread(assigned_store, "CG-0101")] == ["caregiver", "kaigo"]


def test_ordinary_chat_does_not_create_an_event(assigned_store):
    result = chat.caregiver_says(FakeGemini(event_type="other"), assigned_store, "CG-0101", "Running 10 min late")
    assert result["event"] is None and result["reply"] is None
    assert assigned_store.all(ChangeEvent) == []


def test_repeated_message_links_to_the_existing_event(assigned_store):
    first = chat.caregiver_says(FakeGemini(), assigned_store, "CG-0101", "Can't do tomorrow night")
    again = chat.caregiver_says(FakeGemini(), assigned_store, "CG-0101", "Just checking you got my message?")
    assert again["event"].id == first["event"].id
    assert len(assigned_store.all(ChangeEvent)) == 1


def test_message_is_kept_when_gemini_is_down(assigned_store):
    result = chat.caregiver_says(DownGemini(), assigned_store, "CG-0101", "Can't do tomorrow night")
    assert result["understood"] is False and result["event"] is None
    assert len(chat.thread(assigned_store, "CG-0101")) == 1


def test_message_about_someone_else_goes_to_review(assigned_store):
    result = chat.caregiver_says(FakeGemini(name="Kiran D'Souza"), assigned_store, "CG-0101", "Kiran can't come")
    assert result["event"].parsed.caregiver_id == "CG-0105"
    assert result["event"].status == "needs_review"


def test_approval_confirms_bookings_and_tells_the_original_caregiver(assigned_store):
    event = chat.caregiver_says(FakeGemini(), assigned_store, "CG-0101", "Can't do tomorrow night")["event"]
    split = next(o for o in event.options if o.kind == "split")
    decide(assigned_store, event.id, "approved", split.id, None, "Care coordinator")
    for cid in split.caregiver_ids:
        assert any(m.kind == "confirmation" for m in chat.thread(assigned_store, cid))
    notice = [m for m in chat.thread(assigned_store, "CG-0101") if m.kind == "notice"]
    assert notice and "covered" in notice[0].text


def test_handover_notes_are_delivered_to_threads(assigned_store):
    event = ChangeEvent(id="EV-H", source="chat", received_at=clock.now(), handover_notes={"CG-0107": "Hi Priya…"})
    chat.deliver_handover(assigned_store, event)
    assert [m.kind for m in chat.thread(assigned_store, "CG-0107")] == ["handover"]


def test_inbox_counts_unread_and_marks_read(assigned_store):
    chat.caregiver_says(FakeGemini(event_type="other"), assigned_store, "CG-0103", "Hello")
    row = next(r for r in chat.inbox(assigned_store) if r["caregiver_id"] == "CG-0103")
    assert row["unread"] == 1 and row["last"].text == "Hello"
    assert chat.mark_read(assigned_store, "CG-0103", "coordinator") == 1
    assert all(m.read_by_coordinator for m in assigned_store.all(Message) if m.caregiver_id == "CG-0103")
