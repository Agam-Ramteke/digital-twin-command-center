import type { MachineTelemetry, FactorySummary, MachineTwinState, SimulationState } from '../types';
import { clientSim } from './mockSimulator';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function get<T>(path: string, fallback: () => T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return await res.json();
  } catch {
    return fallback();
  }
}

async function post(path: string, fallback: () => void): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST' });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  } catch {
    fallback();
  }
}

export const api = {
  getMachines: () => get<MachineTelemetry[]>('/machines', () => clientSim.getMachines()),
  getMachine: (id: string) => get<MachineTelemetry>(`/machines/${id}`, () => clientSim.getMachine(id)),
  getMachineTwin: (id: string) => get<MachineTwinState>(`/machines/${id}/twin`, () => clientSim.getTwinState(id)),
  getSummary: () => get<FactorySummary>('/summary', () => clientSim.getSummary()),
  getSimState: () => get<SimulationState>('/simulate/state', () => clientSim.getSimState()),

  // Simulation control
  simStart: () => post('/simulate/start', () => clientSim.start()),
  simStop: () => post('/simulate/stop', () => clientSim.stop()),
  simDegradeCnc: () => post('/simulate/degrade_cnc', () => clientSim.degradeCnc()),
  simResetCnc: () => post('/simulate/reset_cnc', () => clientSim.resetCnc()),
  simResetAll: () => post('/simulate/reset', () => clientSim.resetAllGlobal()),

  // Per-machine fault control
  injectFault: async (machineId: string, faultType: string, severity: 'Warning' | 'Critical') => {
    try {
      const res = await fetch(`${API_BASE}/machines/${machineId}/inject-fault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fault_type: faultType, severity }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: inject-fault`);
    } catch {
      clientSim.injectFault(machineId, faultType, severity);
    }
  },
  resetMachine: (machineId: string) => post(`/machines/${machineId}/reset`, () => clientSim.resetMachine(machineId)),
};

