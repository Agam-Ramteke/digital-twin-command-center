"""Process-level Digital Twin service composing independent station twins.

Implements Sections 4.2, 4.4, and 9 of the research report:
- DAG-based process topology with frozen-snapshot semantics.
- Lightweight production token flow with station lineage and carried flags.
- Line-level computations: bottleneck attribution and upstream defect tracing.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import math
from threading import RLock
from typing import Literal
from uuid import uuid4

from domain.contracts import (
    BottleneckReport,
    DAGEdge,
    DAGNode,
    DefectAttributionReport,
    FrozenLineSnapshot,
    MachineStatus,
    ProcessMetrics,
    ProcessTopology,
    ProcessTwinView,
    ProductionToken,
    StationBottleneckDetail,
    StationDefectAttribution,
    StationType,
    TwinDocument,
    utc_now,
)
from services.live_twin import LiveTwinService


CANONICAL_TOPOLOGY_ORDER: tuple[str, ...] = (
    "STAMPING-01",
    "CNC-01",
    "WELDING-01",
    "INSPECTION-01",
    "PACKAGING-01",
)

CANONICAL_NODES: tuple[DAGNode, ...] = (
    DAGNode(
        machine_id="STAMPING-01",
        station=StationType.STAMPING,
        station_index=1,
        nominal_cycle_time_s=8.5,
        upstream_machine_ids=[],
        downstream_machine_ids=["CNC-01"],
    ),
    DAGNode(
        machine_id="CNC-01",
        station=StationType.CNC,
        station_index=2,
        nominal_cycle_time_s=42.0,
        upstream_machine_ids=["STAMPING-01"],
        downstream_machine_ids=["WELDING-01"],
    ),
    DAGNode(
        machine_id="WELDING-01",
        station=StationType.WELDING,
        station_index=3,
        nominal_cycle_time_s=15.0,
        upstream_machine_ids=["CNC-01"],
        downstream_machine_ids=["INSPECTION-01"],
    ),
    DAGNode(
        machine_id="INSPECTION-01",
        station=StationType.INSPECTION,
        station_index=4,
        nominal_cycle_time_s=6.0,
        upstream_machine_ids=["WELDING-01"],
        downstream_machine_ids=["PACKAGING-01"],
    ),
    DAGNode(
        machine_id="PACKAGING-01",
        station=StationType.PACKAGING,
        station_index=5,
        nominal_cycle_time_s=10.0,
        upstream_machine_ids=["INSPECTION-01"],
        downstream_machine_ids=[],
    ),
)

CANONICAL_EDGES: tuple[DAGEdge, ...] = (
    DAGEdge(from_machine_id="STAMPING-01", to_machine_id="CNC-01", transition_type="material_flow"),
    DAGEdge(from_machine_id="CNC-01", to_machine_id="WELDING-01", transition_type="material_flow"),
    DAGEdge(from_machine_id="WELDING-01", to_machine_id="INSPECTION-01", transition_type="material_flow"),
    DAGEdge(from_machine_id="INSPECTION-01", to_machine_id="PACKAGING-01", transition_type="material_flow"),
)


class ProcessTwinService:
    """Manages the DAG topology, frozen snapshot capture, tokens, and line analytics."""

    def __init__(self, live_twin_service: LiveTwinService, *, max_token_history: int = 1000) -> None:
        self._live_twin_service = live_twin_service
        self._lock = RLock()
        self._topology = ProcessTopology(
            version="five-station-v1",
            nodes=list(CANONICAL_NODES),
            edges=list(CANONICAL_EDGES),
            order=list(CANONICAL_TOPOLOGY_ORDER),
        )
        self._max_token_history = max_token_history
        self._tokens: deque[ProductionToken] = deque(maxlen=max_token_history)
        self._tokens_by_id: dict[str, ProductionToken] = {}
        self._dispatched_count = 0
        self._scrapped_count = 0
        # Token emission rate control (Bug 7): only emit a token when enough
        # simulated time has elapsed to match the physical bottleneck rate.
        self._cycle_accumulator: float = 0.0
        self._bottleneck_cycle_time_s: float = 42.0  # CNC-01 is the default bottleneck

    @property
    def topology(self) -> ProcessTopology:
        return self._topology

    # ------------------------------------------------------------------
    # Frozen Snapshot Semantics (§4.2)
    # ------------------------------------------------------------------

    def accumulate_time(self, dt_s: float) -> ProductionToken | None:
        """Accumulate simulation time and emit a token when enough has passed.

        The emission rate is governed by the physical line bottleneck cycle time
        (default 42.0s for CNC-01).  This prevents emitting 42x too many tokens
        when called once per simulation tick (1s).
        """
        self._cycle_accumulator += dt_s
        if self._cycle_accumulator >= self._bottleneck_cycle_time_s:
            self._cycle_accumulator -= self._bottleneck_cycle_time_s
            return self.emit_token_through_pipeline()
        return None

    def capture_snapshot(self) -> FrozenLineSnapshot:
        """Capture an atomic, immutable snapshot of all 5 station Live Twins.

        Reading all station twins at one instant avoids distributed-snapshot
        inconsistency where different stations are observed at different times.
        """
        twins = self._live_twin_service.list_twins()
        if not twins:
            raise ValueError("Cannot capture FrozenLineSnapshot: no Live Twins exist in repository")

        # Guarantee ordering by station_index
        ordered_twins = sorted(twins, key=lambda t: t.identity.station_index)

        return FrozenLineSnapshot(
            snapshot_id=str(uuid4()),
            captured_at=utc_now(),
            topology_version=self._topology.version,
            twins=ordered_twins,
        )

    # ------------------------------------------------------------------
    # Production Token Abstraction & Material Flow (§9.1)
    # ------------------------------------------------------------------

    def emit_token_through_pipeline(
        self,
        *,
        token_id: str | None = None,
        part_type: str = "automotive_component",
        twins_map: dict[str, TwinDocument] | None = None,
        emitted_at: datetime | None = None,
    ) -> ProductionToken:
        """Simulate the progression of one discrete part along the 5-station DAG.

        Accumulates quality scores and flags at each station, determines
        inspection pass/fail, and finalizes at packaging dispatch or scrap.
        """
        now = emitted_at or utc_now()
        tid = token_id or f"tok-{uuid4().hex[:12]}"

        # If twins_map is not passed, use current Live Twin state
        if twins_map is None:
            twins = self._live_twin_service.list_twins()
            twins_map = {t.identity.machine_id: t for t in twins}

        stamping = twins_map.get("STAMPING-01")
        cnc = twins_map.get("CNC-01")
        welding = twins_map.get("WELDING-01")
        inspection = twins_map.get("INSPECTION-01")
        packaging = twins_map.get("PACKAGING-01")

        lineage: list[str] = []
        carried_flags: dict[str, float | bool | str] = {}

        # 1. Stamping Press
        lineage.append("STAMPING-01")
        stamping_q = stamping.telemetry.quality_score if stamping else 0.99
        carried_flags["stamping_quality"] = round(stamping_q, 4)
        if stamping and stamping.telemetry.force_kn is not None:
            carried_flags["stamping_force_kn"] = round(stamping.telemetry.force_kn, 2)

        # 2. CNC Machining Center
        lineage.append("CNC-01")
        cnc_q = cnc.telemetry.quality_score if cnc else 0.98
        carried_flags["machining_quality"] = round(cnc_q, 4)
        if cnc and cnc.telemetry.tool_wear_percent is not None:
            carried_flags["cnc_tool_wear_percent"] = round(cnc.telemetry.tool_wear_percent, 2)
        if cnc and cnc.telemetry.bearing_degradation_percent is not None:
            carried_flags["cnc_bearing_wear_percent"] = round(cnc.telemetry.bearing_degradation_percent, 2)

        # 3. Welding/Assembly Station
        lineage.append("WELDING-01")
        weld_q = welding.telemetry.quality_score if welding else 0.99
        carried_flags["weld_quality"] = round(weld_q, 4)
        if welding and welding.telemetry.voltage_v is not None:
            carried_flags["welding_voltage_v"] = round(welding.telemetry.voltage_v, 2)

        # 4. Quality Inspection Station
        lineage.append("INSPECTION-01")
        # Defect probability from upstream quality: f(machining_quality, weld_quality, stamping_quality)
        # Bounded causal function per §8.4
        defect_prob = (
            0.005  # Base defect rate (<1% Bosch benchmark)
            + 0.55 * max(0.0, 0.95 - cnc_q) ** 1.5
            + 0.35 * max(0.0, 0.95 - weld_q) ** 1.5
            + 0.10 * max(0.0, 0.95 - stamping_q) ** 1.5
        )
        defect_prob = max(0.0, min(1.0, defect_prob))
        carried_flags["defect_probability"] = round(defect_prob, 5)

        # Inspection verdict: if inspection twin reports fault/low quality or defect_prob > 0.15
        is_defective = defect_prob >= 0.15 or (inspection and inspection.telemetry.quality_score < 0.85)
        quality_status: Literal["pending", "pass", "fail"] = "fail" if is_defective else "pass"
        carried_flags["inspection_verdict"] = "REJECTED" if is_defective else "ACCEPTED"

        # 5. Packaging/Dispatch Station
        if not is_defective:
            lineage.append("PACKAGING-01")
            carried_flags["disposition"] = "DISPATCHED"
            carried_flags["dispatched"] = True
        else:
            carried_flags["disposition"] = "SCRAPPED"
            carried_flags["dispatched"] = False

        token = ProductionToken(
            token_id=tid,
            part_type=part_type,
            quality=quality_status,
            source_station=StationType.STAMPING,
            emitted_at=now,
            carried_flags=carried_flags,
            lineage=lineage,
        )

        with self._lock:
            # Evict oldest token from dict if deque is at capacity (Bug 3 fix)
            if len(self._tokens) == self._max_token_history:
                evicted = self._tokens[0]  # Oldest item about to be pushed off
                self._tokens_by_id.pop(evicted.token_id, None)
            self._tokens.append(token)
            self._tokens_by_id[token.token_id] = token
            if is_defective:
                self._scrapped_count += 1
            else:
                self._dispatched_count += 1

        return token

    def list_tokens(
        self,
        *,
        limit: int = 50,
        quality: str | None = None,
        station: str | None = None,
    ) -> list[ProductionToken]:
        """Return newest-first production tokens matching optional filters."""
        if limit < 1 or limit > 10_000:
            raise ValueError("limit must be between 1 and 10000")

        with self._lock:
            results: list[ProductionToken] = []
            for token in reversed(self._tokens):
                if quality and token.quality != quality.lower():
                    continue
                if station and station.upper() not in token.lineage:
                    continue
                results.append(token)
                if len(results) >= limit:
                    break
            return results

    def get_token(self, token_id: str) -> ProductionToken | None:
        with self._lock:
            return self._tokens_by_id.get(token_id)

    # ------------------------------------------------------------------
    # Bottleneck Attribution (§9.2)
    # ------------------------------------------------------------------

    def analyze_bottleneck(self, snapshot: FrozenLineSnapshot | None = None) -> BottleneckReport:
        """Compute the binding line bottleneck by comparing effective station cycle times.

        Answers: Which station is currently the binding constraint on line throughput?
        Accounts for nominal cycle time and operational state (e.g. running, degraded, faulted).
        """
        active_snapshot = snapshot or self.capture_snapshot()

        station_details: list[StationBottleneckDetail] = []
        max_effective_time = 0.0
        binding_twin: TwinDocument | None = None

        for twin in active_snapshot.twins:
            nominal = next(
                (node.nominal_cycle_time_s for node in self._topology.nodes if node.machine_id == twin.identity.machine_id),
                twin.telemetry.cycle_time_s,
            )
            reported_time = twin.telemetry.cycle_time_s or nominal

            # Operational penalty factor
            status = twin.operational.status
            if status == MachineStatus.RUNNING:
                factor = 1.0
            elif status == MachineStatus.WARNING:
                factor = 1.15
            elif status == MachineStatus.DEGRADED:
                factor = 1.35
            elif status in (MachineStatus.FAULT, MachineStatus.OFFLINE):
                factor = 10.0  # Line halted or severely obstructed
            elif status == MachineStatus.MAINTENANCE:
                factor = 5.0
            else:  # IDLE
                factor = 1.2

            effective_time = round(reported_time * factor, 2)
            if effective_time > max_effective_time:
                max_effective_time = effective_time
                binding_twin = twin

            station_details.append(
                StationBottleneckDetail(
                    machine_id=twin.identity.machine_id,
                    station=twin.identity.station,
                    cycle_time_s=round(reported_time, 2),
                    effective_cycle_time_s=effective_time,
                    slack_time_s=0.0,  # Computed below once max is known
                    is_bottleneck=False,
                    status=status,
                )
            )

        if binding_twin is None and active_snapshot.twins:
            binding_twin = active_snapshot.twins[0]
            max_effective_time = binding_twin.telemetry.cycle_time_s

        # Compute slacks relative to binding bottleneck
        updated_details: list[StationBottleneckDetail] = []
        for detail in station_details:
            slack = round(max(0.0, max_effective_time - detail.effective_cycle_time_s), 2)
            is_bt = (detail.machine_id == (binding_twin.identity.machine_id if binding_twin else ""))
            updated_details.append(
                detail.model_copy(update={"slack_time_s": slack, "is_bottleneck": is_bt})
            )

        hourly_capacity = round(3600.0 / max_effective_time, 2) if max_effective_time > 0 else 0.0

        return BottleneckReport(
            binding_machine_id=binding_twin.identity.machine_id if binding_twin else "UNKNOWN",
            binding_station=binding_twin.identity.station if binding_twin else StationType.CNC,
            binding_cycle_time_s=max_effective_time,
            max_line_capacity_per_hour=hourly_capacity,
            stations=updated_details,
            captured_at=active_snapshot.captured_at,
        )

    # ------------------------------------------------------------------
    # Propagated Defect Tracing (§9.2)
    # ------------------------------------------------------------------

    def trace_defects(self, *, limit: int = 100) -> DefectAttributionReport:
        """Trace inspection defect occurrences back to upstream station degradations.

        Answers: Given defective tokens, which upstream machine contributed most
        to the failure (CNC machining quality degradation vs Weld quality drift vs Stamping)?
        """
        tokens = self.list_tokens(limit=limit)
        total_count = len(tokens)
        defective_tokens = [t for t in tokens if t.quality == "fail"]
        defective_count = len(defective_tokens)

        evaluated_at = utc_now()

        if defective_count == 0:
            return DefectAttributionReport(
                total_tokens_evaluated=total_count,
                defective_tokens_count=0,
                defect_rate_percent=0.0,
                primary_root_cause_station=None,
                primary_root_cause_machine_id=None,
                attributions=[
                    StationDefectAttribution(
                        machine_id="CNC-01",
                        station=StationType.CNC,
                        attribution_percent=0.0,
                        sample_count=0,
                        average_quality_score=1.0,
                        reason="No defects detected in recent token window.",
                    ),
                    StationDefectAttribution(
                        machine_id="WELDING-01",
                        station=StationType.WELDING,
                        attribution_percent=0.0,
                        sample_count=0,
                        average_quality_score=1.0,
                        reason="No defects detected in recent token window.",
                    ),
                    StationDefectAttribution(
                        machine_id="STAMPING-01",
                        station=StationType.STAMPING,
                        attribution_percent=0.0,
                        sample_count=0,
                        average_quality_score=1.0,
                        reason="No defects detected in recent token window.",
                    ),
                ],
                summary_analysis="Production line operating nominally. Zero defect events in current evaluation window.",
                evaluated_at=evaluated_at,
            )

        # Tally upstream degradation penalties across defective tokens
        cnc_penalty_sum = 0.0
        weld_penalty_sum = 0.0
        stamping_penalty_sum = 0.0

        cnc_scores: list[float] = []
        weld_scores: list[float] = []
        stamping_scores: list[float] = []

        for token in defective_tokens:
            flags = token.carried_flags
            cq = float(flags.get("machining_quality", 0.98))
            wq = float(flags.get("weld_quality", 0.99))
            sq = float(flags.get("stamping_quality", 0.99))

            cnc_scores.append(cq)
            weld_scores.append(wq)
            stamping_scores.append(sq)

            # Penalize deviation from nominal (0.98+)
            cnc_penalty_sum += max(0.0, 0.98 - cq)
            weld_penalty_sum += max(0.0, 0.98 - wq)
            stamping_penalty_sum += max(0.0, 0.98 - sq)

        total_penalty = cnc_penalty_sum + weld_penalty_sum + stamping_penalty_sum
        if total_penalty <= 1e-6:
            # Random unmodeled residual defects
            cnc_attr = 50.0
            weld_attr = 35.0
            stamping_attr = 15.0
        else:
            cnc_attr = round((cnc_penalty_sum / total_penalty) * 100.0, 1)
            weld_attr = round((weld_penalty_sum / total_penalty) * 100.0, 1)
            stamping_attr = round((stamping_penalty_sum / total_penalty) * 100.0, 1)

        attributions: list[StationDefectAttribution] = [
            StationDefectAttribution(
                machine_id="CNC-01",
                station=StationType.CNC,
                attribution_percent=cnc_attr,
                sample_count=defective_count,
                average_quality_score=round(sum(cnc_scores) / len(cnc_scores), 4) if cnc_scores else 1.0,
                reason=f"Machining out-of-tolerance / tool wear degradation (avg quality: {round(sum(cnc_scores)/len(cnc_scores), 2) if cnc_scores else 1.0})",
            ),
            StationDefectAttribution(
                machine_id="WELDING-01",
                station=StationType.WELDING,
                attribution_percent=weld_attr,
                sample_count=defective_count,
                average_quality_score=round(sum(weld_scores) / len(weld_scores), 4) if weld_scores else 1.0,
                reason=f"Welding electrode wear / voltage drift (avg quality: {round(sum(weld_scores)/len(weld_scores), 2) if weld_scores else 1.0})",
            ),
            StationDefectAttribution(
                machine_id="STAMPING-01",
                station=StationType.STAMPING,
                attribution_percent=stamping_attr,
                sample_count=defective_count,
                average_quality_score=round(sum(stamping_scores) / len(stamping_scores), 4) if stamping_scores else 1.0,
                reason=f"Stamping press force variance (avg quality: {round(sum(stamping_scores)/len(stamping_scores), 2) if stamping_scores else 1.0})",
            ),
        ]

        # Rank by attribution percentage
        attributions.sort(key=lambda a: a.attribution_percent, reverse=True)
        primary = attributions[0]
        defect_rate = round((defective_count / total_count) * 100.0, 2) if total_count > 0 else 0.0

        summary = (
            f"Inspection rejected {defective_count} of {total_count} parts ({defect_rate}% defect rate). "
            f"Primary root cause traced to {primary.machine_id} ({primary.station.value}) contributing "
            f"{primary.attribution_percent}% of quality degradation."
        )

        return DefectAttributionReport(
            total_tokens_evaluated=total_count,
            defective_tokens_count=defective_count,
            defect_rate_percent=defect_rate,
            primary_root_cause_station=primary.station,
            primary_root_cause_machine_id=primary.machine_id,
            attributions=attributions,
            summary_analysis=summary,
            evaluated_at=evaluated_at,
        )

    # ------------------------------------------------------------------
    # Full Process Twin View (§9.2)
    # ------------------------------------------------------------------

    def get_process_view(self) -> ProcessTwinView:
        """Compose an atomic FrozenLineSnapshot with line-level ProcessMetrics."""
        snapshot = self.capture_snapshot()
        bottleneck = self.analyze_bottleneck(snapshot)

        total_stations = len(snapshot.twins)
        available_stations = sum(
            1 for twin in snapshot.twins
            if twin.operational.status not in (MachineStatus.FAULT, MachineStatus.OFFLINE)
        )

        # Expected overall line quality: product of station quality scores
        quality_product = 1.0
        max_source_age_ms = 0.0
        for twin in snapshot.twins:
            quality_product *= twin.telemetry.quality_score
            age = twin.synchronization.source_age_ms or 0.0
            if age > max_source_age_ms:
                max_source_age_ms = age

        notes = [
            f"Line bottleneck is {bottleneck.binding_machine_id} ({bottleneck.binding_station.value}) with effective cycle time {bottleneck.binding_cycle_time_s}s.",
            f"Theoretical max line throughput: {bottleneck.max_line_capacity_per_hour} parts/hour.",
            f"Station availability: {available_stations}/{total_stations} stations operational.",
        ]

        metrics = ProcessMetrics(
            bottleneck_machine_id=bottleneck.binding_machine_id,
            bottleneck_station=bottleneck.binding_station,
            bottleneck_cycle_time_s=bottleneck.binding_cycle_time_s,
            line_capacity_per_hour=bottleneck.max_line_capacity_per_hour,
            expected_line_quality=round(quality_product, 4),
            available_stations=available_stations,
            total_stations=total_stations,
            snapshot_max_source_age_ms=round(max_source_age_ms, 2) if max_source_age_ms > 0 else None,
            notes=notes,
        )

        return ProcessTwinView(snapshot=snapshot, metrics=metrics)
