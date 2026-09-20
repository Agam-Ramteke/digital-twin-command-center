"""MongoDB persistence adapter for Scenario Worker results."""

from __future__ import annotations

from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient

from domain.contracts import ScenarioRunResult


class MongoScenarioRepository:
    """Persist scenario run results in MongoDB `scenarios` collection."""

    def __init__(
        self,
        uri: str,
        *,
        database_name: str = "digital_twin",
        server_selection_timeout_ms: int = 3_000,
    ) -> None:
        self._client = MongoClient(uri, serverSelectionTimeoutMS=server_selection_timeout_ms)
        self._database = self._client[database_name]
        self._scenarios = self._database["scenarios"]
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        self._scenarios.create_index("scenario_id", unique=True)
        self._scenarios.create_index([("created_at", DESCENDING)])

    @staticmethod
    def _document_for_mongo(scenario: ScenarioRunResult) -> dict[str, Any]:
        result = scenario.model_dump(mode="json")
        result["_id"] = scenario.scenario_id
        return result

    @staticmethod
    def _without_mongo_id(document: dict[str, Any]) -> dict[str, Any]:
        result = dict(document)
        result.pop("_id", None)
        return result

    def save(self, scenario: ScenarioRunResult) -> None:
        self._scenarios.replace_one(
            {"_id": scenario.scenario_id},
            self._document_for_mongo(scenario),
            upsert=True,
        )

    def get(self, scenario_id: str) -> ScenarioRunResult | None:
        result = self._scenarios.find_one({"_id": scenario_id})
        return ScenarioRunResult.model_validate(self._without_mongo_id(result)) if result else None

    def list_all(self, *, limit: int = 50) -> list[ScenarioRunResult]:
        if limit < 1 or limit > 1000:
            raise ValueError("limit must be between 1 and 1000")
        cursor = self._scenarios.find({}).sort("created_at", DESCENDING).limit(limit)
        return [ScenarioRunResult.model_validate(self._without_mongo_id(item)) for item in cursor]

    def delete(self, scenario_id: str) -> bool:
        result = self._scenarios.delete_one({"_id": scenario_id})
        return result.deleted_count > 0

    def close(self) -> None:
        self._client.close()
