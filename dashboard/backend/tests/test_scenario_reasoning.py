import unittest
from repositories.scenario_repository import InMemoryScenarioRepository
from repositories.twin_repository import InMemoryTwinRepository
from services.live_twin import LiveTwinService
from services.process_twin import ProcessTwinService
from services.scenario_worker import ScenarioWorkerService
from services.scenario_reasoning import ScenarioReasoningService
from simulation.causal import build_default_factory


def _populate_test_twins(live_twin_service: LiveTwinService, factory_ticks: int = 5) -> None:
    factory = build_default_factory(seed=12345)
    for _ in range(factory_ticks):
        tick = factory.tick(dt_s=1.0)
        for event in tick.events:
            live_twin_service.consume(event)


class TestScenarioReasoningService(unittest.TestCase):
    def setUp(self):
        self.twin_repo = InMemoryTwinRepository()
        self.live_twin_service = LiveTwinService(self.twin_repo)
        self.process_twin_service = ProcessTwinService(self.live_twin_service)
        self.scenario_repo = InMemoryScenarioRepository()
        _populate_test_twins(self.live_twin_service, factory_ticks=5)

        self.worker_service = ScenarioWorkerService(
            process_twin_service=self.process_twin_service,
            live_twin_service=self.live_twin_service,
            scenario_repository=self.scenario_repo,
        )
        self.snapshot = self.process_twin_service.capture_snapshot()
        self.reasoning_service = ScenarioReasoningService()
        self.run_result = self.worker_service.run_preset("preventive_tool_change", horizon_seconds=60.0)

    def test_analyze_scenario_returns_complete_packages(self):
        analysis = self.reasoning_service.analyze_scenario(
            self.run_result,
            snapshot=self.snapshot,
            shift_quota_target=120,
        )
        self.assertIsNotNone(analysis)
        self.assertIsNotNone(analysis.manager_brief)
        self.assertIsNotNone(analysis.worker_order)
        self.assertGreaterEqual(len(analysis.strategies), 3)

    def test_manager_brief_structure(self):
        analysis = self.reasoning_service.analyze_scenario(
            self.run_result,
            snapshot=self.snapshot,
            shift_quota_target=120,
        )
        brief = analysis.manager_brief
        self.assertIsInstance(brief.financial_advantage_usd, (int, float))
        self.assertIsInstance(brief.shift_quota_feasible, bool)
        self.assertGreater(len(brief.key_tradeoff_summary), 10)
        self.assertGreater(len(brief.ai_reasoning_narrative), 10)

    def test_worker_order_structure(self):
        analysis = self.reasoning_service.analyze_scenario(
            self.run_result,
            snapshot=self.snapshot,
            shift_quota_target=120,
        )
        order = analysis.worker_order
        self.assertIn("CNC", order.target_machine_id)
        self.assertGreater(len(order.sop_procedure_steps), 3)
        self.assertGreater(len(order.safety_loto_steps), 3)
        self.assertGreater(len(order.required_tools_and_parts), 1)
        self.assertGreater(order.estimated_duration_min, 0)

    def test_strategies_matrix(self):
        analysis = self.reasoning_service.analyze_scenario(
            self.run_result,
            snapshot=self.snapshot,
            shift_quota_target=120,
        )
        strategies = analysis.strategies
        strategy_names = [s.name for s in strategies]
        self.assertTrue(any("Preventive" in n or "Immediate" in n for n in strategy_names))
        self.assertTrue(any("Status Quo" in n or "Run to Failure" in n or "Derate" in n for n in strategy_names))
        has_rec = any(s.is_recommended for s in strategies)
        self.assertTrue(has_rec, "At least one strategy must be marked is_recommended")


if __name__ == "__main__":
    unittest.main()
