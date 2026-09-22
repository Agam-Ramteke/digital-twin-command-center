"""FastAPI dashboard gateway for the Digital Twin Orchestration Platform.

Phase 1 keeps the existing REST responses available while the simulator emits
versioned causal-model telemetry. Persistent Live Twin APIs arrive in Phase 2.
"""

from __future__ import annotations

from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from models import MachineTelemetry, FactorySummary, MachineTwinState, SimulationState
from simulator import SimulatorEngine
from config import Settings
from domain.contracts import (
    BottleneckReport,
    DefectAttributionReport,
    EventEnvelope,
    FrozenLineSnapshot,
    ProcessTopology,
    ProcessTwinView,
    ProductionToken,
    ScenarioForkRequest,
    ScenarioRunResult,
    TwinDocument,
)
from repositories.factory import create_scenario_repository, create_twin_repository
from services import (
    BedrockService,
    LiveTwinMqttConsumer,
    LiveTwinService,
    ProcessTwinService,
    ScenarioWorkerService,
)


# ---------------------------------------------------------------------------
# Simulator and Services
# ---------------------------------------------------------------------------
settings = Settings.from_environment()
twin_repository = create_twin_repository(settings)
scenario_repository = create_scenario_repository(settings)
live_twin_service = LiveTwinService(twin_repository)
process_twin_service = ProcessTwinService(live_twin_service)
scenario_worker_service = ScenarioWorkerService(
    process_twin_service=process_twin_service,
    live_twin_service=live_twin_service,
    scenario_repository=scenario_repository,
)
bedrock_service = BedrockService(
    profile_name=settings.aws_profile,
    region_name=settings.aws_region,
    fast_model_id=settings.bedrock_fast_model,
    reasoning_model_id=settings.bedrock_reasoning_model,
)
live_twin_consumer = LiveTwinMqttConsumer(
    live_twin_service,
    host=settings.mqtt_host,
    port=settings.mqtt_port,
)


def _on_simulation_tick(events: tuple[EventEnvelope, ...]) -> None:
    # In-process bridge for development environments without a running MQTT broker
    if not live_twin_consumer.connected:
        for event in events:
            with suppress(Exception):
                live_twin_service.consume(event)
    # Accumulate simulation time for rate-limited token emission through DAG
    with suppress(Exception):
        process_twin_service.accumulate_time(1.0)


