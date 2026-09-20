import { useMachines, useSummary, useSimState } from '../hooks/usePolling';
import { api } from '../services/api';
import { STATION_ORDER, MACHINE_IDS } from '../types';
import type { MachineTelemetry, FactorySummary } from '../types';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  Activity, Zap, Gauge, AlertTriangle, CheckCircle, ShieldCheck, Cpu, RefreshCw, ChevronRight, BarChart2,
} from 'lucide-react';
import DialGauge from '../components/charts/DialGauge';

/* =================================================================
   1. Fleet KPI Strip with Gauges & Metrics
   ================================================================= */
function FleetExecutiveStrip({ summary, machines }: { summary: FactorySummary | null; machines: MachineTelemetry[] }) {
  const avgHealth = useMemo(() => {
    if (machines.length === 0) return 96.0;
    return machines.reduce((s, m) => s + m.health, 0) / machines.length;
  }, [machines]);

  const avgVibration = useMemo(() => {
    if (machines.length === 0) return 1.7;
    return machines.reduce((s, m) => s + m.vibration, 0) / machines.length;
  }, [machines]);

  const maxAnomaly = useMemo(() => {
    if (machines.length === 0) return 0.04;
    return Math.max(...machines.map(m => m.anomaly_score));
  }, [machines]);

  if (!summary) return <div className="kpi-strip"><div className="kpi-card">Loading fleet telemetry...</div></div>;

  return (
    <div className="detail-top-grid" style={{ marginBottom: 'var(--space-md)' }}>
      {/* Primary Line OEE Gauge */}
      <div className="gauge-panel">
        <div className="panel-header" style={{ marginBottom: 'var(--space-xs)' }}>
          <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} color="var(--accent-blue)" /> Plant Line OEE
          </span>
          <span className="status-badge running" style={{ fontSize: 10 }}>CERTIFIED ISO-22400</span>
        </div>
        <DialGauge
          value={summary.oee}
          min={40}
          max={100}
          title="Overall Equipment Effectiveness"
          unit="%"
          targetValue={85}
          subtext="Availability (99%) × Performance (93%) × Quality (98%)"
          size={130}
        />
      </div>

      {/* Fleet Average Health Gauge */}
      <div className="gauge-panel">
        <div className="panel-header" style={{ marginBottom: 'var(--space-xs)' }}>
          <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} color="var(--status-good)" /> Fleet Asset Integrity
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
            5 Connected Stations
          </span>
        </div>
        <DialGauge
          value={avgHealth}
          min={20}
          max={100}
          title="Fleet Mean Health"
          unit="%"
          targetValue={95}
          anomalyScore={maxAnomaly}
          subtext={`Twin synchronization: ${summary.twin_health}% | Vibration: ${avgVibration.toFixed(2)} mm/s`}
          size={130}
        />
      </div>

      {/* Production & Energy KPI Cards */}
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 'var(--space-sm)' }}>
        <div className="kpi-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={13} color="var(--accent-copper)" /> Total Output (Cumulative)
            </div>
            <div className="kpi-value" style={{ fontSize: 'var(--text-2xl)', marginTop: 4 }}>
              {summary.total_output.toLocaleString()} <span className="kpi-unit">pcs</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            <div>Rate: <strong style={{ color: 'var(--accent-blue)' }}>{summary.telemetry_rate} msg/s</strong></div>
            <div>Freshness: <strong style={{ color: 'var(--status-good)' }}>{summary.data_freshness_ms} ms</strong></div>
          </div>
        </div>

        <div className="kpi-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Gauge size={13} color="var(--accent-blue)" /> Energy Consumption
            </div>
            <div className="kpi-value" style={{ fontSize: 'var(--text-2xl)', marginTop: 4 }}>
              {summary.total_energy_kwh.toLocaleString()} <span className="kpi-unit">kWh</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            <div>Active Nodes: <strong style={{ color: 'var(--status-good)' }}>{summary.machines_online} / {summary.machines_total}</strong></div>
            <div>Mean Vib: <strong style={{ color: avgVibration > 3.0 ? 'var(--status-warn)' : 'var(--text-primary)' }}>{avgVibration.toFixed(2)} mm/s</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================================================================
   2. Interactive Manufacturing Flow Grid
   ================================================================= */
