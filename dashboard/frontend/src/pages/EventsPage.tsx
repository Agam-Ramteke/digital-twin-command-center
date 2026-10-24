import { useEvents, useMachines } from '../hooks/usePolling';
import type { FactoryEvent, StationType } from '../types';
import { useState, useMemo } from 'react';

/** Map backend EventEnvelope records into FactoryEvent view models */
function parseEnvelopeToEvent(item: any): FactoryEvent {
  const payload = item.payload || {};
  const status = payload.status || 'RUNNING';
  const station: StationType = payload.station || item.machine_id?.split('-')[0] || 'CNC';
  const hasFault = Boolean(payload.fault_code);
  const isDegraded = status === 'DEGRADED' || status === 'WARNING';
  const isCritical = status === 'FAULT' || hasFault;

  let severity: 'Info' | 'Warning' | 'Error' = 'Info';
  if (isCritical) severity = 'Error';
  else if (isDegraded || (payload.anomaly_score && payload.anomaly_score > 0.4)) severity = 'Warning';

  let type: 'Condition' | 'Production' | 'System' | 'Maintenance' = 'System';
  if (isCritical || isDegraded) type = 'Condition';
  else if (payload.tool_wear_percent && payload.tool_wear_percent > 60) type = 'Maintenance';
  else if (item.kind === 'production') type = 'Production';

  let description = `Sequence #${item.sequence ?? 0} telemetry received`;
  if (payload.fault_code) {
    description = `Fault detected: ${payload.fault_code} (Status: ${status})`;
  } else if (status === 'DEGRADED') {
    description = `Performance degradation observed (Health: ${payload.health_score ?? 0}%)`;
  } else if (payload.anomaly_score && payload.anomaly_score > 0.4) {
    description = `Anomaly score elevated: ${payload.anomaly_score.toFixed(2)}`;
  } else if (payload.tool_wear_percent && payload.tool_wear_percent > 60) {
    description = `High tool wear: ${payload.tool_wear_percent.toFixed(0)}%`;
  } else if (payload.production_count !== undefined) {
    description = `Production count updated: ${payload.production_count} pcs`;
  }

  return {
    id: item.event_id || `${item.machine_id}-${item.sequence}`,
    timestamp: item.generated_at || new Date().toISOString(),
    machine_id: item.machine_id,
    station,
    type,
    severity,
    description,
    status: isCritical || isDegraded ? 'Open' : 'Closed',
  };
}

export default function EventsPage() {
  const { data: rawEvents } = useEvents(2000, 100);
  const { data: machines } = useMachines(2000);
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');

  const events: FactoryEvent[] = useMemo(() => {
    if (rawEvents && Array.isArray(rawEvents) && rawEvents.length > 0) {
      return rawEvents.map(parseEnvelopeToEvent);
    }
    // Fallback if no backend events yet
    if (!machines) return [];
    const fallbackList: FactoryEvent[] = [];
    const now = new Date();
    for (const m of machines) {
      if (m.status === 'DEGRADED' || m.status === 'FAULT') {
        fallbackList.push({
          id: `${m.machine_id}-degraded`,
          timestamp: now.toISOString(),
          machine_id: m.machine_id,
          station: m.station,
          type: 'Condition',
          severity: m.status === 'FAULT' ? 'Error' : 'Warning',
          description: `Machine in ${m.status} state`,
          status: 'Open',
        });
      }
      fallbackList.push({
        id: `${m.machine_id}-prod-${m.production_count}`,
        timestamp: now.toISOString(),
        machine_id: m.machine_id,
        station: m.station,
        type: 'Production',
        severity: 'Info',
        description: `Output: ${m.production_count} pcs`,
        status: 'Closed',
      });
    }
    return fallbackList;
  }, [rawEvents, machines]);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterMachine && e.machine_id !== filterMachine) return false;
      if (filterSeverity && e.severity !== filterSeverity) return false;
      if (filterType && e.type !== filterType) return false;
      if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [events, filterMachine, filterSeverity, filterType, search]);

  const machineIds = useMemo(() => [...new Set(events.map(e => e.machine_id))], [events]);

  return (
    <>
      <div className="page-header">
        <h2>Events</h2>
        <p>Centralized plant event log — {filtered.length} live events recorded</p>
      </div>

      <div className="events-filters">
        <select className="filter-select" value={filterMachine} onChange={e => setFilterMachine(e.target.value)}>
          <option value="">All Machines</option>
          {machineIds.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        <select className="filter-select" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="">All Severities</option>
          <option value="Error">Error</option>
          <option value="Warning">Warning</option>
          <option value="Info">Info</option>
        </select>
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="Condition">Condition</option>
          <option value="Production">Production</option>
          <option value="Maintenance">Maintenance</option>
          <option value="System">System</option>
        </select>
        <input
          className="filter-input"
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="machine-table-wrapper">
        <table className="machine-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Station / Machine</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-md)' }}>
                  No events recorded matching current filters.
                </td>
              </tr>
            ) : (
              filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                    {new Date(e.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
                  </td>
                  <td className="table-machine-id">
                    <div>{e.machine_id}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 'normal' }}>{e.station}</div>
                  </td>
                  <td>{e.type}</td>
                  <td>
                    <span className={`status-badge ${e.severity === 'Error' ? 'degraded' : e.severity === 'Warning' ? 'warning' : 'running'}`}>
                      {e.severity}
                    </span>
                  </td>
                  <td>{e.description}</td>
                  <td>
                    <span className={`status-badge ${e.status === 'Open' ? 'warning' : 'running'}`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
