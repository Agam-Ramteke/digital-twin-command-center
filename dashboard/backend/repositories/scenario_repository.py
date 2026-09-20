"""Scenario persistence contracts and thread-safe in-memory adapter."""

from __future__ import annotations

from threading import RLock
from typing import Protocol

from domain.contracts import ScenarioRunResult


class ScenarioRepository(Protocol):
    """Persistence operations for Scenario Worker results (§4.3, ARCHITECTURE.md)."""

    def save(self, scenario: ScenarioRunResult) -> None: ...

    def get(self, scenario_id: str) -> ScenarioRunResult | None: ...

    def list_all(self, *, limit: int = 50) -> list[ScenarioRunResult]: ...

    def delete(self, scenario_id: str) -> bool: ...

    def close(self) -> None: ...


class InMemoryScenarioRepository:
    """Thread-safe development and unit-test repository adapter for Scenarios."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._scenarios: dict[str, ScenarioRunResult] = {}

    def save(self, scenario: ScenarioRunResult) -> None:
        with self._lock:
            self._scenarios[scenario.scenario_id] = scenario

    def get(self, scenario_id: str) -> ScenarioRunResult | None:
        with self._lock:
            return self._scenarios.get(scenario_id)

    def list_all(self, *, limit: int = 50) -> list[ScenarioRunResult]:
        if limit < 1 or limit > 1000:
            raise ValueError("limit must be between 1 and 1000")
        with self._lock:
            ordered = sorted(
                self._scenarios.values(),
                key=lambda s: s.created_at,
                reverse=True,
            )
            return ordered[:limit]

    def delete(self, scenario_id: str) -> bool:
        with self._lock:
            return self._scenarios.pop(scenario_id, None) is not None

    def close(self) -> None:
        """Protocol symmetry; in-memory storage holds no OS resources."""
