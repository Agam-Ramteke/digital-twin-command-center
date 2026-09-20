import { useMachines } from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';

export default function MachinesPage() {
  const { data: machines, connected } = useMachines(1000);
  const navigate = useNavigate();

  if (!connected) {
    return <div style={{ color: 'var(--text-secondary)' }}>Connection lost — waiting for backend...</div>;
  }

  return (
    <>
      <div className="page-header">
        <h2>Machines</h2>
        <p>All manufacturing stations — click a row for detail view</p>
      </div>

      <div className="machine-table-wrapper">
        <table className="machine-table">
          <thead>
            <tr>
              <th>Station / Machine</th>
              <th>Status</th>
              <th>Health</th>
              <th>Cycle</th>
              <th>Output</th>
              <th>Temp</th>
              <th>Vibration</th>
              <th>Anomaly</th>
            </tr>
          </thead>
          <tbody>
            {(machines ?? []).map(m => {
              const statusClass = m.status.toLowerCase();
              return (
                <tr key={m.machine_id} onClick={() => navigate(`/machines/${m.machine_id}`)}>
                  <td className="table-machine-id">
                    <div>{m.machine_id}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 'normal' }}>{m.station}</div>
                  </td>
                  <td><span className={`status-badge ${statusClass}`}>{m.status}</span></td>
                  <td>{m.health}%</td>
                  <td>{m.cycle_time}s</td>
                  <td>{m.production_count}</td>
                  <td>{m.temperature}°C</td>
                  <td>{m.vibration} mm/s</td>
                  <td>{m.anomaly_score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
