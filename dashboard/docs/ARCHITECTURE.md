# Target Architecture

This is a build-time contract for the application, not a claim that all
components are already deployed. Consult `BUILD_PROGRESS.md` for completion
status.

## Components

```text
                 +---------------------+
                 | Dashboard (React)   |
                 +----------+----------+
                            | REST / WebSocket
                 +----------v----------+
                 | Dashboard API       |
                 | FastAPI             |
                 +----------+----------+
                            |
        +-------------------+-------------------+
        |                                       |
+-------v--------+                      +-------v--------+
| Process Twin   |                      | Scenario Worker |
| DAG + snapshot |                      | snapshot only   |
+-------+--------+                      +----------------+
        |
+-------v------------------------------------------------+
| Live Twin service                                      |
| state reducer, command handling, idempotency, metrics  |
+-------+---------------------------+-------------------+
        |                           |
        | MQTT                      | MongoDB
+-------v--------+           +------v-------------------+
| Mosquitto      |           | twins + telemetry + runs  |
+-------+--------+           +--------------------------+
        |
+-------v-----------------------------------------------+
| Station simulators / future real OPC-UA adapters       |
+--------------------------------------------------------+
```

## Event topics

The canonical layout is deliberately machine-first and versioned:

```text
factory/v1/{machine_id}/telemetry   QoS 0, not retained
factory/v1/{machine_id}/state       QoS 1, not retained
factory/v1/{machine_id}/fault       QoS 1, retained
factory/v1/{machine_id}/production  QoS 1, not retained
factory/v1/{machine_id}/command     QoS 1, not retained
factory/v1/system/summary           QoS 0, not retained
```

During migration, the dashboard may subscribe to the legacy topics. Do not
remove them until the frontend migration is complete.

## Data ownership

| Data | Owner | Persistence |
|---|---|---|
| Raw telemetry | Simulator / real adapter | Mongo time series collection |
| Current machine state | Live Twin | `twins` collection |
| Production token and lineage | Process Twin | `production_tokens` collection |
| Scenario input/output | Scenario Worker | `scenarios` collection |
| Experiment metadata/results | Experiment runner | `experiment_runs` collection |

## Boundaries that must not blur

- A simulator produces observations; it does not decide dashboard state.
- The Process Twin computes across machine snapshots; it does not own a
  station's live state.
- A Scenario Worker operates from an immutable snapshot and reports results;
  it does not publish live telemetry or commands.
- The dashboard displays status; it does not synthesize test data in experiment
  mode.

## Deployment progression

1. Local development: Docker Compose for broker, MongoDB, backend, frontend.
2. Single-node Kubernetes: namespace, ConfigMaps/Secrets, deployments,
   services, probes, resources.
3. Measurement configuration: repeatable twin replica counts, metrics export,
   controlled fault and network-degradation injection.
