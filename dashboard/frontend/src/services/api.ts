import type {
  MachineTelemetry,
  FactorySummary,
  MachineTwinState,
  SimulationState,
  SystemReadiness,
  TwinDocument,
  ProcessTopology,
  FrozenLineSnapshot,
  ProcessTwinView,
  BottleneckReport,
  ProductionToken,
  DefectAttributionReport,
  ScenarioRunResult,
  ScenarioPreset,
} from '../types';
import { clientSim } from './mockSimulator';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// In research/experiment mode, silent mock fallback is disabled by default.
// It can be toggled explicitly if running an offline UI demo without the backend.
let allowMockFallback = false;

export function setMockFallbackEnabled(enabled: boolean): void {
  allowMockFallback = enabled;
}

export function isMockFallbackEnabled(): boolean {
  return allowMockFallback;
}

async function request<T>(path: string, init?: RequestInit, fallback?: () => T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Accept': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      throw new Error(`API HTTP ${res.status}: ${res.statusText} (${path})`);
    }
    return (await res.json()) as T;
  } catch (err: unknown) {
    if (allowMockFallback && fallback) {
      return fallback();
    }
    throw err;
  }
}

async function postAction(path: string, body?: unknown, fallback?: () => void): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`API HTTP ${res.status}: ${res.statusText} (${path})`);
    }
  } catch (err: unknown) {
    if (allowMockFallback && fallback) {
      fallback();
      return;
    }
    throw err;
  }
}

export const api = {
  // ---------------------------------------------------------------------------
  // Infrastructure & Service Probes
  // ---------------------------------------------------------------------------
  getHealth: () => request<{ status: string; service: string }>('/health'),
  getReadiness: () =>
    request<SystemReadiness>('/ready', undefined, () => ({
      status: clientSim ? 'ready' : 'offline',
      simulation_running: clientSim?.getSimState().running ?? false,
      simulation_tick: clientSim?.getSimState().tick ?? 0,
      persistence_backend: 'in_memory (client mock)',
      live_twin_mqtt_connected: false,
    })),

  // ---------------------------------------------------------------------------
  // Core Machine Telemetry & Summary
  // ---------------------------------------------------------------------------
  getMachines: () => request<MachineTelemetry[]>('/machines', undefined, () => clientSim.getMachines()),
  getMachine: (id: string) => request<MachineTelemetry>(`/machines/${id}`, undefined, () => clientSim.getMachine(id)),
  getMachineTwin: (id: string) => request<MachineTwinState>(`/machines/${id}/twin`, undefined, () => clientSim.getTwinState(id)),
  getSummary: () => request<FactorySummary>('/summary', undefined, () => clientSim.getSummary()),
  getSimState: () => request<SimulationState>('/simulate/state', undefined, () => clientSim.getSimState()),

  // Simulation control
  simStart: () => postAction('/simulate/start', undefined, () => clientSim.start()),
  simStop: () => postAction('/simulate/stop', undefined, () => clientSim.stop()),
  simDegradeCnc: () => postAction('/simulate/degrade_cnc', undefined, () => clientSim.degradeCnc()),
  simResetCnc: () => postAction('/simulate/reset_cnc', undefined, () => clientSim.resetCnc()),
  simResetAll: () => postAction('/simulate/reset', undefined, () => clientSim.resetAllGlobal()),

  // Per-machine fault control
  injectFault: (machineId: string, faultType: string, severity: 'Warning' | 'Critical') =>
    postAction(
      `/machines/${machineId}/inject-fault`,
      { fault_type: faultType, severity },
      () => clientSim.injectFault(machineId, faultType, severity)
    ),
  resetMachine: (machineId: string) =>
    postAction(`/machines/${machineId}/reset`, undefined, () => clientSim.resetMachine(machineId)),

  // ---------------------------------------------------------------------------
  // Phase 2 — Versioned Live Twin API
  // ---------------------------------------------------------------------------
  getLiveTwins: () => request<TwinDocument[]>('/api/v1/twins'),
  getLiveTwin: (machineId: string) => request<TwinDocument>(`/api/v1/twins/${machineId}`),
  getLiveTwinTelemetry: (machineId: string, limit = 100) =>
    request<any[]>(`/api/v1/twins/${machineId}/telemetry?limit=${limit}`),

  // ---------------------------------------------------------------------------
  // Phase 3 — Versioned Process Twin & DAG API
  // ---------------------------------------------------------------------------
  getProcessTopology: () => request<ProcessTopology>('/api/v1/process/topology'),
  getProcessSnapshot: () => request<FrozenLineSnapshot>('/api/v1/process/snapshot'),
  getProcessView: () => request<ProcessTwinView>('/api/v1/process/view'),
  getProcessBottleneck: () => request<BottleneckReport>('/api/v1/process/bottleneck'),
  listProductionTokens: (params?: { limit?: number; quality?: string; station?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.quality) query.set('quality', params.quality);
    if (params?.station) query.set('station', params.station);
    const qs = query.toString();
    return request<ProductionToken[]>(`/api/v1/process/tokens${qs ? `?${qs}` : ''}`);
  },
  getProductionToken: (tokenId: string) => request<ProductionToken>(`/api/v1/process/tokens/${tokenId}`),
  emitProductionToken: () =>
    request<ProductionToken>('/api/v1/process/tokens', { method: 'POST' }),
  traceDefects: (limit = 100) =>
    request<DefectAttributionReport>(`/api/v1/process/defects/trace?limit=${limit}`),

  // ---------------------------------------------------------------------------
  // Phase 4 — Scenario Worker API
  // ---------------------------------------------------------------------------
  getScenarioPresets: () => request<ScenarioPreset[]>('/api/v1/scenarios/presets'),
  runScenarioPreset: (presetId: string, horizonSeconds = 120, seed = 20260920) =>
    request<ScenarioRunResult>(
      `/api/v1/scenarios/presets/${presetId}/run?horizon_seconds=${horizonSeconds}&seed=${seed}`,
      { method: 'POST' }
    ),
  runScenario: (requestPayload: unknown) =>
    request<ScenarioRunResult>('/api/v1/scenarios/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    }),
  listScenarios: (limit = 20) => request<ScenarioRunResult[]>(`/api/v1/scenarios?limit=${limit}`),
  getScenario: (scenarioId: string) => request<ScenarioRunResult>(`/api/v1/scenarios/${scenarioId}`),
  deleteScenario: (scenarioId: string) =>
    request<{ status: string; scenario_id: string }>(`/api/v1/scenarios/${scenarioId}`, {
      method: 'DELETE',
    }),
};
