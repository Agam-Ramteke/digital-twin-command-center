import { useEffect, useState } from 'react';
import { useSimState, useSystemReadiness } from '../../hooks/usePolling';
import { useMqtt } from '../../hooks/useMqtt';

export default function Header() {
  const [time, setTime] = useState(new Date());
  const { data: simState, connected: simConnected } = useSimState(2000);
  const { data: readiness, connected: backendConnected } = useSystemReadiness(2000);
  const { isConnected: isMqtt } = useMqtt();

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isOnline = backendConnected && readiness?.status === 'ready';
  const persistenceLabel = readiness?.persistence_backend ? readiness.persistence_backend.toUpperCase() : 'MEM';

  const statusText = isOnline
    ? (simState?.cnc_degrading ? 'CNC DEGRADING' : 'SYSTEM ONLINE')
    : 'BACKEND OFFLINE';

  const dotColor = isOnline
    ? (simState?.cnc_degrading ? 'var(--status-warn)' : 'var(--status-good)')
    : 'var(--status-crit)';

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="header-title">Factory Twin</span>
        <span className="header-subtitle">Automotive Component Manufacturing</span>
      </div>
      <div className="header-right">
        {/* Backend & Persistence Badge */}
        <div
          className="protocol-badge"
          title={`Backend: ${isOnline ? 'Online (FastAPI)' : 'Offline'} | Persistence: ${readiness?.persistence_backend || 'unknown'}`}
          style={{
            border: `1px solid ${isOnline ? 'var(--border-medium)' : 'var(--status-crit)'}`,
            background: isOnline ? 'var(--bg-surface)' : 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <span
            className="status-dot"
            style={{ backgroundColor: isOnline ? 'var(--status-good)' : 'var(--status-crit)' }}
          />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {isOnline ? `LIVE API [${persistenceLabel}]` : 'OFFLINE'}
          </span>
        </div>

        {/* Protocol status badge */}
        <div
          className="protocol-badge"
          title={isMqtt ? 'Real-time MQTT streaming on ws://localhost:9001' : 'REST Polling on port 8000'}
        >
          <span
            className="status-dot"
            style={{ backgroundColor: isMqtt ? 'var(--status-good)' : 'var(--accent-blue)' }}
          />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {isMqtt ? 'MQTT LIVE' : 'REST POLLING'}
          </span>
        </div>

        <div className="header-status">
          <span className="status-dot" style={{ backgroundColor: dotColor }} />
          {statusText}
        </div>
        <div className="header-time">
          {time.toLocaleTimeString('en-GB', { hour12: false })}
        </div>
      </div>
    </header>
  );
}
