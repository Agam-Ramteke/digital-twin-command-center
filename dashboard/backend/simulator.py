"""
Machine Simulator — Correlated telemetry generation for 5 manufacturing stations.

The simulator runs a tick-based loop (1s interval) and maintains internal state
for each machine.  Values are correlated: load drives current, current drives
temperature, wear drives vibration, vibration penalises health, etc.

CNC-01 has a special degradation scenario that can be triggered externally.
"""

from __future__ import annotations

import json
import math
import random
import time
import threading
from datetime import datetime, timezone
from typing import Dict, Optional

try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False

from models import (
    MachineTelemetry,
    MachineStatus,
    StationType,
    FactorySummary,
    MachineTwinState,
    TwinComparison,
    SimulationState,
)


# ---------------------------------------------------------------------------
# Machine configuration baselines
# ---------------------------------------------------------------------------

MACHINE_CONFIGS = {
    "STAMPING-01": {
        "station": StationType.STAMPING,
        "temp_base": 55.0,
        "vib_base": 2.0,
        "rpm_base": 1200,
        "current_base": 12.0,
        "cycle_time_base": 8.5,
        "energy_base": 18.0,
    },
    "CNC-01": {
        "station": StationType.CNC,
        "temp_base": 65.0,
        "vib_base": 3.2,
        "rpm_base": 3400,
        "current_base": 8.0,
        "cycle_time_base": 42.0,
        "energy_base": 24.0,
    },
    "WELDING-01": {
        "station": StationType.WELDING,
        "temp_base": 80.0,
        "vib_base": 1.8,
        "rpm_base": 0,
        "current_base": 45.0,
        "cycle_time_base": 15.0,
        "energy_base": 35.0,
    },
    "INSPECTION-01": {
        "station": StationType.INSPECTION,
        "temp_base": 28.0,
        "vib_base": 0.4,
        "rpm_base": 0,
        "current_base": 2.5,
        "cycle_time_base": 6.0,
        "energy_base": 5.0,
    },
    "PACKAGING-01": {
        "station": StationType.PACKAGING,
        "temp_base": 32.0,
        "vib_base": 1.2,
        "rpm_base": 800,
        "current_base": 4.0,
        "cycle_time_base": 10.0,
        "energy_base": 8.0,
    },
}


class MachineState:
    """Internal mutable state for a single machine."""

    def __init__(self, machine_id: str, config: dict):
        self.machine_id = machine_id
        self.config = config
        self.station: StationType = config["station"]

        # Telemetry values (start at baseline)
        self.temperature: float = config["temp_base"]
        self.vibration: float = config["vib_base"]
        self.rpm: float = config["rpm_base"]
        self.current: float = config["current_base"]
        self.cycle_time: float = config["cycle_time_base"]
        self.energy_kwh: float = config["energy_base"]

        # Derived / cumulative
        self.production_count: int = 0
        self.health: float = 97.0 + random.uniform(-2, 2)
        self.tool_wear: float = 15.0 if self.station == StationType.CNC else 0.0
        self.anomaly_score: float = 0.05
        self.rul_cycles: int = 900 if self.station == StationType.CNC else 0
        self.status: MachineStatus = MachineStatus.RUNNING

        # Internal state
        self.load_factor: float = 0.5 + random.uniform(-0.1, 0.1)
        self.fault_active: bool = False
        self.fault_type: str = "nominal"
        self.fault_severity: str = "Warning"
        self.fault_ticks: int = 0
        self.degradation_active: bool = False
        self.degradation_ticks: int = 0
        self.cumulative_cycles: int = 0

    def reset(self):
        """Reset to healthy baseline (used after maintenance)."""
        cfg = self.config
        self.temperature = cfg["temp_base"]
        self.vibration = cfg["vib_base"]
        self.rpm = cfg["rpm_base"]
        self.current = cfg["current_base"]
        self.cycle_time = cfg["cycle_time_base"]
        self.energy_kwh = cfg["energy_base"]
        self.health = 96.0 + random.uniform(-1, 2)
        if self.station == StationType.CNC:
            self.tool_wear = 15.0
            self.rul_cycles = 900
        self.anomaly_score = 0.05
        self.status = MachineStatus.RUNNING
        self.load_factor = 0.5
        self.fault_active = False
        self.fault_type = "nominal"
        self.fault_severity = "Warning"
        self.fault_ticks = 0
        self.degradation_active = False
        self.degradation_ticks = 0


