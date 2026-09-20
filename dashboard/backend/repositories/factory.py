"""Runtime repository selection with explicit deployment behavior."""

from __future__ import annotations

from config import Settings
from .mongo_twin_repository import MongoTwinRepository
from .twin_repository import InMemoryTwinRepository, TwinRepository
from .scenario_repository import InMemoryScenarioRepository, ScenarioRepository
from .mongo_scenario_repository import MongoScenarioRepository


def create_twin_repository(settings: Settings) -> TwinRepository:
    if settings.persistence_backend == "memory":
        return InMemoryTwinRepository()
    repository = MongoTwinRepository(
        settings.mongo_uri,
        database_name=settings.mongo_database,
    )
    # Fail fast in explicitly Mongo-backed deployment rather than silently
    # executing an experiment against an ephemeral in-memory database.
    repository.ping()
    return repository


def create_scenario_repository(settings: Settings) -> ScenarioRepository:
    if settings.persistence_backend == "memory":
        return InMemoryScenarioRepository()
    repository = MongoScenarioRepository(
        settings.mongo_uri,
        database_name=settings.mongo_database,
    )
    return repository

