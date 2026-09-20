"""Fast, deterministic tests for Phase 1 simulation contracts."""

from __future__ import annotations

from datetime import timedelta
import unittest

from domain.contracts import (
    CommandName,
    CommandRequest,
    EventKind,
    FaultSeverity,
    MachineStatus,
    event_id_for,
)
from simulation.causal import build_default_factory


def sample_for(tick, machine_id: str):
    return next(sample for sample in tick.telemetry if sample.machine_id == machine_id)


class CausalFactoryTests(unittest.TestCase):
    def test_same_seed_replays_identically(self) -> None:
        first = build_default_factory(run_id="repeatable", seed=91)
        second = build_default_factory(run_id="repeatable", seed=91)

        first_ticks = [first.tick(dt_s=5.0) for _ in range(4)]
        second_ticks = [second.tick(dt_s=5.0) for _ in range(4)]

        self.assertEqual(
            [tick.events for tick in first_ticks],
            [tick.events for tick in second_ticks],
        )
        self.assertEqual(first.snapshot(), second.snapshot())

    def test_cnc_tool_wear_fault_has_expected_causal_direction(self) -> None:
        healthy_factory = build_default_factory(run_id="healthy", seed=700)
        degraded_factory = build_default_factory(run_id="degraded", seed=700)
        degraded_factory.apply_command(
            "CNC-01",
            CommandRequest(
                command=CommandName.INJECT_FAULT,
                fault_type="tool_wear",
                severity=FaultSeverity.CRITICAL,
            ),
        )

        healthy = sample_for(healthy_factory.tick(dt_s=60.0), "CNC-01")
        degraded = sample_for(degraded_factory.tick(dt_s=60.0), "CNC-01")

        self.assertIsNotNone(healthy.tool_wear_percent)
        self.assertIsNotNone(degraded.tool_wear_percent)
        self.assertGreater(degraded.tool_wear_percent, healthy.tool_wear_percent)
        self.assertGreater(degraded.current_a, healthy.current_a)
        self.assertGreater(degraded.vibration_mm_s, healthy.vibration_mm_s)
        self.assertGreater(degraded.temperature_c, healthy.temperature_c)
        self.assertLess(degraded.quality_score, healthy.quality_score)
        self.assertLess(degraded.health_score, healthy.health_score)
        self.assertLess(degraded.actual_rpm, healthy.actual_rpm)

    def test_inspection_quality_responds_to_current_upstream_quality(self) -> None:
        healthy_factory = build_default_factory(run_id="inspection-healthy", seed=999)
        faulted_factory = build_default_factory(run_id="inspection-faulted", seed=999)
        faulted_factory.apply_command(
            "CNC-01",
            CommandRequest(
                command=CommandName.INJECT_FAULT,
                fault_type="tool_wear",
                severity=FaultSeverity.CRITICAL,
            ),
        )

        healthy = sample_for(healthy_factory.tick(dt_s=60.0), "INSPECTION-01")
        faulted = sample_for(faulted_factory.tick(dt_s=60.0), "INSPECTION-01")

        self.assertLess(faulted.quality_score, healthy.quality_score)
        self.assertGreater(faulted.anomaly_score, healthy.anomaly_score)

    def test_tool_change_resets_cnc_tool_wear_and_fault(self) -> None:
        factory = build_default_factory(run_id="maintenance", seed=111)
        factory.apply_command(
            "CNC-01",
            CommandRequest(
                command=CommandName.INJECT_FAULT,
                fault_type="tool_wear",
                severity=FaultSeverity.CRITICAL,
            ),
        )
        before = sample_for(factory.tick(dt_s=30.0), "CNC-01")
        factory.apply_command("CNC-01", CommandRequest(command=CommandName.TOOL_CHANGE))
        after = sample_for(factory.tick(dt_s=1.0), "CNC-01")

        self.assertGreater(before.tool_wear_percent, after.tool_wear_percent)
        # One post-maintenance simulated second adds only normal baseline wear.
        self.assertLess(after.tool_wear_percent, 0.01)
        self.assertIsNone(after.fault_code)

    def test_event_has_stable_idempotency_identity_and_unobserved_receive_time(self) -> None:
        factory = build_default_factory(run_id="event-contract", seed=1)
        tick = factory.tick()
        event = next(item for item in tick.events if item.machine_id == "CNC-01")

        self.assertEqual(event.kind, EventKind.TELEMETRY)
        self.assertEqual(event.sequence, 1)
        self.assertIsNone(event.received_at)
        self.assertEqual(
            event.event_id,
            event_id_for("event-contract", "CNC-01", EventKind.TELEMETRY, 1),
        )
        self.assertEqual(event.payload["machine_id"], "CNC-01")

    def test_stop_and_start_transition_affect_status(self) -> None:
        factory = build_default_factory(run_id="states", seed=22)
        factory.apply_command("STAMPING-01", CommandRequest(command=CommandName.STOP))
        stopped = sample_for(factory.tick(dt_s=1.0), "STAMPING-01")
        factory.apply_command("STAMPING-01", CommandRequest(command=CommandName.START))
        started = sample_for(factory.tick(dt_s=1.0), "STAMPING-01")

        self.assertEqual(stopped.status, MachineStatus.IDLE)
        self.assertEqual(started.status, MachineStatus.RUNNING)

    def test_factory_rejects_non_positive_time_step(self) -> None:
        with self.assertRaises(ValueError):
            build_default_factory().tick(dt_s=0)


if __name__ == "__main__":
    unittest.main()