class SimulatorEngine:
    """
    Manages all 5 machines.  Call `tick()` every second to advance simulation.
    Thread-safe — the FastAPI server reads state while the simulator writes it.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.machines: Dict[str, MachineState] = {}
        self.tick_count: int = 0
        self.running: bool = False
        self._thread: Optional[threading.Thread] = None
        self.cnc_degrading: bool = False
        self._mqtt_client: Optional[object] = None
        self._mqtt_connected: bool = False

        for mid, cfg in MACHINE_CONFIGS.items():
            self.machines[mid] = MachineState(mid, cfg)

        if MQTT_AVAILABLE:
            self._init_mqtt()

    def _init_mqtt(self):
        try:
            try:
                self._mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="digital_twin_simulator")
            except Exception:
                self._mqtt_client = mqtt.Client(client_id="digital_twin_simulator")

            def on_connect(client, userdata, flags, rc, properties=None):
                if rc == 0:
                    self._mqtt_connected = True
                    print("[MQTT] Simulator connected to broker on port 1883")
                    client.subscribe("factory/commands/#")
                else:
                    self._mqtt_connected = False

            def on_disconnect(client, userdata, rc, properties=None):
                self._mqtt_connected = False

            def on_message(client, userdata, msg):
                try:
                    topic = msg.topic
                    if topic == "factory/commands/degrade_cnc":
                        self.degrade_cnc()
                    elif topic == "factory/commands/reset_cnc":
                        self.reset_cnc()
                    elif topic == "factory/commands/reset_all":
                        self.reset_all()
                except Exception as e:
                    print(f"[MQTT] Error processing command: {e}")

            self._mqtt_client.on_connect = on_connect
            self._mqtt_client.on_disconnect = on_disconnect
            self._mqtt_client.on_message = on_message
            self._mqtt_client.connect_async("localhost", 1883, 60)
            self._mqtt_client.loop_start()
        except Exception as e:
            print(f"[MQTT] Optional MQTT broker not available ({e}). Running in standalone REST mode.")

    # ------------------------------------------------------------------
    # Public control API
    # ------------------------------------------------------------------

    def start(self):
        """Start the background simulation loop."""
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False

    def inject_fault(self, machine_id: str, fault_type: str = "default", severity: str = "Warning") -> bool:
        """Trigger fault scenario on a specific machine."""
        with self._lock:
            m = self.machines.get(machine_id)
            if not m:
                return False
            m.fault_active = True
            m.fault_type = fault_type
            m.fault_severity = severity
            m.fault_ticks = 0
            if machine_id == "CNC-01":
                m.degradation_active = True
                m.degradation_ticks = 0
                self.cnc_degrading = True
            return True

    def reset_machine(self, machine_id: str) -> bool:
        """Reset a specific machine to healthy state (simulates maintenance)."""
        with self._lock:
            m = self.machines.get(machine_id)
            if not m:
                return False
            m.reset()
            if machine_id == "CNC-01":
                self.cnc_degrading = False
            return True

    def degrade_cnc(self):
        """Trigger CNC-01 degradation scenario."""
        self.inject_fault("CNC-01", "tool_wear", "Critical")

    def reset_cnc(self):
        """Simulate maintenance — reset CNC-01 to healthy state."""
        self.reset_machine("CNC-01")

    def reset_all(self):
        """Reset entire simulation."""
        with self._lock:
            self.tick_count = 0
            self.cnc_degrading = False
            for m in self.machines.values():
                m.reset()
                m.production_count = 0
                m.cumulative_cycles = 0

    # ------------------------------------------------------------------
    # Data access (thread-safe reads)
    # ------------------------------------------------------------------

    def get_telemetry(self, machine_id: str) -> Optional[MachineTelemetry]:
        with self._lock:
            m = self.machines.get(machine_id)
            if not m:
                return None
            return self._to_telemetry(m)

    def get_all_telemetry(self) -> list[MachineTelemetry]:
        with self._lock:
            return [self._to_telemetry(m) for m in self.machines.values()]

    def get_summary(self) -> FactorySummary:
        with self._lock:
            machines = list(self.machines.values())
            total_output = sum(m.production_count for m in machines)
            total_energy = sum(m.energy_kwh for m in machines)
            avg_health = sum(m.health for m in machines) / len(machines)
            online = sum(1 for m in machines if m.status != MachineStatus.OFFLINE)

            # OEE approximation: availability × performance × quality
            availability = online / len(machines)
            # Performance: ratio of actual cycle time to ideal
            perf_scores = []
            for m in machines:
                ideal = m.config["cycle_time_base"]
                actual = max(m.cycle_time, ideal * 0.5)
                perf_scores.append(min(ideal / actual, 1.0))
            performance = sum(perf_scores) / len(perf_scores)
            quality = 0.985 - (0.002 * max(0, 50 - avg_health))  # slight degradation at low health
            oee = round(availability * performance * quality * 100, 1)

            return FactorySummary(
                oee=oee,
                total_output=total_output,
                total_energy_kwh=round(total_energy, 1),
                twin_health=round(avg_health * 0.98, 1),  # twin slightly lags
                machines_online=online,
                machines_total=len(machines),
                data_freshness_ms=round(random.uniform(30, 80), 1),
                telemetry_rate=round(len(machines) * (1 + random.uniform(-0.1, 0.1)), 1),
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

    def get_twin_state(self, machine_id: str) -> Optional[MachineTwinState]:
        with self._lock:
            m = self.machines.get(machine_id)
            if not m:
                return None
            # Simulate small twin-vs-physical divergence
            def _twin_val(physical: float, noise_pct: float = 0.01) -> float:
                return round(physical * (1 + random.uniform(-noise_pct, noise_pct * 0.3)), 2)

            comparisons = [
                TwinComparison(signal="Temperature", physical=round(m.temperature, 1),
                               twin=_twin_val(m.temperature), error=round(abs(m.temperature * random.uniform(0, 0.01)), 2), unit="°C"),
                TwinComparison(signal="Vibration", physical=round(m.vibration, 1),
                               twin=_twin_val(m.vibration, 0.02), error=round(abs(m.vibration * random.uniform(0, 0.02)), 2), unit="mm/s"),
                TwinComparison(signal="RPM", physical=round(m.rpm, 0),
                               twin=round(_twin_val(m.rpm, 0.005)), error=round(abs(m.rpm * random.uniform(0, 0.005)), 1), unit="RPM"),
                TwinComparison(signal="Current", physical=round(m.current, 1),
                               twin=_twin_val(m.current), error=round(abs(m.current * random.uniform(0, 0.01)), 2), unit="A"),
            ]
            sync = 100 - sum(c.error for c in comparisons) * 0.1
            return MachineTwinState(
                machine_id=machine_id,
                comparisons=comparisons,
                sync_percent=round(max(sync, 90), 1),
                data_freshness_ms=round(random.uniform(30, 80), 1),
                telemetry_rate=round(1 + random.uniform(-0.1, 0.1), 1),
            )

    def get_simulation_state(self) -> SimulationState:
        return SimulationState(
            running=self.running,
            tick=self.tick_count,
            cnc_degrading=self.cnc_degrading,
            scenario="CNC_DEGRADATION" if self.cnc_degrading else "NORMAL",
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run_loop(self):
        while self.running:
            self.tick()
            time.sleep(1.0)

    def tick(self):
        """Advance simulation by one step."""
        with self._lock:
            self.tick_count += 1
            for m in self.machines.values():
                self._update_machine(m)

            # Publish to MQTT if broker is active
            if self._mqtt_client and self._mqtt_connected:
                try:
                    for m in self.machines.values():
                        telem = self._to_telemetry(m)
                        payload = telem.model_dump_json() if hasattr(telem, "model_dump_json") else json.dumps(telem.dict())
                        self._mqtt_client.publish(f"factory/telemetry/{m.machine_id}", payload, qos=0)

                    summary = self.get_summary()
                    sum_payload = summary.model_dump_json() if hasattr(summary, "model_dump_json") else json.dumps(summary.dict())
                    self._mqtt_client.publish("factory/summary", sum_payload, qos=0)

                    sim_state = self.get_simulation_state()
                    sim_payload = sim_state.model_dump_json() if hasattr(sim_state, "model_dump_json") else json.dumps(sim_state.dict())
                    self._mqtt_client.publish("factory/sim/state", sim_payload, qos=0)
                except Exception:
                    pass

    def _update_machine(self, m: MachineState):
        cfg = m.config
        noise = lambda scale=1.0: random.gauss(0, scale)

        # Load oscillates naturally
        m.load_factor += noise(0.02)
        m.load_factor = max(0.3, min(0.9, m.load_factor))

        # Fault ramp calculation
        fault_mult = 1.0 if m.fault_severity == "Critical" else 0.65
        if m.fault_active:
            m.fault_ticks += 1
            fault_factor = min(m.fault_ticks / 40.0, 1.0) * fault_mult
        elif m.degradation_active and m.station == StationType.CNC:
            m.degradation_ticks += 1
            fault_factor = min(m.degradation_ticks / 60.0, 1.0)
        else:
            fault_factor = 0.0

        # --- Station-Specific Correlated Telemetry ---

        if m.station == StationType.STAMPING:
            # Hydraulic press physics
            load_current = cfg["current_base"] * (0.7 + 0.6 * m.load_factor) + (fault_factor * 5.2)
            m.current = round(load_current + noise(0.2), 1)
            temp_calc = cfg["temp_base"] + (m.load_factor - 0.5) * 6 + (fault_factor * 16.0) + (m.current - cfg["current_base"]) * 0.4
            m.temperature = round(temp_calc + noise(0.3), 1)
            m.vibration = round(max(0.1, cfg["vib_base"] + (m.load_factor - 0.5) * 0.4 + (fault_factor * 2.1) + noise(0.12)), 1)
            m.rpm = round(max(500, cfg["rpm_base"] * (1 - fault_factor * 0.1) + noise(10)))
            m.cycle_time = round(cfg["cycle_time_base"] * (1 + fault_factor * 0.35) + noise(0.2), 1)
            m.health = round(max(15.0, min(100.0, 100.0 - fault_factor * 45 - max(0, m.vibration - cfg["vib_base"]) * 3.5 - noise(0.2))), 1)
            m.anomaly_score = round(min(1.0, max(0.02, 0.04 + fault_factor * 0.82 + noise(0.01))), 3)

        elif m.station == StationType.CNC:
            # 5-axis milling physics
            m.tool_wear = min(100.0, 15.0 + fault_factor * 72.0)
            load_current = cfg["current_base"] * (0.7 + 0.6 * m.load_factor) * (1 + fault_factor * 0.35)
            m.current = round(load_current + noise(0.2), 1)
            temp_calc = cfg["temp_base"] + (m.load_factor - 0.5) * 8 + (m.current - cfg["current_base"]) * 0.5 + (fault_factor * 14.0)
            m.temperature = round(temp_calc + noise(0.3), 1)
            wear_vib = (m.tool_wear / 100.0) * 4.8
            m.vibration = round(max(0.1, cfg["vib_base"] + wear_vib + noise(0.15)), 1)
            m.rpm = round(max(1000, cfg["rpm_base"] * (1 - fault_factor * 0.06) + noise(15)))
            m.rul_cycles = max(10, int(900 * (1 - m.tool_wear / 100.0)))
            m.cycle_time = round(cfg["cycle_time_base"] * (1 + fault_factor * 0.18) + noise(0.3), 1)
            m.health = round(max(15.0, min(100.0, 100.0 - (m.tool_wear / 100.0) * 35 - max(0, m.vibration - cfg["vib_base"]) * 3.5 - noise(0.2))), 1)
            m.anomaly_score = round(min(1.0, max(0.02, 0.05 + fault_factor * 0.85 + noise(0.01))), 3)

        elif m.station == StationType.WELDING:
            # Robotic MIG welding cell physics
            load_current = cfg["current_base"] * (0.7 + 0.6 * m.load_factor) + (fault_factor * (18.0 + noise(2.5)))
            m.current = round(load_current + noise(0.4), 1)
            temp_calc = cfg["temp_base"] + (m.load_factor - 0.5) * 8 + (fault_factor * 22.0)
            m.temperature = round(temp_calc + noise(0.4), 1)
            m.vibration = round(max(0.1, cfg["vib_base"] + (fault_factor * 1.6) + noise(0.1)), 1)
            m.rpm = 0
            m.cycle_time = round(cfg["cycle_time_base"] * (1 + fault_factor * 0.2) + noise(0.3), 1)
            m.health = round(max(15.0, min(100.0, 100.0 - fault_factor * 48 - noise(0.3))), 1)
            m.anomaly_score = round(min(1.0, max(0.02, 0.03 + fault_factor * 0.90 + noise(0.01))), 3)

        elif m.station == StationType.INSPECTION:
            # Laser CMM scanning physics
            load_current = cfg["current_base"] * (0.8 + 0.4 * m.load_factor) + (fault_factor * 1.8)
            m.current = round(load_current + noise(0.1), 1)
            temp_calc = cfg["temp_base"] + (m.load_factor - 0.5) * 3 + (fault_factor * 7.5)
            m.temperature = round(temp_calc + noise(0.2), 1)
            m.vibration = round(max(0.05, cfg["vib_base"] + (fault_factor * 0.85) + noise(0.05)), 1)
            m.rpm = 0
            m.cycle_time = round(cfg["cycle_time_base"] * (1 + fault_factor * 0.65) + noise(0.2), 1)
            m.health = round(max(20.0, min(100.0, 100.0 - fault_factor * 42 - noise(0.2))), 1)
            m.anomaly_score = round(min(1.0, max(0.02, 0.05 + fault_factor * 0.94 + noise(0.01))), 3)

        elif m.station == StationType.PACKAGING:
            # Palletizer conveyor physics
            load_current = cfg["current_base"] * (0.7 + 0.6 * m.load_factor) + (fault_factor * 5.0)
            m.current = round(load_current + noise(0.2), 1)
            temp_calc = cfg["temp_base"] + (m.load_factor - 0.5) * 6 + (fault_factor * 15.0)
            m.temperature = round(temp_calc + noise(0.3), 1)
            m.vibration = round(max(0.1, cfg["vib_base"] + (fault_factor * 2.0) + noise(0.12)), 1)
            m.rpm = round(max(250, cfg["rpm_base"] * (1 - fault_factor * 0.28) + noise(10)))
            m.cycle_time = round(cfg["cycle_time_base"] * (1 + fault_factor * 0.3) + noise(0.2), 1)
            m.health = round(max(15.0, min(100.0, 100.0 - fault_factor * 46 - noise(0.2))), 1)
            m.anomaly_score = round(min(1.0, max(0.02, 0.04 + fault_factor * 0.84 + noise(0.01))), 3)

        # Status determination
        if fault_factor > 0.45:
            m.status = MachineStatus.DEGRADED
        elif fault_factor > 0.15:
            m.status = MachineStatus.WARNING
        else:
            m.status = MachineStatus.RUNNING

        # Energy calculation
        m.energy_kwh = round(cfg["energy_base"] * (0.8 + 0.4 * m.load_factor) + (m.current / cfg["current_base"]) * 1.5 + noise(0.2), 1)

        # Production cycles
        m.cumulative_cycles += 1
        cycle_ticks = max(1, int(m.cycle_time))
        if m.cumulative_cycles % max(1, cycle_ticks // 3) == 0:
            m.production_count += 1

    def _to_telemetry(self, m: MachineState) -> MachineTelemetry:
        return MachineTelemetry(
            machine_id=m.machine_id,
            station=m.station,
            timestamp=datetime.now(timezone.utc).isoformat(),
            status=m.status,
            temperature=round(m.temperature, 1),
            vibration=round(m.vibration, 1),
            rpm=round(m.rpm),
            current=round(m.current, 1),
            production_count=m.production_count,
            cycle_time=round(m.cycle_time, 1),
            energy_kwh=round(m.energy_kwh, 1),
            health=min(100.0, max(0.0, round(m.health, 1))),
            tool_wear=min(100.0, max(0.0, round(m.tool_wear, 1))) if m.station == StationType.CNC else None,
            anomaly_score=min(1.0, max(0.0, round(m.anomaly_score, 3))),
            rul_cycles=m.rul_cycles if m.station == StationType.CNC else None,
            latency_ms=round(random.uniform(20, 60), 1),
        )
