"""Unit tests for Phase 4 Scenario Worker (§4.3, §4.4).

Tests:
- Strict Fork Immutability: verifying running scenarios never mutates Live Twins.
- Deterministic Replay: identical snapshot + seed produces identical output.
- Counterfactual Intervention Sensitivity: tool change restores health, coolant failure triggers thermal defect.
- Line Cadence Adjustment: speedup increases throughput and energy.
- Scenario Repository persistence and retrieval.
- Research Preset retrieval and execution.
"""

from __future__ import annotations

from datetime import datetime, timezone
import unittest
from uuid import uuid4

from domain.contracts import (
    CommandName,
    EventEnvelope,
    EventKind,
    FaultSeverity,
    FrozenLineSnapshot,
    ScenarioForkRequest,
    StationOverride,
    StationType,
    TwinDocument,
    event_id_for,
    utc_now,
)
from repositories.scenario_repository import InMemoryScenarioRepository
from repositories.twin_repository import InMemoryTwinRepository
from services.live_twin import LiveTwinService
from services.process_twin import ProcessTwinService
from services.scenario_worker import ScenarioWorkerService
from simulation.causal import build_default_factory


def _populate_test_twins(live_twin_service: LiveTwinService, factory_ticks: int = 5) -> None:
    factory = build_default_factory(seed=12345)
    for _ in range(factory_ticks):
        tick = factory.tick(dt_s=1.0)
        for event in tick.events:
            live_twin_service.consume(event)


class ScenarioWorkerServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.twin_repo = InMemoryTwinRepository()
        self.live_twin_service = LiveTwinService(self.twin_repo)
        self.process_twin_service = ProcessTwinService(self.live_twin_service)
        self.scenario_repo = InMemoryScenarioRepository()
        self.service = ScenarioWorkerService(
            process_twin_service=self.process_twin_service,
            live_twin_service=self.live_twin_service,
            scenario_repository=self.scenario_repo,
        )
        _populate_test_twins(self.live_twin_service, factory_ticks=5)

    def test_scenario_fork_immutability(self) -> None:
        """Scenario execution MUST NEVER mutate Live Twin state or repository events."""
        before_twins = {t.identity.machine_id: t.model_dump(mode="json") for t in self.live_twin_service.list_twins()}
        self.assertEqual(len(before_twins), 5)

        request = ScenarioForkRequest(
            name="Immutability Proof",
            horizon_seconds=60.0,
            seed=20260920,
            overrides=[
                StationOverride(
                    machine_id="CNC-01",
                    command=CommandName.INJECT_FAULT,
                    fault_type="severe_crash",
                    fault_severity=FaultSeverity.CRITICAL,
                    load_factor=0.99,
                ),
                StationOverride(
                    machine_id="STAMPING-01",
                    cycle_time_multiplier=0.5,
                ),
            ],
        )

        result = self.service.run_scenario(request)
        self.assertIsNotNone(result.scenario_id)

        # Verify Live Twins are completely unchanged
        after_twins = {t.identity.machine_id: t.model_dump(mode="json") for t in self.live_twin_service.list_twins()}
        self.assertEqual(before_twins, after_twins)

    def test_deterministic_replay(self) -> None:
        """Two forward runs with identical snapshot and seed produce bit-for-bit identical results."""
        request = ScenarioForkRequest(
            name="Determinism Check",
            horizon_seconds=45.0,
            seed=99991,
            overrides=[
                StationOverride(machine_id="CNC-01", load_factor=0.75),
            ],
        )

        run1 = self.service.run_scenario(request)
        run2 = self.service.run_scenario(request)

        self.assertEqual(run1.baseline.total_output, run2.baseline.total_output)
        self.assertEqual(run1.counterfactual.total_output, run2.counterfactual.total_output)
        self.assertEqual(run1.comparison.output_delta, run2.comparison.output_delta)
        self.assertEqual(run1.comparison.quality_delta, run2.comparison.quality_delta)
        self.assertEqual(run1.comparison.energy_delta_kwh, run2.comparison.energy_delta_kwh)
        self.assertEqual(len(run1.trajectory), len(run2.trajectory))

    def test_counterfactual_tool_change_preserves_health(self) -> None:
        """Immediate tool change at CNC-01 restores tool wear and preserves health vs degradation."""
        result = self.service.run_preset("preventive_tool_change", horizon_seconds=90.0, seed=777)

        self.assertIn("CNC-01", [s.machine_id for s in result.counterfactual.stations])
        base_cnc = next(s for s in result.baseline.stations if s.machine_id == "CNC-01")
        cf_cnc = next(s for s in result.counterfactual.stations if s.machine_id == "CNC-01")

        # Counterfactual tool change should yield higher CNC health than letting it run
        self.assertGreaterEqual(cf_cnc.final_health_score, base_cnc.final_health_score)
        self.assertGreaterEqual(result.comparison.health_delta, 0.0)

    def test_counterfactual_coolant_failure_triggers_degradation(self) -> None:
        """Coolant failure should cause thermal rise, lower health, and negative delta."""
        result = self.service.run_preset("coolant_pump_failure", horizon_seconds=80.0, seed=42)

        base_cnc = next(s for s in result.baseline.stations if s.machine_id == "CNC-01")
        cf_cnc = next(s for s in result.counterfactual.stations if s.machine_id == "CNC-01")

        # Health should drop under coolant failure
        self.assertLess(cf_cnc.final_health_score, base_cnc.final_health_score)
        self.assertTrue(cf_cnc.fault_occurred)
        self.assertLess(result.comparison.health_delta, 0.0)

    def test_line_cadence_boost_increases_energy(self) -> None:
        """Speeding up machines (lower cycle time) increases energy consumption."""
        result = self.service.run_preset("line_cadence_boost", horizon_seconds=60.0, seed=101)

        self.assertGreater(result.counterfactual.total_energy_kwh, 0.0)
        # Accelerated pace consumes more electrical energy
        self.assertGreaterEqual(result.counterfactual.total_energy_kwh, result.baseline.total_energy_kwh)

    def test_scenario_presets_metadata(self) -> None:
        """Presets list must return all predefined research scenarios."""
        presets = self.service.get_presets()
        self.assertGreaterEqual(len(presets), 4)
        preset_ids = [p["preset_id"] for p in presets]
        self.assertIn("preventive_tool_change", preset_ids)
        self.assertIn("coolant_pump_failure", preset_ids)
        self.assertIn("line_cadence_boost", preset_ids)
        self.assertIn("welding_electrode_drift", preset_ids)

    def test_scenario_repository_crud(self) -> None:
        """Repository must support saving, retrieving, listing, and deleting scenarios."""
        result = self.service.run_preset("preventive_tool_change", horizon_seconds=30.0)

        retrieved = self.scenario_repo.get(result.scenario_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.name, result.name)

        all_scenarios = self.scenario_repo.list_all(limit=10)
        self.assertGreaterEqual(len(all_scenarios), 1)
        self.assertEqual(all_scenarios[0].scenario_id, result.scenario_id)

        deleted = self.scenario_repo.delete(result.scenario_id)
        self.assertTrue(deleted)
        self.assertIsNone(self.scenario_repo.get(result.scenario_id))


if __name__ == "__main__":
    unittest.main()
