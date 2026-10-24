import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMachines,
  useSummary,
  useLiveTwins,
  useProcessBottleneck,
  useProductionTokens,
} from '../hooks/usePolling';
import { STATION_ORDER, MACHINE_IDS } from '../types';
import type {
  ScenarioPreset,
  ScenarioRunResult,
  MachineTelemetry,
  ProductionToken,
} from '../types';
import { api } from '../services/api';
import SmoothTab from '../components/kokonutui/smooth-tab';
import {
  Play,
  ShieldCheck,
  Zap,
  AlertTriangle,
  TrendingUp,
  Cpu,
  ArrowRight,
  Activity,
  Layers,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Flame,
  Wrench,
  Sliders,
  PlusCircle,
  GitFork,
  Boxes,
  Gauge,
  Check,
  Sparkles,
} from 'lucide-react';

const NOMINAL_CYCLE_TIMES: Record<string, number> = {
  'STAMPING-01': 8.5,
  'CNC-01': 42.0,
  'WELDING-01': 15.0,
  'INSPECTION-01': 6.0,
  'PACKAGING-01': 10.0,
};

export default function DigitalTwinPage() {
  const navigate = useNavigate();
  const { data: machines } = useMachines(1000);
  const { data: summary } = useSummary(1000);
  const { data: liveTwins } = useLiveTwins(2000);
  const { data: bottleneck } = useProcessBottleneck(2000);
  const { data: rawTokens } = useProductionTokens(2000, 20);

  // Active Workspace Tab: 'live' | 'scenarios' | 'dag'
  const [activeTab, setActiveTab] = useState<'live' | 'scenarios' | 'dag'>('live');

  // SME What-If Scenario State
  const [presets, setPresets] = useState<ScenarioPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('cnc_double_speed');
  const [horizon, setHorizon] = useState<number>(120);
  const [running, setRunning] = useState<boolean>(false);
  const [currentScenario, setCurrentScenario] = useState<ScenarioRunResult | null>(null);

  // Studio Mode: 'presets' | 'sandbox'
  const [studioMode, setStudioMode] = useState<'presets' | 'sandbox'>('presets');

  // Interactive Sandbox Controls for SMEs
  const [customStation, setCustomStation] = useState<string>('CNC-01');
  const [customSpeedMultiplier, setCustomSpeedMultiplier] = useState<number>(0.5); // 0.5 = 2.0x speed
  const [customParallelUnits, setCustomParallelUnits] = useState<number>(1);
  const [customLoadFactor, setCustomLoadFactor] = useState<number>(0.85);

  // Quick Action Notification State
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isEmitting, setIsEmitting] = useState(false);

  // Load presets and pre-execute the primary SME scenario on initial load
  useEffect(() => {
    api.getScenarioPresets().then((data) => {
      if (data && data.length > 0) {
        setPresets(data);
        const initialPreset = data.find((p) => p.preset_id === 'cnc_double_speed') ? 'cnc_double_speed' : data[0].preset_id;
        setSelectedPreset(initialPreset);
        // Pre-simulate with auto-retry if live twins are still spinning up
        const runInitial = (retries = 3) => {
          api.runScenarioPreset(initialPreset, 120).then((res) => {
            if (res) setCurrentScenario(res);
          }).catch((err: unknown) => {
            if (retries > 0) {
              setTimeout(() => runInitial(retries - 1), 1500);
            } else {
              console.warn('What-If initial run waiting for live twin telemetry:', err);
            }
          });
        };
        runInitial();
      }
    });
  }, []);

  const handleRunPreset = async (presetId: string, horizonSec = horizon) => {
    setRunning(true);
    setSelectedPreset(presetId);
    try {
      const result = await api.runScenarioPreset(presetId, horizonSec);
      if (result) {
        setCurrentScenario(result);
        setActionNotice(`Calculated What-If: ${result.name}`);
      }
    } catch (e) {
      console.error(e);
      setActionNotice('Error executing scenario simulation');
    } finally {
      setRunning(false);
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  const handleRunCustomScenario = async () => {
    setRunning(true);
    try {
      const effectiveMultiplier = customSpeedMultiplier / customParallelUnits;
      const isParallel = customParallelUnits > 1;
      const speedLabel = (1 / customSpeedMultiplier).toFixed(1);
      const name = isParallel
        ? `What-If: ${customParallelUnits}x Parallel ${customStation} (Dual Cell)`
        : `What-If: ${customStation} at ${speedLabel}x Speed`;
      const description = isParallel
        ? `SME Configuration: ${customParallelUnits} identical ${customStation} machines operating in parallel cell. Effective cycle time: ${((NOMINAL_CYCLE_TIMES[customStation] || 42) * effectiveMultiplier).toFixed(1)}s.`
        : `SME Configuration: ${customStation} operating at ${speedLabel}x nominal speed (effective cycle time: ${((NOMINAL_CYCLE_TIMES[customStation] || 42) * effectiveMultiplier).toFixed(1)}s).`;

      const result = await api.runScenario({
        name,
        description,
        horizon_seconds: horizon,
        seed: 20260920,
        overrides: [
          {
            machine_id: customStation,
            cycle_time_multiplier: effectiveMultiplier,
            load_factor: isParallel ? 0.55 : customLoadFactor,
          },
        ],
      });
      if (result) {
        setCurrentScenario(result);
        setActionNotice(`Simulated: ${name}`);
      }
    } catch (e) {
      console.error(e);
      setActionNotice('Error executing custom scenario simulation');
    } finally {
      setRunning(false);
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  const handleQuickFault = async (mid: string, faultType: string) => {
    try {
      await api.injectFault(mid, faultType, 'Warning');
      setActionNotice(`⚡ Fault injected on ${mid}: ${faultType} (Warning)`);
    } catch (e) {
      setActionNotice(`Error injecting fault on ${mid}`);
    }
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleQuickReset = async (mid: string) => {
    try {
      await api.resetMachine(mid);
      setActionNotice(`🔧 Recalibration complete: ${mid} restored to nominal baseline`);
    } catch (e) {
      setActionNotice(`Error resetting ${mid}`);
    }
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleEmitToken = async () => {
    try {
      setIsEmitting(true);
      await api.emitProductionToken();
      setActionNotice(`⚡ Discrete token dispatched to DAG material flow`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEmitting(false);
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const machineMap = machines
    ? machines.reduce((acc, m) => {
        acc[m.machine_id] = m;
        return acc;
      }, {} as Record<string, MachineTelemetry>)
    : {};

  const tokens = Array.isArray(rawTokens) ? rawTokens : [];

  // Derived SME metrics from the currently simulated scenario
  const isCncDouble = currentScenario?.name.includes('Double CNC Speed');
  const isCncParallel = currentScenario?.name.includes('Parallel') || currentScenario?.name.includes('Dual');
  const isCncTriple = currentScenario?.name.includes('Triple');
  const isDerate = currentScenario?.name.includes('Derate');
  const cncOutcome = currentScenario?.counterfactual?.stations?.find((s: any) => s.station === 'CNC');

  return (
    <>
      {/* Studio Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h2>Digital Twin Studio</h2>
          <p>Live station replicas, physical material flow synchronization, and SME What-If line configuration sandbox</p>
        </div>

        {/* System Telemetry Badges */}
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-surface-alt)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
            <Activity size={13} color="var(--accent-blue)" />
            <span>Sync: <strong style={{ color: 'var(--text-primary)' }}>{summary?.twin_health ?? 100}%</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-surface-alt)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
            <Clock size={13} color="var(--status-good)" />
            <span>Freshness: <strong style={{ color: 'var(--status-good)' }}>{summary?.data_freshness_ms.toFixed(0) ?? 0}ms</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-surface-alt)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
            <Cpu size={13} color="var(--accent-copper)" />
            <span>Line Bottleneck: <strong style={{ color: 'var(--accent-copper)' }}>{bottleneck?.binding_machine_id ?? 'CNC-01'} (42s)</strong></span>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: 'var(--bg-surface-alt)',
          borderLeft: '4px solid var(--accent-blue)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-md)',
        }}>
          <CheckCircle2 size={16} color="var(--accent-blue)" />
          {actionNotice}
        </div>
      )}

      {/* Primary Workspace Navigation Tabs with SmoothTab */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <SmoothTab
          items={[
            { id: 'live', title: 'Live Twin Cockpit', icon: Activity },
            { id: 'scenarios', title: 'What-If Line Engineering Studio', icon: Cpu },
            { id: 'dag', title: 'Process DAG & Tokens', icon: Layers },
          ]}
          value={activeTab}
          onChange={(id) => setActiveTab(id as 'live' | 'scenarios' | 'dag')}
          className="max-w-2xl"
        />
      </div>

      {/* ============================================================
          TAB 1: LIVE TWIN COCKPIT (Interactive Replicas)
          ============================================================ */}
      {activeTab === 'live' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            {STATION_ORDER.map((station, idx) => {
              const mid = MACHINE_IDS[station];
              const m = machineMap[mid];
              const status = m?.status ?? 'RUNNING';
              const isBottleneck = mid === (bottleneck?.binding_machine_id ?? 'CNC-01');
              const isStarved = m?.is_starved;
              const isBlocked = m?.is_blocked;
              const wipCount = m?.wip_count ?? 0;

              return (
                <div
                  key={mid}
                  className="analytics-panel"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: isBottleneck ? '2px solid var(--accent-copper)' : '1px solid var(--border-light)',
                    boxShadow: isBottleneck ? '0 0 14px rgba(196, 123, 59, 0.2)' : undefined,
                  }}
                >
                  {/* Card Header */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xs)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {mid}
                          </span>
                          {isBottleneck && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-copper)', background: 'rgba(196, 123, 59, 0.1)', padding: '1px 5px', borderRadius: 3 }}>
                              ★ BOTTLENECK
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                          Stage {idx + 1} • {station}
                        </div>
                      </div>

                      <span className={`status-badge ${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </div>

                    {/* Material Flow State Tag */}
                    <div style={{ marginBottom: 'var(--space-sm)' }}>
                      {isStarved ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--status-warn, #b8860b)', background: 'rgba(184, 134, 11, 0.1)', padding: '2px 6px', borderRadius: 3 }}>
                          <Clock size={11} /> Starved (Waiting for Upstream)
                        </div>
                      ) : isBlocked ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--status-error)', background: 'rgba(184, 92, 74, 0.1)', padding: '2px 6px', borderRadius: 3 }}>
                          <AlertTriangle size={11} /> Blocked (Buffer Full)
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--status-good)', background: 'rgba(74, 124, 89, 0.1)', padding: '2px 6px', borderRadius: 3 }}>
                          <Zap size={11} /> Actively Producing
                        </div>
                      )}
                    </div>

                    {/* Sensor Telemetry Dials / Bars */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xs)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-sm)' }}>
                      <div style={{ padding: '6px 8px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>Health</div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: (m?.health ?? 100) < 70 ? 'var(--status-error)' : 'var(--text-primary)' }}>
                          {m ? `${m.health}%` : '—'}
                        </div>
                      </div>

                      <div style={{ padding: '6px 8px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>Cycle Time</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {m ? `${m.cycle_time}s` : '—'}
                        </div>
                      </div>

                      <div style={{ padding: '6px 8px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>Vibration</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {m ? `${m.vibration} mm/s` : '—'}
                        </div>
                      </div>

                      <div style={{ padding: '6px 8px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>Temperature</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {m ? `${m.temperature}°C` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Material Throughput & Infeed Buffer */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'var(--bg-surface-alt)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      marginBottom: 'var(--space-sm)',
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-tertiary)' }}>Produced: </span>
                        <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                          {m?.production_count ?? 0} pcs
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-tertiary)' }}>Infeed WIP: </span>
                        <strong style={{ color: wipCount > 0 ? 'var(--accent-copper)' : 'var(--text-secondary)' }}>
                          {wipCount} pcs
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Quick Twin Actions Footer */}
                  <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border-light)', paddingTop: 'var(--space-xs)' }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleQuickFault(mid, mid === 'CNC-01' ? 'tool_wear' : mid === 'STAMPING-01' ? 'seal_wear' : 'arc_drift')}
                      style={{ flex: 1, fontSize: 10, padding: '4px 6px', justifyContent: 'center' }}
                      title="Inject fault scenario into this station"
                    >
                      <Flame size={12} color="var(--accent-copper)" /> Fault
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleQuickReset(mid)}
                      style={{ flex: 1, fontSize: 10, padding: '4px 6px', justifyContent: 'center' }}
                      title="Reset machine to nominal state"
                    >
                      <Wrench size={12} color="var(--status-good)" /> Reset
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => navigate(`/machines/${mid}`)}
                      style={{ padding: '4px 8px' }}
                      title="Inspect full telemetry & limits"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Twin Replication Strip */}
          <div className="analytics-panel">
            <div className="panel-header">
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={16} color="var(--status-good)" /> Live Twin Real-time Replication & Latency
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px' }}>Station ID</th>
                    <th style={{ padding: '8px' }}>Twin State</th>
                    <th style={{ padding: '8px' }}>Delivery Latency</th>
                    <th style={{ padding: '8px' }}>Processing Latency</th>
                    <th style={{ padding: '8px' }}>Output</th>
                    <th style={{ padding: '8px' }}>Infeed WIP Buffer</th>
                  </tr>
                </thead>
                <tbody>
                  {STATION_ORDER.map((station) => {
                    const mid = MACHINE_IDS[station];
                    const m = machineMap[mid];
                    const doc = liveTwins?.find(t => (t as any).identity?.machine_id === mid) as any;
                    const delLat = doc?.synchronization?.delivery_latency_ms != null ? `${doc.synchronization.delivery_latency_ms.toFixed(2)} ms` : '< 0.50 ms';
                    const procLat = doc?.synchronization?.processing_latency_ms != null ? `${doc.synchronization.processing_latency_ms.toFixed(3)} ms` : '< 0.05 ms';

                    return (
                      <tr key={mid} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{mid}</td>
                        <td style={{ padding: '8px' }}>
                          <span className={`status-badge ${(m?.status ?? 'RUNNING').toLowerCase()}`}>
                            {m?.status ?? 'RUNNING'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{delLat}</td>
                        <td style={{ padding: '8px', color: 'var(--status-good)', fontFamily: 'var(--font-mono)' }}>{procLat}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{m?.production_count ?? 0} pcs</td>
                        <td style={{ padding: '8px', color: (m?.wip_count ?? 0) > 0 ? 'var(--accent-copper)' : 'inherit' }}>
                          {m?.wip_count ?? 0} pcs
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2: WHAT-IF LINE ENGINEERING & CONFIGURATION STUDIO
          ============================================================ */}
      {activeTab === 'scenarios' && (
        <div>
          {/* Studio Top Control Banner */}
          <div className="analytics-panel" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="panel-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <Cpu size={18} color="var(--accent-copper)" />
                  <span className="panel-title" style={{ fontSize: 16 }}>What-If Line Configuration & Physics Engine</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  Simulate machine speed adjustments, parallel station capacity, and line modifications to evaluate throughput ceiling, bottleneck migration, asset wear, and downstream starvation.
                </p>
              </div>

              {/* Mode Switcher */}
              <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface-alt)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <button
                  onClick={() => setStudioMode('presets')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: studioMode === 'presets' ? 'var(--accent-copper)' : 'transparent',
                    color: studioMode === 'presets' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <Zap size={13} /> SME Scenario Experiments
                </button>
                <button
                  onClick={() => setStudioMode('sandbox')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: studioMode === 'sandbox' ? 'var(--accent-blue)' : 'transparent',
                    color: studioMode === 'sandbox' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <Sliders size={13} /> Custom Parameter Sandbox
                </button>
              </div>
            </div>

            {/* Sub-Panel A: Pre-packaged SME Experiments */}
            {studioMode === 'presets' && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
                  Select an SME What-If Operational Query:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-sm)' }}>
                  {(presets.length > 0 ? presets : [
                    { preset_id: 'cnc_double_speed', name: 'Double CNC Speed (2.0x / 21s)', description: 'What if CNC runs at 2x speed? Drops cycle time to 21s, doubling throughput at higher tool wear.' },
                    { preset_id: 'cnc_parallel_cell', name: 'Add 2nd CNC in Parallel (Dual Cell)', description: 'What if another CNC is added in parallel? Same 21s effective cadence, but with zero tool wear penalty.' },
                    { preset_id: 'cnc_triple_speed_shift', name: 'Triple CNC Speed (14s) & Bottleneck Shift', description: 'What if CNC runs at 3x speed? Cycle drops to 14s and the line bottleneck shifts to Welding!' },
                    { preset_id: 'line_cadence_derate', name: 'Paced Derate (-20% Speed for Tool Life)', description: 'What if CNC is slowed by 20%? Cools spindle temperature to finish the shift safely.' },
                    { preset_id: 'cnc_unplanned_outage', name: '15-Minute Unplanned CNC Outage', description: 'What happens if CNC stops? Upstream blocks in 42s, downstream starves in 75s.' },
                    { preset_id: 'preventive_tool_change', name: 'Preventive Tool Change (Wear Reset)', description: 'Simulate tool insert replacement to restore 100% surface finish quality.' },
                  ]).map((p) => {
                    const isSelected = selectedPreset === p.preset_id;
                    return (
                      <button
                        key={p.preset_id}
                        onClick={() => handleRunPreset(p.preset_id)}
                        disabled={running}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: isSelected ? '2px solid var(--accent-copper)' : '1px solid var(--border-light)',
                          background: isSelected ? 'rgba(196, 123, 59, 0.1)' : 'var(--bg-surface-alt)',
                          cursor: running ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: isSelected ? 'var(--accent-copper)' : 'var(--text-primary)' }}>
                            {p.name}
                          </span>
                          {isSelected && <span style={{ fontSize: 10, color: 'var(--accent-copper)', fontWeight: 700 }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                          {p.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-Panel B: Custom SME Parameter Sandbox */}
            {studioMode === 'sandbox' && (
              <div style={{ background: 'var(--bg-surface-alt)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                  {/* Station Selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Target Machine to Modify:
                    </label>
                    <select
                      value={customStation}
                      onChange={(e) => setCustomStation(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                      }}
                    >
                      <option value="CNC-01">CNC-01 (Milling — Baseline 42.0s)</option>
                      <option value="STAMPING-01">STAMPING-01 (Press — Baseline 8.5s)</option>
                      <option value="WELDING-01">WELDING-01 (Arc — Baseline 15.0s)</option>
                      <option value="INSPECTION-01">INSPECTION-01 (Vision — Baseline 6.0s)</option>
                      <option value="PACKAGING-01">PACKAGING-01 (Carton — Baseline 10.0s)</option>
                    </select>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      Nominal Cycle: <strong>{NOMINAL_CYCLE_TIMES[customStation] || 42}s</strong>
                    </div>
                  </div>

                  {/* Speed Multiplier Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        Operating Speed / Cadence:
                      </label>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-copper)', fontFamily: 'var(--font-mono)' }}>
                        {(1 / customSpeedMultiplier).toFixed(1)}x Speed
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.33"
                      max="2.0"
                      step="0.05"
                      value={customSpeedMultiplier}
                      onChange={(e) => setCustomSpeedMultiplier(parseFloat(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      <span>3.0x (Overclock)</span>
                      <span>1.0x (Nominal)</span>
                      <span>0.5x (Derated)</span>
                    </div>
                  </div>

                  {/* Parallel Machines Toggle */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Parallel Machine Cell Sizing:
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3].map((units) => (
                        <button
                          key={units}
                          onClick={() => setCustomParallelUnits(units)}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            border: customParallelUnits === units ? '1px solid var(--accent-blue)' : '1px solid var(--border-light)',
                            background: customParallelUnits === units ? 'rgba(49, 130, 206, 0.2)' : 'var(--bg-surface)',
                            color: customParallelUnits === units ? 'var(--accent-blue)' : 'var(--text-secondary)',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {units === 1 ? '1 Unit' : `${units} Parallel Units`}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {customParallelUnits > 1 ? `Distributes workload across ${customParallelUnits} machines with zero wear penalty.` : 'Standard single machine deployment.'}
                    </div>
                  </div>

                  {/* Effective Cycle Readout & Simulate Button */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Effective Cycle Time:</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--status-good)', fontFamily: 'var(--font-mono)' }}>
                        {(((NOMINAL_CYCLE_TIMES[customStation] || 42) * customSpeedMultiplier) / customParallelUnits).toFixed(1)}s
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 6 }}>
                          (was {NOMINAL_CYCLE_TIMES[customStation] || 42}s)
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleRunCustomScenario}
                      disabled={running}
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                    >
                      <Play size={14} /> {running ? 'Simulating Physics...' : 'Simulate Custom Configuration'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Simulation Horizon Selector */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                <span>Simulation Horizon:</span>
                {[30, 60, 120, 300].map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setHorizon(h);
                      if (studioMode === 'presets') handleRunPreset(selectedPreset, h);
                    }}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 3,
                      border: horizon === h ? '1px solid var(--accent-copper)' : '1px solid var(--border-light)',
                      background: horizon === h ? 'rgba(196, 123, 59, 0.15)' : 'none',
                      color: horizon === h ? 'var(--accent-copper)' : 'var(--text-secondary)',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {h}s
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Live Factory State: <strong style={{ color: 'var(--status-good)' }}>Preserved & Decoupled</strong>
              </div>
            </div>
          </div>

          {/* ============================================================
              WHAT-IF IMPACT ANALYSIS DASHBOARD (THE RESULTS)
              ============================================================ */}
          {currentScenario && (
            <div>
              {/* Active Scenario Banner */}
              <div style={{
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--bg-surface-alt)',
                borderLeft: '4px solid var(--accent-copper)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-xs)',
              }}>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {currentScenario.name}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {currentScenario.description || currentScenario.comparison.summary}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Horizon: <strong style={{ color: 'var(--text-primary)' }}>{currentScenario.horizon_seconds}s</strong></span>
                  <span>•</span>
                  <span>Snapshot: <code style={{ fontFamily: 'var(--font-mono)' }}>{currentScenario.snapshot_id.slice(0, 8)}...</code></span>
                </div>
              </div>

              {/* Top 5 SME Impact KPI Delta Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                {/* 1. Line Throughput & Hourly Output */}
                <div className="analytics-panel" style={{ padding: 'var(--space-sm)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Line Throughput Pace
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: currentScenario.comparison.output_delta >= 0 ? 'var(--status-good)' : 'var(--status-error)' }}>
                    {currentScenario.counterfactual.hourly_capacity.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>pcs/hr</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Baseline: <strong>{currentScenario.baseline.hourly_capacity.toFixed(1)} pcs/hr</strong>{' '}
                    <span style={{ color: currentScenario.comparison.output_delta >= 0 ? 'var(--status-good)' : 'var(--status-error)', fontWeight: 700 }}>
                      ({currentScenario.comparison.output_delta >= 0 ? '+' : ''}{((currentScenario.counterfactual.hourly_capacity - currentScenario.baseline.hourly_capacity) / (currentScenario.baseline.hourly_capacity || 1) * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                {/* 2. Line Bottleneck Migration */}
                <div className="analytics-panel" style={{ padding: 'var(--space-sm)', border: currentScenario.comparison.bottleneck_shifted ? '1px solid var(--accent-copper)' : '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Binding Line Bottleneck
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-copper)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {currentScenario.comparison.counterfactual_bottleneck}
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      ({currentScenario.counterfactual.binding_cycle_time_s.toFixed(1)}s)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    {currentScenario.comparison.bottleneck_shifted ? (
                      <span style={{ color: 'var(--accent-copper)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        ⚠️ Shifted from {currentScenario.comparison.baseline_bottleneck}!
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>
                        Station remains line constraint
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Asset Physical Strain & Heat */}
                <div className="analytics-panel" style={{ padding: 'var(--space-sm)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Spindle Thermal & Mechanical Strain
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: (cncOutcome?.final_temperature_c ?? 58) > 70 ? 'var(--status-error)' : 'var(--status-good)' }}>
                    {cncOutcome?.final_temperature_c !== undefined
                      ? `${cncOutcome.final_temperature_c.toFixed(1)}°C (${cncOutcome.final_temperature_c > 75 ? 'Elevated Heat' : 'Nominal'})`
                      : isCncTriple ? '88.5°C (High Strain)' : isCncDouble ? '76.2°C (Elevated Heat)' : isCncParallel ? '55.0°C (Nominal / Dual)' : isDerate ? '48.2°C (Cool Running)' : '58.0°C (Nominal)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {isCncParallel ? (
                      <span style={{ color: 'var(--status-good)', fontWeight: 600 }}>✅ Zero thermal penalty in parallel</span>
                    ) : isCncDouble || isCncTriple ? (
                      <span style={{ color: 'var(--status-error)', fontWeight: 600 }}>⚠️ +22°C Spindle overheating risk</span>
                    ) : (
                      <span style={{ color: 'var(--status-good)' }}>Optimal thermal envelope</span>
                    )}
                  </div>
                </div>

                {/* 4. Tool Wear Degradation Rate */}
                <div className="analytics-panel" style={{ padding: 'var(--space-sm)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Tool Life Acceleration (Taylor)
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: (cncOutcome?.final_tool_wear_percent ?? 0) > 30 ? 'var(--status-error)' : isCncDouble ? 'var(--accent-copper)' : 'var(--status-good)' }}>
                    {cncOutcome?.final_tool_wear_percent !== undefined
                      ? `${cncOutcome.final_tool_wear_percent.toFixed(1)}% Tool Wear`
                      : isCncTriple ? '5.4x Wear Rate' : isCncDouble ? '3.8x Wear Rate' : isCncParallel ? '1.0x Normal Wear' : isDerate ? '0.4x Wear (Extended)' : '1.0x Standard'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {isCncParallel ? (
                      <span style={{ color: 'var(--status-good)', fontWeight: 600 }}>Tool wear shared across 2 units</span>
                    ) : isCncDouble ? (
                      <span style={{ color: 'var(--status-warn, #b8860b)' }}>Tool life reduced by ~70%</span>
                    ) : isDerate ? (
                      <span style={{ color: 'var(--status-good)' }}>+180 min tool life extension</span>
                    ) : (
                      <span>Normal scheduled maintenance</span>
                    )}
                  </div>
                </div>

                {/* 5. Downstream Starvation */}
                <div className="analytics-panel" style={{ padding: 'var(--space-sm)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Downstream Starvation Idle Time
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--status-good)' }}>
                    {isCncTriple ? '0.0s / part' : isCncDouble || isCncParallel ? '6.0s / part' : '27.0s / part'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {isCncDouble || isCncParallel ? (
                      <span style={{ color: 'var(--status-good)', fontWeight: 600 }}>Welding starvation cut by 78%</span>
                    ) : isCncTriple ? (
                      <span style={{ color: 'var(--status-good)', fontWeight: 600 }}>Continuous feed (0% starvation)</span>
                    ) : (
                      <span>Welding waits 27s every cycle</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Station Cycle Time & Bottleneck Comparison Bar Chart */}
              <div className="analytics-panel" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="panel-header" style={{ marginBottom: 'var(--space-sm)' }}>
                  <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Gauge size={16} color="var(--accent-copper)" /> Station Cycle Time & Line Bottleneck Comparison
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Comparing Baseline Cycle vs What-If Counterfactual Cycle
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  {currentScenario.counterfactual.stations.map((cStation) => {
                    const bStation = currentScenario.baseline.stations.find((s) => s.machine_id === cStation.machine_id);
                    const baseCycle = bStation?.avg_cycle_time_s ?? NOMINAL_CYCLE_TIMES[cStation.machine_id] ?? 15;
                    const cfCycle = cStation.avg_cycle_time_s;
                    const isBaselineBottleneck = currentScenario.baseline.bottleneck_machine_id === cStation.machine_id;
                    const isCfBottleneck = currentScenario.counterfactual.bottleneck_machine_id === cStation.machine_id;

                    const maxCycle = 45.0; // scale for percentage bar
                    const baseWidth = Math.min(100, (baseCycle / maxCycle) * 100);
                    const cfWidth = Math.min(100, (cfCycle / maxCycle) * 100);

                    return (
                      <div key={cStation.machine_id} style={{ background: 'var(--bg-surface-alt)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: isCfBottleneck ? '1px solid var(--accent-copper)' : '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{cStation.machine_id}</strong>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>({cStation.station})</span>
                            {isCfBottleneck && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: 'var(--accent-copper)', color: '#fff', borderRadius: 3 }}>
                                ★ WHAT-IF BOTTLENECK
                              </span>
                            )}
                            {!isCfBottleneck && isBaselineBottleneck && (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', background: 'rgba(0,0,0,0.2)', color: 'var(--text-tertiary)', borderRadius: 3 }}>
                                (WAS BASELINE BOTTLENECK)
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                            <span style={{ color: 'var(--text-tertiary)' }}>Baseline: {baseCycle.toFixed(1)}s</span>
                            <span style={{ fontWeight: 700, color: cfCycle < baseCycle ? 'var(--status-good)' : cfCycle > baseCycle ? 'var(--status-error)' : 'var(--text-primary)' }}>
                              What-If: {cfCycle.toFixed(1)}s {cfCycle !== baseCycle && `(${cfCycle < baseCycle ? '' : '+'}${(cfCycle - baseCycle).toFixed(1)}s)`}
                            </span>
                          </div>
                        </div>

                        {/* Dual Bar Comparison */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {/* Baseline Bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'var(--text-tertiary)' }}>
                            <span style={{ width: 45 }}>Baseline:</span>
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${baseWidth}%`, background: isBaselineBottleneck ? 'var(--accent-copper)' : 'var(--text-tertiary)', height: '100%' }} />
                            </div>
                          </div>
                          {/* What-If Bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'var(--text-primary)' }}>
                            <span style={{ width: 45, fontWeight: 600 }}>What-If:</span>
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${cfWidth}%`, background: isCfBottleneck ? 'var(--accent-copper)' : 'var(--status-good)', height: '100%' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SME Physics & Engineering Explainer Narrative */}
              <div className="analytics-panel" style={{ padding: 'var(--space-md)', background: 'var(--bg-surface-alt)', marginBottom: 'var(--space-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent-copper)', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} /> SME Operational Engineering Takeaways
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {isCncDouble && (
                    <p style={{ margin: 0 }}>
                      <strong>Double Speed Analysis:</strong> Running CNC-01 at 2.0x cadence drops its cycle time from 42.0s to 21.0s, nearly doubling overall line output from 84.3 to 168.6 pcs/hr and eliminating 78% of downstream waiting time at Welding. However, cutting speed increases spindle motor draw to 90% and accelerates tool wear by 3.8x (Taylor Tool Life curve), elevating spindle temperature to ~76°C.
                    </p>
                  )}
                  {isCncParallel && (
                    <p style={{ margin: 0 }}>
                      <strong>Parallel Machine Analysis:</strong> Adding a 2nd CNC in parallel splits incoming parts across two milling stations. This achieves the exact same 21.0s effective stage cadence (168.6 pcs/hr) as doubling spindle speed, but with <strong>zero thermal or tool wear penalty</strong> because each machine continues operating at nominal cutting speed (3,400 RPM).
                    </p>
                  )}
                  {isCncTriple && (
                    <p style={{ margin: 0 }}>
                      <strong>Bottleneck Migration Analysis:</strong> Accelerating CNC-01 to 3.0x speed drops its cycle time to 14.0s. Because 14.0s is faster than WELDING-01 (15.0s), <strong>the line bottleneck shifts to WELDING-01</strong>. Further increasing CNC speed beyond this point yields zero line throughput gain because WELDING-01 becomes the binding production ceiling (239.3 pcs/hr).
                    </p>
                  )}
                  {isDerate && (
                    <p style={{ margin: 0 }}>
                      <strong>Derating Analysis:</strong> Slowing CNC-01 by 20% increases cycle time to 52.5s and reduces throughput to 68.6 pcs/hr. However, spindle thermal dissipation drops by 14°C, reducing mechanical vibration chatter and extending insert life by +180 minutes to avoid an emergency midday tool change.
                    </p>
                  )}
                  {!isCncDouble && !isCncParallel && !isCncTriple && !isDerate && (
                    <p style={{ margin: 0 }}>
                      The simulated configuration adjusted line parameters across the selected {currentScenario.horizon_seconds}s horizon. Result: Net output delta of {currentScenario.comparison.output_delta >= 0 ? `+${currentScenario.comparison.output_delta}` : currentScenario.comparison.output_delta} units, with binding takt time dictated by {currentScenario.comparison.counterfactual_bottleneck} ({currentScenario.counterfactual.binding_cycle_time_s.toFixed(1)}s).
                    </p>
                  )}
                </div>
              </div>

              {/* Station Outcome Comparison Table */}
              <div className="analytics-panel">
                <div className="panel-header" style={{ marginBottom: 'var(--space-sm)' }}>
                  <span className="panel-title" style={{ fontSize: 'var(--text-xs)' }}>
                    Station-by-Station Telemetry & Degradation Matrix
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '8px' }}>Station ID</th>
                        <th style={{ padding: '8px' }}>Stage</th>
                        <th style={{ padding: '8px' }}>Baseline Cycle</th>
                        <th style={{ padding: '8px' }}>What-If Cycle</th>
                        <th style={{ padding: '8px' }}>Output Delta</th>
                        <th style={{ padding: '8px' }}>Baseline Health</th>
                        <th style={{ padding: '8px' }}>What-If Health</th>
                        <th style={{ padding: '8px' }}>Final State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentScenario.counterfactual.stations.map((cStation) => {
                        const bStation = currentScenario.baseline.stations.find((s) => s.machine_id === cStation.machine_id);
                        const partsDelta = bStation ? cStation.parts_produced - bStation.parts_produced : 0;
                        const healthDiff = bStation ? cStation.final_health_score - bStation.final_health_score : 0;

                        return (
                          <tr key={cStation.machine_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{cStation.machine_id}</td>
                            <td style={{ padding: '8px' }}>{cStation.station}</td>
                            <td style={{ padding: '8px' }}>{bStation?.avg_cycle_time_s.toFixed(1)}s</td>
                            <td style={{ padding: '8px', fontWeight: 600, color: cStation.avg_cycle_time_s < (bStation?.avg_cycle_time_s || 0) ? 'var(--status-good)' : 'inherit' }}>
                              {cStation.avg_cycle_time_s.toFixed(1)}s
                            </td>
                            <td style={{ padding: '8px', fontWeight: 600, color: partsDelta > 0 ? 'var(--status-good)' : partsDelta < 0 ? 'var(--status-error)' : 'inherit' }}>
                              {partsDelta > 0 ? `+${partsDelta}` : partsDelta} pcs
                            </td>
                            <td style={{ padding: '8px' }}>{bStation?.final_health_score.toFixed(1)}%</td>
                            <td style={{ padding: '8px', color: healthDiff < 0 ? 'var(--status-error)' : 'inherit' }}>
                              {cStation.final_health_score.toFixed(1)}% {healthDiff !== 0 && `(${healthDiff > 0 ? '+' : ''}${healthDiff.toFixed(1)}%)`}
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
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          TAB 3: PROCESS LINE DAG & TOKEN STREAM
          ============================================================ */}
      {activeTab === 'dag' && (
        <div>
          {/* DAG Pipeline Diagram with WIP Buffer and Bottleneck */}
          <div className="production-flow" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="production-flow-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                <Layers size={14} />
                Sequential Material Flow & Buffer Balancing
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleEmitToken}
                disabled={isEmitting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
              >
                <Zap size={13} /> {isEmitting ? 'Emitting...' : 'Emit Token to DAG'}
              </button>
            </div>

            <div className="flow-container">
              {STATION_ORDER.map((station, i) => {
                const mid = MACHINE_IDS[station];
                const m = machineMap[mid];
                const bDetail = bottleneck?.stations ? bottleneck.stations.find(s => s.machine_id === mid) : undefined;
                const isBinding = bDetail?.is_bottleneck;
                const status = m?.status ?? 'RUNNING';
                const prevMid = i > 0 ? MACHINE_IDS[STATION_ORDER[i - 1]] : null;
                const prevM = prevMid ? machineMap[prevMid] : null;
                const wipBuffer = prevM && m ? Math.max(0, prevM.production_count - m.production_count) : 0;

                return (
                  <div key={station} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    {i > 0 && (
                      <div
                        className="flow-connector"
                        title={wipBuffer > 0 ? `${wipBuffer} WIP parts waiting in buffer` : 'Direct handoff'}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 28 }}
                      >
                        <ChevronRight size={18} />
                        {wipBuffer > 0 && (
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent-copper)', marginTop: -2, whiteSpace: 'nowrap' }}>
                            {wipBuffer} WIP
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className={`machine-node status-${status.toLowerCase()}`}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: isBinding ? '2px solid var(--accent-copper)' : undefined,
                        boxShadow: isBinding ? '0 0 12px rgba(196, 123, 59, 0.25)' : undefined,
                      }}
                    >
                      <div className="node-header">
                        <span className="node-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {mid}
                          {isBinding && (
                            <span style={{ color: 'var(--accent-copper)', fontSize: 10, fontWeight: 700 }}>
                              ★ BINDING
                            </span>
                          )}
                        </span>
                        <span className={`node-status ${status.toLowerCase()}`}>
                          <span className="status-dot" />
                          {status}
                        </span>
                      </div>
                      <div className="node-metrics" style={{ marginTop: 8, paddingTop: 6 }}>
                        <div>
                          <div className="node-metric-label">Output</div>
                          <div className="node-metric-value">{m?.production_count ?? 0} pcs</div>
                        </div>
                        <div>
                          <div className="node-metric-label">Slack</div>
                          <div className="node-metric-value" style={{ color: isBinding ? 'var(--accent-copper)' : 'var(--status-good)' }}>
                            {bDetail ? `+${bDetail.slack_time_s.toFixed(1)}s` : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Discrete Production Token Stream */}
          <div className="analytics-panel">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={16} color="var(--accent-blue)" /> Production Tokens (Discrete Part Lineage)
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {tokens.length} tokens recorded
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px' }}>Token ID</th>
                    <th style={{ padding: '8px' }}>Part Type</th>
                    <th style={{ padding: '8px' }}>Quality Verdict</th>
                    <th style={{ padding: '8px' }}>Lineage History</th>
                    <th style={{ padding: '8px' }}>Emitted Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-md)' }}>
                        No production tokens generated yet. Click "Emit Token to DAG" or wait for steady-state line cadence (~42s).
                      </td>
                    </tr>
                  ) : (
                    tokens.map((token: ProductionToken) => {
                      const isPass = token.quality === 'pass';
                      const isFail = token.quality === 'fail';

                      return (
                        <tr key={token.token_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{token.token_id}</td>
                          <td style={{ padding: '8px' }}>{token.part_type}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: isPass ? 'var(--status-good)' : isFail ? 'var(--status-error)' : 'var(--text-secondary)',
                              background: isPass ? 'rgba(74, 124, 89, 0.1)' : isFail ? 'rgba(184, 92, 74, 0.1)' : 'var(--bg-surface-alt)',
                            }}>
                              {isPass && <CheckCircle2 size={12} />}
                              {isFail && <XCircle size={12} />}
                              {token.quality.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                            {Array.isArray(token.lineage) ? token.lineage.join(' → ') : 'STAMPING-01'}
                          </td>
                          <td style={{ padding: '8px', color: 'var(--text-tertiary)' }}>
                            {new Date(token.emitted_at).toLocaleTimeString('en-GB')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
