"""Application services that compose contracts, repositories, and transports."""

try:
    from .bedrock_service import BedrockService, BOTO3_AVAILABLE
except (ImportError, Exception):  # pragma: no cover
    BedrockService = None  # type: ignore[assignment, misc]
    BOTO3_AVAILABLE = False

from .live_twin import LiveTwinConsumeResult, LiveTwinService
from .mqtt_live_twin import LiveTwinMqttConsumer
from .process_twin import ProcessTwinService
from .scenario_worker import ScenarioWorkerService
from .scenario_reasoning import ScenarioReasoningService

__all__ = [
    "BedrockService",
    "BOTO3_AVAILABLE",
    "LiveTwinConsumeResult",
    "LiveTwinMqttConsumer",
    "LiveTwinService",
    "ProcessTwinService",
    "ScenarioWorkerService",
    "ScenarioReasoningService",
]
