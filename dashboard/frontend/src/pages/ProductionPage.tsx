import { useMachines, useSummary } from '../hooks/usePolling';
import { STATION_ORDER, MACHINE_IDS } from '../types';
import { useMemo, useRef, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { ChevronRight } from 'lucide-react';

export default function ProductionPage() {
  const { data: machines } = useMachines(1000);
  const { data: summary } = useSummary(1000);
  const historyRef = useRef<{ time: string; output: number; target: number }[]>([]);

  useEffect(() => {
    if (!machines) return;
    const total = machines.reduce((s, m) => s + m.production_count, 0);
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false, second: '2-digit', minute: '2-digit' });
    historyRef.current = [
      ...historyRef.current.slice(-59),
      { time: timeStr, output: total, target: Math.round(total * 1.05 + 2) },
    ];
  }, [machines]);

  const machineMap = useMemo(() => {
    const map: Record<string, (typeof machines extends (infer U)[] | null ? U : never)> = {};
    if (machines) for (const m of machines) map[m.machine_id] = m;
    return map;
  }, [machines]);

  const latestData = historyRef.current.length > 0 ? historyRef.current[historyRef.current.length - 1] : null;

  return (
    <>
      <div className="page-header">
        <h2>Production</h2>
        <p>Real-time manufacturing output and line performance</p>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Total Output</div>
          <div className="kpi-value">{summary?.total_output ?? '—'}<span className="kpi-unit">pcs</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Line OEE</div>
          <div className="kpi-value">{summary?.oee ?? '—'}<span className="kpi-unit">%</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Energy</div>
          <div className="kpi-value">{summary?.total_energy_kwh ?? '—'}<span className="kpi-unit">kWh</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Online Stations</div>
          <div className="kpi-value">{summary?.machines_online ?? '—'}<span className="kpi-unit">/ {summary?.machines_total ?? 5}</span></div>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="flow-container" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="flow-nodes">
          {STATION_ORDER.map((station, i) => {
            const mid = MACHINE_IDS[station];
            const m = machineMap[mid];
            return (
              <div key={station} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <ChevronRight className="flow-arrow" size={16} />}
                <div className={`flow-node ${m?.status.toLowerCase() ?? 'running'}`}>
                  <div className="node-header">
                    <span className="node-name">{mid}</span>
                    <span className={`node-status ${m?.status ?? 'IDLE'}`}>
                      <span className="status-dot" />
                      {m?.status ?? '—'}
                    </span>
                  </div>
                  <div className="node-metrics">
                    <div>
                      <div className="node-metric-label">Output</div>
                      <div className="node-metric-value">{m?.production_count ?? '—'}</div>
                    </div>
                    <div>
                      <div className="node-metric-label">Cycle</div>
                      <div className="node-metric-value">{m ? `${m.cycle_time}s` : '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Output Trend */}
      <div className="analytics-panel" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
          <div>
            <span className="panel-title">Production Throughput & Schedule Variance</span>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Actual parts produced vs planned manufacturing run rate
            </div>
          </div>
          {latestData && (
            <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <span>Actual: <strong style={{ color: 'var(--accent-blue)' }}>{latestData.output} pcs</strong></span>
              <span>Target: <strong style={{ color: 'var(--accent-copper)' }}>{latestData.target} pcs</strong></span>
              <span>Variance: <strong style={{ color: 'var(--status-warn)' }}>-{(latestData.target - latestData.output)} pcs</strong></span>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={historyRef.current}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis dataKey="time" fontSize={10} stroke="var(--text-tertiary)" minTickGap={25} />
            <YAxis width={45} fontSize={10} stroke="var(--text-tertiary)" />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                borderRadius: 4,
                fontSize: 12,
                boxShadow: 'var(--shadow-md)',
              }}
            />
            <Line type="monotone" dataKey="output" stroke="var(--accent-blue)" strokeWidth={2} dot={false} isAnimationActive={false} name="Actual Output (pcs)" />
            <Line type="monotone" dataKey="target" stroke="var(--accent-copper)" strokeWidth={1.8} dot={false} strokeDasharray="4 4" isAnimationActive={false} name="Target Plan (pcs)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
