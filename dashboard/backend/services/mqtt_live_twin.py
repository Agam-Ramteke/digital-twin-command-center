"""MQTT adapter that forwards canonical telemetry envelopes to Live Twins."""

from __future__ import annotations

import logging

try:
    import paho.mqtt.client as mqtt

    MQTT_AVAILABLE = True
except ImportError:  # pragma: no cover - deployment dependency check
    MQTT_AVAILABLE = False

from domain.contracts import EventEnvelope
from .live_twin import LiveTwinService


logger = logging.getLogger(__name__)


class LiveTwinMqttConsumer:
    """Subscribe to canonical telemetry and invoke one shared LiveTwinService."""

    def __init__(self, service: LiveTwinService, *, host: str, port: int) -> None:
        self._service = service
        self._host = host
        self._port = port
        self._client: object | None = None
        self.connected = False

    def start(self) -> None:
        if not MQTT_AVAILABLE or self._client is not None:
            return
        try:
            try:
                client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="digital_twin_live_twin")
            except (AttributeError, TypeError):
                client = mqtt.Client(client_id="digital_twin_live_twin")

            def on_connect(client, userdata, flags, reason_code, properties=None):
                success = getattr(reason_code, "value", reason_code) == 0
                self.connected = bool(success)
                if success:
                    client.subscribe("factory/v1/+/telemetry", qos=0)
                    logger.info("Live Twin consumer connected to MQTT at %s:%s", self._host, self._port)
                else:
                    logger.warning("Live Twin MQTT connection rejected: %s", reason_code)

            def on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
                self.connected = False

            def on_message(client, userdata, message):
                try:
                    event = EventEnvelope.model_validate_json(message.payload)
                    result = self._service.consume(event)
                    if result.out_of_order:
                        logger.warning("Stored out-of-order event %s for %s", event.event_id, event.machine_id)
                except Exception:
                    logger.exception("Live Twin rejected MQTT telemetry on %s", message.topic)

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect
            client.on_message = on_message
            client.connect_async(self._host, self._port, 60)
            client.loop_start()
            self._client = client
        except Exception:  # pragma: no cover - broker availability is environment-specific
            logger.exception("Live Twin MQTT client could not start")
            self._client = None
            self.connected = False

    def stop(self) -> None:
        client = self._client
        self._client = None
        self.connected = False
        if client is not None:
            try:
                client.loop_stop()
                client.disconnect()
            except Exception:  # pragma: no cover - shutdown must remain best effort
                logger.exception("Live Twin MQTT client did not shut down cleanly")
