"""MongoDB persistence adapter for production Live Twin deployments."""

from __future__ import annotations

from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

from domain.contracts import EventEnvelope, TwinDocument
from .twin_repository import RepositoryWriteResult


class MongoTwinRepository:
    """Persist one current Twin document plus immutable event history.

    `events._id` is the idempotency barrier. MongoDB standalone deployments do
    not support multi-document transactions, so a failed Twin update removes
    the just-created event marker best-effort. The Kubernetes deployment should
    use a replica set when stronger transaction guarantees become necessary.
    """

    def __init__(
        self,
        uri: str,
        *,
        database_name: str = "digital_twin",
        server_selection_timeout_ms: int = 3_000,
    ) -> None:
        self._client = MongoClient(uri, serverSelectionTimeoutMS=server_selection_timeout_ms)
        self._database = self._client[database_name]
        self._twins = self._database["twins"]
        self._events = self._database["events"]
        self._telemetry = self._database["telemetry"]
        self._ensure_indexes()

    def ping(self) -> None:
        self._client.admin.command("ping")

    def _ensure_indexes(self) -> None:
        self._events.create_index([("machine_id", ASCENDING), ("generated_at", DESCENDING)])
        self._telemetry.create_index("event_id", unique=True)
        self._telemetry.create_index([("machine_id", ASCENDING), ("generated_at", DESCENDING)])
        self._twins.create_index("identity.station_index")

    @staticmethod
    def _document_for_mongo(document: TwinDocument) -> dict[str, Any]:
        result = document.model_dump(mode="json")
        result["_id"] = document.identity.machine_id
        return result

    @staticmethod
    def _event_for_mongo(event: EventEnvelope) -> dict[str, Any]:
        result = event.model_dump(mode="json")
        result["_id"] = event.event_id
        return result

    @staticmethod
    def _without_mongo_id(document: dict[str, Any]) -> dict[str, Any]:
        result = dict(document)
        result.pop("_id", None)
        return result

    def get_twin(self, machine_id: str) -> TwinDocument | None:
        result = self._twins.find_one({"_id": machine_id})
        return TwinDocument.model_validate(self._without_mongo_id(result)) if result else None

    def list_twins(self) -> list[TwinDocument]:
        cursor = self._twins.find({}).sort("identity.station_index", ASCENDING)
        return [TwinDocument.model_validate(self._without_mongo_id(item)) for item in cursor]

    def save_event_and_twin(self, event: EventEnvelope, document: TwinDocument) -> RepositoryWriteResult:
        event_document = self._event_for_mongo(event)
        try:
            self._events.insert_one(event_document)
        except DuplicateKeyError:
            existing = self.get_twin(event.machine_id)
            if existing is None:
                raise RuntimeError(f"Duplicate event {event.event_id} has no associated Twin document")
            return RepositoryWriteResult(document=existing, applied=False)

        try:
            self._twins.replace_one(
                {"_id": event.machine_id},
                self._document_for_mongo(document),
                upsert=True,
            )
            if event.kind.value == "telemetry":
                telemetry_document = event.model_dump(mode="json")
                telemetry_document["_id"] = event.event_id
                telemetry_document["event_id"] = event.event_id
                self._telemetry.insert_one(telemetry_document)
        except Exception:
            # Avoid permanently suppressing a retry after a known failed write.
            self._events.delete_one({"_id": event.event_id})
            raise
        return RepositoryWriteResult(document=document, applied=True)

    def list_telemetry(self, machine_id: str, *, limit: int = 100) -> list[EventEnvelope]:
        if limit < 1 or limit > 10_000:
            raise ValueError("limit must be between 1 and 10000")
        cursor = self._telemetry.find({"machine_id": machine_id}).sort("generated_at", DESCENDING).limit(limit)
        return [EventEnvelope.model_validate(self._without_mongo_id(item)) for item in cursor]

    def close(self) -> None:
        self._client.close()
