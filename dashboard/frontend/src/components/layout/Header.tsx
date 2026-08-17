import { useEffect, useState } from 'react';
import { useSimState } from '../../hooks/usePolling';
import { useMqtt } from '../../hooks/useMqtt';

export default function Header() {
  const [time, setTime] = useState(new Date());
  const { data: simState, connected, isMqtt } = useSimState(2000);
  const { statusText: mqttStatus } = useMqtt();

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const statusText = connected
    ? (simState?.cnc_degrading ? 'CNC DEGRADING' : 'SYSTEM ONLINE')
    : 'DISCONNECTED';
  const dotClass = connected
    ? (simState?.cnc_degrading ? 'warn' : '')
    : 'warn';

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="header-title">Factory Twin</span>
        <span className="header-subtitle">Automotive Component Manufacturing</span>
      </div>
      <div className="header-right">
        {/* Protocol status badge */}
        <div className="protocol-badge" title={isMqtt ? "Real-time MQTT streaming on ws://localhost:9001" : "Polling REST backend on port 8000"}>
          <span className={`status-dot ${isMqtt ? '' : 'neutral'}`} style={{ backgroundColor: isMqtt ? 'var(--status-good)' : 'var(--accent-blue)' }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {isMqtt ? 'MQTT CONNECTED' : 'REST POLLING'}
          </span>
        </div>

        <div className="header-status">
          <span className={`status-dot ${dotClass}`} />
          {statusText}
        </div>
        <div className="header-time">
          {time.toLocaleTimeString('en-GB', { hour12: false })}
        </div>
      </div>
    </header>
  );
}
