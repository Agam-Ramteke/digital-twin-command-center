import { useMachines, useSummary, useProcessBottleneck, useProductionTokens, useDefectTrace } from '../hooks/usePolling';
import { api } from '../services/api';
import { STATION_ORDER, MACHINE_IDS, type ProductionToken } from '../types';
import { useMemo, useRef, useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Activity,
  Layers,
  Search,
} from 'lucide-react';

export default function ProductionPage() {
  const { data: machines } = useMachines(1000);
  const { data: summary } = useSummary(1000);
  const { data: bottleneck } = useProcessBottleneck(2000);
  const { data: rawTokens } = useProductionTokens(2000, 30);
  const { data: defectReport } = useDefectTrace(3000, 50);

  const tokens = Array.isArray(rawTokens) ? rawTokens : [];

  const [selectedToken, setSelectedToken] = useState<ProductionToken | null>(null);
  const [tokenFilter, setTokenFilter] = useState<'ALL' | 'PASS' | 'FAIL' | 'PENDING'>('ALL');
  const [isEmitting, setIsEmitting] = useState(false);

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

  const filteredTokens = useMemo(() => {
    if (tokenFilter === 'PASS') return tokens.filter(t => t.quality === 'pass');
    if (tokenFilter === 'FAIL') return tokens.filter(t => t.quality === 'fail');
    if (tokenFilter === 'PENDING') return tokens.filter(t => t.quality === 'pending');
    return tokens;
  }, [tokens, tokenFilter]);

  const handleEmitToken = async () => {
    try {
      setIsEmitting(true);
      await api.emitProductionToken();
    } catch (e) {
      console.error('Failed to emit token:', e);
    } finally {
      setIsEmitting(false);
    }
  };

  const latestData = historyRef.current.length > 0 ? historyRef.current[historyRef.current.length - 1] : null;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Production & Process Twin</h2>
          <p>Discrete token lineage, sequential DAG balancing, and bottleneck attribution</p>
        </div>
        <button
          className="btn-primary"
          onClick={handleEmitToken}
          disabled={isEmitting}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--text-sm)' }}
        >
          <Zap size={14} />
          {isEmitting ? 'Emitting...' : 'Emit Token to DAG'}
        </button>
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
          <div className="kpi-label">Binding Constraint</div>
          <div className="kpi-value" style={{ color: 'var(--accent-copper)', fontSize: '1.25rem' }}>
            {bottleneck?.binding_machine_id ?? '—'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 2 }}>
            Cycle: {bottleneck?.binding_cycle_time_s ? `${bottleneck.binding_cycle_time_s}s` : '—'}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Max Line Capacity</div>
          <div className="kpi-value">
            {bottleneck?.max_line_capacity_per_hour ? bottleneck.max_line_capacity_per_hour.toFixed(1) : '—'}<span className="kpi-unit">parts/hr</span>
          </div>
        </div>
      </div>

      {/* DAG Flow Diagram with Bottleneck Annotation */}
      <div className="production-flow" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="production-flow-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            <Layers size={14} />
            Sequential DAG Balancing
          </div>
          {bottleneck && (
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textTransform: 'none' }}>
              Bottleneck: <strong style={{ color: 'var(--accent-copper)' }}>{bottleneck.binding_machine_id}</strong> ({bottleneck.binding_cycle_time_s}s)
            </span>
          )}
        </div>

        <div className="flow-container">
          {STATION_ORDER.map((station, i) => {
            const mid = MACHINE_IDS[station];
            const m = machineMap[mid];
            const bDetail = bottleneck?.stations ? bottleneck.stations.find(s => s.machine_id === mid) : undefined;
            const isBinding = bDetail?.is_bottleneck;
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
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: isBinding ? '2px solid var(--accent-copper)' : undefined,
                    boxShadow: isBinding ? '0 0 12px rgba(217, 119, 6, 0.25)' : undefined,
                  }}
                >
                  <div className="node-header">
                    <span className="node-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {mid}
                      {isBinding && (
                        <span title="Binding Line Bottleneck" style={{ color: 'var(--accent-copper)', fontSize: 10, fontWeight: 700 }}>
                          ★ BINDING
                        </span>
                      )}
                    </span>
                    <span className={`node-status ${status}`}>
                      <span className="status-dot" />
                      {status}
                    </span>
                  </div>
                  <div className="node-metrics" style={{ marginTop: 8, paddingTop: 6 }}>
                    <div>
                      <div className="node-metric-label">Effective CT</div>
                      <div className="node-metric-value">
                        {bDetail ? `${bDetail.effective_cycle_time_s.toFixed(1)}s` : (m ? `${m.cycle_time}s` : '—')}
                      </div>
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

      {/* Discrete Token Lineage & Defect Attribution Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        {/* Token Stream & Lineage */}
        <div className="analytics-panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
              <Activity size={16} style={{ color: 'var(--accent-blue)' }} />
              <span className="panel-title">Production Token Lineage</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['ALL', 'PASS', 'FAIL', 'PENDING'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTokenFilter(f)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: 4,
                    border: '1px solid var(--border-medium)',
                    background: tokenFilter === f ? 'var(--accent-blue)' : 'var(--bg-surface)',
                    color: tokenFilter === f ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>Token ID</th>
                  <th>Source</th>
                  <th>Emitted</th>
                  <th>Quality Verdict</th>
                  <th>Stations Traversed</th>
                  <th>Lineage</th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-md)' }}>
                      No production tokens recorded yet. Tokens emit every ~42s (physical cycle) or click "Emit Token to DAG".
                    </td>
                  </tr>
                ) : (
                  filteredTokens.map(token => {
                    const isSelected = selectedToken?.token_id === token.token_id;
                    const lineageCount = Array.isArray(token.lineage) ? token.lineage.length : 0;
                    const isPass = token.quality === 'pass';
                    const isFail = token.quality === 'fail';

                    return (
                      <tr
                        key={token.token_id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedToken(token)}
                      >
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{token.token_id}</td>
                        <td>{token.source_station}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 11 }}>
                          {token.emitted_at ? new Date(token.emitted_at).toLocaleTimeString() : '—'}
                        </td>
                        <td>
                          {isFail ? (
                            <span className="status-badge crit" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                              <XCircle size={10} /> REJECT
                            </span>
                          ) : isPass ? (
                            <span className="status-badge good" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                              <CheckCircle2 size={10} /> PASS
                            </span>
                          ) : (
                            <span className="status-badge warn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                              <Clock size={10} /> PENDING
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>{lineageCount} / 5 stations</td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedToken(token);
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upstream Defect Root-Cause Attribution */}
        <div className="analytics-panel">
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
            <AlertTriangle size={16} style={{ color: 'var(--accent-copper)' }} />
            <span className="panel-title">Defect Attribution</span>
          </div>

          <div style={{ padding: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 'var(--space-xs)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Evaluated Tokens:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{defectReport?.total_tokens_evaluated ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 'var(--space-md)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Defect Rate:</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-warn)' }}>
                {defectReport?.defect_rate_percent != null ? `${defectReport.defect_rate_percent.toFixed(1)}%` : '0.0%'}
              </strong>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              Upstream Root Cause
            </div>

            {defectReport?.attributions && defectReport.attributions.length > 0 ? (
              defectReport.attributions.map((attr) => (
                <div key={attr.station} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span>{attr.station} ({attr.machine_id})</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{attr.attribution_percent.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, width: '100%', background: 'var(--border-light)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${attr.attribution_percent}%`,
                        background: attr.station === 'CNC' ? 'var(--accent-blue)' : (attr.station === 'WELDING' ? 'var(--accent-copper)' : 'var(--status-warn)'),
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, padding: 'var(--space-md) 0' }}>
                Nominal line quality. No active defect clusters.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Token Lineage Detailed Inspection Panel */}
      {selectedToken && (
        <div className="analytics-panel" style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--accent-blue)' }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Search size={16} style={{ color: 'var(--accent-blue)' }} />
              <span className="panel-title">
                Lineage for Token: <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedToken.token_id}</strong>
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                ({selectedToken.emitted_at ? new Date(selectedToken.emitted_at).toLocaleTimeString() : ''})
              </span>
            </div>
            <button
              className="btn-secondary"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setSelectedToken(null)}
            >
              Close
            </button>
          </div>

          <div style={{ padding: 'var(--space-md)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)', overflowX: 'auto', paddingBottom: 'var(--space-sm)' }}>
              {(selectedToken.lineage || []).map((machineId: string, idx: number) => {
                const flags = selectedToken.carried_flags || {};
                let signal1 = '';
                let signal2 = '';

                if (machineId.includes('STAMPING')) {
                  signal1 = flags.stamping_force_kn ? `Force: ${flags.stamping_force_kn.toFixed(1)} kN` : '';
                  signal2 = flags.stamping_quality ? `Quality: ${(flags.stamping_quality * 100).toFixed(1)}%` : '';
                } else if (machineId.includes('CNC')) {
                  signal1 = flags.cnc_tool_wear_percent != null ? `Wear: ${flags.cnc_tool_wear_percent.toFixed(1)}%` : '';
                  signal2 = flags.machining_quality ? `Quality: ${(flags.machining_quality * 100).toFixed(1)}%` : '';
                } else if (machineId.includes('WELDING')) {
                  signal1 = flags.welding_voltage_v ? `Voltage: ${flags.welding_voltage_v.toFixed(1)} V` : '';
                  signal2 = flags.weld_quality ? `Quality: ${(flags.weld_quality * 100).toFixed(1)}%` : '';
                } else if (machineId.includes('INSPECTION')) {
                  signal1 = flags.inspection_verdict ? `Verdict: ${flags.inspection_verdict}` : '';
                  signal2 = flags.defect_probability != null ? `Defect p: ${(flags.defect_probability * 100).toFixed(2)}%` : '';
                } else if (machineId.includes('PACKAGING')) {
                  signal1 = flags.disposition ? `Disposition: ${flags.disposition}` : '';
                  signal2 = flags.dispatched != null ? (flags.dispatched ? 'Dispatched' : 'Held') : '';
                }

                return (
                  <div
                    key={machineId}
                    style={{
                      minWidth: 160,
                      padding: 'var(--space-sm)',
                      borderRadius: 6,
                      border: '1px solid var(--border-medium)',
                      background: 'var(--bg-surface)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>{idx + 1}. {machineId}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--status-good)', marginBottom: 2 }}>
                      Status: Traversing
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {signal1 && <div>{signal1}</div>}
                      {signal2 && <div>{signal2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Output Trend */}
      <div className="analytics-panel" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
          <div>
            <span className="panel-title">Production Throughput</span>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Actual parts produced vs planned manufacturing cadence
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
