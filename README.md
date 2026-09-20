# Digital Twin Orchestration Platform

A self-hosted, cloud-native Digital Twin Orchestration Platform for a discrete 5-station automotive component manufacturing line.

The platform bridges real-time industrial telemetry with causal physics simulation, event-driven state reduction, directed acyclic graph (DAG) material flow tracking, discrete token lineage, isolated counterfactual what-if simulation, and an industrial-grade operational dashboard.

---

## Table of Contents

- [1. System Architecture](#1-system-architecture)
  - [Architectural Boundaries](#architectural-boundaries)
  - [End-to-End Data Flow](#end-to-end-data-flow)
- [2. Subsystems Deep-Dive](#2-subsystems-deep-dive)
  - [2.1 Causal Physics Engine (`backend/simulation/causal.py`)](#21-causal-physics-engine)
  - [2.2 Event Bus & MQTT Protocol (`mosquitto/`)](#22-event-bus--mqtt-protocol)
  - [2.3 Live Twin State Reducer (`backend/services/live_twin.py`)](#23-live-twin-state-reducer)
  - [2.4 Persistence Layer (`backend/services/twin_repository.py`)](#24-persistence-layer)
  - [2.5 Process Twin & Discrete Token Lineage (`backend/services/process_twin.py`)](#25-process-twin--discrete-token-lineage)
  - [2.6 Scenario Worker & What-If Studio (`backend/services/scenario_worker.py`)](#26-scenario-worker--what-if-studio)
  - [2.7 Industrial Dashboard (`frontend/`)](#27-industrial-dashboard)
- [3. The 5 Manufacturing Stations](#3-the-5-manufacturing-stations)
- [4. API Reference](#4-api-reference)
- [5. Getting Started](#5-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [MQTT Broker Setup](#mqtt-broker-setup)
  - [Running Unit & Verification Tests](#running-unit--verification-tests)
- [6. Project Delivery Phases](#6-project-delivery-phases)

---

## 1. System Architecture

```text
                  +-----------------------------------+
                  |   Dashboard Frontend (React 19)   |
                  +-----------------+-----------------+
                                    | REST / WebSocket
                  +-----------------v-----------------+
                  |      Dashboard API (FastAPI)      |
                  +-----------------+-----------------+
                                    |
         +--------------------------+--------------------------+
         |                                                     |
+--------v---------+                                  +--------v---------+
|   Process Twin   |                                  | Scenario Worker  |
| DAG Flow Lineage |                                  | Counterfactuals  |
+--------+---------+                                  +------------------+
         |                                                     | (Snapshot Fork)
+--------v-----------------------------------------------------v-------+
|                        Live Twin Service                             |
|       State Reducer, Monotonic Sequences, True Latency Metrics       |
+--------+---------------------------------------------+---------------+
         |                                             |
         | MQTT                                        | Storage Driver
+--------v---------+                          +--------v---------------+
|    Mosquitto     |                          |   MongoDB / In-Memory  |
| TCP:1883 WS:9001 |                          |   Repository Driver    |
+--------+---------+                          +------------------------+
         |
+--------v-------------------------------------------------------------+
|    Causal Physics Simulator / Future Industrial OPC-UA Adapters     |
|    5 Stations: Stamping -> CNC -> Welding -> Inspection -> Packaging |
+----------------------------------------------------------------------+
```

### Architectural Boundaries

The platform enforces strict separation of concerns:

1. **Simulator $\neq$ Live Twin**: The simulator generates physical sensor observations; it does not dictate twin or operational state. The Live Twin independently consumes events and computes its own state via an idempotent reducer.
2. **Immutability of Live State**: Scenario Workers fork from an immutable `FrozenLineSnapshot`. Forward counterfactual simulations are completely isolated and never mutate live twins or emit production telemetry.
3. **True Instrumentation**: Timing and latency metrics (delivery latency, processing latency, source age) reflect real clock differentials; synthetic or randomized delays are strictly forbidden.
4. **Deterministic Reproducibility**: Physical models use seeded random generators to ensure identical scenario replays across test runs.

---

## 2. Subsystems Deep-Dive

### 2.1 Causal Physics Engine
**Location:** `backend/simulation/causal.py`

Instead of relying on disconnected random number generators, the platform models the factory line using first-principles physics and reduced-order degradation dynamics:

- **Thermal Dissipation & Power**: Electrical energy is derived from physical three-phase voltage, current, and power factor:
  $$P = \sqrt{3} \cdot V \cdot I \cdot \cos\phi$$
- **Tool Wear & Cutting Forces**: On `CNC-01`, spindle tool wear accelerates based on cutting forces and spindle speed ($RPM$). Tool wear directly increases vibration and cutting temperature while degrading dimensional accuracy.
- **Hydraulic & Mechanical Degradation**: `STAMPING-01` models cylinder seal friction, pressure drops, and die wear.
- **Idle-State Physics Attenuation**: When stations are in `IDLE`, `MAINTENANCE`, or `FAULT`, tool wear and bearing degradation stop, cutting forces decay to zero, and temperatures cool asymptotically toward ambient ($25^\circ\text{C}$).
- **State Machine Transitions**: Each station transitions strictly through `IDLE`, `RUNNING`, `WARNING`, `DEGRADED`, `FAULT`, and `MAINTENANCE` driven by physics thresholds and operator commands.

### 2.2 Event Bus & MQTT Protocol
**Location:** `mosquitto/`

The event bus uses Eclipse Mosquitto to decouple edge telemetry from backend processing.

- **Topic Taxonomy**:
  ```text
  factory/v1/{machine_id}/telemetry   # Sensor metrics (QoS 0, un-retained)
  factory/v1/{machine_id}/state       # State transitions (QoS 1, un-retained)
  factory/v1/{machine_id}/fault       # Alarms & fault codes (QoS 1, retained)
  factory/v1/{machine_id}/production  # Discrete part completions (QoS 1, un-retained)
  factory/v1/{machine_id}/command     # Control directives (QoS 1, un-retained)
  factory/v1/system/summary           # Plant-wide KPI summaries (QoS 0, un-retained)
  ```
- **Dual Ports**:
  - `1883`: Standard TCP MQTT for internal services and simulators.
  - `9001`: WebSockets for real-time browser streaming directly to the frontend.

### 2.3 Live Twin State Reducer
**Location:** `backend/services/live_twin.py`

The Live Twin maintains a single source of truth (`TwinDocument`) for every machine:

- **Monotonic Sequence Validation**: Incoming events carry sequential numbers. Out-of-order events are detected, preserving document consistency.
- **Idempotent State Reduction**: Duplicate message deliveries (QoS 1 retries) do not corrupt telemetry or cumulative counters.
- **Latency Tracking**: For every incoming event, the reducer computes:
  - `delivery_latency_ms`: Ingestion timestamp minus generation timestamp.
  - `processing_latency_ms`: Execution time taken by the reducer.
  - `source_age_ms`: Current wall time minus original sensor timestamp.

### 2.4 Persistence Layer
**Location:** `backend/services/twin_repository.py`

Data persistence is abstracted through a clean repository pattern:

- **MongoDB Collections**:
  - `twins`: Current state document of each active machine twin.
  - `telemetry`: Time-series sensor history for sparklines and analysis.
  - `production_tokens`: Lineage of individual manufactured parts.
  - `scenarios`: What-if simulation parameters, inputs, and comparative results.
- **In-Memory Fallback**: For automated unit tests and lightweight local execution without MongoDB, an in-memory repository implementation provides identical functional semantics.

### 2.5 Process Twin & Discrete Token Lineage
**Location:** `backend/services/process_twin.py`

While the Live Twin tracks individual machines, the **Process Twin** tracks the line as a coupled system:

- **Sequential DAG Balancing**: Models the sequential material flow:
  $$\text{STAMPING-01} \longrightarrow \text{CNC-01} \longrightarrow \text{WELDING-01} \longrightarrow \text{INSPECTION-01} \longrightarrow \text{PACKAGING-01}$$
- **Binding Bottleneck Detection**: Implements Theory of Constraints (TOC) to identify the slowest station, effective cycle times, and line slack time:
  $$\text{Capacity} = \frac{3600}{\max(\text{CycleTime}_i)} \text{ parts/hr}$$
- **Discrete Production Tokens**: Individual parts carry unique UUIDs, tracking:
  - Batch identifiers and creation timestamps.
  - Complete station passage history (`lineage: string[]`).
  - Carried physical flags (`stamping_force_kn`, `cnc_cutting_force_kn`, `welding_current_a`).
  - Quality verdicts (`pass`, `fail`, `pending`).
- **Upstream Defect Root-Cause Attribution**: When `INSPECTION-01` detects a reject, the platform inspects the token's historical telemetry flags to attribute the root cause to upstream stations (e.g. Stamping die wear vs. CNC spindle chatter vs. Welding electrode drift).

### 2.6 Scenario Worker & What-If Studio
**Location:** `backend/services/scenario_worker.py`

Provides predictive forward simulation without disrupting live production:

- **Snapshot Forking**: Freezes an immutable snapshot of all 5 Live Twins (`FrozenLineSnapshot`).
- **Isolated Simulation**: Rehydrates twin states into an ephemeral causal physics instance and projects the line forward over a specified horizon (e.g. 30s, 60s, 120s, 300s).
- **Intervention Presets**:
  - *Preventive CNC Tool Change*: Simulates resetting tool wear at `CNC-01` to 0%.
  - *Coolant Pump Failure*: Simulates thermal runaway on the CNC spindle.
  - *Line Cadence Boost*: Tests a 20% acceleration across Stamping and CNC.
  - *Welding Electrode Degradation*: Evaluates weld defect rates under rapid electrode wear.
- **Comparative Deltas**: Calculates net differences between baseline and counterfactual runs (Output Delta, Quality Delta, Energy Delta, and Bottleneck Shifts).

### 2.7 Industrial Dashboard
**Location:** `frontend/`

A high-density React 19 + TypeScript web application built with Vite:

- **Live-First Architecture**: Connects directly to FastAPI and Mosquitto without mock fallbacks.
- **8 Dedicated Views**:
  1. `Overview`: Plant OEE, Asset Integrity dial gauges, 5-station status flow, real-time multi-machine health trajectory, root-cause diagnostic matrix, and quick fault injection.
  2. `Production`: Sequential DAG balancing, binding constraint highlight, live production token stream, token inspection drawer, and defect attribution analysis.
  3. `Digital Twin`: What-If Scenario Studio, intervention selector, comparative run table, live twin registry with sequence IDs, and DAG hierarchy.
  4. `Machines`: High-density station telemetry table with combined Station/Machine column, anomaly scores, health, and output.
  5. `Machine Detail`: Station deep-dive with calibrated gauges, ISO baselines & tolerances, 4-metric historical sparklines with normal distributions, and fault injection/reset controls.
  6. `Predictive Maintenance`: Machine health, remaining useful life (RUL) cycle estimates, condition assessment, and recommended operator actions.
  7. `Analytics`: Multi-station comparison tabs (Production, Energy, Health, Cycle Time) and rolling plant power consumption.
  8. `Events`: Centralized plant event log with severity filtering, machine filtering, and full-text search.
  9. `System`: Infrastructure health for all 8 microservices and synchronization latency measurements.

---

## 3. The 5 Manufacturing Stations

| Station ID | Type | Nominal Cycle | Nominal RPM | Calibrated Baseline Signals | Primary Failure Modes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`STAMPING-01`** | Hydraulic Press | 8.5 s | 1200 RPM | 110 kN Force, 125 bar Pressure, 2.0 mm/s Vib, 55°C | Hydraulic pressure loss, cylinder friction, die wear |
| **`CNC-01`** | 5-Axis Milling | 42.0 s *(Bottleneck)* | 3400 RPM | 7.2 kN Force, 8.0 A Current, 3.2 mm/s Vib, 65°C | Tool flank wear, spindle bearing degradation, coolant failure |
| **`WELDING-01`** | Robotic MIG Cell | 15.0 s | — | 45.0 A Current, 1.8 mm/s Vib, 80°C | Electrode wear, arc current drift, water-cooled nozzle overload |
| **`INSPECTION-01`** | 3D Laser & CMM | 6.0 s | — | 2.5 A Current, 0.4 mm/s Vib, 28°C | Laser triangulation drift, CMM gantry vibration, camera exposure drop |
| **`PACKAGING-01`** | Automated Palletizer | 10.0 s | 800 RPM | 4.0 A Current, 1.2 mm/s Vib, 32°C | Conveyor roller jam, vacuum gripper pressure loss, motor overheat |

---

## 4. API Reference

### System & Readiness
- `GET /ready`: Returns full operational status of gateway, simulator, live twins, persistence, and MQTT.
- `GET /health`: Basic health check.
- `GET /summary`: Line-wide factory summary (OEE, energy, output, telemetry rates).

### Live Twin Management
- `GET /api/v1/twins`: List all active machine twin documents.
- `GET /api/v1/twins/{machine_id}`: Retrieve current state document for a specific machine.
- `GET /api/v1/twins/{machine_id}/telemetry?limit=60`: Time-series sensor history.

### Process Twin & Lineage
- `GET /api/v1/process/topology`: DAG node and edge topology.
- `GET /api/v1/process/view`: Process-level snapshot including active tokens and station utilization.
- `GET /api/v1/process/bottleneck`: Detailed bottleneck analysis, binding station, and slack times.
- `GET /api/v1/process/tokens?limit=30`: List recent production tokens and lineage.
- `POST /api/v1/process/tokens/emit`: Manually inject a production token into the DAG.
- `GET /api/v1/process/defects?limit=50`: Defect incident list and upstream station attribution.

### Scenario Worker (What-If)
- `GET /api/v1/scenarios/presets`: List available intervention presets.
- `POST /api/v1/scenarios/run`: Execute an isolated counterfactual forward simulation from an immutable snapshot.
- `GET /api/v1/scenarios`: List historical scenario results.

### Fault Injection & Simulation Control
- `POST /simulate/degrade_cnc`: Trigger critical tool wear on `CNC-01`.
- `POST /simulate/reset_cnc`: Recalibrate `CNC-01` to nominal baseline.
- `POST /simulate/reset_all`: Reset all factory machines and reinitialize simulation run.
- `POST /machines/{machine_id}/fault`: Inject custom fault type and severity.

---

## 5. Getting Started

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** and **npm**
- **Eclipse Mosquitto** (optional for local REST-only mode; required for MQTT streaming)
- **MongoDB 6+** (optional; backend defaults to in-memory repository if MongoDB is unavailable)

### Backend Setup

```bash
cd dashboard/backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate      # Windows
source venv/bin/activate    # Linux / macOS

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server with live reload
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
The interactive API documentation is accessible at `http://127.0.0.1:8000/docs`.

### Frontend Setup

```bash
cd dashboard/frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
The dashboard will be available at `http://localhost:5173`.

### MQTT Broker Setup

If using Mosquitto locally:
```bash
# Start broker with the provided configuration
mosquitto -c dashboard/mosquitto/mosquitto.conf
```
- Port `1883`: TCP MQTT broker
- Port `9001`: WebSocket MQTT broker

### Running Unit & Verification Tests

```bash
cd dashboard/backend

# Run the full unit test suite (45 tests)
python -m unittest discover -s tests -p "test_*.py"

# Run IoT engineer verification suite
python ..\..\scratch\verify_bug_fixes.py
```

---

## 6. Project Delivery Phases

| Phase | Scope | Status |
|---|---|---|
| **0** | Foundation, design contract, progress tracking, test plan | **Complete** |
| **1** | Domain contracts and causal physics simulation | **Complete** |
| **2** | Live Twin service, persistence, idempotent reducer, true latency | **Complete** |
| **3** | Process Twin, frozen snapshot, production tokens, DAG bottleneck & defect tracing | **Complete** |
| **4** | Scenario Worker, snapshot forking, isolated counterfactual forward simulation | **Complete** |
| **5** | Dashboard integration, live-first policy, UI decluttering, end-to-end testing | **Complete** |
| **6** | Container and Kubernetes deployment (Dockerfiles, Compose, manifests) | *In Progress* |
| **7** | Observability, metric export, automated fault injection benchmarks | *Planned* |
| **8** | Research report closeout and reproducibility package | *Planned* |
