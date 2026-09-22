"""Unit tests for AWS Bedrock integration service."""

import unittest
from unittest.mock import MagicMock, patch

from services.bedrock_service import BedrockService


class BedrockServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = BedrockService(
            profile_name="Agam",
            region_name="ap-south-1",
            fast_model_id="in.openai.gpt-5.6-luna",
            reasoning_model_id="global.openai.gpt-6-astra",
        )

    @patch("services.bedrock_service.boto3.Session")
    def test_generate_success(self, mock_session_cls: MagicMock) -> None:
        mock_client = MagicMock()
        mock_session = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_cls.return_value = mock_session

        mock_client.converse.return_value = {
            "output": {
                "message": {
                    "content": [{"text": "Machine CNC-01 is operating within normal parameters."}]
                }
            }
        }

        response = self.service.generate("Check CNC-01 health status")
        self.assertIn("CNC-01", response)
        mock_client.converse.assert_called_once()

    @patch("services.bedrock_service.boto3.Session")
    def test_diagnose_bottleneck(self, mock_session_cls: MagicMock) -> None:
        mock_client = MagicMock()
        mock_session = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_cls.return_value = mock_session

        mock_client.converse.return_value = {
            "output": {
                "message": {
                    "content": [{"text": "Root cause: CNC buffer overflow caused by high cycle times."}]
                }
            }
        }

        bottleneck_data = {"bottleneck_station": "CNC", "severity": "HIGH"}
        machines = [{"machine_id": "CNC-01", "temperature": 82.5}]

        result = self.service.diagnose_bottleneck(bottleneck_data, machines)
        self.assertIn("Root cause", result)
        self.assertEqual(mock_client.converse.call_args[1]["modelId"], "global.openai.gpt-6-astra")


if __name__ == "__main__":
    unittest.main()
