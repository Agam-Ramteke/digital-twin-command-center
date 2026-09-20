"""Live Twin event reducer with idempotency and observed synchronization timing."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter_ns

from domain.contracts import (
    DesiredState,
    EventEnvelope,
    EventKind,
    FaultSeverity,
    FaultState,
    HealthState,
    IdentityState,
    MachineStatus,
    OperationalState,
    OperationalStateSnapshot,
    ProductionState,
    SynchronizationState,
    TelemetryPayload,
    TwinDocument,
    utc_now,
)
from repositories.twin_repository import TwinRepository


STATION_INDEX = {
    "STAMPING": 1,
    "CNC": 2,
    "WELDING": 3,
    "INSPECTION": 4,
    "PACKAGING": 5,
}


@dataclass(frozen=True)
class LiveTwinConsumeResult:
    """Result of one consumed transport event."""

    document: TwinDocument
    event_persisted: bool
    state_updated: bool
    out_of_order: bool


class LiveTwinService:
    """Reduce versioned telemetry envelopes into persistent Live Twin state.

    This class is transport-independent. MQTT consumers and the internal HTTP
    ingestion endpoint both call `consume`, which makes their behavior and
    tests identical.
    """

    def __init__(self, repository: TwinRepository) -> None:
        self._repository = repository

    def consume(
        self,
        event: EventEnvelope,
        *,
        received_at: datetime | None = None,
    ) -> LiveTwinConsumeResult:
        if event.kind != EventKind.TELEMETRY:
            raise ValueError(f"Live Twin currently consumes telemetry events, got {event.kind.value}")
        raw_received = received_at or utc_now()
        if raw_received.tzinfo is None or raw_received.utcoffset() is None:
            raise ValueError("received_at must be timezone-aware")
        received = raw_received.astimezone(timezone.utc)
        materialized_event = event.model_copy(update={"received_at": received})
        started_ns = perf_counter_ns()
        telemetry = TelemetryPayload.model_validate(materialized_event.payload)
        if telemetry.machine_id != materialized_event.machine_id:
            raise ValueError("event.machine_id must match payload.machine_id")

        existing = self._repository.get_twin(materialized_event.machine_id)
        out_of_order = bool(
            existing and materialized_event.sequence <= existing.synchronization.latest_sequence
        )
        if out_of_order:
            # Preserve current state while retaining the late event in history.
            assert existing is not None
            candidate = existing
            state_updated = False
        else:
            processing_latency_ms = (perf_counter_ns() - started_ns) / 1_000_000.0
            candidate = self._reduce_telemetry(
                existing=existing,
                event=materialized_event,
                telemetry=telemetry,
                received_at=received,
                processing_latency_ms=processing_latency_ms,
            )
            state_updated = True

        write = self._repository.save_event_and_twin(materialized_event, candidate)
        # A duplicate event was not newly persisted and therefore did not alter
        # state even if its sequence looks newer in an isolated retry.
        return LiveTwinConsumeResult(
            document=write.document,
            event_persisted=write.applied,
            state_updated=state_updated and write.applied,
            out_of_order=out_of_order,
        )

    def get_twin(self, machine_id: str) -> TwinDocument | None:
        return self._repository.get_twin(machine_id)

    def list_twins(self) -> list[TwinDocument]:
        return self._repository.list_twins()

    def telemetry_history(self, machine_id: str, *, limit: int = 100) -> list[EventEnvelope]:
        return self._repository.list_telemetry(machine_id, limit=limit)

    @staticmethod
    def _reduce_telemetry(
        *,
        existing: TwinDocument | None,
        event: EventEnvelope,
        telemetry: TelemetryPayload,
        received_at: datetime,
        processing_latency_ms: float,
    ) -> TwinDocument:
        delivery_latency_ms = max(
            0.0,
            (received_at - event.generated_at).total_seconds() * 1_000.0,
        )
        station_index = STATION_INDEX[telemetry.station.value]
        same_fault = existing and existing.faults.code == telemetry.fault_code
        inferred_severity = existing.faults.severity if same_fault and existing else None
        if inferred_severity is None and telemetry.fault_code is not None:
            if telemetry.status == MachineStatus.FAULT or telemetry.operational_state == OperationalState.FAULT:
                inferred_severity = FaultSeverity.CRITICAL
            elif telemetry.status == MachineStatus.DEGRADED:
                inferred_severity = FaultSeverity.WARNING
            elif telemetry.status == MachineStatus.WARNING:
                inferred_severity = FaultSeverity.INFO
        fault_state = FaultState(
            active=telemetry.fault_code is not None,
            code=telemetry.fault_code,
            severity=inferred_severity,
            updated_at=received_at if telemetry.fault_code is not None else None,
        )
        return TwinDocument(
            identity=IdentityState(
                machine_id=telemetry.machine_id,
                station=telemetry.station,
                station_index=station_index,
            ),
            operational=OperationalStateSnapshot(
                state=telemetry.operational_state,
                status=telemetry.status,
                updated_at=received_at,
            ),
            telemetry=telemetry,
            health=HealthState(
                score=telemetry.health_score,
                anomaly_score=telemetry.anomaly_score,
                tool_wear_percent=telemetry.tool_wear_percent,
                bearing_degradation_percent=telemetry.bearing_degradation_percent,
            ),
            production=ProductionState(
                cumulative_output=telemetry.production_count,
                latest_quality_score=telemetry.quality_score,
                latest_token_id=existing.production.latest_token_id if existing else None,
            ),
            faults=fault_state,
            desired=existing.desired if existing else DesiredState(),
            synchronization=SynchronizationState(
                latest_sequence=event.sequence,
                last_generated_at=event.generated_at,
                last_received_at=received_at,
                delivery_latency_ms=round(delivery_latency_ms, 6),
                processing_latency_ms=round(max(0.0, processing_latency_ms), 6),
                source_age_ms=round(delivery_latency_ms, 6),
            ),
            last_event_id=event.event_id,
            revision=(existing.revision + 1) if existing else 1,
            updated_at=received_at,
        )
