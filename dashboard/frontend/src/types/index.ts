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

/* Phase 4 Scenario Worker types */
export interface StationOutcome {
  machine_id: string;
  station: StationType;
  final_state: string;
  final_status: MachineStatus;
  final_health_score: number;
  parts_produced: number;
  energy_kwh: number;
  avg_cycle_time_s: number;
  avg_quality_score: number;
  fault_occurred: boolean;
}

export interface LineOutcome {
  total_output: number;
  scrap_count: number;
  overall_quality: number;
  total_energy_kwh: number;
  bottleneck_machine_id: string;
  binding_cycle_time_s: number;
  hourly_capacity: number;
  stations: StationOutcome[];
}

export interface ScenarioDelta {
  output_delta: number;
  scrap_delta: number;
  quality_delta: number;
  energy_delta_kwh: number;
  health_delta: number;
  bottleneck_shifted: boolean;
  baseline_bottleneck: string;
  counterfactual_bottleneck: string;
  summary: string;
}

export interface TrajectorySample {
  simulated_seconds: number;
  baseline_output: number;
  counterfactual_output: number;
  baseline_quality: number;
  counterfactual_quality: number;
  baseline_cnc_health: number;
  counterfactual_cnc_health: number;
}

export interface ScenarioRunResult {
  scenario_id: string;
  name: string;
  description: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  snapshot_id: string;
  seed: number;
  horizon_seconds: number;
  time_step_s: number;
  created_at: string;
  completed_at: string;
  baseline: LineOutcome;
  counterfactual: LineOutcome;
  comparison: ScenarioDelta;
  trajectory: TrajectorySample[];
}

export interface ScenarioPreset {
  preset_id: string;
  name: string;
  description: string;
  overrides: any[];
}

/* Phase 2 Live Twin types */
export type OperationalState = 'IDLE' | 'SETUP' | 'LOADING' | 'RUNNING' | 'TOOL_CHANGE' | 'FAULT' | 'MAINTENANCE' | 'OFFLINE';

export type FaultSeverity = 'Info' | 'Warning' | 'Critical';

export interface IdentityState {
  machine_id: string;
  station: StationType;
  station_index: number;
  cell_id?: string;
  line_id?: string;
  vendor?: string;
  model?: string;
}

export interface OperationalStateSnapshot {
  state: OperationalState;
  status: MachineStatus;
  updated_at: string;
}

export interface HealthState {
  score: number;
  anomaly_score: number;
  tool_wear_percent: number | null;
  bearing_degradation_percent: number | null;
}

export interface ProductionState {
  cumulative_output: number;
  latest_quality_score: number;
  latest_token_id: string | null;
}

export interface FaultState {
  active: boolean;
  code: string | null;
  severity: FaultSeverity | null;
  updated_at: string | null;
}

export interface DesiredState {
  pending_command: string | null;
  command_requested_at: string | null;
}

export interface SynchronizationState {
  latest_sequence: number;
  last_generated_at: string | null;
  last_received_at: string | null;
  delivery_latency_ms: number | null;
  processing_latency_ms: number | null;
  source_age_ms: number | null;
}

export interface TelemetryPayload {
  machine_id: string;
  station: StationType;
  status: MachineStatus;
  operational_state: OperationalState;
  simulated_at: string;
  temperature_c: number;
  vibration_mm_s: number;
  current_a: number;
  voltage_v: number | null;
  force_kn: number | null;
  hydraulic_pressure_bar: number | null;
  pneumatic_pressure_bar: number | null;
  target_rpm: number | null;
  actual_rpm: number | null;
  cycle_time_s: number;
  energy_kwh: number;
  production_count: number;
  health_score: number;
  anomaly_score: number;
  quality_score: number;
  tool_wear_percent: number | null;
  bearing_degradation_percent: number | null;
  fault_code: string | null;
}

export interface TwinDocument {
  identity: IdentityState;
  operational: OperationalStateSnapshot;
  telemetry: TelemetryPayload;
  health: HealthState;
  production: ProductionState;
  faults: FaultState;
  desired: DesiredState;
  synchronization: SynchronizationState;
  last_event_id: string;
  revision: number;
  updated_at: string;
}

/* Phase 3 Process Twin & DAG types */
export interface DAGNode {
  machine_id: string;
  station: StationType;
  station_index: number;
  nominal_cycle_time_s: number;
}

export interface DAGEdge {
  source_machine_id: string;
  target_machine_id: string;
  buffer_capacity: number;
}

export interface ProcessTopology {
  topology_id: string;
  line_id: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  sequence: string[];
}

export interface StationBottleneckDetail {
  machine_id: string;
  station: StationType;
  cycle_time_s: number;
  effective_cycle_time_s: number;
  slack_time_s: number;
  is_bottleneck: boolean;
  status: MachineStatus;
}

export interface BottleneckReport {
  binding_machine_id: string;
  binding_station: StationType;
  binding_cycle_time_s: number;
  max_line_capacity_per_hour: number;
  stations: StationBottleneckDetail[];
  captured_at: string;
}

export interface CarriedQuality {
  stamping_force_kn?: number;
  stamping_vibration?: number;
  cnc_tool_wear_at_machining?: number;
  cnc_cutting_force_kn?: number;
  cnc_thermal_deviation_c?: number;
  welding_current_a?: number;
  welding_voltage_v?: number;
  inspection_confidence?: number;
}

export interface StationPassage {
  station: StationType;
  machine_id: string;
  entered_at: string;
  exited_at: string | null;
  processing_time_s: number | null;
  station_quality_score: number;
  carried_quality: CarriedQuality;
  defect_flags: string[];
}

export interface ProductionToken {
  token_id: string;
  part_type: string;
  quality: 'pending' | 'pass' | 'fail';
  source_station: StationType;
  emitted_at: string;
  carried_flags: Record<string, any>;
  lineage: string[];
}

export interface StationDefectAttribution {
  machine_id: string;
  station: StationType;
  attribution_percent: number;
  sample_count: number;
  average_quality_score: number;
  reason: string;
}

export interface DefectAttributionReport {
  total_tokens_evaluated: number;
  defective_tokens_count: number;
  defect_rate_percent: number;
  primary_root_cause_station: StationType | null;
  primary_root_cause_machine_id: string | null;
  attributions: StationDefectAttribution[];
  summary_analysis: string;
  evaluated_at: string;
}

export interface ProcessMetrics {
  line_oee: number;
  parts_completed: number;
  parts_scrapped: number;
  active_wip: number;
  bottleneck_machine_id: string;
  line_throughput_per_minute: number;
  average_cycle_time_s: number;
}

export interface FrozenLineSnapshot {
  snapshot_id: string;
  captured_at: string;
  line_id: string;
  twins: TwinDocument[];
}

export interface ProcessTwinView {
  topology: ProcessTopology;
  snapshot: FrozenLineSnapshot;
  metrics: ProcessMetrics;
}

/* System Service Readiness */
export interface SystemReadiness {
  status: 'ready' | 'starting' | 'offline';
  simulation_running: boolean;
  simulation_tick: number;
  persistence_backend: 'mongodb' | 'in_memory' | string;
  live_twin_mqtt_connected: boolean;
}


