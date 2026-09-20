# Digital Twin Dashboard & Services

This directory contains the full-stack implementation of the **Digital Twin Orchestration Platform**:

- **[`backend/`](backend/)**: FastAPI gateway, causal physics simulation engine (`simulation/causal.py`), Live Twin state reducer (`services/live_twin.py`), Process Twin with DAG token lineage (`services/process_twin.py`), and counterfactual Scenario Worker (`services/scenario_worker.py`).
- **[`frontend/`](frontend/)**: Industrial React 19 + TypeScript dashboard built with Vite, Recharts, and Lucide icons.
- **[`mosquitto/`](mosquitto/)**: Configuration for Eclipse Mosquitto broker (TCP port 1883, WebSocket port 9001).
- **[`docs/`](docs/)**: Architecture contracts (`ARCHITECTURE.md`) and phased delivery tracker (`BUILD_PROGRESS.md`).

For full architecture documentation, causal models, API references, and setup guides, see the root [**README.md**](../README.md).
