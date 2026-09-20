"""Persistence adapters for current Live Twin state and event history."""

from .twin_repository import (
    InMemoryTwinRepository,
    RepositoryWriteResult,
    TwinRepository,
)
from .scenario_repository import (
    InMemoryScenarioRepository,
    ScenarioRepository,
)

try:  # MongoDB is optional for unit tests but required in deployment.
    from .mongo_twin_repository import MongoTwinRepository
    from .mongo_scenario_repository import MongoScenarioRepository
except ImportError:  # pragma: no cover - depends on optional dependency installation
    MongoTwinRepository = None  # type: ignore[assignment,misc]
    MongoScenarioRepository = None  # type: ignore[assignment,misc]

__all__ = [
    "InMemoryTwinRepository",
    "MongoTwinRepository",
    "RepositoryWriteResult",
    "TwinRepository",
    "InMemoryScenarioRepository",
    "MongoScenarioRepository",
    "ScenarioRepository",
]

