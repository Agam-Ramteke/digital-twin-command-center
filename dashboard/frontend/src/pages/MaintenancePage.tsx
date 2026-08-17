import { useMachines } from '../hooks/usePolling';
import { useMemo } from 'react';

export default function PredictiveMaintenancePage() {
  const { data: machines } = useMachines(2000);

  const rows = useMemo(() => {
    if (!machines) return [];
    return machines.map(m => {
      const risk = m.health < 70 ? 'Medium' : m.health < 85 ? 'Low' : 'Minimal';
      const condition = m.station === 'CNC' && m.tool_wear !== null && m.tool_wear > 50
        ? 'Tool degradation'
        : m.health < 85 ? 'Moderate wear' : 'Stable';
      const action = m.station === 'CNC' && m.tool_wear !== null && m.tool_wear > 50
        ? 'Inspect tool'
        : m.health < 85 ? 'Monitor' : 'Continue';
      return { ...m, risk, condition, action };
    }).sort((a, b) => a.health - b.health);
  }, [machines]);

  return (
    <>
      <div className="page-header">
        <h2>Predictive Maintenance</h2>
        <p>Machine health, risk assessment, and recommended actions</p>
      </div>

      <div className="machine-table-wrapper">
        <table className="machine-table">
          <thead>
            <tr>
              <th>Machine</th>
              <th>Health</th>
              <th>Risk</th>
              <th>RUL</th>
              <th>Condition</th>
              <th>Anomaly</th>
              <th>Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.machine_id}>
                <td className="table-machine-id">{r.machine_id}</td>
                <td>
                  <span style={{ color: r.health < 70 ? 'var(--status-error)' : r.health < 85 ? 'var(--status-warn)' : 'var(--status-good)' }}>
                    {r.health}%
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${r.risk === 'Medium' ? 'warning' : 'running'}`}>
                    {r.risk}
                  </span>
                </td>
                <td>{r.rul_cycles !== null ? `${r.rul_cycles} cycles` : '—'}</td>
                <td>{r.condition}</td>
                <td>{r.anomaly_score}</td>
                <td style={{ fontWeight: 500 }}>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
