/* Shared TypeScript types matching the backend data contract. */

export type StationType = 'STAMPING' | 'CNC' | 'WELDING' | 'INSPECTION' | 'PACKAGING';

export type MachineStatus = 'RUNNING' | 'IDLE' | 'WARNING' | 'DEGRADED' | 'FAULT' | 'MAINTENANCE' | 'OFFLINE';

export interface MachineTelemetry {
  machine_id: string;
  station: StationType;
  timestamp: string;
  status: MachineStatus;
  temperature: number;
  vibration: number;
  rpm: number;
  current: number;
  production_count: number;
  cycle_time: number;
  energy_kwh: number;
  health: number;
  tool_wear: number | null;
  anomaly_score: number;
  rul_cycles: number | null;
  latency_ms: number;
}

export interface TwinComparison {
  signal: string;
  physical: number;
  twin: number;
  error: number;
  unit: string;
}

export interface MachineTwinState {
  machine_id: string;
  comparisons: TwinComparison[];
  sync_percent: number;
  data_freshness_ms: number;
  telemetry_rate: number;
}

export interface FactorySummary {
  oee: number;
  total_output: number;
  total_energy_kwh: number;
  twin_health: number;
  machines_online: number;
  machines_total: number;
  data_freshness_ms: number;
  telemetry_rate: number;
  timestamp: string;
}

export interface SimulationState {
  running: boolean;
  tick: number;
  cnc_degrading: boolean;
  scenario: string;
}

export interface FactoryEvent {
  id: string;
  timestamp: string;
  machine_id: string;
  station: StationType;
  type: 'Condition' | 'Production' | 'System' | 'Maintenance';
  severity: 'Info' | 'Warning' | 'Error';
  description: string;
  status: 'Open' | 'Closed';
}

/* Mapping of station order in the production flow */
export const STATION_ORDER: StationType[] = ['STAMPING', 'CNC', 'WELDING', 'INSPECTION', 'PACKAGING'];

export const MACHINE_IDS: Record<StationType, string> = {
  STAMPING: 'STAMPING-01',
  CNC: 'CNC-01',
  WELDING: 'WELDING-01',
  INSPECTION: 'INSPECTION-01',
  PACKAGING: 'PACKAGING-01',
};
