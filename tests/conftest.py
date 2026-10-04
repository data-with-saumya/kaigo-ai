from datetime import timedelta

import pytest

from models.domain import ChangeEvent, EventType, ParsedEvent
from services import clock, seed
from services.repository import MemoryRepository, Store


@pytest.fixture
def anchor():
    return clock.today()


@pytest.fixture
def fresh_store(anchor):
    store = Store(MemoryRepository(), "test")
    store.put_many(seed.build(anchor, "fresh"))
    return store


@pytest.fixture
def assigned_store(anchor):
    store = Store(MemoryRepository(), "test")
    store.put_many(seed.build(anchor, "after_assignment"))
    return store


@pytest.fixture
def cancellation(anchor):
    def make(caregiver_id="CG-0101", days_ahead=1, confidence=0.94, event_id="EV-T1"):
        return ChangeEvent(
            id=event_id, raw_text="Anjali can't do tomorrow night", source="sms", received_at=clock.now(),
            parsed=ParsedEvent(event_type=EventType.CANCELLATION, caregiver_id=caregiver_id, caregiver_name="Anjali",
                               date=anchor + timedelta(days=days_ahead), confidence=confidence,
                               summary="Caregiver cancellation"))
    return make
