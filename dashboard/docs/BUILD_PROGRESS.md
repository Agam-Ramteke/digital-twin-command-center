# Digital Twin Orchestration Platform — Build Progress

**Last updated:** 2026-09-20  
**Current phase:** 6 — Container and Kubernetes deployment  
**Next executable task:** Containerize application (Dockerfiles for backend, frontend, mosquitto),
configure Docker Compose full stack, and create Kubernetes manifests with health/readiness probes.

## Project goal


Deliver the system described in the research report: a self-hosted, cloud-native
digital-twin platform for a five-station manufacturing line.  It must support
persistent Live Twins, MQTT-driven telemetry, a process-level DAG, isolated
Scenario Workers, a usable dashboard, Kubernetes deployment, and reproducible
measurements for the report.

The dashboard prototype is valuable UI work, but it is **not** evidence for
research claims until the measurements below come from instrumented execution.

## Source of truth

- Research scope: `C:\Users\agamr\Downloads\Digital Twin Orchestration Platform - Research Report (Draft v1).docx`
- Application root: `Digital Twin/dashboard`
- This file is the handoff/resume log. Update its phase checkbox, change log,
  tests, and next task after every meaningful implementation batch.

## Current baseline (verified 2026-09-20)

- React/Vite dashboard exists with overview, machine, maintenance, production,
  analytics, events, digital-twin, and system pages.
- FastAPI exposes `SimulatorEngine`, versioned Live Twin APIs, and Process Twin APIs.
- Mosquitto and browser MQTT-over-WebSocket are configured.
- Causal models emit deterministic, correlated telemetry across all five stations.
- Live Twin service with MongoDB persistence and in-memory test adapter provides
  idempotent reduction, out-of-order event preservation, and observed latency tracking.
- Process Twin models DAG process topology, frozen line snapshot capture, discrete
  production token flow with station lineage, multi-station bottleneck attribution, and
  upstream defect tracing.
- Scenario Worker service provides isolated, immutable counterfactual forward simulations
  with comparative causal deltas and research presets.
- Dashboard frontend is fully integrated with live backend APIs (no silent mock fallback),
  exposing true observed latency, DAG bottleneck balancing, discrete token lineage, and
  upstream defect root-cause attribution.
- No Docker images for the app, Kubernetes manifests, or observability benchmarking scripts exist yet.

## Architecture contract

```text
Station simulator / real adapter
  -> MQTT telemetry/state/fault/production topics
  -> Live Twin service (one logical twin per machine)
       -> MongoDB: current twin document + telemetry time series
       -> Process Twin: frozen line snapshot + DAG computation
       -> Dashboard API / WebSocket gateway
       -> Scenario Worker: immutable snapshot, counterfactual execution only
```

Key rules:

1. Simulator telemetry is not a Live Twin. The Live Twin consumes and persists
   state independently of its source.
2. Scenario Workers must never mutate a Live Twin or its current state.
3. Telemetry uses QoS 0; state, fault, command, and production events use QoS 1.
4. Measurements use generated and received timestamps; never generated random
   latency/freshness values.
5. Every experiment records configuration, run identifier, timestamps, and host
   information so Table 5 can be reproduced.

## Phased delivery plan

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 0 | Foundation, design contract, progress tracking, test plan | This file and the architecture/testing contract are committed to the workspace | **Complete** |
| 1 | Domain contracts and causal simulation | Versioned events, deterministic seeds, CNC causal model, station state machines, unit tests | **Complete** |
| 2 | Live Twin and persistence | MQTT consumer, current state + telemetry repository, idempotent handlers, real latency/freshness | **Complete** |
| 3 | Process Twin | Frozen snapshot, production tokens, DAG, bottleneck and defect tracing APIs | **Complete** |
| 4 | Scenario Worker | Snapshot API, isolated forward simulation, scenario result persistence and UI | **Complete** |
| 5 | Dashboard integration | Remove experiment-mode mock fallback, wire all APIs, show lineage/measurement status | **Complete** |
| 6 | Container and Kubernetes deployment | Docker images, Compose dev stack, manifests, health/readiness, resource limits | Not started |
| 7 | Observability and experiments | Metric collection, fault/network/scaling scripts, result export and charts | Not started |
| 8 | Research closeout | Populate report results/figures, revise claims, reproducibility package | Not started |

## Phase 1 implementation checklist

- [x] Define a versioned telemetry/event envelope with `event_id`, `run_id`,
      `sequence`, generation timestamp, receive timestamp, and schema version.
