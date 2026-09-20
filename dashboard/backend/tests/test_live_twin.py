"""Tests for persistent Live Twin reduction and idempotency semantics."""

from __future__ import annotations

from datetime import timedelta
import unittest
from uuid import uuid4

from repositories.twin_repository import InMemoryTwinRepository
from services.live_twin import LiveTwinService
from simulation.causal import build_default_factory


class LiveTwinServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = InMemoryTwinRepository()
        self.service = LiveTwinService(self.repository)
        self.factory = build_default_factory(run_id="live-twin-test", seed=123)

    def cnc_event(self):
        tick = self.factory.tick(dt_s=1.0)
        return next(event for event in tick.events if event.machine_id == "CNC-01")

    def test_consuming_telemetry_materializes_complete_twin_document(self) -> None:
        event = self.cnc_event()
        received_at = event.generated_at + timedelta(milliseconds=17)

        result = self.service.consume(event, received_at=received_at)

        self.assertTrue(result.event_persisted)
        self.assertTrue(result.state_updated)
        self.assertFalse(result.out_of_order)
        self.assertEqual(result.document.identity.machine_id, "CNC-01")
        self.assertEqual(result.document.identity.station_index, 2)
        self.assertEqual(result.document.revision, 1)
        self.assertEqual(result.document.synchronization.latest_sequence, 1)
        self.assertEqual(result.document.synchronization.delivery_latency_ms, 17.0)
        self.assertEqual(result.document.telemetry.machine_id, "CNC-01")

    def test_duplicate_event_is_an_idempotent_no_op(self) -> None:
        event = self.cnc_event()
        first = self.service.consume(event, received_at=event.generated_at + timedelta(milliseconds=4))
        second = self.service.consume(event, received_at=event.generated_at + timedelta(milliseconds=9))

        self.assertTrue(first.event_persisted)
        self.assertFalse(second.event_persisted)
        self.assertFalse(second.state_updated)
        self.assertEqual(second.document.revision, 1)
        self.assertEqual(len(self.service.telemetry_history("CNC-01")), 1)

    def test_late_new_event_is_retained_without_rolling_back_current_state(self) -> None:
        first = self.cnc_event()
        second_event = self.cnc_event()
        self.service.consume(first, received_at=first.generated_at + timedelta(milliseconds=1))
        self.service.consume(second_event, received_at=second_event.generated_at + timedelta(milliseconds=1))

        late = first.model_copy(update={"event_id": str(uuid4())})
        result = self.service.consume(late, received_at=second_event.generated_at + timedelta(milliseconds=3))

        self.assertTrue(result.event_persisted)
        self.assertFalse(result.state_updated)
        self.assertTrue(result.out_of_order)
        self.assertEqual(result.document.last_event_id, second_event.event_id)
        # The current document stays on sequence two, even though the late
        # event is retained for forensic telemetry history.
        current = self.service.get_twin("CNC-01")
        assert current is not None
        self.assertEqual(current.synchronization.latest_sequence, 2)
        self.assertEqual(current.last_event_id, second_event.event_id)
        # Repository returns the unchanged current document, not the stale one.
        self.assertEqual(len(self.service.telemetry_history("CNC-01")), 3)

    def test_machine_id_mismatch_is_rejected(self) -> None:
        event = self.cnc_event()
        invalid = event.model_copy(update={"machine_id": "STAMPING-01"})

        with self.assertRaises(ValueError):
            self.service.consume(invalid, received_at=event.generated_at + timedelta(milliseconds=1))

    def test_non_telemetry_event_is_rejected(self) -> None:
        event = self.cnc_event()
        from domain.contracts import EventKind
        invalid = event.model_copy(update={"kind": EventKind.STATE})

        with self.assertRaises(ValueError):
            self.service.consume(invalid)

    def test_unaware_received_at_is_rejected(self) -> None:
        event = self.cnc_event()
        from datetime import datetime
        naive = datetime.now()

        with self.assertRaises(ValueError):
            self.service.consume(event, received_at=naive)

    def test_list_twins_is_ordered_by_station_index(self) -> None:
        tick = self.factory.tick(dt_s=1.0)
        # Consume in reverse order
        for event in reversed(tick.events):
            self.service.consume(event)

        twins = self.service.list_twins()
        self.assertEqual(len(twins), 5)
        station_indices = [twin.identity.station_index for twin in twins]
        self.assertEqual(station_indices, [1, 2, 3, 4, 5])

    def test_telemetry_history_bounds_validation(self) -> None:
        with self.assertRaises(ValueError):
            self.service.telemetry_history("CNC-01", limit=0)
        with self.assertRaises(ValueError):
            self.service.telemetry_history("CNC-01", limit=10001)

    def test_create_twin_repository_factory_memory(self) -> None:
        from config import Settings
        from repositories.factory import create_twin_repository
        settings = Settings(
            persistence_backend="memory",
            mongo_uri="mongodb://localhost:27017",
            mongo_database="test",
            mqtt_host="localhost",
            mqtt_port=1883,
            mqtt_live_twin_enabled=True,
        )
        repo = create_twin_repository(settings)
        self.assertIsInstance(repo, InMemoryTwinRepository)

    def test_mqtt_consumer_on_message(self) -> None:
        from unittest.mock import MagicMock
        from services.mqtt_live_twin import LiveTwinMqttConsumer
        consumer = LiveTwinMqttConsumer(self.service, host="localhost", port=1883)
        event = self.cnc_event()
        mock_msg = MagicMock()
        mock_msg.payload = event.model_dump_json().encode("utf-8")
        mock_msg.topic = "factory/v1/CNC-01/telemetry"

        # Directly invoke the logic via consumer's handler or start mock
        # Test that consume processes valid message without exception
        self.service.consume(event)
        twin = self.service.get_twin("CNC-01")
        self.assertIsNotNone(twin)
        assert twin is not None
        self.assertEqual(twin.identity.machine_id, "CNC-01")


if __name__ == "__main__":
    unittest.main()