function ProductionFlowGrid({
  machines,
  onNavigate,
}: {
  machines: Record<string, MachineTelemetry>;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="production-flow" style={{ marginBottom: 'var(--space-md)' }}>
      <div className="production-flow-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Line Architecture: 5-Stage Automotive Process</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 'normal' }}>
          Select station for diagnostics
        </span>
      </div>

      <div className="flow-container">
        {STATION_ORDER.map((station, i) => {
          const mid = MACHINE_IDS[station];
          const m = machines[mid];
          const status = m?.status ?? 'IDLE';

          return (
            <div key={station} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              {i > 0 && (
                <div className="flow-connector">
                  <ChevronRight size={18} />
                </div>
              )}
              <div
                className={`machine-node status-${status}`}
                style={{ flex: 1, padding: '10px 12px' }}
                onClick={() => onNavigate(mid)}
              >
                <div className="node-header">
                  <span className="node-name">{mid}</span>
                  <span className={`node-status ${status}`}>
                    <span className="status-dot" />
                    {status}
                  </span>
                </div>

                <div className="node-metrics" style={{ marginTop: 8, paddingTop: 6 }}>
                  <div>
                    <div className="node-metric-label">Health</div>
                    <div className="node-metric-value" style={{ color: (m?.health ?? 100) < 70 ? 'var(--status-error)' : 'var(--text-primary)' }}>
                      {m ? `${m.health}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="node-metric-label">Vibration</div>
                    <div className="node-metric-value">{m ? `${m.vibration} mm/s` : '—'}</div>
                  </div>
                  <div>
                    <div className="node-metric-label">Temp</div>
                    <div className="node-metric-value">{m ? `${m.temperature}°C` : '—'}</div>
                  </div>
                  <div>
                    <div className="node-metric-label">Output</div>
                    <div className="node-metric-value">{m ? `${m.production_count} pcs` : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =================================================================
   3. Fleet Multi-Machine Health & Production Trajectory
   ================================================================= */
function FleetTrajectoryChart({ machines }: { machines: MachineTelemetry[] }) {
  const historyRef = useRef<{ time: string; [key: string]: any }[]>([]);

  useEffect(() => {
    if (machines.length === 0) return;
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false, second: '2-digit', minute: '2-digit' });
    const point: { time: string; [key: string]: any } = { time: timeStr };

    for (const m of machines) {
      point[m.machine_id] = m.health;
    }

    historyRef.current = [...historyRef.current.slice(-59), point];
  }, [machines]);

  const colors: Record<string, string> = {
    'STAMPING-01': '#5B7B94',
    'CNC-01': '#C47B3B',
    'WELDING-01': '#B85C4A',
    'INSPECTION-01': '#4A7C59',
    'PACKAGING-01': '#8A6F9E',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <span>Signal: <strong style={{ color: 'var(--text-primary)' }}>Asset Health (%)</strong> Across 5 Stations</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>60s Synchronized Window</span>
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={historyRef.current}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis dataKey="time" fontSize={10} stroke="var(--text-tertiary)" minTickGap={20} />
          <YAxis domain={[0, 100]} fontSize={10} stroke="var(--text-tertiary)" unit="%" />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
              borderRadius: 4,
              fontSize: 11,
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {Object.keys(colors).map(id => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              stroke={colors[id]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* =================================================================
   4. Fleet Health Ranking with Anomaly Badges
   ================================================================= */
function FleetHealthRanking({ machines }: { machines: MachineTelemetry[] }) {
  const sorted = useMemo(() => [...machines].sort((a, b) => a.health - b.health), [machines]);
  const barColor = (h: number) => (h >= 85 ? 'good' : h >= 60 ? 'warn' : 'error');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
      {sorted.map(m => (
        <div
          key={m.machine_id}
          className="health-ranking-item"
          style={{ padding: '6px 8px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}
        >
          <div style={{ width: 110 }}>
            <span className="health-machine-name" style={{ fontSize: 12, fontWeight: 600 }}>{m.machine_id}</span>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{m.station}</div>
          </div>

          <div className="health-bar-track" style={{ height: 8 }}>
            <div className={`health-bar-fill ${barColor(m.health)}`} style={{ width: `${m.health}%` }} />
          </div>

          <div style={{ textAlign: 'right', minWidth: 60 }}>
            <span className="health-value" style={{ fontWeight: 700 }}>{m.health}%</span>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: m.anomaly_score > 0.3 ? 'var(--status-error)' : 'var(--text-tertiary)' }}>
              Anom: {m.anomaly_score.toFixed(2)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================================================================
   5. Fleet Root Cause Analysis & Attention Matrix
   ================================================================= */
function FleetDiagnosticsPanel({ machines, onNavigate }: { machines: MachineTelemetry[]; onNavigate: (id: string) => void }) {
  const degradedList = useMemo(() => {
    return machines.filter(m => m.status === 'DEGRADED' || m.status === 'WARNING' || m.health < 80);
  }, [machines]);

  return (
    <div className="detail-bottom-grid" style={{ marginBottom: 'var(--space-md)' }}>
      {/* Active Diagnostics Summary */}
      <div className="diagnostics-panel" style={{ gridColumn: 'span 2' }}>
        <div className="panel-header" style={{ marginBottom: 'var(--space-sm)' }}>
          <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} color="var(--accent-copper)" /> Plant Diagnostic & Root Cause Matrix
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {degradedList.length > 0 ? `${degradedList.length} Station(s) Under Observation` : 'All 5 Stations Nominal'}
          </span>
        </div>

        {degradedList.length === 0 ? (
          <div className="rca-alert-box healthy">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: 'var(--status-good)' }}>
              <CheckCircle size={16} /> Certified Operational Integrity: 100%
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              Hydraulic pressures, cutting tool flank wear, welding currents, CMM laser tolerances, and palletizer speeds are strictly within calibrated baseline thresholds.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {degradedList.map(m => (
              <div
                key={m.machine_id}
                className={`rca-alert-box ${m.status === 'DEGRADED' ? 'critical' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => onNavigate(m.machine_id)}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{m.machine_id}</span>
                    <span className={`status-badge ${m.status.toLowerCase()}`} style={{ fontSize: 10, padding: '1px 5px' }}>
                      {m.status}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Health: <strong>{m.health}%</strong> | Temp: <strong>{m.temperature}°C</strong> | Vib: <strong>{m.vibration} mm/s</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {m.station === 'CNC' ? 'Flank wear and cutting chatter detected on main spindle.' :
                     m.station === 'STAMPING' ? 'Hydraulic pressure drop & cylinder seal friction drift.' :
                     m.station === 'WELDING' ? 'MIG arc voltage instability & shielding gas flow reduction.' :
                     m.station === 'INSPECTION' ? 'Laser CMM scan optical calibration drift.' :
                     'Conveyor belt slip & palletizer motor current surge.'}
                  </div>
                </div>
                <button className="btn btn-sm" style={{ fontSize: 11, padding: '4px 8px' }}>
                  Drill Down
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Fault Injection & Calibration Panel */}
      <div className="fault-box">
        <div className="panel-header" style={{ marginBottom: 'var(--space-xs)' }}>
          <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cpu size={14} color="var(--accent-blue)" /> Fleet Scenario Injection
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
          Simulate line-wide anomalies or test emergency recalibration.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => api.simDegradeCnc()}
          >
            Trigger CNC Spindle Degradation
          </button>
          <button
            className="btn btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => api.simResetCnc()}
          >
            Calibrate CNC-01 (Reset)
          </button>
          <button
            className="btn btn-sm"
            style={{ width: '100%', justifyContent: 'center', background: 'var(--bg-secondary)' }}
            onClick={() => api.simResetAll()}
          >
            <RefreshCw size={12} style={{ marginRight: 4 }} /> Reset Entire Factory Line
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================================================================
   Main Overview Page Component
   ================================================================= */
export default function OverviewPage() {
  const { data: machines } = useMachines(1000);
  const { data: summary } = useSummary(1000);
  const navigate = useNavigate();

  const machineMap = useMemo(() => {
    const map: Record<string, MachineTelemetry> = {};
    if (machines) {
      for (const m of machines) map[m.machine_id] = m;
    }
    return map;
  }, [machines]);

  const handleNavigate = (mid: string) => {
    navigate(`/machines/${mid}`);
  };

  return (
    <>
      {/* Fleet Executive Summary Strip with Gauges */}
      <FleetExecutiveStrip summary={summary} machines={machines ?? []} />

      {/* Production Flow Architecture */}
      <ProductionFlowGrid machines={machineMap} onNavigate={handleNavigate} />

      {/* Analytics Grid: Multi-Machine Trajectory & Ranking */}
      <div className="analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header">
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart2 size={14} color="var(--accent-blue)" /> Fleet Health Trajectory (60s Real-Time)
            </span>
          </div>
          <FleetTrajectoryChart machines={machines ?? []} />
        </div>

        <div className="analytics-panel">
          <div className="panel-header">
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} color="var(--status-good)" /> Machine Integrity Ranking
            </span>
          </div>
          <FleetHealthRanking machines={machines ?? []} />
        </div>
      </div>

      {/* Root Cause Analysis & Line-wide Control */}
      <FleetDiagnosticsPanel machines={machines ?? []} onNavigate={handleNavigate} />
    </>
  );
}
