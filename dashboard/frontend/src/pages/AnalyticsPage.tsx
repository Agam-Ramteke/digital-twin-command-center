import { useMachines } from '../hooks/usePolling';
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import SmoothTab from '../components/kokonutui/smooth-tab';
import Loader from '../components/kokonutui/loader';
import MetricCard from '../components/kokonutui/metric-card';
import { LineChart, Line } from '../components/charts/line-chart';
import { Grid } from '../components/charts/grid';
import { XAxis as ChartXAxis } from '../components/charts/x-axis';
import { ChartTooltip } from '../components/charts/tooltip';

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

  // Rolling energy history with timestamps for @bklit/line-chart
  const [energyHistory, setEnergyHistory] = useState<{ date: Date; time: string; energy: number; powerKw: number }[]>([]);
  const lastEnergyRef = useRef<number>(0);

  useEffect(() => {
    if (!machines) return;
    const total = machines.reduce((s, m) => s + m.energy_kwh, 0);
    const power = lastEnergyRef.current > 0 ? (total - lastEnergyRef.current) * 3600 : 18.2;
    lastEnergyRef.current = total;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false, second: '2-digit', minute: '2-digit' });
    const point = {
      date: now,
      time: timeStr,
      energy: Math.round(total * 10) / 10,
      powerKw: Math.max(0, Math.round(power * 10) / 10),
    };

    setEnergyHistory((prev) => {
      if (prev.length === 0) {
        const seeds = [4, 3, 2, 1].map((sec) => ({
          date: new Date(now.getTime() - sec * 1000),
          time: new Date(now.getTime() - sec * 1000).toLocaleTimeString('en-GB', { hour12: false, second: '2-digit', minute: '2-digit' }),
          energy: Math.max(0, Math.round((total - sec * 0.04) * 10) / 10),
          powerKw: Math.round((18 + Math.random() * 2) * 10) / 10,
        }));
        return [...seeds, point];
      }
      return [...prev.slice(-30), point];
    });
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

  const latestEnergy = energyHistory.length > 0 ? energyHistory[energyHistory.length - 1] : null;

  return (
    <>
      <div className="page-header">
        <h2>Analytics & Performance Diagnostics</h2>
        <p>Comparative cross-station telemetry and energy distribution workspace</p>
      </div>

      <div style={{ marginBottom: 'var(--space-md)' }}>
        <SmoothTab
          items={[
            { id: 'production', title: 'Production Output' },
            { id: 'energy', title: 'Energy Consumption' },
            { id: 'health', title: 'Asset Health Index' },
            { id: 'cycle', title: 'Cycle Duration' },
          ]}
          value={tab}
          onChange={(tabId) => setTab(tabId as Tab)}
          className="max-w-xl mx-auto"
        />
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
              <span className="panel-title">Cumulative Energy & Power Draw (@bklit/line-chart)</span>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                High-precision interpolated telemetry stream with live power trajectory
              </div>
            </div>
            {latestEnergy && (
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                Total: <strong style={{ color: 'var(--accent-copper)' }}>{latestEnergy.energy} kWh</strong>
              </div>
            )}
          </div>
          <div style={{ height: 230, width: '100%', position: 'relative' }}>
            {energyHistory.length > 1 ? (
              <LineChart
                data={energyHistory}
                xDataKey="date"
                className="w-full h-full"
                aspectRatio=""
                margin={{ top: 15, right: 20, bottom: 30, left: 20 }}
              >
                <Grid horizontal vertical stroke="var(--border-medium)" strokeWidth={1} strokeDasharray="3 3" />
                <Line dataKey="energy" stroke="var(--accent-copper)" strokeWidth={2.5} />
                <Line dataKey="powerKw" stroke="var(--accent-blue)" strokeWidth={2} />
                <ChartTooltip showDatePill showCrosshair showDots />
                <ChartXAxis numTicks={5} />
              </LineChart>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Loader size="sm" title="Awaiting Energy Telemetry" subtitle="Collecting first 60s window..." />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Long-Range Telemetry Trajectory & Morphing Trends (MetricCard by Kokonut UI) */}
      <div style={{ marginTop: 'var(--space-lg)' }}>
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Long-Range Telemetry Trajectory & Morphing Trends
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
            Interactive timeline scrubbing, multi-day range selection, and Catmull-Rom spline breakdown by cell
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-md)' }}>
          <MetricCard
            label="Plant Production Output"
            unit="pcs"
            segments={['Stamping Press', 'CNC Machining', 'Robotic Welding', 'Inspection & Pack']}
            format="number"
            defaultPeriod={30}
          />
          <MetricCard
            label="Line Energy Consumption"
            unit="kWh"
            segments={['Hydraulic Units', 'Spindle Drives', 'Robotic Arms', 'Pneumatics & Aux']}
            format="number"
            defaultPeriod={30}
          />
        </div>
      </div>
    </>
  );
}
