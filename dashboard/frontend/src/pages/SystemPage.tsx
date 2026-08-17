import { useSimState, useSummary } from '../hooks/usePolling';

const SERVICES = [
  { name: 'Simulator', key: 'running' as const, detail: 'Python process' },
  { name: 'FastAPI Backend', key: 'connected' as const, detail: 'REST API' },
  { name: 'MQTT Broker', key: 'placeholder' as const, detail: 'Future integration' },
  { name: 'Twin API', key: 'placeholder' as const, detail: 'Future integration' },
  { name: 'Database', key: 'placeholder' as const, detail: 'Future integration' },
  { name: 'Edge Processor', key: 'placeholder' as const, detail: 'Future integration' },
  { name: 'Cloud Connector', key: 'placeholder' as const, detail: 'Future integration' },
  { name: 'Predictive Model', key: 'mock' as const, detail: 'Simulated predictions' },
];

export default function SystemPage() {
  const { data: simState, connected } = useSimState(2000);
  const { data: summary } = useSummary(2000);

  const getStatus = (key: string) => {
    if (key === 'running') return simState?.running ? 'RUNNING' : 'STOPPED';
    if (key === 'connected') return connected ? 'CONNECTED' : 'OFFLINE';
    if (key === 'mock') return 'MOCK';
    return 'PLACEHOLDER';
  };

  const getBadgeClass = (key: string) => {
    if (key === 'running') return simState?.running ? 'running' : 'idle';
    if (key === 'connected') return connected ? 'connected' : 'degraded';
    if (key === 'mock') return 'mock';
    return 'placeholder';
  };

  return (
    <>
      <div className="page-header">
        <h2>System Status</h2>
        <p>Infrastructure and service health</p>
      </div>

      <div className="system-grid">
        {SERVICES.map(s => (
          <div key={s.name} className="system-service">
            <div>
              <div className="service-name">{s.name}</div>
              <div className="service-detail">{s.detail}</div>
            </div>
            <span className={`status-badge ${getBadgeClass(s.key)}`}>
              {getStatus(s.key)}
            </span>
          </div>
        ))}
      </div>

      {/* System Metrics */}
      <div style={{ marginTop: 'var(--space-lg)' }}>
        <div className="detail-section">
          <div className="detail-section-title">System Metrics</div>
          <div className="telemetry-grid">
            <div className="telemetry-item">
              <div className="telemetry-value">{summary?.telemetry_rate ?? '—'}<span className="telemetry-unit">msg/s</span></div>
              <div className="telemetry-label">Message Rate</div>
            </div>
            <div className="telemetry-item">
              <div className="telemetry-value">{summary?.data_freshness_ms.toFixed(0) ?? '—'}<span className="telemetry-unit">ms</span></div>
              <div className="telemetry-label">Avg Latency</div>
            </div>
            <div className="telemetry-item">
              <div className="telemetry-value">{simState?.tick ?? '—'}</div>
              <div className="telemetry-label">Simulation Tick</div>
            </div>
            <div className="telemetry-item">
              <div className="telemetry-value">{simState?.scenario ?? '—'}</div>
              <div className="telemetry-label">Active Scenario</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
