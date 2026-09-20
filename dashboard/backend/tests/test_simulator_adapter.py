"""Compatibility guarantees while the dashboard migrates to Live Twin APIs."""

from __future__ import annotations

import unittest

from models import MachineStatus
from simulator import SimulatorEngine


class SimulatorAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = SimulatorEngine(seed=314, mqtt_enabled=False)

    def tearDown(self) -> None:
        self.engine.stop()

    def test_one_tick_exposes_all_legacy_machine_records(self) -> None:
        self.engine.tick()
        records = self.engine.get_all_telemetry()

        self.assertEqual(len(records), 5)
        self.assertEqual({item.machine_id for item in records}, {
            "STAMPING-01", "CNC-01", "WELDING-01", "INSPECTION-01", "PACKAGING-01"
        })
        self.assertTrue(all(item.latency_ms == 0.0 for item in records))
        self.assertTrue(all(item.energy_kwh >= 0 for item in records))

    def test_fault_is_visible_through_existing_rest_shape(self) -> None:
        self.engine.tick()
        self.assertTrue(self.engine.inject_fault("CNC-01", "tool_wear", "Critical"))
        for _ in range(60):
            self.engine.tick()

        cnc = self.engine.get_telemetry("CNC-01")
        self.assertIsNotNone(cnc)
        assert cnc is not None
        self.assertIn(cnc.status, {MachineStatus.DEGRADED, MachineStatus.FAULT})
        self.assertGreater(cnc.tool_wear or 0, 10.0)

    def test_summary_uses_conservative_line_output_proxy(self) -> None:
        for _ in range(60):
            self.engine.tick()
        telemetry = self.engine.get_all_telemetry()
        summary = self.engine.get_summary()

        self.assertEqual(summary.total_output, min(item.production_count for item in telemetry))
        self.assertEqual(summary.machines_total, 5)
        self.assertEqual(summary.telemetry_rate, 5.0)

    def test_reset_all_clears_materialized_dashboard_state(self) -> None:
        self.engine.tick()
        self.assertIsNotNone(self.engine.get_telemetry("CNC-01"))
        self.engine.reset_all()

        self.assertEqual(self.engine.tick_count, 0)
        self.assertIsNone(self.engine.get_telemetry("CNC-01"))


if __name__ == "__main__":
    unittest.main()
