"""
FastAPI backend for the Digital Twin MVP.

Starts the simulator on boot and exposes simple REST endpoints.
The React dashboard polls these endpoints every ~1 second.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import MachineTelemetry, FactorySummary, MachineTwinState, SimulationState
from simulator import SimulatorEngine


# ---------------------------------------------------------------------------
# Simulator singleton
# ---------------------------------------------------------------------------
engine = SimulatorEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the simulator when the server boots."""
    engine.start()
    yield
    engine.stop()


app = FastAPI(
    title="Digital Twin MVP",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Machine Telemetry
# ---------------------------------------------------------------------------

@app.get("/machines", response_model=list[MachineTelemetry])
def get_all_machines():
    """Return latest telemetry for all machines."""
    return engine.get_all_telemetry()


@app.get("/machines/{machine_id}", response_model=MachineTelemetry)
def get_machine(machine_id: str):
    """Return latest telemetry for a specific machine."""
    data = engine.get_telemetry(machine_id)
    if not data:
        raise HTTPException(404, f"Machine {machine_id} not found")
    return data


@app.get("/machines/{machine_id}/twin", response_model=MachineTwinState)
def get_machine_twin(machine_id: str):
    """Return Digital Twin synchronization state for a machine."""
    data = engine.get_twin_state(machine_id)
    if not data:
        raise HTTPException(404, f"Machine {machine_id} not found")
    return data


# ---------------------------------------------------------------------------
# Factory Summary
# ---------------------------------------------------------------------------

@app.get("/summary", response_model=FactorySummary)
def get_summary():
    """Return factory-level KPIs."""
    return engine.get_summary()


# ---------------------------------------------------------------------------
# Simulation Control
# ---------------------------------------------------------------------------

@app.get("/simulate/state", response_model=SimulationState)
def get_simulation_state():
    """Return current simulation engine state."""
    return engine.get_simulation_state()


@app.post("/simulate/start")
def start_simulation():
    engine.start()
    return {"status": "started"}


@app.post("/simulate/stop")
def stop_simulation():
    engine.stop()
    return {"status": "stopped"}


@app.post("/simulate/degrade_cnc")
def degrade_cnc():
    """Trigger CNC-01 degradation scenario."""
    engine.degrade_cnc()
    return {"status": "cnc_degradation_started"}


@app.post("/simulate/reset_cnc")
def reset_cnc():
    """Simulate maintenance — reset CNC-01 to healthy state."""
    engine.reset_cnc()
    return {"status": "cnc_reset"}


@app.post("/machines/{machine_id}/inject-fault")
def inject_machine_fault(machine_id: str, payload: dict = None):
    """Inject a specific fault scenario into any machine station."""
    fault_type = payload.get("fault_type", "default") if payload else "default"
    severity = payload.get("severity", "Warning") if payload else "Warning"
    success = engine.inject_fault(machine_id, fault_type, severity)
    if not success:
        raise HTTPException(404, f"Machine {machine_id} not found")
    return {"status": "fault_injected", "machine_id": machine_id, "fault_type": fault_type, "severity": severity}


@app.post("/machines/{machine_id}/reset")
def reset_machine(machine_id: str):
    """Simulate maintenance calibration on a specific machine."""
    success = engine.reset_machine(machine_id)
    if not success:
        raise HTTPException(404, f"Machine {machine_id} not found")
    return {"status": "machine_reset", "machine_id": machine_id}


@app.post("/simulate/reset")
def reset_all():
    """Reset entire simulation to initial state."""
    engine.reset_all()
    return {"status": "reset"}