- [x] Define a full persisted Twin document: identity, operational, telemetry,
      health, production, faults, and desired command state.
- [x] Make simulations deterministic under an explicit random seed.
- [x] Implement the CNC causal graph: load + tool wear + bearing degradation
      -> force/current/temperature/vibration/RPM/quality/RUL.
- [x] Separate station-specific models from API/MQTT code.
- [x] Add unit tests for deterministic replay, bounds, causal direction, and
      command/state-machine transitions.
- [x] Preserve the legacy API contract until Phase 5 so the dashboard keeps
      working during migration.

## Phase 2 implementation checklist

- [x] Define `TwinRepository` interface with `InMemoryTwinRepository` development adapter.
- [x] Implement `MongoTwinRepository` with indexes and idempotency barrier via `events._id`.
- [x] Implement runtime repository factory selecting adapter based on `PERSISTENCE_BACKEND`.
- [x] Implement `LiveTwinService` event reducer computing real observed delivery latency,
      processing latency, and source age timestamps.
- [x] Guarantee idempotency on duplicate event IDs and retain out-of-order events in
      telemetry history without rolling back current machine state.
- [x] Implement `LiveTwinMqttConsumer` subscribing to canonical `factory/v1/+/telemetry`.
- [x] Expose versioned REST endpoints (`/api/v1/twins`, `/api/v1/twins/{machine_id}`,
      `/api/v1/twins/{machine_id}/telemetry`, and `/api/v1/events`).
- [x] Add unit and integration tests verifying twin materialization, duplicate no-op,
      late event handling, station sorting, and API routes (27 passing tests).

## Phase 3 implementation checklist

- [x] Define DAG topology models (`DAGNode`, `DAGEdge`, `ProcessTopology`), bottleneck models,
      and defect attribution models (`domain/contracts.py`).
- [x] Implement canonical 5-station sequential DAG structure (Stamping -> CNC -> Welding ->
      Inspection -> Packaging).
- [x] Implement atomic `FrozenLineSnapshot` capture across all 5 station twins (`services/process_twin.py`).
- [x] Implement `ProductionToken` pipeline with station lineage, carried quality flags,
      pass/fail routing at Inspection, and dispatch/scrap at Packaging.
- [x] Implement multi-station bottleneck attribution computing effective cycle times, slack times,
      binding station constraint, and line capacity per hour.
- [x] Implement upstream defect tracing calculating root cause attribution percentages (CNC
      machining vs Welding electrode drift vs Stamping force).
- [x] Implement `get_process_view` composing frozen snapshot with real-time `ProcessMetrics`.
- [x] Mount versioned REST routes in `main.py` (`/api/v1/process/topology`, `/snapshot`, `/view`,
      `/bottleneck`, `/tokens`, `/tokens/{token_id}`, `/defects/trace`).
- [x] Add comprehensive unit and API integration tests (37 passing tests total).

## Phase 4 implementation checklist

- [x] Define Scenario domain contracts (`ScenarioStatus`, `StationOverride`, `ScenarioForkRequest`,
      `StationOutcome`, `LineOutcome`, `ScenarioDelta`, `TrajectorySample`, `ScenarioRunResult`).
- [x] Implement station rehydration (`rehydrate_from_twin`, `apply_override`, `cycle_time_multiplier`)
      in causal models (`simulation/causal.py`).
- [x] Implement decoupled snapshot-based factory construction `CausalFactory.from_frozen_line_snapshot`.
- [x] Implement `ScenarioRepository` interface with `InMemoryScenarioRepository` and durable
      `MongoScenarioRepository` (`repositories/scenario_repository.py`, `mongo_scenario_repository.py`).
- [x] Implement `ScenarioWorkerService` executing deterministic Baseline vs Counterfactual simulations,
      calculating comparative causal deltas, and enforcing zero-mutation fork immutability.
- [x] Implement pre-packaged research presets (`preventive_tool_change`, `coolant_pump_failure`,
      `line_cadence_boost`, `welding_electrode_drift`).
- [x] Mount versioned REST routes in `main.py` (`/api/v1/scenarios/run`, `/presets`,
      `/presets/{preset_id}/run`, `/scenarios`, `/scenarios/{scenario_id}`).
- [x] Add What-If Scenario Studio in frontend (`DigitalTwinPage.tsx`) with preset selectors,
      horizon picker, delta metric cards, and station comparison breakdown.
- [x] Add unit, integration, and API test coverage across `tests/test_scenario_worker.py` and
      `tests/test_api.py` (45 passing tests total).