engine = SimulatorEngine(on_tick=_on_simulation_tick)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start simulation and the separate Live Twin MQTT consumer."""
    if settings.mqtt_live_twin_enabled:
        live_twin_consumer.start()
    engine.start()
    yield
    engine.stop()
    live_twin_consumer.stop()
    scenario_repository.close()
    twin_repository.close()


app = FastAPI(
    title="Digital Twin Orchestration Platform",
    version="0.4.0",
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
# Service probes (used by Docker Compose and Kubernetes in Phase 6)
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    """Liveness probe: the API process can answer requests."""
    return {"status": "ok", "service": "dashboard-api"}


@app.get("/ready")
def readiness_check():
    """Readiness probe for the current in-process simulation dependency."""
    state = engine.get_simulation_state()
    return {
        "status": "ready" if state.running else "starting",
        "simulation_running": state.running,
        "simulation_tick": state.tick,
        "persistence_backend": settings.persistence_backend,
        "live_twin_mqtt_connected": live_twin_consumer.connected,
    }


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
# Versioned Live Twin API (introduced in Phase 2)
# ---------------------------------------------------------------------------

@app.get("/api/v1/twins", response_model=list[TwinDocument])
def list_live_twins():
    """List the persistent current state of each Live Twin."""
    return live_twin_service.list_twins()


@app.get("/api/v1/twins/{machine_id}", response_model=TwinDocument)
def get_live_twin(machine_id: str):
    """Return a single persistent Live Twin document."""
    twin = live_twin_service.get_twin(machine_id)
    if twin is None:
        raise HTTPException(404, f"Live Twin {machine_id} not found")
    return twin


@app.get("/api/v1/twins/{machine_id}/telemetry", response_model=list[EventEnvelope])
def get_live_twin_telemetry(
    machine_id: str,
    limit: int = Query(default=100, ge=1, le=10_000),
):
    """Return newest-first immutable telemetry envelopes for a Live Twin."""
    if live_twin_service.get_twin(machine_id) is None:
        raise HTTPException(404, f"Live Twin {machine_id} not found")
    return live_twin_service.telemetry_history(machine_id, limit=limit)


@app.post("/api/v1/events", response_model=TwinDocument, status_code=202)
def ingest_live_twin_event(event: EventEnvelope):
    """Internal/test ingestion route using the exact MQTT reducer path.

    Production station simulators publish the same envelope to MQTT. This
    endpoint is intentionally useful for deterministic integration tests and
    controlled experiments where event replay is needed.
    """
    try:
        return live_twin_service.consume(event).document
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


# ---------------------------------------------------------------------------
# Versioned Process Twin API (introduced in Phase 3)
# ---------------------------------------------------------------------------

@app.get("/api/v1/process/topology", response_model=ProcessTopology)
def get_process_topology():
    """Return the DAG process topology (nodes, material flow edges, sequence)."""
    return process_twin_service.topology


@app.get("/api/v1/process/snapshot", response_model=FrozenLineSnapshot)
def get_frozen_line_snapshot():
    """Capture an atomic, immutable snapshot across all 5 station Live Twins."""
    try:
        return process_twin_service.capture_snapshot()
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/api/v1/process/view", response_model=ProcessTwinView)
def get_process_twin_view():
    """Return composite Process Twin view: frozen snapshot + computed line metrics."""
    try:
        return process_twin_service.get_process_view()
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/api/v1/process/bottleneck", response_model=BottleneckReport)
def get_process_bottleneck():
    """Identify the binding bottleneck station and max line throughput capacity."""
    try:
        return process_twin_service.analyze_bottleneck()
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/api/v1/process/tokens", response_model=list[ProductionToken])
def list_production_tokens(
    limit: int = Query(default=50, ge=1, le=10_000),
    quality: str | None = Query(default=None),
    station: str | None = Query(default=None),
):
    """List newest-first production tokens with station lineage and carried quality flags."""
    return process_twin_service.list_tokens(limit=limit, quality=quality, station=station)


@app.get("/api/v1/process/tokens/{token_id}", response_model=ProductionToken)
def get_production_token(token_id: str):
    """Retrieve a specific production token by ID with full lineage history."""
    token = process_twin_service.get_token(token_id)
    if token is None:
        raise HTTPException(404, f"Production token {token_id} not found")
    return token


@app.post("/api/v1/process/tokens", response_model=ProductionToken, status_code=201)
def emit_production_token():
    """Trigger emission of a production token through the 5-station pipeline."""
    return process_twin_service.emit_token_through_pipeline()


@app.get("/api/v1/process/defects/trace", response_model=DefectAttributionReport)
def trace_process_defects(
    limit: int = Query(default=100, ge=1, le=10_000),
):
    """Trace recent inspection defects back to upstream machine degradation root causes."""
    return process_twin_service.trace_defects(limit=limit)


# ---------------------------------------------------------------------------
# Phase 4 — Scenario Worker API (§4.3, §4.4)
# ---------------------------------------------------------------------------

@app.post("/api/v1/scenarios/run", response_model=ScenarioRunResult)
def run_scenario(request: ScenarioForkRequest):
    """Run an isolated forward counterfactual simulation from a frozen snapshot."""
    try:
        return scenario_worker_service.run_scenario(request)
    except Exception as error:
        raise HTTPException(400, str(error)) from error


@app.get("/api/v1/scenarios", response_model=list[ScenarioRunResult])
def list_scenarios(limit: int = Query(default=50, ge=1, le=1000)):
    """List historical scenario runs ordered newest first."""
    return scenario_worker_service.list_scenarios(limit=limit)


@app.get("/api/v1/scenarios/presets")
def list_scenario_presets():
    """List pre-packaged research scenario presets."""
    return scenario_worker_service.get_presets()


@app.post("/api/v1/scenarios/presets/{preset_id}/run", response_model=ScenarioRunResult)
def run_scenario_preset(
    preset_id: str,
    horizon_seconds: float = Query(default=120.0, ge=5.0, le=3600.0),
    seed: int = Query(default=20260920),
):
    """Trigger execution of a pre-configured research what-if scenario preset."""
    try:
        return scenario_worker_service.run_preset(
            preset_id,
            horizon_seconds=horizon_seconds,
            seed=seed,
        )
    except KeyError as error:
        raise HTTPException(404, str(error)) from error
    except Exception as error:
        raise HTTPException(400, str(error)) from error


@app.get("/api/v1/scenarios/{scenario_id}", response_model=ScenarioRunResult)
def get_scenario(scenario_id: str):
    """Retrieve detailed execution results and delta for a specific scenario."""
    result = scenario_worker_service.get_scenario(scenario_id)
    if result is None:
        raise HTTPException(404, f"Scenario {scenario_id} not found")
    return result


@app.delete("/api/v1/scenarios/{scenario_id}")
def delete_scenario(scenario_id: str):
    """Delete a scenario record."""
    deleted = scenario_worker_service.delete_scenario(scenario_id)
    if not deleted:
        raise HTTPException(404, f"Scenario {scenario_id} not found")
    return {"status": "deleted", "scenario_id": scenario_id}



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


# ---------------------------------------------------------------------------
# AWS Bedrock AI Diagnostics & Reasoning Endpoints
# ---------------------------------------------------------------------------
@app.post("/api/ai/ask")
def ask_ai(payload: dict):
    """Interactive AI query endpoint supporting fast (Luna) and reasoning (Astra/Claude) models."""
    prompt = payload.get("prompt")
    if not prompt:
        raise HTTPException(400, "Missing 'prompt' in request body")
    model_id = payload.get("model_id")
    system_prompt = payload.get(
        "system_prompt",
        "You are an expert AI industrial engineer for the factory digital twin platform.",
    )
    try:
        reply = bedrock_service.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model_id=model_id,
        )
        return {
            "prompt": prompt,
            "response": reply,
            "model_id": model_id or bedrock_service.fast_model_id,
        }
    except Exception as exc:
        raise HTTPException(502, f"Bedrock invocation failed: {exc}")


@app.post("/api/ai/diagnose-bottlenecks")
def diagnose_bottlenecks():
    """Deep causal diagnosis of active factory bottlenecks using reasoning model."""
    try:
        bottleneck_data = process_twin_service.get_bottlenecks().model_dump()
        machines = [m.model_dump() for m in engine.get_all_machines()]
        analysis = bedrock_service.diagnose_bottleneck(bottleneck_data, machines)
        return {
            "model_id": bedrock_service.reasoning_model_id,
            "analysis": analysis,
            "bottlenecks": bottleneck_data,
        }
    except Exception as exc:
        raise HTTPException(502, f"AI bottleneck diagnosis failed: {exc}")


@app.post("/api/ai/scenario-insights/{scenario_id}")
def get_scenario_ai_insights(scenario_id: str):
    """Generate deep engineering insights for a finished scenario fork."""
    scenario = scenario_repository.get_scenario(scenario_id)
    if not scenario:
        raise HTTPException(404, f"Scenario {scenario_id} not found")
    try:
        insights = bedrock_service.explain_scenario(scenario.model_dump())
        return {
            "scenario_id": scenario_id,
            "model_id": bedrock_service.reasoning_model_id,
            "insights": insights,
        }
    except Exception as exc:
        raise HTTPException(502, f"AI scenario analysis failed: {exc}")

