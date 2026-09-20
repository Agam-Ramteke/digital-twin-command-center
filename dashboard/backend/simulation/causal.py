"""Causal, deterministic reduced-order models for the five-station line.

This module is intentionally pure Python.  It does not open sockets, access a
database, or know about FastAPI.  That separation lets the same models run in a
Live-Twin container, an isolated Scenario Worker, or a reproducible unit test.

The values are *calibration-ready parameters*, not claims of physical
validation.  Phase 7 will fit and record their values against the public data
sets specified in the research report.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
import random
from typing import Iterable

from domain.contracts import (
    CommandName,
    CommandRequest,
    EventEnvelope,
    EventKind,
    FaultSeverity,
    FrozenLineSnapshot,
    MachineStatus,
    OperationalState,
    StationOverride,
    StationType,
    TelemetryPayload,
    TwinDocument,
    event_id_for,
)


SIMULATION_EPOCH = datetime(2026, 1, 1, tzinfo=timezone.utc)


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass(frozen=True)
class StationConfig:
    machine_id: str
    station: StationType
    station_index: int
    cycle_time_s: float
    nominal_rpm: float | None = None


@dataclass(frozen=True)
class SimulationTick:
    """Everything generated in one deterministic factory time step."""

    simulated_at: datetime
    telemetry: tuple[TelemetryPayload, ...]
    events: tuple[EventEnvelope, ...]


DEFAULT_STATIONS: tuple[StationConfig, ...] = (
    StationConfig("STAMPING-01", StationType.STAMPING, 1, 8.5),
    StationConfig("CNC-01", StationType.CNC, 2, 42.0, nominal_rpm=3400.0),
    StationConfig("WELDING-01", StationType.WELDING, 3, 15.0),
    StationConfig("INSPECTION-01", StationType.INSPECTION, 4, 6.0),
    StationConfig("PACKAGING-01", StationType.PACKAGING, 5, 10.0, nominal_rpm=800.0),
)


class CausalStation:
    """Base class for all station models.

    A station owns state evolution, operational state, command transitions, and
    an independent pseudo-random stream so that one station's seed replay does
    not perturb the others.
    """

    def __init__(self, config: StationConfig, *, seed: int) -> None:
        self.config = config
        self._rng = random.Random(seed)
        self.operational_state = OperationalState.RUNNING
        self._fault_type: str | None = None
        self._fault_severity: FaultSeverity | None = None
        self._fault_elapsed_s = 0.0
        self._load_factor = 0.55
        self._cycle_elapsed_s = 0.0
        self.production_count = 0
        self.energy_kwh = 0.0
        self._last_status = MachineStatus.RUNNING
        self.cycle_time_multiplier = 1.0

    @property
    def machine_id(self) -> str:
        return self.config.machine_id

    @property
    def station(self) -> StationType:
        return self.config.station

    @property
    def fault_type(self) -> str | None:
        return self._fault_type

    @property
    def fault_active(self) -> bool:
        return self._fault_type is not None

    def apply_command(self, command: CommandRequest) -> None:
        """Apply a validated operator/scenario command to the local state.

        The future Live Twin will persist command intent before calling this;
        this pure model only performs the state transition.
        """

        name = command.command
        if name == CommandName.START:
            if self.operational_state in {OperationalState.IDLE, OperationalState.OFFLINE}:
                self.operational_state = OperationalState.RUNNING
        elif name == CommandName.STOP:
            self.operational_state = OperationalState.IDLE
        elif name == CommandName.RESET:
            self.reset()
        elif name == CommandName.BEGIN_MAINTENANCE:
            self.operational_state = OperationalState.MAINTENANCE
        elif name == CommandName.COMPLETE_MAINTENANCE:
            self._complete_maintenance()
            self.operational_state = OperationalState.RUNNING
        elif name == CommandName.TOOL_CHANGE:
            self._tool_change()
            self.operational_state = OperationalState.RUNNING
        elif name == CommandName.INJECT_FAULT:
            self._fault_type = command.fault_type or "injected_fault"
            self._fault_severity = command.severity or FaultSeverity.WARNING
            self._fault_elapsed_s = 0.0
        elif name == CommandName.CLEAR_FAULT:
            self._clear_fault()

    def reset(self) -> None:
        """Return generic state to nominal; subclasses reset degradation too."""

        self.operational_state = OperationalState.RUNNING
        self._fault_type = None
        self._fault_severity = None
        self._fault_elapsed_s = 0.0
        self._load_factor = 0.55
        self._cycle_elapsed_s = 0.0
        self.production_count = 0
        self.energy_kwh = 0.0
        self._last_status = MachineStatus.RUNNING
        self.cycle_time_multiplier = 1.0
        self._reset_degradation()

    def rehydrate_from_twin(self, twin: TwinDocument) -> None:
        """Restore internal station state from a FrozenLineSnapshot TwinDocument."""
        self.operational_state = twin.operational.state
        self._last_status = twin.operational.status
        self.production_count = twin.production.cumulative_output
        self.energy_kwh = twin.telemetry.energy_kwh
        self._fault_type = twin.faults.code if twin.faults.active else (
            twin.telemetry.fault_code or ("injected_fault" if twin.operational.state == OperationalState.FAULT else None)
        )
        self._fault_severity = twin.faults.severity
        if self._fault_type is not None:
            if self._fault_severity is None:
                if twin.operational.status == MachineStatus.FAULT or twin.operational.state == OperationalState.FAULT:
                    self._fault_severity = FaultSeverity.CRITICAL
                elif twin.operational.status == MachineStatus.DEGRADED:
                    self._fault_severity = FaultSeverity.WARNING
                else:
                    self._fault_severity = FaultSeverity.INFO
            severity_scale = 1.0 if self._fault_severity == FaultSeverity.CRITICAL else 0.62
            if self._fault_severity == FaultSeverity.INFO:
                severity_scale = 0.25
            if twin.operational.status == MachineStatus.FAULT or twin.operational.state == OperationalState.FAULT:
                target_fault = 1.0
            elif twin.operational.status == MachineStatus.DEGRADED:
                target_fault = 0.50
            elif twin.operational.status == MachineStatus.WARNING:
                target_fault = 0.20
            else:
                target_fault = 0.05
            self._fault_elapsed_s = (target_fault * 60.0) / max(0.01, severity_scale)
        else:
            self._fault_elapsed_s = 0.0
        self._rehydrate_station_degradation(twin)

    def _rehydrate_station_degradation(self, twin: TwinDocument) -> None:
        pass

    def apply_override(self, override: StationOverride) -> None:
        """Apply a counterfactual override to this station for scenario forking."""
        if override.command is not None:
            self.apply_command(
                CommandRequest(
                    command=override.command,
                    fault_type=override.fault_type,
                    severity=override.fault_severity,
                )
            )
        elif override.fault_type is not None:
            self.apply_command(
                CommandRequest(
                    command=CommandName.INJECT_FAULT,
                    fault_type=override.fault_type,
                    severity=override.fault_severity or FaultSeverity.WARNING,
                )
            )
        if override.load_factor is not None:
            self._load_factor = clamp(override.load_factor, 0.1, 1.0)
        if override.cycle_time_multiplier is not None:
            self.cycle_time_multiplier = clamp(override.cycle_time_multiplier, 0.2, 5.0)
        self._apply_station_override(override)

    def _apply_station_override(self, override: StationOverride) -> None:
        pass

    @property
    def _is_actively_producing(self) -> bool:
        """True when the station is in a state that performs physical work.

        FAULT machines are still physically operating under degraded conditions
        (generating heat, forces, consuming power, wearing tools) — they just
        aren't counted as producing good parts by _advance_production.
        """
        return self.operational_state in {OperationalState.RUNNING, OperationalState.FAULT}

    def _calculate_idle_values(self, dt_s: float) -> dict[str, float | None]:
        """Return near-zero ambient readings for a stopped/idle machine.

        Stopped machines still have ambient temperature and standby current
        but produce zero cutting force, zero RPM, and no tool wear.
        """
        fault = self._fault_factor()
        # Ambient temperature with very slow drift toward room temp
        ambient_temp = 25.0 + self._rng.gauss(0.0, 0.08)
        # Standby current (electronics/PLC only)
        standby_current = 0.12 + self._rng.gauss(0.0, 0.01)
        # Residual vibration from building/adjacent machines
        residual_vibration = 0.05 + self._rng.gauss(0.0, 0.01)

        return {
            "fault_factor": fault,
            "temperature_c": ambient_temp,
            "vibration_mm_s": max(0.0, residual_vibration),
            "current_a": max(0.0, standby_current),
            "voltage_v": None,
            "force_kn": 0.0,
            "hydraulic_pressure_bar": None,
            "pneumatic_pressure_bar": None,
            "target_rpm": 0.0,
            "actual_rpm": 0.0,
            "cycle_time_s": self.config.cycle_time_s * self.cycle_time_multiplier,
            "health_score": self._idle_health_score(),
            "anomaly_score": clamp(0.01 + 0.55 * fault, 0.0, 1.0),
            "quality_score": 1.0,  # Not producing, so no quality to degrade
            "tool_wear_percent": self._current_tool_wear_percent(),
            "bearing_degradation_percent": self._current_bearing_degradation_percent(),
        }

    def _idle_health_score(self) -> float:
        """Health score when idle — subclasses can override for station-specific health."""
        return 100.0

    def _current_tool_wear_percent(self) -> float | None:
        """Return current tool wear; subclasses override."""
        return None

    def _current_bearing_degradation_percent(self) -> float | None:
        """Return current bearing degradation; subclasses override."""
        return None

    def advance(self, *, dt_s: float, simulated_at: datetime) -> TelemetryPayload:
        """Advance one station by deterministic simulation time.

        `simulated_at` comes from the factory clock rather than wall time.  It
        allows a scenario to replay the exact same trajectory from a snapshot.
        """

        if dt_s <= 0:
            raise ValueError("dt_s must be positive")
        if simulated_at.tzinfo is None or simulated_at.utcoffset() is None:
            raise ValueError("simulated_at must be timezone-aware")

        self._advance_operational_state(dt_s)

        if self._is_actively_producing:
            # Full physics: load evolution, causal values, production, energy
            self._advance_load(dt_s)
            values = self._calculate_values(dt_s)
            self._advance_production(dt_s, values["cycle_time_s"])
            self.energy_kwh += self._energy_increment_kwh(values["current_a"], dt_s)
        else:
            # Idle/stopped: ambient readings only, no wear, no production, standby energy
            values = self._calculate_idle_values(dt_s)
            standby_current = values["current_a"] or 0.12
            self.energy_kwh += self._energy_increment_kwh(standby_current, dt_s)

        status = self._status_for_fault_factor(values["fault_factor"])
        self._last_status = status

        return TelemetryPayload(
            machine_id=self.machine_id,
            station=self.station,
            status=status,
            operational_state=self.operational_state,
            simulated_at=simulated_at.astimezone(timezone.utc),
            temperature_c=round(values["temperature_c"], 3),
            vibration_mm_s=round(values["vibration_mm_s"], 3),
            current_a=round(values["current_a"], 3),
            voltage_v=self._round_or_none(values.get("voltage_v")),
            force_kn=self._round_or_none(values.get("force_kn")),
            hydraulic_pressure_bar=self._round_or_none(values.get("hydraulic_pressure_bar")),
            pneumatic_pressure_bar=self._round_or_none(values.get("pneumatic_pressure_bar")),
            target_rpm=self._round_or_none(values.get("target_rpm")),
            actual_rpm=self._round_or_none(values.get("actual_rpm")),
            cycle_time_s=round(values["cycle_time_s"], 3),
            energy_kwh=round(self.energy_kwh, 6),
            production_count=self.production_count,
            health_score=round(values["health_score"], 3),
            anomaly_score=round(values["anomaly_score"], 4),
            quality_score=round(values["quality_score"], 5),
            tool_wear_percent=self._round_or_none(values.get("tool_wear_percent")),
            bearing_degradation_percent=self._round_or_none(values.get("bearing_degradation_percent")),
            fault_code=self._fault_type,
        )

    def snapshot(self) -> dict[str, object]:
        """Return only serialisable state needed for later scenario forks."""

        return {
            "machine_id": self.machine_id,
            "station": self.station.value,
            "operational_state": self.operational_state.value,
            "fault_type": self._fault_type,
            "fault_severity": self._fault_severity.value if self._fault_severity else None,
            "fault_elapsed_s": self._fault_elapsed_s,
            "load_factor": self._load_factor,
            "cycle_elapsed_s": self._cycle_elapsed_s,
            "production_count": self.production_count,
            "energy_kwh": self.energy_kwh,
            "degradation": self._degradation_snapshot(),
        }

    def _advance_operational_state(self, dt_s: float) -> None:
        if self.fault_active:
            self._fault_elapsed_s += dt_s

    def _advance_load(self, dt_s: float) -> None:
        # Mean-reverting operational load plus a bounded sensor-independent
        # disturbance. This is deliberately a residual, not the whole model.
        mean_reversion = (0.55 - self._load_factor) * min(1.0, dt_s / 15.0)
        disturbance = self._rng.gauss(0.0, 0.025 * math.sqrt(dt_s))
        self._load_factor = clamp(self._load_factor + mean_reversion + disturbance, 0.25, 0.95)

    def _fault_factor(self) -> float:
        if not self.fault_active:
            return 0.0
        severity_scale = 1.0 if self._fault_severity == FaultSeverity.CRITICAL else 0.62
        if self._fault_severity == FaultSeverity.INFO:
            severity_scale = 0.25
        return clamp((self._fault_elapsed_s / 60.0) * severity_scale, 0.0, 1.0)

    def _status_for_fault_factor(self, fault_factor: float) -> MachineStatus:
        if self.operational_state == OperationalState.OFFLINE:
            return MachineStatus.OFFLINE
        if self.operational_state == OperationalState.MAINTENANCE:
            return MachineStatus.MAINTENANCE
        if self.operational_state == OperationalState.IDLE:
            return MachineStatus.IDLE
        if fault_factor >= 0.9:
            self.operational_state = OperationalState.FAULT
            return MachineStatus.FAULT
        if fault_factor >= 0.42:
            return MachineStatus.DEGRADED
        if fault_factor >= 0.12:
            return MachineStatus.WARNING
        return MachineStatus.RUNNING

    def _advance_production(self, dt_s: float, cycle_time_s: float) -> None:
        if self.operational_state in {
            OperationalState.IDLE,
            OperationalState.MAINTENANCE,
            OperationalState.FAULT,
            OperationalState.OFFLINE,
        }:
            return
        self._cycle_elapsed_s += dt_s
        while self._cycle_elapsed_s >= cycle_time_s:
            self.production_count += 1
            self._cycle_elapsed_s -= cycle_time_s

    @staticmethod
    def _energy_increment_kwh(current_a: float, dt_s: float) -> float:
        # 415V three-phase, 0.8 power factor.  It intentionally derives energy
        # from the modelled current instead of inventing a separate KPI series.
        return max(0.0, current_a) * 415.0 * math.sqrt(3) * 0.8 * dt_s / 3_600_000.0

    @staticmethod
    def _round_or_none(value: float | None) -> float | None:
        return round(value, 3) if value is not None else None

    def _clear_fault(self) -> None:
        self._fault_type = None
        self._fault_severity = None
        self._fault_elapsed_s = 0.0
        if self.operational_state == OperationalState.FAULT:
            self.operational_state = OperationalState.RUNNING

    def _complete_maintenance(self) -> None:
        self._clear_fault()
        self._reset_degradation()

    def _tool_change(self) -> None:
        """Subclasses override if their station has a tool-change operation."""

    def _reset_degradation(self) -> None:
        """Subclasses override to reset station-specific internal variables."""

    def _degradation_snapshot(self) -> dict[str, float]:
        return {}

    def _calculate_values(self, dt_s: float) -> dict[str, float | None]:
        raise NotImplementedError


class StampingStation(CausalStation):
    """Die wear -> press force -> current/vibration/quality causal chain."""

    def __init__(self, config: StationConfig, *, seed: int) -> None:
        super().__init__(config, seed=seed)
        self.die_wear = 0.04

    def _rehydrate_station_degradation(self, twin: TwinDocument) -> None:
        if twin.health.tool_wear_percent is not None:
            self.die_wear = clamp(twin.health.tool_wear_percent / 100.0, 0.0, 1.0)
        else:
            self.die_wear = clamp((100.0 - twin.health.score) / 68.0, 0.0, 1.0)

    def _apply_station_override(self, override: StationOverride) -> None:
        if override.tool_wear_percent is not None:
            self.die_wear = clamp(override.tool_wear_percent / 100.0, 0.0, 1.0)

    def _calculate_values(self, dt_s: float) -> dict[str, float | None]:
        fault = self._fault_factor()
        accelerated_wear = 1.0 + (4.0 * fault if self._fault_type in {"die_wear", "feed_jam"} else 0.0)
        self.die_wear = clamp(
            self.die_wear + 0.000018 * dt_s * (0.65 + self._load_factor) * accelerated_wear,
            0.0,
            1.0,
        )
        required_force = 110.0 * (0.72 + 0.56 * self._load_factor) * (1.0 + 0.9 * self.die_wear)
        current = 5.0 + 0.055 * required_force + self._rng.gauss(0.0, 0.16)
        hydraulic_pressure = 85.0 + 0.45 * required_force + self._rng.gauss(0.0, 0.4)
        vibration = 1.15 + 0.0065 * required_force + 3.2 * self.die_wear + self._rng.gauss(0.0, 0.07)
        temperature = 43.0 + 0.16 * current + 7.0 * self.die_wear + self._rng.gauss(0.0, 0.18)
        cycle_time = self.config.cycle_time_s * (1.0 + 0.22 * fault + 0.07 * self.die_wear) * self.cycle_time_multiplier
        quality = clamp(0.997 - 0.52 * self.die_wear - 0.35 * fault, 0.0, 1.0)
        health = clamp(100.0 - 68.0 * self.die_wear - 42.0 * fault, 0.0, 100.0)
        return {
            "fault_factor": fault,
            "temperature_c": temperature,
            "vibration_mm_s": max(0.0, vibration),
            "current_a": max(0.0, current),
            "force_kn": required_force,
            "hydraulic_pressure_bar": hydraulic_pressure,
            "target_rpm": self.config.nominal_rpm,
            "actual_rpm": max(0.0, (self.config.nominal_rpm or 0.0) * (1.0 - 0.08 * fault)),
            "cycle_time_s": cycle_time,
            "health_score": health,
            "anomaly_score": clamp(0.02 + 0.62 * self.die_wear + 0.65 * fault, 0.0, 1.0),
            "quality_score": quality,
            "tool_wear_percent": self.die_wear * 100.0,
            "bearing_degradation_percent": None,
        }

    def _idle_health_score(self) -> float:
        return clamp(100.0 - 68.0 * self.die_wear, 0.0, 100.0)

    def _current_tool_wear_percent(self) -> float | None:
        return self.die_wear * 100.0

    def _reset_degradation(self) -> None:
        self.die_wear = 0.04

    def _degradation_snapshot(self) -> dict[str, float]:
        return {"die_wear_percent": round(self.die_wear * 100.0, 5)}


class CncStation(CausalStation):
    """Flagship reduced-order CNC model based on the report's causal graph.

    The internal variables are deliberately separate: tool wear affects cutting
    force and quality, while bearing degradation creates a distinct vibration
    and RPM-tracking signal.  Phase 7 will replace the provisional coefficients
    with recorded calibration artifacts from PHM 2010 and NASA IMS analysis.
    """

    def __init__(self, config: StationConfig, *, seed: int) -> None:
        super().__init__(config, seed=seed)
        self.tool_wear = 0.10
        self.bearing_degradation = 0.03
        self.coolant_failure = False
        self.custom_rpm: float | None = None

    def _rehydrate_station_degradation(self, twin: TwinDocument) -> None:
        if twin.health.tool_wear_percent is not None:
            self.tool_wear = clamp(twin.health.tool_wear_percent / 100.0, 0.0, 1.0)
        if twin.health.bearing_degradation_percent is not None:
            self.bearing_degradation = clamp(twin.health.bearing_degradation_percent / 100.0, 0.0, 1.0)
        if twin.faults.active and twin.faults.code == "coolant_failure":
            self.coolant_failure = True

    def _apply_station_override(self, override: StationOverride) -> None:
        if override.tool_wear_percent is not None:
            self.tool_wear = clamp(override.tool_wear_percent / 100.0, 0.0, 1.0)
        if override.bearing_degradation_percent is not None:
            self.bearing_degradation = clamp(override.bearing_degradation_percent / 100.0, 0.0, 1.0)
        if override.target_rpm is not None:
            self.custom_rpm = override.target_rpm

    def _calculate_values(self, dt_s: float) -> dict[str, float | None]:
        fault = self._fault_factor()
        if self._fault_type == "coolant_failure":
            self.coolant_failure = True
        tool_acceleration = 1.0 + (5.0 * fault if self._fault_type in {"tool_wear", "injected_fault"} else 0.0)
        bearing_acceleration = 1.0 + (4.0 * fault if self._fault_type == "bearing_fault" else 0.0)
        self.tool_wear = clamp(
            self.tool_wear + 0.000012 * dt_s * (0.5 + self._load_factor) * tool_acceleration,
            0.0,
            1.0,
        )
        self.bearing_degradation = clamp(
            self.bearing_degradation + 0.000004 * dt_s * (0.4 + self._load_factor) * bearing_acceleration,
            0.0,
            1.0,
        )

        cutting_force = 7.2 * (0.75 + self._load_factor) * (1.0 + 0.95 * self.tool_wear)
        current = 3.9 + 0.60 * cutting_force + 1.8 * self.bearing_degradation + self._rng.gauss(0.0, 0.12)
        coolant_penalty = 14.0 * (0.55 + fault) if self.coolant_failure else 0.0
        temperature = (
            40.0
            + 1.65 * current
            + 10.0 * self.tool_wear
            + 5.5 * self.bearing_degradation
            + coolant_penalty
            + self._rng.gauss(0.0, 0.22)
        )
        target_rpm = self.custom_rpm if self.custom_rpm is not None else (self.config.nominal_rpm or 3400.0)
        rpm_tracking_error = 35.0 * self._load_factor + 210.0 * self.bearing_degradation + 360.0 * fault
        actual_rpm = max(200.0, target_rpm - rpm_tracking_error + self._rng.gauss(0.0, 5.0))
        vibration = (
            1.5
            + 0.25 * cutting_force
            + 5.0 * self.tool_wear
            + 4.0 * self.bearing_degradation
            + 1.5 * fault
            + self._rng.gauss(0.0, 0.08)
        )
        cycle_time = self.config.cycle_time_s * (
            1.0 + 0.14 * self.tool_wear + 0.08 * self.bearing_degradation + 0.22 * fault
        ) * self.cycle_time_multiplier
        quality = clamp(
            0.998 - 0.58 * (self.tool_wear ** 1.45) - 0.10 * self.bearing_degradation - 0.24 * fault,
            0.0,
            1.0,
        )
        health = clamp(
            100.0 - 62.0 * self.tool_wear - 26.0 * self.bearing_degradation - 20.0 * fault,
            0.0,
            100.0,
        )
        anomaly = clamp(
            0.015
            + 0.46 * self.tool_wear
            + 0.25 * self.bearing_degradation
            + 0.55 * fault
            + (0.10 if self.coolant_failure else 0.0),
            0.0,
            1.0,
        )
        return {
            "fault_factor": fault,
            "temperature_c": temperature,
            "vibration_mm_s": max(0.0, vibration),
            "current_a": max(0.0, current),
            "force_kn": cutting_force,
            "target_rpm": target_rpm,
            "actual_rpm": actual_rpm,
            "cycle_time_s": cycle_time,
            "health_score": health,
            "anomaly_score": anomaly,
            "quality_score": quality,
            "tool_wear_percent": self.tool_wear * 100.0,
            "bearing_degradation_percent": self.bearing_degradation * 100.0,
        }

    def _tool_change(self) -> None:
        self.tool_wear = 0.0
        self.coolant_failure = False
        if self._fault_type in {"tool_wear", "coolant_failure"}:
            self._clear_fault()

    def _idle_health_score(self) -> float:
        return clamp(100.0 - 62.0 * self.tool_wear - 26.0 * self.bearing_degradation, 0.0, 100.0)

    def _current_tool_wear_percent(self) -> float | None:
        return self.tool_wear * 100.0

    def _current_bearing_degradation_percent(self) -> float | None:
        return self.bearing_degradation * 100.0

    def _reset_degradation(self) -> None:
        self.tool_wear = 0.10
        self.bearing_degradation = 0.03
        self.coolant_failure = False
        self.custom_rpm = None

    def _degradation_snapshot(self) -> dict[str, float]:
        return {
            "tool_wear_percent": round(self.tool_wear * 100.0, 5),
            "bearing_degradation_percent": round(self.bearing_degradation * 100.0, 5),
            "coolant_failure": float(self.coolant_failure),
        }


class WeldingStation(CausalStation):
    """Electrode wear -> voltage/current drift -> weld quality."""

    def __init__(self, config: StationConfig, *, seed: int) -> None:
        super().__init__(config, seed=seed)
        self.electrode_wear = 0.05
        self.clamp_degradation = 0.03

    def _rehydrate_station_degradation(self, twin: TwinDocument) -> None:
        if twin.health.tool_wear_percent is not None:
            self.electrode_wear = clamp(twin.health.tool_wear_percent / 100.0, 0.0, 1.0)
        else:
            # Fallback: inverse health, but only if no fault is active to avoid confounding
            if not twin.faults.active:
                self.electrode_wear = clamp((100.0 - twin.health.score) / 58.0, 0.0, 1.0)

    def _apply_station_override(self, override: StationOverride) -> None:
        if override.tool_wear_percent is not None:
            self.electrode_wear = clamp(override.tool_wear_percent / 100.0, 0.0, 1.0)

    def _calculate_values(self, dt_s: float) -> dict[str, float | None]:
        fault = self._fault_factor()
        self.electrode_wear = clamp(
            self.electrode_wear + 0.000014 * dt_s * (0.5 + self._load_factor) * (1.0 + 4.0 * fault),
            0.0,
            1.0,
        )
        self.clamp_degradation = clamp(
            self.clamp_degradation + 0.000006 * dt_s * (1.0 + 2.5 * fault),
            0.0,
            1.0,
        )
        current = 42.0 + 9.5 * self._load_factor + 16.0 * self.electrode_wear + self._rng.gauss(0.0, 0.32)
        voltage = 20.0 + 3.4 * self.electrode_wear + 2.6 * fault + self._rng.gauss(0.0, 0.08)
        pneumatic = 6.3 - 1.5 * self.clamp_degradation - 1.2 * fault + self._rng.gauss(0.0, 0.04)
        temperature = 68.0 + 0.30 * current + 6.0 * self.electrode_wear + self._rng.gauss(0.0, 0.25)
        vibration = 1.2 + 1.7 * self.clamp_degradation + 1.2 * fault + self._rng.gauss(0.0, 0.06)
        cycle_time = self.config.cycle_time_s * (1.0 + 0.1 * self.clamp_degradation + 0.23 * fault) * self.cycle_time_multiplier
        quality = clamp(
            0.997 - 0.48 * self.electrode_wear - 0.28 * self.clamp_degradation - 0.30 * fault,
            0.0,
            1.0,
        )
        health = clamp(100.0 - 58.0 * self.electrode_wear - 20.0 * self.clamp_degradation - 30.0 * fault, 0.0, 100.0)
        return {
            "fault_factor": fault,
            "temperature_c": temperature,
            "vibration_mm_s": max(0.0, vibration),
            "current_a": max(0.0, current),
            "voltage_v": max(0.0, voltage),
            "pneumatic_pressure_bar": max(0.0, pneumatic),
            "cycle_time_s": cycle_time,
            "health_score": health,
            "anomaly_score": clamp(0.02 + 0.55 * self.electrode_wear + 0.2 * self.clamp_degradation + 0.55 * fault, 0.0, 1.0),
            "quality_score": quality,
            "tool_wear_percent": self.electrode_wear * 100.0,
            "bearing_degradation_percent": None,
        }

    def _idle_health_score(self) -> float:
        return clamp(100.0 - 58.0 * self.electrode_wear - 20.0 * self.clamp_degradation, 0.0, 100.0)

    def _current_tool_wear_percent(self) -> float | None:
        return self.electrode_wear * 100.0

    def _reset_degradation(self) -> None:
        self.electrode_wear = 0.05
        self.clamp_degradation = 0.03

    def _degradation_snapshot(self) -> dict[str, float]:
        return {
            "electrode_wear_percent": round(self.electrode_wear * 100.0, 5),
            "clamp_degradation_percent": round(self.clamp_degradation * 100.0, 5),
        }


class InspectionStation(CausalStation):
    """Upstream CNC/weld quality -> bounded defect probability -> result.

    The Process Twin will own historic token correlation in Phase 3.  The
    station model still exposes an explicit upstream-quality input so the causal
    dependency is present rather than invented through independent noise.
    """

    def __init__(self, config: StationConfig, *, seed: int) -> None:
        super().__init__(config, seed=seed)
        self._upstream_cnc_quality = 0.995
        self._upstream_weld_quality = 0.995
        self.last_defect_probability = 0.01

    def set_upstream_quality(self, *, cnc_quality: float, weld_quality: float) -> None:
        self._upstream_cnc_quality = clamp(cnc_quality, 0.0, 1.0)
        self._upstream_weld_quality = clamp(weld_quality, 0.0, 1.0)

    def _calculate_values(self, dt_s: float) -> dict[str, float | None]:
        fault = self._fault_factor()
        upstream_defect_risk = 0.62 * (1.0 - self._upstream_cnc_quality) + 0.38 * (1.0 - self._upstream_weld_quality)
        self.last_defect_probability = clamp(0.003 + upstream_defect_risk + 0.30 * fault, 0.0, 0.98)
        quality = clamp(1.0 - self.last_defect_probability, 0.0, 1.0)
        current = 1.8 + 0.9 * self._load_factor + 1.3 * fault + self._rng.gauss(0.0, 0.04)
        temperature = 25.0 + 1.5 * self._load_factor + 5.0 * fault + self._rng.gauss(0.0, 0.08)
        vibration = 0.18 + 0.15 * self._load_factor + 0.55 * fault + self._rng.gauss(0.0, 0.02)
        cycle_time = self.config.cycle_time_s * (1.0 + 0.45 * fault) * self.cycle_time_multiplier
        health = clamp(100.0 - 48.0 * fault, 0.0, 100.0)
        return {
            "fault_factor": fault,
            "temperature_c": temperature,
            "vibration_mm_s": max(0.0, vibration),
            "current_a": max(0.0, current),
            "cycle_time_s": cycle_time,
            "health_score": health,
            "anomaly_score": clamp(0.01 + 0.75 * fault + 0.2 * upstream_defect_risk, 0.0, 1.0),
            "quality_score": quality,
            "tool_wear_percent": None,
            "bearing_degradation_percent": None,
        }


class PackagingStation(CausalStation):
    """Minimal downstream conveyor/counting station."""

    def __init__(self, config: StationConfig, *, seed: int) -> None:
        super().__init__(config, seed=seed)
        self.conveyor_wear = 0.02

    def _rehydrate_station_degradation(self, twin: TwinDocument) -> None:
        if twin.health.tool_wear_percent is not None:
            self.conveyor_wear = clamp(twin.health.tool_wear_percent / 100.0, 0.0, 1.0)
        else:
            # Fallback: inverse health, but only if no fault is active to avoid confounding
            if not twin.faults.active:
                self.conveyor_wear = clamp((100.0 - twin.health.score) / 40.0, 0.0, 1.0)

    def _apply_station_override(self, override: StationOverride) -> None:
        if override.tool_wear_percent is not None:
            self.conveyor_wear = clamp(override.tool_wear_percent / 100.0, 0.0, 1.0)

    def _calculate_values(self, dt_s: float) -> dict[str, float | None]:
        fault = self._fault_factor()
        self.conveyor_wear = clamp(
            self.conveyor_wear + 0.000003 * dt_s * (0.5 + self._load_factor) * (1.0 + 3.0 * fault),
            0.0,
            1.0,
        )
        current = 2.5 + 2.4 * self._load_factor + 3.2 * fault + self._rng.gauss(0.0, 0.07)
        temperature = 28.0 + 1.25 * current + 4.0 * self.conveyor_wear + self._rng.gauss(0.0, 0.12)
        vibration = 0.6 + 0.6 * self.conveyor_wear + 1.6 * fault + self._rng.gauss(0.0, 0.04)
        target_rpm = self.config.nominal_rpm or 800.0
        actual_rpm = max(0.0, target_rpm * (1.0 - 0.28 * fault - 0.08 * self.conveyor_wear) + self._rng.gauss(0.0, 3.0))
        cycle_time = self.config.cycle_time_s * (1.0 + 0.13 * self.conveyor_wear + 0.32 * fault) * self.cycle_time_multiplier
        quality = clamp(0.999 - 0.20 * fault, 0.0, 1.0)
        health = clamp(100.0 - 40.0 * self.conveyor_wear - 45.0 * fault, 0.0, 100.0)
        return {
            "fault_factor": fault,
            "temperature_c": temperature,
            "vibration_mm_s": max(0.0, vibration),
            "current_a": max(0.0, current),
            "target_rpm": target_rpm,
            "actual_rpm": actual_rpm,
            "cycle_time_s": cycle_time,
            "health_score": health,
            "anomaly_score": clamp(0.01 + 0.45 * self.conveyor_wear + 0.7 * fault, 0.0, 1.0),
            "quality_score": quality,
            "tool_wear_percent": self.conveyor_wear * 100.0,
            "bearing_degradation_percent": None,
        }

    def _idle_health_score(self) -> float:
        return clamp(100.0 - 40.0 * self.conveyor_wear, 0.0, 100.0)

    def _current_tool_wear_percent(self) -> float | None:
        return self.conveyor_wear * 100.0

    def _reset_degradation(self) -> None:
        self.conveyor_wear = 0.02

    def _degradation_snapshot(self) -> dict[str, float]:
        return {"conveyor_wear_percent": round(self.conveyor_wear * 100.0, 5)}


def build_station(config: StationConfig, *, seed: int) -> CausalStation:
    factories = {
        StationType.STAMPING: StampingStation,
        StationType.CNC: CncStation,
        StationType.WELDING: WeldingStation,
        StationType.INSPECTION: InspectionStation,
        StationType.PACKAGING: PackagingStation,
    }
    return factories[config.station](config, seed=seed)


class CausalFactory:
    """Deterministic in-process factory runner used before service extraction."""

    def __init__(
        self,
        *,
        run_id: str = "development-run",
        seed: int = 20260919,
        start_at: datetime = SIMULATION_EPOCH,
        stations: Iterable[StationConfig] = DEFAULT_STATIONS,
    ) -> None:
        if not run_id:
            raise ValueError("run_id is required")
        if start_at.tzinfo is None or start_at.utcoffset() is None:
            raise ValueError("start_at must be timezone-aware")
        self.run_id = run_id
        self.seed = seed
        self.current_time = start_at.astimezone(timezone.utc)
        self.models: dict[str, CausalStation] = {}
        self._sequences: dict[str, int] = {}
        for index, config in enumerate(stations):
            machine_seed = seed + (index + 1) * 10_007
            self.models[config.machine_id] = build_station(config, seed=machine_seed)
            self._sequences[config.machine_id] = 0

    def apply_command(self, machine_id: str, command: CommandRequest) -> None:
        try:
            self.models[machine_id].apply_command(command)
        except KeyError as error:
            raise KeyError(f"Unknown machine {machine_id}") from error

    def tick(self, *, dt_s: float = 1.0) -> SimulationTick:
        if dt_s <= 0:
            raise ValueError("dt_s must be positive")
        self.current_time += timedelta(seconds=dt_s)
        telemetry_by_machine: dict[str, TelemetryPayload] = {}
        inspection_model: InspectionStation | None = None
        for station in self.models.values():
            if isinstance(station, InspectionStation):
                inspection_model = station
                continue
            telemetry_by_machine[station.machine_id] = station.advance(
                dt_s=dt_s, simulated_at=self.current_time
            )

        # Preserve the direct physical quality dependency now. The durable
        # production-token/DAG representation is deliberately Phase 3.
        if inspection_model is not None:
            cnc = telemetry_by_machine.get("CNC-01")
            weld = telemetry_by_machine.get("WELDING-01")
            if cnc is not None and weld is not None:
                inspection_model.set_upstream_quality(
                    cnc_quality=cnc.quality_score,
                    weld_quality=weld.quality_score,
                )
            telemetry_by_machine[inspection_model.machine_id] = inspection_model.advance(
                dt_s=dt_s, simulated_at=self.current_time
            )

        telemetry = sorted(
            telemetry_by_machine.values(),
            key=lambda sample: self.models[sample.machine_id].config.station_index,
        )

        events: list[EventEnvelope] = []
        for sample in telemetry:
            self._sequences[sample.machine_id] += 1
            sequence = self._sequences[sample.machine_id]
            events.append(
                EventEnvelope(
                    event_id=event_id_for(self.run_id, sample.machine_id, EventKind.TELEMETRY, sequence),
                    run_id=self.run_id,
                    machine_id=sample.machine_id,
                    kind=EventKind.TELEMETRY,
                    sequence=sequence,
                    generated_at=sample.simulated_at,
                    payload=sample.model_dump(mode="json"),
                )
            )
        return SimulationTick(self.current_time, tuple(telemetry), tuple(events))

    def snapshot(self) -> dict[str, object]:
        """A serialisable frozen factory snapshot for Phase 4 Scenario Workers."""

        return {
            "run_id": self.run_id,
            "seed": self.seed,
            "captured_at": self.current_time.isoformat(),
            "stations": {machine_id: model.snapshot() for machine_id, model in self.models.items()},
        }

    @classmethod
    def from_frozen_line_snapshot(
        cls,
        snapshot: FrozenLineSnapshot,
        *,
        seed: int = 20260920,
        run_id: str = "scenario-run",
    ) -> CausalFactory:
        """Construct an isolated, ephemeral CausalFactory rehydrated from a FrozenLineSnapshot."""
        factory = cls(run_id=run_id, seed=seed, start_at=snapshot.captured_at)
        for twin in snapshot.twins:
            if twin.identity.machine_id in factory.models:
                factory.models[twin.identity.machine_id].rehydrate_from_twin(twin)
        return factory


def build_default_factory(*, run_id: str = "development-run", seed: int = 20260919) -> CausalFactory:
    return CausalFactory(run_id=run_id, seed=seed)

