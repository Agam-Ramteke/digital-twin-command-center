"""Versioned data contracts for the Digital Twin Orchestration Platform.

These models intentionally do not depend on FastAPI, MQTT, MongoDB, or the
legacy dashboard models.  They are the source of truth for the event pipeline
introduced in Phase 1 and will be reused by the Live Twin, Process Twin, and
Scenario Worker phases.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID, uuid4, uuid5

from pydantic import BaseModel, ConfigDict, Field, field_validator


SCHEMA_VERSION = "1.0"
EVENT_NAMESPACE = UUID("ad74f6e5-25e4-5c3f-b8c5-fa9bc2bd161c")


def utc_now() -> datetime:
    """Return an aware UTC timestamp.

    Keeping this in one place makes it simple for later services to inject a
    test clock instead of generating untraceable timestamps.
    """

    return datetime.now(timezone.utc)


class StationType(str, Enum):
    STAMPING = "STAMPING"
    CNC = "CNC"
    WELDING = "WELDING"
    INSPECTION = "INSPECTION"
    PACKAGING = "PACKAGING"


class OperationalState(str, Enum):
    IDLE = "IDLE"
    SETUP = "SETUP"
    LOADING = "LOADING"
    RUNNING = "RUNNING"
    TOOL_CHANGE = "TOOL_CHANGE"
    FAULT = "FAULT"
    MAINTENANCE = "MAINTENANCE"
    OFFLINE = "OFFLINE"


class MachineStatus(str, Enum):
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    WARNING = "WARNING"
    DEGRADED = "DEGRADED"
    FAULT = "FAULT"
    MAINTENANCE = "MAINTENANCE"
    OFFLINE = "OFFLINE"


class EventKind(str, Enum):
    TELEMETRY = "telemetry"
    STATE = "state"
    FAULT = "fault"
    PRODUCTION = "production"
    COMMAND = "command"
    SUMMARY = "summary"


class FaultSeverity(str, Enum):
    INFO = "Info"
    WARNING = "Warning"
    CRITICAL = "Critical"


class CommandName(str, Enum):
    START = "start"
    STOP = "stop"
    RESET = "reset"
    BEGIN_MAINTENANCE = "begin_maintenance"
    COMPLETE_MAINTENANCE = "complete_maintenance"
    TOOL_CHANGE = "tool_change"
    INJECT_FAULT = "inject_fault"
    CLEAR_FAULT = "clear_fault"


class StrictModel(BaseModel):
    """Reject silent contract drift at system boundaries."""

    model_config = ConfigDict(extra="forbid", use_enum_values=False)


class CommandRequest(StrictModel):
    command: CommandName
    issued_at: datetime = Field(default_factory=utc_now)
    requested_by: str = Field(default="operator", min_length=1, max_length=120)
    fault_type: str | None = Field(default=None, max_length=120)
    severity: FaultSeverity | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)

    @field_validator("issued_at")
    @classmethod
    def issued_at_must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("issued_at must include a UTC offset")
        return value.astimezone(timezone.utc)


class TelemetryPayload(StrictModel):
    """A causal station observation, before Live-Twin persistence.

    The report calls for target and actual RPM to be distinct for CNC.  Fields
    unused by other station types remain `None`; this keeps a stable platform
    envelope while avoiding fictional readings.
    """

    machine_id: str = Field(min_length=1, max_length=80)
    station: StationType
    status: MachineStatus
    operational_state: OperationalState
    simulated_at: datetime
    temperature_c: float = Field(ge=-50, le=500)
    vibration_mm_s: float = Field(ge=0, le=200)
    current_a: float = Field(ge=0, le=10000)
    voltage_v: float | None = Field(default=None, ge=0, le=10000)
    force_kn: float | None = Field(default=None, ge=0, le=100000)
    hydraulic_pressure_bar: float | None = Field(default=None, ge=0, le=100000)
    pneumatic_pressure_bar: float | None = Field(default=None, ge=0, le=100000)
    target_rpm: float | None = Field(default=None, ge=0, le=100000)
    actual_rpm: float | None = Field(default=None, ge=0, le=100000)
    cycle_time_s: float = Field(gt=0, le=36000)
    energy_kwh: float = Field(ge=0)
    production_count: int = Field(ge=0)
    health_score: float = Field(ge=0, le=100)
    anomaly_score: float = Field(ge=0, le=1)
    quality_score: float = Field(ge=0, le=1)
    tool_wear_percent: float | None = Field(default=None, ge=0, le=100)
    bearing_degradation_percent: float | None = Field(default=None, ge=0, le=100)
    fault_code: str | None = Field(default=None, max_length=120)
    source: Literal["simulator", "adapter"] = "simulator"

    @field_validator("simulated_at")
    @classmethod
    def simulated_at_must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("simulated_at must include a UTC offset")
        return value.astimezone(timezone.utc)


def event_id_for(run_id: str, machine_id: str, kind: EventKind, sequence: int) -> str:
    """Generate an idempotency key that is stable during deterministic replay."""

    if not run_id or not machine_id or sequence < 1:
        raise ValueError("run_id, machine_id, and positive sequence are required")
    return str(uuid5(EVENT_NAMESPACE, f"{run_id}:{machine_id}:{kind.value}:{sequence}"))


class EventEnvelope(StrictModel):
    """Transport-independent envelope used for MQTT and persistence.

    `received_at` is deliberately unset at generation.  The Live Twin fills it
    when an event is actually consumed, producing measurable—not invented—
    delivery and processing latency.
    """

    schema_version: str = SCHEMA_VERSION
    event_id: str = Field(min_length=36, max_length=36)
    run_id: str = Field(min_length=1, max_length=120)
    machine_id: str = Field(min_length=1, max_length=80)
    kind: EventKind
    sequence: int = Field(ge=1)
    generated_at: datetime
    received_at: datetime | None = None
    correlation_id: str | None = Field(default=None, max_length=120)
    payload: dict[str, Any]

    @field_validator("generated_at", "received_at")
    @classmethod
    def timestamps_must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must include a UTC offset")
        return value.astimezone(timezone.utc)

    @property
    def payload_fingerprint(self) -> str:
        """A useful diagnostic hash for idempotency collision investigation."""

        serialized = self.model_dump_json(exclude={"received_at"}, by_alias=True)
        return sha256(serialized.encode("utf-8")).hexdigest()


class IdentityState(StrictModel):
    machine_id: str = Field(min_length=1, max_length=80)
    station: StationType
    station_index: int = Field(ge=1, le=999)
    schema_version: str = SCHEMA_VERSION


class OperationalStateSnapshot(StrictModel):
    state: OperationalState
    status: MachineStatus
    updated_at: datetime


class HealthState(StrictModel):
    score: float = Field(ge=0, le=100)
    anomaly_score: float = Field(ge=0, le=1)
    tool_wear_percent: float | None = Field(default=None, ge=0, le=100)
    bearing_degradation_percent: float | None = Field(default=None, ge=0, le=100)


class ProductionState(StrictModel):
    cumulative_output: int = Field(ge=0)
    latest_quality_score: float = Field(ge=0, le=1)
    latest_token_id: str | None = None


class FaultState(StrictModel):
    active: bool = False
    code: str | None = None
    severity: FaultSeverity | None = None
    updated_at: datetime | None = None


class DesiredState(StrictModel):
    pending_command: CommandName | None = None
    command_requested_at: datetime | None = None


class SynchronizationState(StrictModel):
    """Observed timestamps and timing values maintained by a Live Twin.

    Values are optional until the first event is consumed.  A measurement is
    only set from observed clocks; the application never fills it with a random
    placeholder merely to make a dashboard tile look populated.
    """

    latest_sequence: int = Field(ge=0)
    last_generated_at: datetime | None = None
    last_received_at: datetime | None = None
    delivery_latency_ms: float | None = Field(default=None, ge=0)
    processing_latency_ms: float | None = Field(default=None, ge=0)
    source_age_ms: float | None = Field(default=None, ge=0)


class TwinDocument(StrictModel):
    """The one-document-per-machine shape intended for MongoDB `twins`."""

    identity: IdentityState
    operational: OperationalStateSnapshot
    telemetry: TelemetryPayload
    health: HealthState
    production: ProductionState
    faults: FaultState = Field(default_factory=FaultState)
    desired: DesiredState = Field(default_factory=DesiredState)
    synchronization: SynchronizationState
    last_event_id: str = Field(min_length=36, max_length=36)
    revision: int = Field(default=1, ge=1)
    updated_at: datetime


class ProductionToken(StrictModel):
    """Minimal material-flow contract for the Phase 3 Process Twin."""

    token_id: str = Field(min_length=1, max_length=120)
    part_type: str = Field(default="automotive_component", min_length=1, max_length=120)
    quality: Literal["pending", "pass", "fail"] = "pending"
    source_station: StationType
    emitted_at: datetime
    carried_flags: dict[str, float | bool | str] = Field(default_factory=dict)
    lineage: list[str] = Field(default_factory=list)


class FrozenLineSnapshot(StrictModel):
    """An immutable-at-creation view of all station Live Twins.

    The Process Twin and Scenario Workers use this rather than separately
    fetching live machine documents, preventing a mixed-time line view.
    """

    snapshot_id: str = Field(default_factory=lambda: str(uuid4()), min_length=36, max_length=36)
    captured_at: datetime = Field(default_factory=utc_now)
    topology_version: str = "five-station-v1"
    twins: list[TwinDocument] = Field(min_length=1)


class ProcessMetrics(StrictModel):
    bottleneck_machine_id: str
    bottleneck_station: StationType
    bottleneck_cycle_time_s: float = Field(gt=0)
    line_capacity_per_hour: float = Field(ge=0)
    expected_line_quality: float = Field(ge=0, le=1)
    available_stations: int = Field(ge=0)
    total_stations: int = Field(ge=1)
    snapshot_max_source_age_ms: float | None = Field(default=None, ge=0)
    notes: list[str] = Field(default_factory=list)


class ProcessTwinView(StrictModel):
    snapshot: FrozenLineSnapshot
    metrics: ProcessMetrics


class DAGNode(StrictModel):
    machine_id: str = Field(min_length=1, max_length=80)
    station: StationType
    station_index: int = Field(ge=1, le=999)
    nominal_cycle_time_s: float = Field(gt=0)
    upstream_machine_ids: list[str] = Field(default_factory=list)
    downstream_machine_ids: list[str] = Field(default_factory=list)


class DAGEdge(StrictModel):
    from_machine_id: str = Field(min_length=1, max_length=80)
    to_machine_id: str = Field(min_length=1, max_length=80)
    transition_type: str = "material_flow"


class ProcessTopology(StrictModel):
    version: str = "five-station-v1"
    nodes: list[DAGNode]
    edges: list[DAGEdge]
    order: list[str]


class StationBottleneckDetail(StrictModel):
    machine_id: str
    station: StationType
    cycle_time_s: float
    effective_cycle_time_s: float
    slack_time_s: float
    is_bottleneck: bool
    status: MachineStatus


class BottleneckReport(StrictModel):
    binding_machine_id: str
    binding_station: StationType
    binding_cycle_time_s: float
    max_line_capacity_per_hour: float
    stations: list[StationBottleneckDetail]
    captured_at: datetime


class StationDefectAttribution(StrictModel):
    machine_id: str
    station: StationType
    attribution_percent: float = Field(ge=0, le=100)
    sample_count: int = Field(ge=0)
    average_quality_score: float = Field(ge=0, le=1)
    reason: str


class DefectAttributionReport(StrictModel):
    total_tokens_evaluated: int = Field(ge=0)
    defective_tokens_count: int = Field(ge=0)
    defect_rate_percent: float = Field(ge=0, le=100)
    primary_root_cause_station: StationType | None = None
    primary_root_cause_machine_id: str | None = None
    attributions: list[StationDefectAttribution] = Field(default_factory=list)
    summary_analysis: str
    evaluated_at: datetime


# ---------------------------------------------------------------------------
# Phase 4 — Scenario Worker Contracts (§4.3, §4.4)
# ---------------------------------------------------------------------------

class ScenarioStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StationOverride(StrictModel):
    """Counterfactual parameter override or command applied to a single station."""

    machine_id: str = Field(min_length=1, max_length=80)
    command: CommandName | None = None
    fault_type: str | None = Field(default=None, max_length=120)
    fault_severity: FaultSeverity | None = None
    tool_wear_percent: float | None = Field(default=None, ge=0, le=100)
    bearing_degradation_percent: float | None = Field(default=None, ge=0, le=100)
    load_factor: float | None = Field(default=None, ge=0.1, le=1.0)
    cycle_time_multiplier: float | None = Field(default=None, ge=0.2, le=5.0)
    target_rpm: float | None = Field(default=None, ge=0)


class ScenarioForkRequest(StrictModel):
    """Request payload for an isolated forward counterfactual simulation."""

    name: str = Field(default="Counterfactual Scenario", min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    snapshot_id: str | None = Field(default=None, min_length=36, max_length=36)
    seed: int = Field(default=20260920)
    horizon_seconds: float = Field(default=120.0, ge=5.0, le=3600.0)
    time_step_s: float = Field(default=1.0, ge=0.1, le=10.0)
    overrides: list[StationOverride] = Field(default_factory=list)


class StationOutcome(StrictModel):
    """Summary metrics for one station over the forward simulation horizon."""

    machine_id: str
    station: StationType
    final_state: OperationalState
    final_status: MachineStatus
    final_health_score: float = Field(ge=0, le=100)
    parts_produced: int = Field(ge=0)
    energy_kwh: float = Field(ge=0)
    avg_cycle_time_s: float = Field(ge=0)
    avg_quality_score: float = Field(ge=0, le=1)
    fault_occurred: bool = False


class LineOutcome(StrictModel):
    """Line-level outcome across the entire five-station DAG."""

    total_output: int = Field(ge=0)
    scrap_count: int = Field(ge=0)
    overall_quality: float = Field(ge=0, le=1)
    total_energy_kwh: float = Field(ge=0)
    bottleneck_machine_id: str
    binding_cycle_time_s: float = Field(gt=0)
    hourly_capacity: float = Field(ge=0)
    stations: list[StationOutcome] = Field(min_length=1)


class ScenarioDelta(StrictModel):
    """Comparative causal delta between Counterfactual and Baseline."""

    output_delta: int
    scrap_delta: int
    quality_delta: float
    energy_delta_kwh: float
    health_delta: float
    bottleneck_shifted: bool
    baseline_bottleneck: str
    counterfactual_bottleneck: str
    summary: str


class TrajectorySample(StrictModel):
    """Sampled forward time point for dashboard charts."""

    simulated_seconds: float
    baseline_output: int
    counterfactual_output: int
    baseline_quality: float
    counterfactual_quality: float
    baseline_cnc_health: float
    counterfactual_cnc_health: float


class ScenarioRunResult(StrictModel):
    """Persisted scenario execution record in MongoDB `scenarios`."""

    scenario_id: str = Field(default_factory=lambda: str(uuid4()), min_length=36, max_length=36)
    name: str
    description: str | None = None
    status: ScenarioStatus = ScenarioStatus.COMPLETED
    snapshot_id: str = Field(min_length=36, max_length=36)
    seed: int
    horizon_seconds: float
    time_step_s: float
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: datetime = Field(default_factory=utc_now)
    overrides: list[StationOverride] = Field(default_factory=list)
    baseline: LineOutcome
    counterfactual: LineOutcome
    comparison: ScenarioDelta
    trajectory: list[TrajectorySample] = Field(default_factory=list)


