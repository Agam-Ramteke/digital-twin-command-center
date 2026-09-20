/* Unified data hooks with MQTT real-time streaming and REST fallback. */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useMqtt } from './useMqtt';
import type {
  MachineTelemetry,
  FactorySummary,
  MachineTwinState,
  SimulationState,
  SystemReadiness,
  TwinDocument,
  BottleneckReport,
  ProcessTwinView,
  ProductionToken,
  DefectAttributionReport,
} from '../types';

/** Generic polling hook with MQTT overlay. */
function usePoll<T>(fetcher: () => Promise<T>, intervalMs = 1000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const result = await fetcherRef.current();
        if (active) {
          setData(result);
          setError(null);
          setConnected(true);
        }
      } catch (e: unknown) {
        if (active) {
          setConnected(false);
          setError(e instanceof Error ? e.message : 'Connection lost');
        }
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [intervalMs]);

  return { data, setData, error, connected };
}

// Global per-machine telemetry history cache so all 5 machines record continuously
const machineHistoryCache: Record<string, MachineTelemetry[]> = {};

export function useMachines(intervalMs = 1000) {
  const poll = usePoll<MachineTelemetry[]>(() => api.getMachines(), intervalMs);
  const mqtt = useMqtt();

  const data = useMemo(() => {
    if (mqtt.isConnected && Object.keys(mqtt.machines).length > 0) {
      const list = Object.values(mqtt.machines);
      return list.length > 0 ? list : poll.data;
    }
    return poll.data;
  }, [mqtt.isConnected, mqtt.machines, poll.data]);

  // Continuously record history for all machines in background
  useEffect(() => {
    if (data && Array.isArray(data)) {
      for (const m of data) {
        const existing = machineHistoryCache[m.machine_id] || [];
        const next = [...existing, m];
        machineHistoryCache[m.machine_id] = next.length > 60 ? next.slice(next.length - 60) : next;
      }
    }
  }, [data]);

  return {
    data,
    error: poll.error,
    connected: poll.connected || mqtt.isConnected,
    isMqtt: mqtt.isConnected,
    mqttStatus: mqtt.statusText,
  };
}

export function useMachine(machineId: string, intervalMs = 1000) {
  const fetcher = useCallback(() => api.getMachine(machineId), [machineId]);
  const poll = usePoll<MachineTelemetry>(fetcher, intervalMs);
  const mqtt = useMqtt();

  const data = useMemo(() => {
    if (mqtt.isConnected && mqtt.machines[machineId]) {
      return mqtt.machines[machineId];
    }
    return poll.data;
  }, [mqtt.isConnected, mqtt.machines, machineId, poll.data]);

  // Update history for this machine
  useEffect(() => {
    if (data && data.machine_id === machineId) {
      const existing = machineHistoryCache[machineId] || [];
      const next = [...existing, data];
      machineHistoryCache[machineId] = next.length > 60 ? next.slice(next.length - 60) : next;
    }
  }, [data, machineId]);

  return {
    data,
    error: poll.error,
    connected: poll.connected || mqtt.isConnected,
    isMqtt: mqtt.isConnected,
    mqttStatus: mqtt.statusText,
  };
}

export function useMachineTwin(machineId: string, intervalMs = 1000) {
  const fetcher = useCallback(() => api.getMachineTwin(machineId), [machineId]);
  return usePoll<MachineTwinState>(fetcher, intervalMs);
}

export function useSummary(intervalMs = 1000) {
  const poll = usePoll<FactorySummary>(() => api.getSummary(), intervalMs);
  const mqtt = useMqtt();

  const data = useMemo(() => {
    if (mqtt.isConnected && mqtt.summary) {
      return mqtt.summary;
    }
    return poll.data;
  }, [mqtt.isConnected, mqtt.summary, poll.data]);

  return {
    data,
    error: poll.error,
    connected: poll.connected || mqtt.isConnected,
    isMqtt: mqtt.isConnected,
  };
}

export function useSimState(intervalMs = 2000) {
  const poll = usePoll<SimulationState>(() => api.getSimState(), intervalMs);
  const mqtt = useMqtt();

  const data = useMemo(() => {
    if (mqtt.isConnected && mqtt.simState) {
      return mqtt.simState;
    }
    return poll.data;
  }, [mqtt.isConnected, mqtt.simState, poll.data]);

  return {
    data,
    error: poll.error,
    connected: poll.connected || mqtt.isConnected,
    isMqtt: mqtt.isConnected,
  };
}

/** Hook to maintain an isolated rolling history buffer for each machine. */
export function useTelemetryHistory(machineId: string, maxPoints = 60) {
  const [history, setHistory] = useState<MachineTelemetry[]>(() => machineHistoryCache[machineId] || []);
  const { data } = useMachine(machineId, 1000);

  // Immediately switch to the selected machine's isolated history buffer
  useEffect(() => {
    setHistory(machineHistoryCache[machineId] || []);
  }, [machineId]);

  useEffect(() => {
    if (data && data.machine_id === machineId) {
      setHistory(prev => {
        const existing = machineHistoryCache[machineId] || prev;
        const next = existing.includes(data) ? existing : [...existing, data];
        const trimmed = next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
        machineHistoryCache[machineId] = trimmed;
        return trimmed;
      });
    }
  }, [data, machineId, maxPoints]);

  return history;
}

/** Hook to monitor system readiness and service health from /ready. */
export function useSystemReadiness(intervalMs = 2000) {
  return usePoll<SystemReadiness>(() => api.getReadiness(), intervalMs);
}

/** Hook to fetch all persistent Live Twin documents from /api/v1/twins. */
export function useLiveTwins(intervalMs = 1000) {
  return usePoll<TwinDocument[]>(() => api.getLiveTwins(), intervalMs);
}

/** Hook to fetch a single persistent Live Twin document from /api/v1/twins/{id}. */
export function useLiveTwin(machineId: string, intervalMs = 1000) {
  const fetcher = useCallback(() => api.getLiveTwin(machineId), [machineId]);
  return usePoll<TwinDocument>(fetcher, intervalMs);
}

/** Hook to poll the DAG bottleneck analysis from /api/v1/process/bottleneck. */
export function useProcessBottleneck(intervalMs = 2000) {
  return usePoll<BottleneckReport>(() => api.getProcessBottleneck(), intervalMs);
}

/** Hook to poll the composite Process Twin view from /api/v1/process/view. */
export function useProcessView(intervalMs = 2000) {
  return usePoll<ProcessTwinView>(() => api.getProcessView(), intervalMs);
}

/** Hook to poll discrete production tokens flowing through the DAG pipeline. */
export function useProductionTokens(intervalMs = 2000, limit = 25) {
  const fetcher = useCallback(() => api.listProductionTokens({ limit }), [limit]);
  return usePoll<ProductionToken[]>(fetcher, intervalMs);
}

/** Hook to poll upstream defect root-cause tracing from /api/v1/process/defects/trace. */
export function useDefectTrace(intervalMs = 3000, limit = 50) {
  const fetcher = useCallback(() => api.traceDefects(limit), [limit]);
  return usePoll<DefectAttributionReport>(fetcher, intervalMs);
}

