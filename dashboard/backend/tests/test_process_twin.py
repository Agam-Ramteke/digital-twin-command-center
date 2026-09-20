"""Tests for Phase 3 Process Twin: DAG topology, frozen snapshot, tokens, bottleneck, defects."""

from __future__ import annotations

from datetime import timedelta
import unittest

from domain.contracts import (
    CommandName,
    CommandRequest,
    FaultSeverity,
    MachineStatus,
    StationType,
)
from repositories.twin_repository import InMemoryTwinRepository
from services.live_twin import LiveTwinService
from services.process_twin import ProcessTwinService
from simulation.causal import build_default_factory


class ProcessTwinServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = InMemoryTwinRepository()
        self.live_twin_service = LiveTwinService(self.repository)
        self.process_twin_service = ProcessTwinService(self.live_twin_service)
        self.factory = build_default_factory(run_id="process-twin-test", seed=42)

    def _populate_live_twins(self, ticks: int = 1) -> None:
        """Advance the factory and feed all station events into LiveTwinService."""
        for _ in range(ticks):
            tick = self.factory.tick(dt_s=1.0)
            for event in tick.events:
                self.live_twin_service.consume(event)

    def test_dag_topology_structure(self) -> None:
        topo = self.process_twin_service.topology
        self.assertEqual(topo.version, "five-station-v1")
        self.assertEqual(len(topo.nodes), 5)
        self.assertEqual(len(topo.edges), 4)
        self.assertEqual(topo.order, [
            "STAMPING-01", "CNC-01", "WELDING-01", "INSPECTION-01", "PACKAGING-01"
        ])

        # Test node connections
        stamping = next(n for n in topo.nodes if n.machine_id == "STAMPING-01")
        cnc = next(n for n in topo.nodes if n.machine_id == "CNC-01")
        packaging = next(n for n in topo.nodes if n.machine_id == "PACKAGING-01")

        self.assertEqual(stamping.upstream_machine_ids, [])
        self.assertEqual(stamping.downstream_machine_ids, ["CNC-01"])
        self.assertEqual(cnc.upstream_machine_ids, ["STAMPING-01"])
        self.assertEqual(cnc.downstream_machine_ids, ["WELDING-01"])
        self.assertEqual(packaging.downstream_machine_ids, [])

    def test_capture_snapshot_requires_live_twins(self) -> None:
        # Before populating twins, snapshot must raise ValueError
        with self.assertRaises(ValueError):
            self.process_twin_service.capture_snapshot()

    def test_capture_snapshot_frozen_semantics(self) -> None:
        self._populate_live_twins(1)
        snapshot = self.process_twin_service.capture_snapshot()

        self.assertEqual(len(snapshot.twins), 5)
        self.assertEqual(snapshot.topology_version, "five-station-v1")
        self.assertIsNotNone(snapshot.snapshot_id)
        self.assertIsNotNone(snapshot.captured_at.tzinfo)

        # Ordering check
        indices = [t.identity.station_index for t in snapshot.twins]
        self.assertEqual(indices, [1, 2, 3, 4, 5])

    def test_token_pipeline_progression(self) -> None:
        self._populate_live_twins(1)
        token = self.process_twin_service.emit_token_through_pipeline()

        self.assertTrue(token.token_id.startswith("tok-"))
        self.assertEqual(token.source_station, StationType.STAMPING)
        self.assertEqual(token.quality, "pass")
        self.assertIn("STAMPING-01", token.lineage)
        self.assertIn("CNC-01", token.lineage)
        self.assertIn("WELDING-01", token.lineage)
        self.assertIn("INSPECTION-01", token.lineage)
        self.assertIn("PACKAGING-01", token.lineage)

        flags = token.carried_flags
        self.assertIn("stamping_quality", flags)
        self.assertIn("machining_quality", flags)
        self.assertIn("weld_quality", flags)
        self.assertIn("defect_probability", flags)
        self.assertEqual(flags["inspection_verdict"], "ACCEPTED")
        self.assertEqual(flags["disposition"], "DISPATCHED")

        # Retrieval check
        retrieved = self.process_twin_service.get_token(token.token_id)
        self.assertIsNotNone(retrieved)
        assert retrieved is not None
        self.assertEqual(retrieved.token_id, token.token_id)

    def test_token_filtering_and_bounds(self) -> None:
        self._populate_live_twins(1)
        for _ in range(5):
            self.process_twin_service.emit_token_through_pipeline()

        tokens = self.process_twin_service.list_tokens(limit=10)
        self.assertEqual(len(tokens), 5)

        pass_tokens = self.process_twin_service.list_tokens(limit=10, quality="pass")
        self.assertEqual(len(pass_tokens), 5)

        fail_tokens = self.process_twin_service.list_tokens(limit=10, quality="fail")
        self.assertEqual(len(fail_tokens), 0)

        # Bounds validation
        with self.assertRaises(ValueError):
            self.process_twin_service.list_tokens(limit=0)
        with self.assertRaises(ValueError):
            self.process_twin_service.list_tokens(limit=10001)

    def test_bottleneck_analysis_nominal_line(self) -> None:
        self._populate_live_twins(1)
        report = self.process_twin_service.analyze_bottleneck()

        # CNC nominal cycle time is 42s, which is the largest on the line
        self.assertEqual(report.binding_machine_id, "CNC-01")
        self.assertEqual(report.binding_station, StationType.CNC)
        self.assertAlmostEqual(report.binding_cycle_time_s, 42.0, delta=1.0)
        self.assertAlmostEqual(report.max_line_capacity_per_hour, round(3600.0 / 42.0, 2), delta=2.0)

        cnc_detail = next(d for d in report.stations if d.machine_id == "CNC-01")
        self.assertTrue(cnc_detail.is_bottleneck)
        self.assertEqual(cnc_detail.slack_time_s, 0.0)

        stamping_detail = next(d for d in report.stations if d.machine_id == "STAMPING-01")
        self.assertFalse(stamping_detail.is_bottleneck)
        self.assertGreater(stamping_detail.slack_time_s, 20.0)

    def test_bottleneck_dynamic_shift_on_stamping_fault(self) -> None:
        self._populate_live_twins(1)
        # Inject fault into STAMPING-01 and advance past fault development threshold (60s)
        self.factory.apply_command(
            "STAMPING-01",
            CommandRequest(
                command=CommandName.INJECT_FAULT,
                fault_type="feed_jam",
                severity=FaultSeverity.CRITICAL,
            ),
        )
        tick = self.factory.tick(dt_s=60.0)
        for event in tick.events:
            self.live_twin_service.consume(event)

        report = self.process_twin_service.analyze_bottleneck()
        # With FAULT operational status, effective cycle time multiplier is 10.0x (8.5s * 10 = 85s > 42s)
        self.assertEqual(report.binding_machine_id, "STAMPING-01")
        self.assertEqual(report.binding_station, StationType.STAMPING)
        stamping_detail = next(d for d in report.stations if d.machine_id == "STAMPING-01")
        self.assertTrue(stamping_detail.is_bottleneck)

    def test_defect_tracing_under_cnc_degradation(self) -> None:
        self._populate_live_twins(1)
        # Healthy baseline check
        healthy_report = self.process_twin_service.trace_defects()
        self.assertEqual(healthy_report.defective_tokens_count, 0)
        self.assertIsNone(healthy_report.primary_root_cause_station)

        # Severely degrade CNC-01
        self.factory.apply_command(
            "CNC-01",
            CommandRequest(
                command=CommandName.INJECT_FAULT,
                fault_type="tool_wear",
                severity=FaultSeverity.CRITICAL,
            ),
        )
        # Tick factory so CNC tool wear accumulates and quality plummets
        for _ in range(50):
            self.factory.tick(dt_s=10.0)
        self._populate_live_twins(1)

        # Emit tokens under degraded conditions
        for _ in range(10):
            self.process_twin_service.emit_token_through_pipeline()

        defect_report = self.process_twin_service.trace_defects(limit=20)
        self.assertGreater(defect_report.defective_tokens_count, 0)
        self.assertEqual(defect_report.primary_root_cause_station, StationType.CNC)
        self.assertEqual(defect_report.primary_root_cause_machine_id, "CNC-01")

        cnc_attr = next(a for a in defect_report.attributions if a.machine_id == "CNC-01")
        self.assertGreater(cnc_attr.attribution_percent, 50.0)

    def test_process_view_composition(self) -> None:
        self._populate_live_twins(1)
        view = self.process_twin_service.get_process_view()

        self.assertEqual(len(view.snapshot.twins), 5)
        self.assertEqual(view.metrics.bottleneck_machine_id, "CNC-01")
        self.assertEqual(view.metrics.total_stations, 5)
        self.assertEqual(view.metrics.available_stations, 5)
        self.assertGreater(view.metrics.line_capacity_per_hour, 0.0)
        self.assertGreater(len(view.metrics.notes), 0)


if __name__ == "__main__":
    unittest.main()
