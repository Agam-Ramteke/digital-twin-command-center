"""HTTP-level checks for the dashboard compatibility API."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from main import app
from simulation.causal import build_default_factory


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)

    def test_health_and_readiness(self) -> None:
        health = self.client.get("/health")
        readiness = self.client.get("/ready")

        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")
        self.assertEqual(readiness.status_code, 200)
        self.assertTrue(readiness.json()["simulation_running"])

    def test_machine_summary_and_fault_control_flow(self) -> None:
        machines = self.client.get("/machines")
        summary = self.client.get("/summary")
        fault = self.client.post(
            "/machines/CNC-01/inject-fault",
            json={"fault_type": "tool_wear", "severity": "Critical"},
        )
        state = self.client.get("/simulate/state")

        self.assertEqual(machines.status_code, 200)
        self.assertEqual(len(machines.json()), 5)
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(fault.status_code, 200)
        self.assertTrue(state.json()["cnc_degrading"])

    def test_unknown_machine_returns_not_found(self) -> None:
        response = self.client.get("/machines/NOT-A-MACHINE")
        self.assertEqual(response.status_code, 404)

    def test_versioned_event_ingestion_materializes_live_twin(self) -> None:
        factory = build_default_factory(run_id="api-live-twin", seed=500)
        tick = factory.tick()
        event = next(item for item in tick.events if item.machine_id == "CNC-01")

        ingestion = self.client.post("/api/v1/events", json=event.model_dump(mode="json"))
        twin = self.client.get("/api/v1/twins/CNC-01")
        history = self.client.get("/api/v1/twins/CNC-01/telemetry?limit=10")

        self.assertEqual(ingestion.status_code, 202)
        self.assertEqual(ingestion.json()["identity"]["machine_id"], "CNC-01")
        self.assertEqual(twin.status_code, 200)
        self.assertGreaterEqual(len(history.json()), 1)

    def test_live_twin_list_and_not_found_handling(self) -> None:
        twins_response = self.client.get("/api/v1/twins")
        self.assertEqual(twins_response.status_code, 200)
        self.assertIsInstance(twins_response.json(), list)

        not_found_twin = self.client.get("/api/v1/twins/NON-EXISTENT")
        self.assertEqual(not_found_twin.status_code, 404)

        not_found_telemetry = self.client.get("/api/v1/twins/NON-EXISTENT/telemetry")
        self.assertEqual(not_found_telemetry.status_code, 404)

    def test_invalid_event_ingestion_returns_422(self) -> None:
        factory = build_default_factory(run_id="api-invalid-test", seed=501)
        tick = factory.tick()
        event = next(item for item in tick.events if item.machine_id == "CNC-01")
        # Invalidate machine_id
        invalid_event = event.model_copy(update={"machine_id": "STAMPING-01"})
        response = self.client.post("/api/v1/events", json=invalid_event.model_dump(mode="json"))
        self.assertEqual(response.status_code, 422)

    def test_process_twin_api_endpoints(self) -> None:
        # 1. Topology
        topology_res = self.client.get("/api/v1/process/topology")
        self.assertEqual(topology_res.status_code, 200)
        self.assertEqual(len(topology_res.json()["nodes"]), 5)
        self.assertEqual(len(topology_res.json()["edges"]), 4)

        # Ingest events for all 5 stations so Live Twin repository is fully populated
        factory = build_default_factory(run_id="api-process-test", seed=600)
        tick = factory.tick()
        for ev in tick.events:
            self.client.post("/api/v1/events", json=ev.model_dump(mode="json"))

        # 2. Frozen snapshot
        snapshot_res = self.client.get("/api/v1/process/snapshot")
        self.assertEqual(snapshot_res.status_code, 200)
        self.assertEqual(len(snapshot_res.json()["twins"]), 5)

        # 3. Process view
        view_res = self.client.get("/api/v1/process/view")
        self.assertEqual(view_res.status_code, 200)
        self.assertIn("metrics", view_res.json())
        self.assertIn("snapshot", view_res.json())

        # 4. Bottleneck analysis
        bottleneck_res = self.client.get("/api/v1/process/bottleneck")
        self.assertEqual(bottleneck_res.status_code, 200)
        self.assertEqual(bottleneck_res.json()["binding_machine_id"], "CNC-01")

        # 5. Token emission and retrieval
        token_res = self.client.post("/api/v1/process/tokens")
        self.assertEqual(token_res.status_code, 201)
        token_id = token_res.json()["token_id"]

        tokens_list = self.client.get("/api/v1/process/tokens?limit=10")
        self.assertEqual(tokens_list.status_code, 200)
        self.assertGreaterEqual(len(tokens_list.json()), 1)

        single_token = self.client.get(f"/api/v1/process/tokens/{token_id}")
        self.assertEqual(single_token.status_code, 200)
        self.assertEqual(single_token.json()["token_id"], token_id)

        not_found_token = self.client.get("/api/v1/process/tokens/non-existent-token")
        self.assertEqual(not_found_token.status_code, 404)

        # 6. Defect tracing
        defects_res = self.client.get("/api/v1/process/defects/trace?limit=50")
        self.assertEqual(defects_res.status_code, 200)
        self.assertIn("attributions", defects_res.json())

    def test_scenario_worker_api_endpoints(self) -> None:
        """Verify Phase 4 Scenario Worker REST endpoints (§4.3, §4.4)."""
        # 1. Preset listing
        presets_res = self.client.get("/api/v1/scenarios/presets")
        self.assertEqual(presets_res.status_code, 200)
        presets = presets_res.json()
        self.assertGreaterEqual(len(presets), 4)

        # 2. Run preset scenario
        run_preset_res = self.client.post("/api/v1/scenarios/presets/preventive_tool_change/run?horizon_seconds=30")
        self.assertEqual(run_preset_res.status_code, 200)
        scenario_data = run_preset_res.json()
        scenario_id = scenario_data["scenario_id"]
        self.assertIn("baseline", scenario_data)
        self.assertIn("counterfactual", scenario_data)
        self.assertIn("comparison", scenario_data)

        # 3. List scenarios
        list_res = self.client.get("/api/v1/scenarios?limit=10")
        self.assertEqual(list_res.status_code, 200)
        scenarios_list = list_res.json()
        self.assertGreaterEqual(len(scenarios_list), 1)

        # 4. Get specific scenario
        get_res = self.client.get(f"/api/v1/scenarios/{scenario_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["scenario_id"], scenario_id)

        # 5. Run custom scenario fork request
        custom_payload = {
            "name": "Custom Speed Test",
            "horizon_seconds": 25.0,
            "seed": 12345,
            "overrides": [
                {"machine_id": "CNC-01", "cycle_time_multiplier": 0.85},
            ],
        }
        custom_res = self.client.post("/api/v1/scenarios/run", json=custom_payload)
        self.assertEqual(custom_res.status_code, 200)
        custom_id = custom_res.json()["scenario_id"]

        # 6. Delete scenario
        del_res = self.client.delete(f"/api/v1/scenarios/{custom_id}")
        self.assertEqual(del_res.status_code, 200)

        not_found_res = self.client.get(f"/api/v1/scenarios/{custom_id}")
        self.assertEqual(not_found_res.status_code, 404)


if __name__ == "__main__":
    unittest.main()