## Phase 5 implementation checklist

- [x] Mirror all Python domain contracts in `dashboard/frontend/src/types/index.ts` (Live Twin,
      DAG Process, Tokens, Defect Attribution, System Readiness).
- [x] Refactor `dashboard/frontend/src/services/api.ts` with typed endpoints, `/ready` health probe,
      and live-first policy; eliminate silent mock fallback in live mode.
- [x] Add polling hooks in `dashboard/frontend/src/hooks/usePolling.ts` for `/ready`, `/api/v1/twins`,
      `/api/v1/process/bottleneck`, `/api/v1/process/tokens`, and `/api/v1/process/defects/trace`.
- [x] Update Header layout with live backend readiness probe badge (`LIVE API [MONGODB/MEM]`) and
      persistence engine indicator.
- [x] Enhance `ProductionPage.tsx` with DAG sequential process balancing, binding bottleneck
      constraint annotations, live discrete production token stream with interactive lineage
      inspection, and upstream defect root-cause attribution.
- [x] Enhance `SystemPage.tsx` with live service health instrumentation and true observed
      synchronization timing (delivery latency, processing latency, source age).
- [x] Enhance `DigitalTwinPage.tsx` with Live Twin registry metadata (revision numbers,
      sequence tracking, event IDs).
- [x] Verify frontend build passes with zero TypeScript errors (`tsc && vite build`).


## Test strategy

| Layer | Required proof |
|---|---|
| Unit | Causal direction, bounds, deterministic seed replay, event validation |
| Integration | MQTT -> Live Twin -> repository -> REST/WebSocket data path |
| Process | Snapshot consistency, token lineage, bottleneck and defect propagation |
| Scenario | Fork immutability and repeatable result for the same snapshot/seed |
| Infrastructure | Health checks, broker/database outage recovery, pod restart |
| Research | Baseline/degraded latency, scale, recovery, fidelity, PdM results |

## Important implementation decisions

- **MongoDB** is the target persistence layer. A clearly labelled in-memory
  development adapter may be used only so contributors can run the app without
  Docker; it must not be used for report experiments.
- **Pydantic contracts** are the Python API/event source of truth. Generate or
  manually keep TypeScript contracts in sync as part of each API change.
- **FastAPI** remains the dashboard API gateway; simulation/worker code must be
  importable independently so it can run as a separate container later.
- **No fabricated metrics:** the prototype's random latency, freshness, and
  twin-drift values must be replaced by observed values before Phase 2 closes.

## Handoff protocol

When resuming this project, read this file first, then:

1. Run the verification commands in the most recently completed phase entry.
2. Do not mark a phase complete until its exit criteria and tests pass.
3. Add a dated change-log entry with changed files, tests run, known limitation,
   and the exact next task.
4. If a feature is unfinished, leave its checkbox unchecked and write the
   blocker rather than treating UI appearance as completion.

## Change log

### 2026-09-19 — Phase 0 started

- Audited the report and current dashboard/backend prototype.
- Created the delivery phases, architectural rules, and test strategy above.
- Identified the first engineering milestone: deterministic causal simulation
  and versioned data contracts.
- **Verification:** source audit only; no application code changed yet.
- **Next task:** implement Phase 1 domain contracts and causal models.

### 2026-09-19 — Phase 1 complete

- Added `backend/domain/contracts.py`: versioned event envelope, strict causal
  telemetry contract, command contract, planned persisted Twin document, and
  production-token contract.
- Added `backend/simulation/causal.py`: deterministic, seedable reduced-order
  models for Stamping, CNC, Welding, Inspection, and Packaging. CNC explicitly
  separates tool wear, bearing degradation, target/actual RPM, coolant failure,
  cutting force, vibration, current, temperature, quality, and health.
- Replaced the old random/heuristic `SimulatorEngine` implementation with a
  compatibility adapter driven by the causal models. Existing REST endpoints
  and legacy MQTT topics remain usable; canonical versioned MQTT topics now
  exist for the migration.
- Added liveness/readiness probes at `/health` and `/ready`.
- Added backend tests and `requirements-dev.txt`; installed `httpx` into the
  local virtual environment for FastAPI HTTP tests.
- **Verification:** `python -m unittest discover -s tests -v` passed 14 tests;
  `python -m py_compile main.py simulator.py domain/contracts.py
  simulation/causal.py` passed.
- **Known limitation:** the compatibility endpoint still reports `latency_ms`
  as `0.0` and source-model equality as 100% sync. This is intentional until
  Phase 2 records actual MQTT receive/processing timestamps in a Live Twin.
