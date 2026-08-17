import { useMachines, useSummary } from '../hooks/usePolling';
import { STATION_ORDER, MACHINE_IDS } from '../types';

export default function DigitalTwinPage() {
  const { data: machines } = useMachines(2000);
  const { data: summary } = useSummary(2000);

  return (
    <>
      <div className="page-header">
        <h2>Digital Twin</h2>
        <p>Twin registry, relationships, and synchronization</p>
      </div>

      <div className="analytics-grid">
        {/* Twin Registry */}
        <div className="analytics-panel">
          <div className="panel-header">
            <span className="panel-title">Twin Registry</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              {machines?.length ?? 0} active twins
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {(machines ?? []).map(m => (
              <div key={m.machine_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--space-sm)', borderBottom: '1px solid var(--border-light)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {m.machine_id}
                </span>
                <span className={`status-badge ${m.status.toLowerCase()}`}>{m.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Twin Relationships */}
        <div className="analytics-panel">
          <div className="panel-header">
            <span className="panel-title">Twin Relationships</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 2 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>FACTORY</div>
            {STATION_ORDER.map(s => (
              <div key={s} style={{ paddingLeft: 'var(--space-lg)', color: 'var(--text-secondary)' }}>
                → {MACHINE_IDS[s]}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Synchronization Overview */}
      <div className="detail-section" style={{ marginTop: 'var(--space-md)' }}>
        <div className="detail-section-title">Synchronization Overview</div>
        <div className="telemetry-grid">
          <div className="telemetry-item">
            <div className="telemetry-value">{summary?.twin_health ?? '—'}<span className="telemetry-unit">%</span></div>
            <div className="telemetry-label">Average Sync</div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-value">{summary?.data_freshness_ms.toFixed(0) ?? '—'}<span className="telemetry-unit">ms</span></div>
            <div className="telemetry-label">Data Freshness</div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-value">{machines?.length ?? 0}</div>
            <div className="telemetry-label">Active Models</div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-value">{summary?.telemetry_rate ?? '—'}<span className="telemetry-unit">msg/s</span></div>
            <div className="telemetry-label">Telemetry Rate</div>
          </div>
        </div>
      </div>
    </>
  );
}
