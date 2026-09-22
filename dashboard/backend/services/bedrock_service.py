"""Amazon Bedrock integration service for the Digital Twin platform.

Provides fast response generation (GPT-5.6 Luna) and deep causal reasoning
(GPT-6 Astra / Claude) for digital twin diagnostics, what-if scenario analysis,
and anomaly explanations.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Iterator, Optional
import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class BedrockService:
    def __init__(
        self,
        profile_name: str = "Agam",
        region_name: str = "ap-south-1",
        fast_model_id: str = "in.openai.gpt-5.6-luna",
        reasoning_model_id: str = "global.openai.gpt-6-astra",
    ) -> None:
        self.profile_name = profile_name
        self.region_name = region_name
        self.fast_model_id = fast_model_id
        self.reasoning_model_id = reasoning_model_id
        self._client: Optional[Any] = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                session = boto3.Session(
                    profile_name=self.profile_name,
                    region_name=self.region_name,
                )
                self._client = session.client(
                    "bedrock-runtime",
                    region_name=self.region_name,
                )
            except Exception as exc:
                logger.error("Failed to initialize AWS Bedrock client: %s", exc)
                raise
        return self._client

    def generate(
        self,
        prompt: str,
        system_prompt: str = "You are an expert AI industrial engineer for a factory digital twin.",
        model_id: Optional[str] = None,
        max_tokens: int = 1500,
        temperature: float = 0.7,
    ) -> str:
        """Invoke model with single prompt and return text output."""
        selected_model = model_id or self.fast_model_id
        client = self._get_client()

        try:
            response = client.converse(
                modelId=selected_model,
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": prompt}],
                    }
                ],
                system=[{"text": system_prompt}],
                inferenceConfig={
                    "maxTokens": max_tokens,
                    "temperature": temperature,
                },
            )
            return response["output"]["message"]["content"][0]["text"]
        except (BotoCoreError, ClientError) as exc:
            logger.error("Bedrock converse failed for model %s: %s", selected_model, exc)
            raise RuntimeError(f"Bedrock invocation error on model '{selected_model}': {exc}") from exc

    def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "You are an expert AI industrial engineer for a factory digital twin.",
        model_id: Optional[str] = None,
    ) -> Iterator[str]:
        """Stream model responses chunk by chunk."""
        selected_model = model_id or self.fast_model_id
        client = self._get_client()

        try:
            response = client.converse_stream(
                modelId=selected_model,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                system=[{"text": system_prompt}],
            )
            for event in response.get("stream", []):
                if "contentBlockDelta" in event:
                    yield event["contentBlockDelta"]["delta"].get("text", "")
        except (BotoCoreError, ClientError) as exc:
            logger.error("Bedrock converse_stream failed for model %s: %s", selected_model, exc)
            raise RuntimeError(f"Bedrock streaming error on model '{selected_model}': {exc}") from exc

    def diagnose_bottleneck(
        self,
        bottleneck_data: dict[str, Any],
        live_machines: list[dict[str, Any]],
    ) -> str:
        """Deep analysis of line bottlenecks and recommended operator actions."""
        prompt = (
            f"Analyze the following factory line bottleneck report and machine states:\n"
            f"Bottleneck Report: {json.dumps(bottleneck_data, indent=2)}\n"
            f"Machine Telemetry Summary: {json.dumps(live_machines, indent=2)}\n\n"
            "Provide:\n"
            "1. Root cause assessment of the bottleneck.\n"
            "2. Impact on downstream throughput.\n"
            "3. Immediate actionable control recommendations (speed adjustment, buffer management, or maintenance)."
        )
        return self.generate(
            prompt=prompt,
            system_prompt=(
                "You are an industrial automation and causal digital twin specialist. "
                "Provide crisp, structured, actionable engineering advice."
            ),
            model_id=self.reasoning_model_id,
        )

    def explain_scenario(
        self,
        scenario_result: dict[str, Any],
    ) -> str:
        """Deep what-if causal evaluation for a completed scenario fork."""
        prompt = (
            f"Evaluate this scenario simulation result:\n"
            f"{json.dumps(scenario_result, indent=2)}\n\n"
            "Explain:\n"
            "1. Did the injected intervention achieve better OEE and cycle time?\n"
            "2. What unintended side-effects or defect propagation occurred?\n"
            "3. Final recommendation on whether to apply this intervention to the live line."
        )
        return self.generate(
            prompt=prompt,
            system_prompt="You are a senior process optimization scientist reviewing digital twin simulation outcomes.",
            model_id=self.reasoning_model_id,
        )