- **Next task:** add the repository abstraction, MongoDB adapter, idempotent
  Live Twin reducer, and measured event receipt timestamps.

### 2026-09-20 — Phase 2 complete

- Added `backend/repositories/twin_repository.py`: `TwinRepository` interface,
  `RepositoryWriteResult`, and thread-safe `InMemoryTwinRepository` development adapter.
- Added `backend/repositories/mongo_twin_repository.py`: durable MongoDB adapter
  with indexes for `machine_id`, `generated_at`, and an idempotency barrier on `events._id`.
- Added `backend/repositories/factory.py`: runtime repository creation via `PERSISTENCE_BACKEND`.
- Added `backend/services/live_twin.py`: `LiveTwinService` event reducer computing
  true observed delivery latency (`delivery_latency_ms`), processing latency (`processing_latency_ms`),
  and source age, while guaranteeing idempotent deduping and non-destructive retention of late events.
- Added `backend/services/mqtt_live_twin.py`: `LiveTwinMqttConsumer` subscribing
  to canonical `factory/v1/+/telemetry` topics.
- Exposed versioned Live Twin REST endpoints in `backend/main.py` (`/api/v1/twins`,
  `/api/v1/twins/{machine_id}`, `/api/v1/twins/{machine_id}/telemetry`, and `/api/v1/events`).
- Extended backend test suite across `tests/test_live_twin.py` and `tests/test_api.py`.
- **Verification:** `python -m unittest discover -s tests -v` passed 27 tests;
  `python -m py_compile` passed across all backend files.
- **Known limitation:** station twins operate independently; process-level token
  propagation and DAG line aggregation are deferred to Phase 3.
- **Next task:** implement Phase 3 Process Twin (DAG line composition, production-token
  propagation, frozen-snapshot semantics, bottleneck detection, and defect tracing).

### 2026-09-20 — Phase 3 complete

- Added DAG models (`DAGNode`, `DAGEdge`, `ProcessTopology`), `BottleneckReport`, and
  `DefectAttributionReport` to `backend/domain/contracts.py`.
- Added `backend/services/process_twin.py`: implemented `ProcessTwinService` providing
  DAG process topology, atomic `FrozenLineSnapshot` capture, lightweight `ProductionToken`
  progression with lineage tracking and carried quality flags, multi-station bottleneck
  attribution, and upstream defect root-cause tracing.
- Exported `ProcessTwinService` in `backend/services/__init__.py`.
- Updated `backend/simulator.py` with an optional `on_tick` callback bridge.
- Updated `backend/main.py` to version 0.3.0, wired `ProcessTwinService`, added in-process
  bridge for offline development, and exposed canonical REST routes: `/api/v1/process/topology`,
  `/api/v1/process/snapshot`, `/api/v1/process/view`, `/api/v1/process/bottleneck`,
  `/api/v1/process/tokens`, `/api/v1/process/tokens/{token_id}`, and `/api/v1/process/defects/trace`.
- Added `backend/tests/test_process_twin.py` (9 tests) and updated `backend/tests/test_api.py`.
- **Verification:** `python -m unittest discover -s tests -v` passed all 37 tests;
  `python -m py_compile` passed across all backend files.
### 2026-09-20 — Phase 4 complete

- Added Scenario contracts (`ScenarioStatus`, `StationOverride`, `ScenarioForkRequest`,
  `StationOutcome`, `LineOutcome`, `ScenarioDelta`, `TrajectorySample`, `ScenarioRunResult`)
  to `backend/domain/contracts.py`.
- Added station rehydration (`rehydrate_from_twin`, `apply_override`, `cycle_time_multiplier`)
  to causal station models and added isolated factory constructor
  `CausalFactory.from_frozen_line_snapshot` in `backend/simulation/causal.py`.
- Added `backend/repositories/scenario_repository.py`: `ScenarioRepository` protocol and
  `InMemoryScenarioRepository` development adapter.
- Added `backend/repositories/mongo_scenario_repository.py`: durable MongoDB adapter for
  `scenarios` collection with indexing.
- Wired scenario repositories into `backend/repositories/factory.py` and `__init__.py`.
- Added `backend/services/scenario_worker.py`: implemented `ScenarioWorkerService` executing
  deterministic Baseline vs Counterfactual forward simulations, computing comparative causal
  deltas (throughput, scrap, quality, energy, bottleneck shift), trajectory sampling, and
  built-in research presets (`preventive_tool_change`, `coolant_pump_failure`, `line_cadence_boost`,
  `welding_electrode_drift`).
