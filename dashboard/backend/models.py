"""
Pydantic models for the Digital Twin MVP.
Shared data contract between simulator, API, and frontend.
"""

from __future__ import annotations
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional


class StationType(str, Enum):
    STAMPING = "STAMPING"
    CNC = "CNC"
    WELDING = "WELDING"
    INSPECTION = "INSPECTION"
    PACKAGING = "PACKAGING"


class MachineStatus(str, Enum):
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    WARNING = "WARNING"
    DEGRADED = "DEGRADED"
    FAULT = "FAULT"
    MAINTENANCE = "MAINTENANCE"
    OFFLINE = "OFFLINE"


class MachineTelemetry(BaseModel):
    """Core telemetry payload for a single machine."""
    machine_id: str
    station: StationType
    timestamp: str
    status: MachineStatus
    temperature: float = Field(..., description="°C")
    vibration: float = Field(..., description="mm/s")
    rpm: float
    current: float = Field(..., description="Amps")
    production_count: int
    cycle_time: float = Field(..., description="seconds")
    energy_kwh: float
    health: float = Field(..., ge=0, le=100, description="Health %")
    tool_wear: Optional[float] = Field(None, ge=0, le=100, description="Tool wear % (CNC only)")
    anomaly_score: float = Field(..., ge=0, le=1)
    rul_cycles: Optional[int] = Field(None, description="Remaining useful life in cycles (CNC only)")
    latency_ms: float = Field(default=0)


class TwinComparison(BaseModel):
    """Physical vs. Digital Twin state for a single signal."""
    signal: str
    physical: float
    twin: float
    error: float
    unit: str


class MachineTwinState(BaseModel):
    """Digital Twin synchronization state for a machine."""
    machine_id: str
    comparisons: list[TwinComparison]
    sync_percent: float
    data_freshness_ms: float
    telemetry_rate: float


class FactorySummary(BaseModel):
    """Factory-level KPIs aggregated from all machines."""
    oee: float
    total_output: int
    total_energy_kwh: float
    twin_health: float
    machines_online: int
    machines_total: int
    data_freshness_ms: float
    telemetry_rate: float
    timestamp: str


class SimulationState(BaseModel):
    """Current state of the simulation engine."""
    running: bool
    tick: int
    cnc_degrading: bool
    scenario: str
