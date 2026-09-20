"""Compatibility adapter between the Phase 1 causal models and the legacy API.

The original MVP generated presentation-oriented values inside one mutable
``SimulatorEngine``.  This adapter keeps the dashboard's REST contract alive
while making the causal models in :mod:`simulation.causal` the sole producer of
station telemetry.  Live Twin persistence is introduced in Phase 2.
"""

from __future__ import annotations

from contextlib import suppress
from datetime import datetime, timezone
import json
import logging
import os
import threading
import time
from typing import Callable, Optional
from uuid import uuid4

try:
    import paho.mqtt.client as mqtt

    MQTT_AVAILABLE = True
except ImportError:  # pragma: no cover - availability depends on deployment image
    MQTT_AVAILABLE = False

from domain.contracts import (
    CommandName,
    CommandRequest,
    EventEnvelope,
    FaultSeverity,
    MachineStatus as DomainMachineStatus,
    TelemetryPayload,
)
from models import (
    FactorySummary,
    MachineStatus,
    MachineTelemetry,
    MachineTwinState,
    SimulationState,
    TwinComparison,
)
from simulation.causal import CausalFactory


logger = logging.getLogger(__name__)


class SimulatorEngine:
    """Runs causal station models and exposes the legacy dashboard interface.

    This class is deliberately a temporary adapter, not the final Live Twin.
    It owns a local simulation process only; Phase 2 will make MQTT consumers
    and persistent Live Twins the canonical state owner.
    """

    tick_interval_s = 1.0

    def __init__(
        self,
        *,
        seed: int | None = None,
        mqtt_enabled: bool = True,
        on_tick: Callable[[tuple[EventEnvelope, ...]], None] | None = None,
    ) -> None:
        self._lock = threading.RLock()
        self._seed = seed if seed is not None else int(os.getenv("SIMULATION_SEED", "20260919"))
        self._run_id = os.getenv("SIMULATION_RUN_ID", f"local-{uuid4()}")
        self._on_tick = on_tick
        self._factory = self._new_factory()
        self._latest: dict[str, TelemetryPayload] = {}
        self._last_published_status: dict[str, DomainMachineStatus] = {}
        self._last_published_fault: dict[str, str | None] = {}
        self._last_published_production: dict[str, int] = {}
        self.tick_count = 0
        self.running = False
        self._thread: threading.Thread | None = None
        self._mqtt_client: Optional[object] = None
        self._mqtt_connected = False
        self._last_tick_wall_time: datetime | None = None

        if MQTT_AVAILABLE and mqtt_enabled:
            self._init_mqtt()

    def _new_factory(self) -> CausalFactory:
        # Runtime starts at current UTC so UI source age is meaningful. Unit
        # tests use CausalFactory's fixed default epoch directly.
        return CausalFactory(
            run_id=self._run_id,
            seed=self._seed,
            start_at=datetime.now(timezone.utc),
        )

    # ------------------------------------------------------------------
    # MQTT transport (canonical v1 topics + read-only migration aliases)
    # ------------------------------------------------------------------

    def _init_mqtt(self) -> None:
        host = os.getenv("MQTT_HOST", "localhost")
        port = int(os.getenv("MQTT_PORT", "1883"))
        try:
            try:
                client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="digital_twin_simulator")
            except (AttributeError, TypeError):
                client = mqtt.Client(client_id="digital_twin_simulator")

            def on_connect(client, userdata, flags, reason_code, properties=None):
                success = getattr(reason_code, "value", reason_code) == 0
                self._mqtt_connected = bool(success)
                if success:
                    client.subscribe("factory/v1/+/command", qos=1)
                    client.subscribe("factory/commands/#", qos=1)  # migration alias
                    logger.info("Simulator MQTT connected to %s:%s", host, port)
                else:
                    logger.warning("Simulator MQTT connection rejected: %s", reason_code)

            def on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
                self._mqtt_connected = False

            def on_message(client, userdata, message):
                self._handle_mqtt_command(message.topic, message.payload)

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect
            client.on_message = on_message
            client.connect_async(host, port, 60)
            client.loop_start()
            self._mqtt_client = client
        except Exception as error:  # pragma: no cover - broker availability is environment-specific
            logger.warning("MQTT unavailable; running REST-only: %s", error)
            self._mqtt_client = None
            self._mqtt_connected = False

    def _handle_mqtt_command(self, topic: str, raw_payload: bytes) -> None:
        """Consume canonical commands and the three original UI commands."""

        try:
            if topic.startswith("factory/v1/") and topic.endswith("/command"):
                machine_id = topic.split("/")[2]
                payload = json.loads(raw_payload.decode("utf-8")) if raw_payload else {}
                self._apply_command(machine_id, CommandRequest.model_validate(payload))
                return

            # These aliases let the existing web UI control a migration build.
            legacy_command = topic.removeprefix("factory/commands/")
            if legacy_command == "degrade_cnc":
                self.degrade_cnc()
            elif legacy_command == "reset_cnc":
                self.reset_cnc()
            elif legacy_command == "reset_all":
                self.reset_all()
        except Exception:
            logger.exception("Ignoring invalid MQTT command on %s", topic)

    @staticmethod
    def _json(model: object) -> str:
        if hasattr(model, "model_dump_json"):
            return model.model_dump_json()  # type: ignore[no-any-return]
        return json.dumps(model)  # pragma: no cover - Pydantic is a project dependency

    def _publish(self, topic: str, payload: object, *, qos: int = 0, retain: bool = False) -> None:
        client = self._mqtt_client
        if not client or not self._mqtt_connected:
            return
        with suppress(Exception):
            client.publish(topic, self._json(payload), qos=qos, retain=retain)

    def _publish_tick(self, events: tuple[EventEnvelope, ...]) -> None:
        for event in events:
            sample = self._latest[event.machine_id]
            # Canonical, versioned event topic.
            self._publish(f"factory/v1/{event.machine_id}/telemetry", event, qos=0)
            # Legacy raw-payload topic retained temporarily for the existing UI.
            self._publish(f"factory/telemetry/{event.machine_id}", self._to_legacy(sample), qos=0)

            previous_status = self._last_published_status.get(event.machine_id)
            if previous_status != sample.status:
                self._publish(
                    f"factory/v1/{event.machine_id}/state",
                    {
                        "machine_id": event.machine_id,
                        "status": sample.status.value,
                        "operational_state": sample.operational_state.value,
                        "generated_at": sample.simulated_at.isoformat(),
                    },
                    qos=1,
                )
                self._last_published_status[event.machine_id] = sample.status

            previous_fault = self._last_published_fault.get(event.machine_id)
            if previous_fault != sample.fault_code:
                self._publish(
                    f"factory/v1/{event.machine_id}/fault",
                    {
                        "machine_id": event.machine_id,
                        "fault_code": sample.fault_code,
                        "active": sample.fault_code is not None,
                        "generated_at": sample.simulated_at.isoformat(),
                    },
                    qos=1,
                    retain=True,
                )
                self._last_published_fault[event.machine_id] = sample.fault_code

            previous_output = self._last_published_production.get(event.machine_id, 0)
            if sample.production_count > previous_output:
                self._publish(
                    f"factory/v1/{event.machine_id}/production",
                    {
                        "machine_id": event.machine_id,
                        "count": sample.production_count,
                        "quality_score": sample.quality_score,
                        "generated_at": sample.simulated_at.isoformat(),
                    },
                    qos=1,
                )
            self._last_published_production[event.machine_id] = sample.production_count

        summary = self.get_summary()
        sim_state = self.get_simulation_state()
        self._publish("factory/v1/system/summary", summary, qos=0)
        self._publish("factory/summary", summary, qos=0)
        self._publish("factory/sim/state", sim_state, qos=0)

        if self._on_tick is not None:
            with suppress(Exception):
                self._on_tick(events)

    # ------------------------------------------------------------------
    # Simulator lifecycle and commands
    # ------------------------------------------------------------------

    def start(self) -> None:
        with self._lock:
            if self.running:
                return
            self.running = True
            self._thread = threading.Thread(target=self._run_loop, name="causal-simulator", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            self.running = False

    def _run_loop(self) -> None:
        while True:
            with self._lock:
                if not self.running:
                    return
            started = time.monotonic()
            self.tick()
            remaining = self.tick_interval_s - (time.monotonic() - started)
            if remaining > 0:
                time.sleep(remaining)

    def _apply_command(self, machine_id: str, command: CommandRequest) -> None:
        with self._lock:
            self._factory.apply_command(machine_id, command)

    def inject_fault(self, machine_id: str, fault_type: str = "injected_fault", severity: str = "Warning") -> bool:
        if machine_id not in self._factory.models:
            return False
        try:
            parsed_severity = FaultSeverity(severity)
        except ValueError:
            parsed_severity = FaultSeverity.WARNING
        self._apply_command(
            machine_id,
            CommandRequest(
                command=CommandName.INJECT_FAULT,
                fault_type=fault_type,
                severity=parsed_severity,
            ),
        )
        return True

    def reset_machine(self, machine_id: str) -> bool:
        if machine_id not in self._factory.models:
            return False
        self._apply_command(machine_id, CommandRequest(command=CommandName.RESET))
        return True

    def degrade_cnc(self) -> None:
        self.inject_fault("CNC-01", "tool_wear", FaultSeverity.CRITICAL.value)

    def reset_cnc(self) -> None:
        self.reset_machine("CNC-01")

    def reset_all(self) -> None:
        with self._lock:
            self._run_id = f"local-{uuid4()}"
            self._factory = self._new_factory()
            self._latest.clear()
            self._last_published_status.clear()
            self._last_published_fault.clear()
            self._last_published_production.clear()
            self.tick_count = 0
            self._last_tick_wall_time = None

    def tick(self) -> None:
        """Advance one real, instrumentable simulation time step."""

        with self._lock:
            tick = self._factory.tick(dt_s=self.tick_interval_s)
            self.tick_count += 1
            self._latest = {sample.machine_id: sample for sample in tick.telemetry}
            self._last_tick_wall_time = datetime.now(timezone.utc)
            events = tick.events
        self._publish_tick(events)

    # ------------------------------------------------------------------
    # Legacy REST response mapping
    # ------------------------------------------------------------------

    @staticmethod
    def _legacy_status(status: DomainMachineStatus) -> MachineStatus:
        return MachineStatus(status.value)

    def _to_legacy(self, sample: TelemetryPayload) -> MachineTelemetry:
        wear = sample.tool_wear_percent
        rul_cycles = int(max(0.0, (100.0 - wear) * 12.0)) if wear is not None else None
        # The `latency_ms` field is retained for UI compatibility only. It is
        # deliberately zero until Phase 2 observes MQTT receipt timestamps.
        return MachineTelemetry(
            machine_id=sample.machine_id,
            station=sample.station.value,
            timestamp=sample.simulated_at.isoformat(),
            status=self._legacy_status(sample.status),
            temperature=sample.temperature_c,
            vibration=sample.vibration_mm_s,
            rpm=sample.actual_rpm or 0.0,
            current=sample.current_a,
            production_count=sample.production_count,
            cycle_time=sample.cycle_time_s,
            energy_kwh=sample.energy_kwh,
            health=sample.health_score,
            tool_wear=wear,
            anomaly_score=sample.anomaly_score,
            rul_cycles=rul_cycles,
            latency_ms=0.0,
        )

    def get_telemetry(self, machine_id: str) -> Optional[MachineTelemetry]:
        with self._lock:
            sample = self._latest.get(machine_id)
            return self._to_legacy(sample) if sample else None

    def get_all_telemetry(self) -> list[MachineTelemetry]:
        with self._lock:
            return [
                self._to_legacy(self._latest[machine_id])
                for machine_id in self._factory.models
                if machine_id in self._latest
            ]

    def get_summary(self) -> FactorySummary:
        with self._lock:
            samples = list(self._latest.values())
            if not samples:
                return FactorySummary(
                    oee=0.0,
                    total_output=0,
                    total_energy_kwh=0.0,
                    twin_health=0.0,
                    machines_online=0,
                    machines_total=len(self._factory.models),
                    data_freshness_ms=0.0,
                    telemetry_rate=0.0,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )

            online = sum(sample.status != DomainMachineStatus.OFFLINE for sample in samples)
            availability = online / len(samples)
            performance = sum(
                min(1.0, self._factory.models[sample.machine_id].config.cycle_time_s / sample.cycle_time_s)
                for sample in samples
            ) / len(samples)
            quality = sum(sample.quality_score for sample in samples) / len(samples)
            # Before production-token flow arrives in Phase 3, min station
            # output is a conservative line-throughput proxy—not an exact count.
            line_output = min(sample.production_count for sample in samples)
            freshness_ms = 0.0
            if self._last_tick_wall_time is not None:
                freshness_ms = max(0.0, (datetime.now(timezone.utc) - self._last_tick_wall_time).total_seconds() * 1000)
            return FactorySummary(
                oee=round(availability * performance * quality * 100.0, 2),
                total_output=line_output,
                total_energy_kwh=round(sum(sample.energy_kwh for sample in samples), 5),
                twin_health=round(sum(sample.health_score for sample in samples) / len(samples), 2),
                machines_online=online,
                machines_total=len(samples),
                data_freshness_ms=round(freshness_ms, 2),
                telemetry_rate=round(len(samples) / self.tick_interval_s, 2),
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

    def get_twin_state(self, machine_id: str) -> Optional[MachineTwinState]:
        """Temporary source-model comparison until the Phase 2 Live Twin exists.

        It returns zero mismatch rather than fabricated random divergence. The
        dashboard labels will be upgraded to show live-twin receipt metrics in
        Phase 5 once actual persistent state is present.
        """

        with self._lock:
            sample = self._latest.get(machine_id)
            if sample is None:
                return None
            values = [
                ("Temperature", sample.temperature_c, "°C"),
                ("Vibration", sample.vibration_mm_s, "mm/s"),
                ("RPM", sample.actual_rpm or 0.0, "RPM"),
                ("Current", sample.current_a, "A"),
            ]
            comparisons = [
                TwinComparison(signal=name, physical=value, twin=value, error=0.0, unit=unit)
                for name, value, unit in values
            ]
            freshness_ms = 0.0
            if self._last_tick_wall_time is not None:
                freshness_ms = max(0.0, (datetime.now(timezone.utc) - self._last_tick_wall_time).total_seconds() * 1000)
            return MachineTwinState(
                machine_id=machine_id,
                comparisons=comparisons,
                sync_percent=100.0,
                data_freshness_ms=round(freshness_ms, 2),
                telemetry_rate=round(1.0 / self.tick_interval_s, 2),
            )

    def get_simulation_state(self) -> SimulationState:
        with self._lock:
            cnc = self._factory.models["CNC-01"]
            return SimulationState(
                running=self.running,
                tick=self.tick_count,
                cnc_degrading=cnc.fault_active,
                scenario="CNC_DEGRADATION" if cnc.fault_active else "NORMAL",
            )