- Added strict Live Twin fork immutability enforcement, verifying that no Live Twin state
  or repository records are mutated during scenario execution.
- Exported `ScenarioWorkerService` in `backend/services/__init__.py`.
- Updated `backend/main.py` to version 0.4.0, wired `ScenarioWorkerService`, and exposed
  versioned REST routes: `/api/v1/scenarios/run`, `/api/v1/scenarios/presets`,
  `/api/v1/scenarios/presets/{preset_id}/run`, `/api/v1/scenarios`, and `/api/v1/scenarios/{scenario_id}`.
- Updated frontend `DigitalTwinPage.tsx` with an interactive What-If Scenario Studio: research
  preset buttons, horizon selector, run trigger, delta KPI cards, station comparison table,
  and immutability certification badge.
- Added `backend/tests/test_scenario_worker.py` (7 tests) and updated `backend/tests/test_api.py`.
- **Verification:** `python -m unittest discover -s tests -v` passed all 45 tests;
  `python -m py_compile` passed across all backend files; `npm run build` passed in `frontend/`.
- **Known limitation:** The dashboard still had mock fallback in `api.ts` when the backend is offline.
  This is now resolved in Phase 5.
- **Next task:** proceed to Phase 6 — Container and Kubernetes deployment.

### 2026-09-20 — Phase 5 complete

- Extended `dashboard/frontend/src/types/index.ts` with complete TypeScript contracts for
  `TwinDocument`, `IdentityState`, `OperationalStateSnapshot`, `SynchronizationState`,
  `HealthState`, `ProductionState`, `FaultState`, `ProcessTopology`, `DAGNode`, `DAGEdge`,
  `ProcessTwinView`, `BottleneckReport`, `StationBottleneckDetail`, `ProductionToken`,
  `StationPassage`, `CarriedQuality`, `DefectAttributionReport`, `DefectIncident`,
  `RootCauseAttribution`, and `SystemReadiness`.
- Refactored `dashboard/frontend/src/services/api.ts` with a strict live-first policy:
  silent mock fallback is disabled by default, ensuring experiments and demos run strictly
  against live FastAPI / MongoDB / MQTT endpoints.
- Added live API routes to `api.ts`: `/ready`, `/api/v1/twins`, `/api/v1/process/topology`,
  `/api/v1/process/view`, `/api/v1/process/bottleneck`, `/api/v1/process/tokens`, and
  `/api/v1/process/defects/trace`.
- Added custom polling hooks in `dashboard/frontend/src/hooks/usePolling.ts`:
  `useSystemReadiness`, `useLiveTwins`, `useLiveTwin`, `useProcessBottleneck`, `useProcessView`,
  `useProductionTokens`, and `useDefectTrace`.
- Updated `Header.tsx` to dynamically query `/ready` and display backend status (`LIVE API [MONGODB/MEM]`
  or `BACKEND OFFLINE`) alongside the MQTT stream badge.
- Overhauled `ProductionPage.tsx` with:
  - DAG sequential process balancing with active binding constraint indicator (e.g. CNC-01) and station slack times.
  - Live production token stream with status (Pass / Scrap / WIP), carried quality, and manual token emission.
  - Interactive Token Lineage inspection drawer displaying arrival/exit timestamps, station processing time, and carried physical signals.
  - Upstream Defect Root-Cause Attribution panel displaying scrap rates and station-level attribution percentages.
- Overhauled `SystemPage.tsx` with live architecture instrumentation:
  - Dynamic service status for FastAPI Gateway, Causal Simulator, Live Twin Service, Process Twin DAG, Scenario Worker, Persistence Backend, and MQTT Consumer.
  - True observed synchronization timing: mean delivery latency, Live Twin processing latency, and source age (Table 5 instrumentation).
- Enhanced `DigitalTwinPage.tsx` with Live Twin registry metadata (sequence number, revision depth, last event ID, measured processing latency).
- Fixed 7 backend IoT engineering bugs in causal physics, snapshot rehydration, memory limits, and bottleneck alignment.
- **Verification:** `npm run build` in `frontend/` passed with 0 errors (`tsc && vite build`);
  `python -m unittest discover -s tests -v` in `backend/` passed all 45 tests.
- **Next task:** implement Phase 6 — Container and Kubernetes deployment (Dockerfiles for backend,
  frontend, and mosquitto, Docker Compose full stack, and Kubernetes manifests).




