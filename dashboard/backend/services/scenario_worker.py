"""Scenario Worker service for isolated forward simulations from frozen snapshots.

Implements Sections 4.3, 4.4, and Table 5 of the research report:
- Snapshot forking: rehydrates a detached CausalFactory from an immutable FrozenLineSnapshot.
- Deterministic forward simulation: runs identical Baseline and Counterfactual trajectories
  under the exact same seed to isolate intervention effects.
- Comparative delta analytics: computes output, scrap, quality, energy, and bottleneck shifts.
- Strict fork immutability: verifies that Live Twin documents and running simulator state
  are never mutated during scenario execution.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any
from uuid import uuid4

from domain.contracts import (
    CommandName,
    FaultSeverity,
    FrozenLineSnapshot,
    LineOutcome,
    OperationalState,
    ScenarioDelta,
    ScenarioForkRequest,
    ScenarioRunResult,
    ScenarioStatus,
    StationOutcome,
    StationOverride,
    StationType,
    TrajectorySample,
    utc_now,
)
from repositories.scenario_repository import ScenarioRepository
from services.live_twin import LiveTwinService
from services.process_twin import ProcessTwinService
from simulation.causal import CausalFactory, clamp


# ---------------------------------------------------------------------------
# Pre-packaged Research Presets (§4.3)
# ---------------------------------------------------------------------------

PRESET_DEFINITIONS: dict[str, dict[str, Any]] = {
    "preventive_tool_change": {
        "name": "Preventive CNC Tool Change",
        "description": "Simulate immediate tool replacement at CNC-01 to prevent impending failure and restore cutting quality.",
        "overrides": [
            StationOverride(
                machine_id="CNC-01",
                command=CommandName.TOOL_CHANGE,
                tool_wear_percent=0.0,
            )
        ],
    },
    "coolant_pump_failure": {
        "name": "Coolant Pump Failure",
        "description": "Simulate unexpected coolant circulation breakdown at CNC-01 causing rapid thermal runaway and surface defects.",
        "overrides": [
            StationOverride(
                machine_id="CNC-01",
                fault_type="coolant_failure",
                fault_severity=FaultSeverity.CRITICAL,
                load_factor=0.85,
            )
        ],
    },
    "line_cadence_boost": {
        "name": "High-Cadence Line Acceleration",
        "description": "Accelerate Stamping and CNC cycle times by 20% to evaluate line throughput ceiling vs increased energy and wear.",
        "overrides": [
            StationOverride(
                machine_id="STAMPING-01",
                cycle_time_multiplier=0.80,
                load_factor=0.80,
            ),
            StationOverride(
                machine_id="CNC-01",
                cycle_time_multiplier=0.80,
                load_factor=0.85,
            ),
        ],
    },
    "welding_electrode_drift": {
        "name": "Welding Electrode Degradation",
        "description": "Simulate heavy electrode wear at WELDING-01 to trace downstream defect propagation at Inspection.",
        "overrides": [
            StationOverride(
                machine_id="WELDING-01",
                tool_wear_percent=85.0,
                fault_type="electrode_wear",
                fault_severity=FaultSeverity.WARNING,
            )
        ],
    },
}



class ScenarioWorkerService:
    """Orchestrates isolated what-if simulations forked from frozen snapshots."""

    MAX_SNAPSHOT_CACHE = 20

    def __init__(
        self,
        process_twin_service: ProcessTwinService,
        live_twin_service: LiveTwinService,
        scenario_repository: ScenarioRepository,
    ) -> None:
        self._process_twin_service = process_twin_service
        self._live_twin_service = live_twin_service
        self._scenario_repository = scenario_repository
        self._snapshot_cache: dict[str, FrozenLineSnapshot] = {}

    def get_presets(self) -> list[dict[str, Any]]:
        """Return list of available research preset configurations."""
        return [
            {
                "preset_id": key,
                "name": val["name"],
                "description": val["description"],
                "overrides": [o.model_dump(mode="json") for o in val["overrides"]],
            }
            for key, val in PRESET_DEFINITIONS.items()
        ]

    def run_preset(
        self,
        preset_id: str,
        *,
        horizon_seconds: float = 120.0,
        seed: int = 20260920,
    ) -> ScenarioRunResult:
        if preset_id not in PRESET_DEFINITIONS:
            raise KeyError(f"Unknown scenario preset: {preset_id}")
        preset = PRESET_DEFINITIONS[preset_id]
        request = ScenarioForkRequest(
            name=preset["name"],
            description=preset["description"],
            horizon_seconds=horizon_seconds,
            seed=seed,
            overrides=list(preset["overrides"]),
        )
        return self.run_scenario(request)

    def run_scenario(self, request: ScenarioForkRequest) -> ScenarioRunResult:
        """Run an isolated forward counterfactual simulation.

        Guarantees that Live Twin state is never mutated (§4.3).
        """
        # Step 1: Obtain or resolve the FrozenLineSnapshot
        snapshot = self._resolve_snapshot(request.snapshot_id)

        # Step 2: Record Live Twin state fingerprint for strict immutability verification
        pre_fingerprint = self._compute_live_twins_fingerprint()

        created_at = utc_now()

        # Step 3: Run Baseline forward simulation (no overrides)
        baseline_factory = CausalFactory.from_frozen_line_snapshot(
            snapshot,
            seed=request.seed,
            run_id=f"base-{uuid4().hex[:8]}",
        )
        baseline_ticks = self._simulate_forward(
            baseline_factory,
            horizon_seconds=request.horizon_seconds,
            time_step_s=request.time_step_s,
        )
        baseline_outcome = self._calculate_line_outcome(baseline_factory, baseline_ticks, snapshot)

        # Step 4: Run Counterfactual forward simulation (exact same snapshot & seed + overrides)
        counterfactual_factory = CausalFactory.from_frozen_line_snapshot(
            snapshot,
            seed=request.seed,
            run_id=f"cf-{uuid4().hex[:8]}",
        )
        # Apply requested overrides to decoupled counterfactual factory
        for override in request.overrides:
            if override.machine_id in counterfactual_factory.models:
                counterfactual_factory.models[override.machine_id].apply_override(override)

        counterfactual_ticks = self._simulate_forward(
            counterfactual_factory,
            horizon_seconds=request.horizon_seconds,
            time_step_s=request.time_step_s,
        )
        counterfactual_outcome = self._calculate_line_outcome(
            counterfactual_factory, counterfactual_ticks, snapshot
        )

        # Step 5: Compute comparative causal delta
        delta = self._compute_delta(request.name, baseline_outcome, counterfactual_outcome)

        # Step 6: Generate trajectory samples for visualization
        trajectory = self._generate_trajectory(
            baseline_ticks, counterfactual_ticks, time_step_s=request.time_step_s
        )

        # Step 7: Verify Live Twin immutability
        post_fingerprint = self._compute_live_twins_fingerprint()
        if pre_fingerprint != post_fingerprint:
            raise RuntimeError("CRITICAL: Scenario Worker mutated Live Twin state! Fork immutability violated.")

        # Step 8: Build and persist the ScenarioRunResult
        result = ScenarioRunResult(
            scenario_id=str(uuid4()),
            name=request.name,
            description=request.description,
            status=ScenarioStatus.COMPLETED,
            snapshot_id=snapshot.snapshot_id,
            seed=request.seed,
            horizon_seconds=request.horizon_seconds,
            time_step_s=request.time_step_s,
            created_at=created_at,
            completed_at=utc_now(),
            overrides=request.overrides,
            baseline=baseline_outcome,
            counterfactual=counterfactual_outcome,
            comparison=delta,
            trajectory=trajectory,
        )

        self._scenario_repository.save(result)
        return result

    def get_scenario(self, scenario_id: str) -> ScenarioRunResult | None:
        return self._scenario_repository.get(scenario_id)

    def list_scenarios(self, *, limit: int = 50) -> list[ScenarioRunResult]:
        return self._scenario_repository.list_all(limit=limit)

    def delete_scenario(self, scenario_id: str) -> bool:
        return self._scenario_repository.delete(scenario_id)

    # ------------------------------------------------------------------
    # Internal Simulation & Analysis Mechanics
    # ------------------------------------------------------------------

    def _resolve_snapshot(self, snapshot_id: str | None) -> FrozenLineSnapshot:
        if snapshot_id is not None:
            cached = self._snapshot_cache.get(snapshot_id)
            if cached is not None:
                return cached
        snapshot = self._process_twin_service.capture_snapshot()
        # Evict oldest snapshots when cache exceeds retention limit (Bug 5)
        if len(self._snapshot_cache) >= self.MAX_SNAPSHOT_CACHE:
            oldest_key = next(iter(self._snapshot_cache))
            del self._snapshot_cache[oldest_key]
        self._snapshot_cache[snapshot.snapshot_id] = snapshot
        return snapshot

    def _compute_live_twins_fingerprint(self) -> tuple[tuple[str, int, int, float], ...]:
        """Produce an immutable hashable fingerprint of all Live Twins in repository."""
        twins = self._live_twin_service.list_twins()
        return tuple(
            (
                t.identity.machine_id,
                t.synchronization.latest_sequence,
                t.production.cumulative_output,
                round(t.telemetry.energy_kwh, 4),
            )
            for t in sorted(twins, key=lambda x: x.identity.station_index)
        )

    def _simulate_forward(
        self,
        factory: CausalFactory,
        *,
        horizon_seconds: float,
        time_step_s: float,
    ) -> list[dict[str, Any]]:
        """Advance the ephemeral factory forward by horizon_seconds."""
        steps = int(math.ceil(horizon_seconds / time_step_s))
        tick_history: list[dict[str, Any]] = []

        for _ in range(steps):
            tick = factory.tick(dt_s=time_step_s)
            tick_dict = {
                sample.machine_id: sample for sample in tick.telemetry
            }
            tick_history.append(tick_dict)

        return tick_history

    def _calculate_line_outcome(
        self,
        factory: CausalFactory,
        ticks: list[dict[str, Any]],
        initial_snapshot: FrozenLineSnapshot,
    ) -> LineOutcome:
        initial_production = {
            twin.identity.machine_id: twin.production.cumulative_output
            for twin in initial_snapshot.twins
        }
        initial_energy = {
            twin.identity.machine_id: twin.telemetry.energy_kwh
            for twin in initial_snapshot.twins
        }

        station_outcomes: list[StationOutcome] = []
        cycle_times: dict[str, float] = {}

        for machine_id, model in factory.models.items():
            station_samples = [t[machine_id] for t in ticks if machine_id in t]
            produced = model.production_count - initial_production.get(machine_id, 0)
            energy = max(0.0, model.energy_kwh - initial_energy.get(machine_id, 0.0))

            avg_cycle = (
                sum(s.cycle_time_s for s in station_samples) / len(station_samples)
                if station_samples
                else model.config.cycle_time_s
            )
            avg_quality = (
                sum(s.quality_score for s in station_samples) / len(station_samples)
                if station_samples
                else 1.0
            )
            final_sample = station_samples[-1] if station_samples else None
            final_health = final_sample.health_score if final_sample else 100.0
            final_status = final_sample.status if final_sample else model._last_status
            fault_occurred = any(s.fault_code is not None for s in station_samples)

            cycle_times[machine_id] = avg_cycle

            station_outcomes.append(
                StationOutcome(
                    machine_id=machine_id,
                    station=model.station,
                    final_state=model.operational_state,
                    final_status=final_status,
                    final_health_score=round(final_health, 2),
                    parts_produced=max(0, produced),
                    energy_kwh=round(energy, 4),
                    avg_cycle_time_s=round(avg_cycle, 2),
                    avg_quality_score=round(avg_quality, 4),
                    fault_occurred=fault_occurred,
                )
            )

        # Line output is determined by PACKAGING-01
        packaging_produced = next(
            (so.parts_produced for so in station_outcomes if so.station == StationType.PACKAGING),
            0,
        )

        # Inspection quality determines scrap
        inspection_quality = next(
            (so.avg_quality_score for so in station_outcomes if so.station == StationType.INSPECTION),
            0.99,
        )
        scrap_count = int(math.floor(packaging_produced * max(0.0, 1.0 - inspection_quality)))
        net_output = max(0, packaging_produced - scrap_count)

        total_energy = sum(so.energy_kwh for so in station_outcomes)
        overall_quality = sum(so.avg_quality_score for so in station_outcomes) / len(station_outcomes)

        # Identify bottleneck station using status-aware effective cycle time
        # (Bug 6: aligned with ProcessTwinService.analyze_bottleneck logic)
        from domain.contracts import MachineStatus
        effective_cycle_times: dict[str, float] = {}
        for so in station_outcomes:
            raw_ct = cycle_times.get(so.machine_id, so.avg_cycle_time_s)
            # Apply operational state penalty factor matching ProcessTwinService
            status = so.final_status
            if status == MachineStatus.RUNNING:
                factor = 1.0
            elif status == MachineStatus.WARNING:
                factor = 1.15
            elif status == MachineStatus.DEGRADED:
                factor = 1.35
            elif status in (MachineStatus.FAULT, MachineStatus.OFFLINE):
                factor = 10.0
            elif status == MachineStatus.MAINTENANCE:
                factor = 5.0
            else:  # IDLE
                factor = 1.2
            effective_cycle_times[so.machine_id] = raw_ct * factor

        bottleneck_id = max(effective_cycle_times, key=effective_cycle_times.get)
        binding_cycle = effective_cycle_times[bottleneck_id]
        hourly_capacity = round(3600.0 / binding_cycle, 1) if binding_cycle > 0 else 0.0

        return LineOutcome(
            total_output=net_output,
            scrap_count=scrap_count,
            overall_quality=round(overall_quality, 4),
            total_energy_kwh=round(total_energy, 4),
            bottleneck_machine_id=bottleneck_id,
            binding_cycle_time_s=round(binding_cycle, 2),
            hourly_capacity=hourly_capacity,
            stations=sorted(station_outcomes, key=lambda s: factory.models[s.machine_id].config.station_index),
        )

    def _compute_delta(
        self,
        name: str,
        baseline: LineOutcome,
        counterfactual: LineOutcome,
    ) -> ScenarioDelta:
        output_delta = counterfactual.total_output - baseline.total_output
        scrap_delta = counterfactual.scrap_count - baseline.scrap_count
        quality_delta = round(counterfactual.overall_quality - baseline.overall_quality, 4)
        energy_delta = round(counterfactual.total_energy_kwh - baseline.total_energy_kwh, 4)

        base_cnc = next((s for s in baseline.stations if s.machine_id == "CNC-01"), None)
        cf_cnc = next((s for s in counterfactual.stations if s.machine_id == "CNC-01"), None)
        health_delta = (
            round(cf_cnc.final_health_score - base_cnc.final_health_score, 2)
            if base_cnc and cf_cnc
            else 0.0
        )

        bottleneck_shifted = baseline.bottleneck_machine_id != counterfactual.bottleneck_machine_id

        summary_parts = []
        if output_delta > 0:
            summary_parts.append(f"+{output_delta} units output")
        elif output_delta < 0:
            summary_parts.append(f"{output_delta} units output")

        if quality_delta != 0:
            summary_parts.append(f"{quality_delta:+.2%} quality shift")

        if health_delta > 0:
            summary_parts.append(f"+{health_delta:.1f}% CNC health preserved")
        elif health_delta < 0:
            summary_parts.append(f"{health_delta:.1f}% CNC health degraded")

        if bottleneck_shifted:
            summary_parts.append(f"bottleneck shifted from {baseline.bottleneck_machine_id} to {counterfactual.bottleneck_machine_id}")

        summary = f"{name}: " + (", ".join(summary_parts) if summary_parts else "Nominal trajectory identical to baseline.")

        return ScenarioDelta(
            output_delta=output_delta,
            scrap_delta=scrap_delta,
            quality_delta=quality_delta,
            energy_delta_kwh=energy_delta,
            health_delta=health_delta,
            bottleneck_shifted=bottleneck_shifted,
            baseline_bottleneck=baseline.bottleneck_machine_id,
            counterfactual_bottleneck=counterfactual.bottleneck_machine_id,
            summary=summary,
        )

    def _generate_trajectory(
        self,
        base_ticks: list[dict[str, Any]],
        cf_ticks: list[dict[str, Any]],
        *,
        time_step_s: float,
        target_points: int = 15,
    ) -> list[TrajectorySample]:
        total_steps = len(base_ticks)
        if total_steps == 0:
            return []

        sample_stride = max(1, total_steps // target_points)
        trajectory: list[TrajectorySample] = []

        for step in range(0, total_steps, sample_stride):
            bt = base_ticks[step]
            ct = cf_ticks[step]
            sim_time = round(step * time_step_s, 1)

            b_pkg = bt.get("PACKAGING-01")
            c_pkg = ct.get("PACKAGING-01")
            b_cnc = bt.get("CNC-01")
            c_cnc = ct.get("CNC-01")
            b_insp = bt.get("INSPECTION-01")
            c_insp = ct.get("INSPECTION-01")

            trajectory.append(
                TrajectorySample(
                    simulated_seconds=sim_time,
                    baseline_output=b_pkg.production_count if b_pkg else 0,
                    counterfactual_output=c_pkg.production_count if c_pkg else 0,
                    baseline_quality=round(b_insp.quality_score if b_insp else 0.99, 4),
                    counterfactual_quality=round(c_insp.quality_score if c_insp else 0.99, 4),
                    baseline_cnc_health=round(b_cnc.health_score if b_cnc else 100.0, 2),
                    counterfactual_cnc_health=round(c_cnc.health_score if c_cnc else 100.0, 2),
                )
            )

        return trajectory
