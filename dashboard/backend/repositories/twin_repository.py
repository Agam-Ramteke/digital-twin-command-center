"""Repository contract and deterministic in-memory development adapter."""

from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from typing import Protocol

from domain.contracts import EventEnvelope, TwinDocument


@dataclass(frozen=True)
class RepositoryWriteResult:
    document: TwinDocument
    applied: bool


class TwinRepository(Protocol):
    """Persistence operations required by the Live Twin reducer.

    An implementation must treat an already-seen event id as an idempotent
    no-op. A retry may return the stored document but must set `applied=False`.
    """

    def get_twin(self, machine_id: str) -> TwinDocument | None: ...

    def list_twins(self) -> list[TwinDocument]: ...

    def save_event_and_twin(self, event: EventEnvelope, document: TwinDocument) -> RepositoryWriteResult: ...

    def list_telemetry(self, machine_id: str, *, limit: int = 100) -> list[EventEnvelope]: ...

    def close(self) -> None: ...


class InMemoryTwinRepository:
    """Thread-safe local adapter used only for development and unit tests.

    It mirrors the semantics of the MongoDB adapter closely enough for service
    tests. It is explicitly not a durable deployment target or experiment data
    store: restarting the process drops all state.
    """

    MAX_TELEMETRY_PER_MACHINE = 5000

    def __init__(self) -> None:
        self._lock = RLock()
        self._twins: dict[str, TwinDocument] = {}
        self._events: dict[str, EventEnvelope] = {}
        self._telemetry_by_machine: dict[str, list[str]] = {}

    def get_twin(self, machine_id: str) -> TwinDocument | None:
        with self._lock:
            return self._twins.get(machine_id)

    def list_twins(self) -> list[TwinDocument]:
        with self._lock:
            return sorted(self._twins.values(), key=lambda twin: twin.identity.station_index)

    def save_event_and_twin(self, event: EventEnvelope, document: TwinDocument) -> RepositoryWriteResult:
        with self._lock:
            if event.event_id in self._events:
                existing = self._twins.get(event.machine_id)
                if existing is None:
                    raise RuntimeError(f"Event {event.event_id} was recorded without its Twin document")
                return RepositoryWriteResult(document=existing, applied=False)

            self._events[event.event_id] = event
            self._twins[event.machine_id] = document
            if event.kind.value == "telemetry":
                history = self._telemetry_by_machine.setdefault(event.machine_id, [])
                history.append(event.event_id)
                # Sliding window: prune oldest telemetry when exceeding retention cap
                if len(history) > self.MAX_TELEMETRY_PER_MACHINE:
                    excess = len(history) - self.MAX_TELEMETRY_PER_MACHINE
                    evicted_ids = history[:excess]
                    del history[:excess]
                    for evicted_id in evicted_ids:
                        self._events.pop(evicted_id, None)
            return RepositoryWriteResult(document=document, applied=True)

    def list_telemetry(self, machine_id: str, *, limit: int = 100) -> list[EventEnvelope]:
        if limit < 1 or limit > 10_000:
            raise ValueError("limit must be between 1 and 10000")
        with self._lock:
            event_ids = self._telemetry_by_machine.get(machine_id, [])[-limit:]
            return [self._events[event_id] for event_id in reversed(event_ids)]

    def close(self) -> None:
        """Kept for protocol symmetry; no resources are held."""
