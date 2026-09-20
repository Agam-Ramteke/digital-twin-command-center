"""Small, explicit runtime configuration layer.

Environment variables are deliberately used instead of a cloud-specific config
system so the same image works locally, in Docker Compose, and in Kubernetes.
"""

from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    persistence_backend: str
    mongo_uri: str
    mongo_database: str
    mqtt_host: str
    mqtt_port: int
    mqtt_live_twin_enabled: bool

    @classmethod
    def from_environment(cls) -> "Settings":
        backend = os.getenv("PERSISTENCE_BACKEND", "memory").strip().lower()
        if backend not in {"memory", "mongo"}:
            raise ValueError("PERSISTENCE_BACKEND must be 'memory' or 'mongo'")
        return cls(
            persistence_backend=backend,
            mongo_uri=os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
            mongo_database=os.getenv("MONGODB_DATABASE", "digital_twin"),
            mqtt_host=os.getenv("MQTT_HOST", "localhost"),
            mqtt_port=int(os.getenv("MQTT_PORT", "1883")),
            mqtt_live_twin_enabled=os.getenv("MQTT_LIVE_TWIN_ENABLED", "true").lower()
            in {"1", "true", "yes"},
        )
