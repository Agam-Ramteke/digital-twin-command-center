import { useEffect, useState } from 'react';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { MachineTelemetry, FactorySummary, SimulationState } from '../types';

export interface MqttState {
  isConnected: boolean;
  statusText: 'Connected' | 'Connecting' | 'Offline';
  machines: Record<string, MachineTelemetry>;
  summary: FactorySummary | null;
  simState: SimulationState | null;
  publishCommand: (command: string) => void;
}

// Singleton MQTT client across components
let globalClient: MqttClient | null = null;
let subscribersCount = 0;

export function useMqtt() {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<'Connected' | 'Connecting' | 'Offline'>('Connecting');
  const [machines, setMachines] = useState<Record<string, MachineTelemetry>>({});
  const [summary, setSummary] = useState<FactorySummary | null>(null);
  const [simState, setSimState] = useState<SimulationState | null>(null);

  useEffect(() => {
    subscribersCount += 1;

    if (!globalClient) {
      try {
        // Connect to Mosquitto WebSocket listener on port 9001
        const connectFn = (mqtt as any).connect || (mqtt as any).default?.connect || (mqtt as any).default;
        if (typeof connectFn === 'function') {
          const client = connectFn('ws://localhost:9001', {
            clientId: `web_${Math.random().toString(16).substring(2, 8)}`,
            clean: true,
            connectTimeout: 4000,
            reconnectPeriod: 5000,
          });
          globalClient = client;

          client.on('connect', () => {
            setIsConnected(true);
            setStatusText('Connected');
            client.subscribe(['factory/telemetry/#', 'factory/summary', 'factory/sim/state'], { qos: 0 });
          });

          client.on('reconnect', () => {
            setStatusText('Connecting');
          });

          client.on('close', () => {
            setIsConnected(false);
            setStatusText('Offline');
          });

          client.on('error', () => {
            setIsConnected(false);
            setStatusText('Offline');
          });
        } else {
          setIsConnected(false);
          setStatusText('Offline');
        }
      } catch (err) {
        setIsConnected(false);
        setStatusText('Offline');
      }
    }

    const messageHandler = (topic: string, message: Buffer) => {
      try {
        const payload = JSON.parse(message.toString());
        if (topic.startsWith('factory/telemetry/')) {
          const machineId = topic.replace('factory/telemetry/', '');
          setMachines(prev => ({ ...prev, [machineId]: payload }));
        } else if (topic === 'factory/summary') {
          setSummary(payload);
        } else if (topic === 'factory/sim/state') {
          setSimState(payload);
        }
      } catch {
        // ignore malformed packets
      }
    };

    globalClient?.on('message', messageHandler);

    return () => {
      globalClient?.removeListener('message', messageHandler);
      subscribersCount -= 1;
      if (subscribersCount <= 0 && globalClient) {
        globalClient.end();
        globalClient = null;
      }
    };
  }, []);

  const publishCommand = (command: string) => {
    if (globalClient && isConnected) {
      globalClient.publish(`factory/commands/${command}`, JSON.stringify({ timestamp: new Date().toISOString() }));
    }
  };

  return {
    isConnected,
    statusText,
    machines,
    summary,
    simState,
    publishCommand,
  };
}
