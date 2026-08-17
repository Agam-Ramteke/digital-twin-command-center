import { useMachines } from '../hooks/usePolling';
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';

type Tab = 'production' | 'energy' | 'health' | 'cycle';

export default function AnalyticsPage() {
  const { data: machines } = useMachines(1000);
  const [tab, setTab] = useState<Tab>('production');

  const barData = useMemo(() => {
    if (!machines) return [];
    return machines.map(m => ({
      name: m.machine_id.replace('-01', ''),
      fullName: m.machine_id,
      output: m.production_count,
      energy: m.energy_kwh,
      health: m.health,
      cycle: m.cycle_time,
    }));
  }, [machines]);

  // Rolling energy history with timestamps
  const energyRef = useRef<{ time: string; energy: number; powerKw: number }[]>([]);
  const lastEnergyRef = useRef<number>(0);

  useEffect(() => {
    if (!machines) return;
    const total = machines.reduce((s, m) => s + m.energy_kwh, 0);
    const power = lastEnergyRef.current > 0 ? (total - lastEnergyRef.current) * 3600 : 0; // kW approx
    lastEnergyRef.current = total;

    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false, second: '2-digit', minute: '2-digit' });
    energyRef.current = [
      ...energyRef.current.slice(-59),
      { time: timeStr, energy: Math.round(total * 10) / 10, powerKw: Math.max(0, Math.round(power * 10) / 10) },
    ];
  }, [machines]);

  const TABS: { key: Tab; label: string; unit: string }[] = [
    { key: 'production', label: 'Production Output', unit: 'pcs' },
    { key: 'energy', label: 'Energy Consumption', unit: 'kWh' },
    { key: 'health', label: 'Asset Health Index', unit: '%' },
    { key: 'cycle', label: 'Cycle Duration', unit: 's' },
  ];

  const activeTabObj = TABS.find(t => t.key === tab) || TABS[0];
  const barKey = tab === 'production' ? 'output' : tab === 'energy' ? 'energy' : tab === 'health' ? 'health' : 'cycle';
  const barColor = tab === 'health' ? 'var(--status-good)' : tab === 'energy' ? 'var(--accent-copper)' : 'var(--accent-blue)';

  const latestEnergy = energyRef.current.length > 0 ? energyRef.current[energyRef.current.length - 1] : null;

  return (
    <>
      <div className="page-header">
        <h2>Analytics & Performance Diagnostics</h2>
        <p>Comparative cross-station telemetry and energy distribution workspace</p>
      </div>

      <div className="chart-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`chart-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
            <div>
              <span className="panel-title">{activeTabObj.label} by Station</span>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Cross-station comparison calibrated in {activeTabObj.unit}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis dataKey="name" fontSize={11} stroke="var(--text-tertiary)" />
              <YAxis width={45} fontSize={10} stroke="var(--text-tertiary)" unit={activeTabObj.unit === '%' ? '%' : ''} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 4,
                  fontSize: 12,
                  boxShadow: 'var(--shadow-md)',
                }}
                formatter={(val: any) => [`${val} ${activeTabObj.unit}`, activeTabObj.label]}
              />
              <Bar dataKey={barKey} fill={barColor} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-panel">
          <div className="panel-header" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
            <div>
              <span className="panel-title">Cumulative Energy & Power Draw</span>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Live electrical load trajectory across all 5 machines
              </div>
            </div>
            {latestEnergy && (
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                Total: <strong style={{ color: 'var(--accent-copper)' }}>{latestEnergy.energy} kWh</strong>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={energyRef.current}>
              <defs>
                <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-copper)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent-copper)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis dataKey="time" fontSize={10} stroke="var(--text-tertiary)" minTickGap={25} />
              <YAxis width={45} fontSize={10} stroke="var(--text-tertiary)" unit="kWh" />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 4,
                  fontSize: 12,
                  boxShadow: 'var(--shadow-md)',
                }}
                formatter={(val: any) => [`${val} kWh`, 'Cumulative Energy']}
              />
              <Area type="monotone" dataKey="energy" stroke="var(--accent-copper)" fill="url(#energyGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
