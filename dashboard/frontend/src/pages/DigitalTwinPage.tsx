import { useState, useEffect } from 'react';
import { useMachines, useSummary, useLiveTwins } from '../hooks/usePolling';
import { STATION_ORDER, MACHINE_IDS } from '../types';
import type { ScenarioPreset, ScenarioRunResult } from '../types';
import { api } from '../services/api';
import { Play, ShieldCheck, Zap, AlertTriangle, TrendingUp, History, Cpu, ArrowRight } from 'lucide-react';

export default function DigitalTwinPage() {
  const { data: machines } = useMachines(2000);
  const { data: summary } = useSummary(2000);
  const { data: liveTwins } = useLiveTwins(2000);

  // Scenario Studio State
  const [presets, setPresets] = useState<ScenarioPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('preventive_tool_change');
  const [horizon, setHorizon] = useState<number>(120);
  const [running, setRunning] = useState<boolean>(false);
  const [currentScenario, setCurrentScenario] = useState<ScenarioRunResult | null>(null);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioRunResult[]>([]);

  useEffect(() => {
    // Load available presets and scenario history
    api.getScenarioPresets().then((data) => {
      if (data && data.length > 0) {
        setPresets(data);
        setSelectedPreset(data[0].preset_id);
      }
    });
    api.listScenarios(5).then((data) => {
      if (data) setScenarioHistory(data);
    });
  }, []);

  const handleRunScenario = async () => {
    setRunning(true);
    try {
      const result = await api.runScenarioPreset(selectedPreset, horizon);
      if (result) {
        setCurrentScenario(result);
        setScenarioHistory((prev) => [result, ...prev.slice(0, 4)]);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Digital Twin</h2>
        <p>Twin registry, relationships, synchronization, and isolated counterfactual scenario simulations</p>
      </div>

      {/* ============================================================
          Phase 4: What-If Scenario Worker Studio (§4.3, §4.4)
          ============================================================ */}
      <div className="analytics-panel" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="panel-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
              <Cpu size={16} color="var(--accent-copper)" />
              <span className="panel-title">What-If Scenario Studio</span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Ephemeral forward simulation forked from an immutable snapshot. Evaluates maintenance and degradation counterfactuals without mutating Live Twins.
            </p>
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            padding: '3px 8px',
            background: 'var(--status-good-bg)',
            border: '1px solid var(--status-good)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--status-good)',
            fontWeight: 600,
          }}>
            <ShieldCheck size={13} /> Fork Immutability Guaranteed
          </div>
        </div>

        {/* Controls: Preset and Horizon */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-md)',
          padding: 'var(--space-md) 0',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
              Select Intervention Scenario:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {(presets.length > 0 ? presets : [
                { preset_id: 'preventive_tool_change', name: 'Preventive CNC Tool Change', description: 'Reset tool wear at CNC-01 to 0%' },
                { preset_id: 'coolant_pump_failure', name: 'Coolant Pump Failure', description: 'Thermal runaway fault at CNC-01' },
                { preset_id: 'line_cadence_boost', name: 'High-Cadence Line Acceleration', description: 'Speed up Stamping & CNC by 20%' },
                { preset_id: 'welding_electrode_drift', name: 'Welding Electrode Degradation', description: 'Electrode wear surge at WELDING-01' },
              ]).map((p) => (
                <button
                  key={p.preset_id}
                  onClick={() => setSelectedPreset(p.preset_id)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: selectedPreset === p.preset_id ? '1px solid var(--accent-copper)' : '1px solid var(--border-light)',
                    background: selectedPreset === p.preset_id ? 'var(--accent-copper-muted)' : 'var(--bg-surface-alt)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: selectedPreset === p.preset_id ? 'var(--accent-copper)' : 'var(--text-primary)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
                Forward Simulation Horizon: <strong style={{ color: 'var(--text-primary)' }}>{horizon} seconds</strong>
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
                {[30, 60, 120, 300].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: horizon === h ? '1px solid var(--accent-blue)' : '1px solid var(--border-light)',
                      background: horizon === h ? 'var(--accent-blue-muted)' : 'var(--bg-surface-alt)',
                      color: horizon === h ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {h}s
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleRunScenario}
              disabled={running}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-xs)',
                width: '100%',
                padding: '12px 16px',
                background: running ? 'var(--bg-secondary)' : 'var(--accent-copper)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: running ? 'not-allowed' : 'pointer',
                transition: 'background var(--transition-fast)',
              }}
            >
              <Play size={16} /> {running ? 'Forking & Simulating Forward...' : 'Run What-If Simulation'}
            </button>
          </div>
        </div>

        {/* Active Scenario Results */}
        {currentScenario && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'var(--bg-surface-alt)',
              borderLeft: '3px solid var(--accent-copper)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-md)',
            }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentScenario.comparison.summary}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                Snapshot: <code style={{ fontFamily: 'var(--font-mono)' }}>{currentScenario.snapshot_id.slice(0, 8)}...</code> | Seed: {currentScenario.seed} | Horizon: {currentScenario.horizon_seconds}s
              </div>
            </div>

            {/* Comparative Delta Cards */}
            <div className="telemetry-grid" style={{ marginBottom: 'var(--space-md)' }}>
              <div className="telemetry-item">
                <div className="telemetry-value" style={{ color: currentScenario.comparison.output_delta >= 0 ? 'var(--status-good)' : 'var(--status-error)' }}>
                  {currentScenario.comparison.output_delta >= 0 ? `+${currentScenario.comparison.output_delta}` : currentScenario.comparison.output_delta}
                  <span className="telemetry-unit">units</span>
                </div>
                <div className="telemetry-label">Net Output Delta</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-value" style={{ color: currentScenario.comparison.quality_delta >= 0 ? 'var(--status-good)' : 'var(--status-error)' }}>
                  {currentScenario.comparison.quality_delta >= 0 ? `+${(currentScenario.comparison.quality_delta * 100).toFixed(2)}` : (currentScenario.comparison.quality_delta * 100).toFixed(2)}
                  <span className="telemetry-unit">%</span>
                </div>
                <div className="telemetry-label">Quality Delta</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-value">
                  {currentScenario.comparison.energy_delta_kwh >= 0 ? `+${currentScenario.comparison.energy_delta_kwh.toFixed(3)}` : currentScenario.comparison.energy_delta_kwh.toFixed(3)}
                  <span className="telemetry-unit">kWh</span>
                </div>
                <div className="telemetry-label">Energy Delta</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-value" style={{ fontSize: 'var(--text-md)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{currentScenario.comparison.baseline_bottleneck}</span>
                  {currentScenario.comparison.bottleneck_shifted && (
                    <>
                      <ArrowRight size={12} color="var(--accent-copper)" />
                      <span style={{ color: 'var(--accent-copper)' }}>{currentScenario.comparison.counterfactual_bottleneck}</span>
                    </>
                  )}
                </div>
                <div className="telemetry-label">Line Bottleneck</div>
              </div>
            </div>

            {/* Station-by-Station Comparative Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px' }}>Station</th>
                    <th style={{ padding: '8px' }}>Baseline Health</th>
                    <th style={{ padding: '8px' }}>Scenario Health</th>
                    <th style={{ padding: '8px' }}>Baseline Cycle</th>
                    <th style={{ padding: '8px' }}>Scenario Cycle</th>
                    <th style={{ padding: '8px' }}>Parts Delta</th>
                    <th style={{ padding: '8px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentScenario.counterfactual.stations.map((cStation) => {
                    const bStation = currentScenario.baseline.stations.find((s) => s.machine_id === cStation.machine_id);
                    const healthDiff = bStation ? cStation.final_health_score - bStation.final_health_score : 0;
                    const partsDiff = bStation ? cStation.parts_produced - bStation.parts_produced : 0;
                    return (
                      <tr key={cStation.machine_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{cStation.machine_id}</td>
                        <td style={{ padding: '8px' }}>{bStation?.final_health_score.toFixed(1) ?? '—'}%</td>
                        <td style={{ padding: '8px', color: healthDiff > 0 ? 'var(--status-good)' : healthDiff < 0 ? 'var(--status-error)' : 'inherit', fontWeight: healthDiff !== 0 ? 600 : 'normal' }}>
                          {cStation.final_health_score.toFixed(1)}% {healthDiff !== 0 && `(${healthDiff > 0 ? '+' : ''}${healthDiff.toFixed(1)}%)`}
                        </td>
                        <td style={{ padding: '8px' }}>{bStation?.avg_cycle_time_s.toFixed(1)}s</td>
                        <td style={{ padding: '8px' }}>{cStation.avg_cycle_time_s.toFixed(1)}s</td>
                        <td style={{ padding: '8px', color: partsDiff > 0 ? 'var(--status-good)' : partsDiff < 0 ? 'var(--status-error)' : 'inherit' }}>
                          {partsDiff > 0 ? `+${partsDiff}` : partsDiff}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span className={`status-badge ${cStation.final_status.toLowerCase()}`}>
                            {cStation.final_status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          Live Twin Registry & Synchronization Overview
          ============================================================ */}
      <div className="analytics-grid">
        {/* Twin Registry */}
        <div className="analytics-panel">
          <div className="panel-header">
            <span className="panel-title">Persistent Live Twin Registry</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              {liveTwins?.length ?? machines?.length ?? 5} active twins
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {(liveTwins && liveTwins.length > 0 ? liveTwins : (machines ?? [])).map((item: any) => {
              const machineId = item.identity?.machine_id ?? item.machine_id;
              const status = item.operational?.status ?? item.status ?? 'RUNNING';
              const revision = item.revision ?? 1;
              const seq = item.synchronization?.latest_sequence ?? item.production_count ?? 0;
              const lastEvent = item.last_event_id ? `${item.last_event_id.slice(0, 8)}...` : '—';
              const procLatency = item.synchronization?.processing_latency_ms != null ? `${item.synchronization.processing_latency_ms.toFixed(2)}ms` : '< 0.05ms';

              return (
                <div
                  key={machineId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-sm)',
                    borderBottom: '1px solid var(--border-light)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {machineId}
                    </span>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginTop: 2 }}>
                      Rev: #{revision} | Seq: #{seq} | Event: {lastEvent} | Proc: {procLatency}
                    </div>
                  </div>
                  <span className={`status-badge ${status.toLowerCase()}`}>{status}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Twin Relationships */}
        <div className="analytics-panel">
          <div className="panel-header">
            <span className="panel-title">DAG Topology & Material Flow</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 2 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>MANUFACTURING LINE DAG</div>
            {STATION_ORDER.map((s, idx) => (
              <div key={s} style={{ paddingLeft: 'var(--space-lg)', color: 'var(--text-secondary)' }}>
                {idx > 0 ? '↳ ' : '• '} Stage {idx + 1}: <strong style={{ color: 'var(--text-primary)' }}>{MACHINE_IDS[s]}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Synchronization Overview */}
      <div className="detail-section" style={{ marginTop: 'var(--space-md)' }}>
        <div className="detail-section-title">Live Twin Synchronization Overview</div>
        <div className="telemetry-grid">
          <div className="telemetry-item">
            <div className="telemetry-value">
              {summary?.twin_health ?? 100}<span className="telemetry-unit">%</span>
            </div>
            <div className="telemetry-label">Live Sync Status</div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-value">
              {summary?.data_freshness_ms.toFixed(0) ?? '0'}<span className="telemetry-unit">ms</span>
            </div>
            <div className="telemetry-label">Observed Freshness</div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-value">{liveTwins?.length ?? machines?.length ?? 5}</div>
            <div className="telemetry-label">Active Twins</div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-value">
              {summary?.telemetry_rate ?? 5}<span className="telemetry-unit">msg/s</span>
            </div>
            <div className="telemetry-label">Event Ingestion Rate</div>
          </div>
        </div>
      </div>
    </>
  );
}
