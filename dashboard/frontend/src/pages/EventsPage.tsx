import { useMachines } from '../hooks/usePolling';
import type { FactoryEvent } from '../types';
import { useState, useMemo, useEffect, useRef } from 'react';

/** Generate events from live telemetry state changes. */
function generateEvents(machines: ReturnType<typeof useMachines>['data']): FactoryEvent[] {
  if (!machines) return [];
  const events: FactoryEvent[] = [];
  const now = new Date();

  for (const m of machines) {
    // Status-based events
    if (m.status === 'DEGRADED' || m.status === 'FAULT') {
      events.push({
        id: `${m.machine_id}-degraded`,
        timestamp: new Date(now.getTime() - 5000).toISOString(),
        machine_id: m.machine_id,
        station: m.station,
        type: 'Condition',
        severity: 'Warning',
        description: `Machine in ${m.status} state`,
        status: 'Open',
      });
    }
    if (m.status === 'WARNING') {
      events.push({
        id: `${m.machine_id}-warning`,
        timestamp: new Date(now.getTime() - 15000).toISOString(),
        machine_id: m.machine_id,
        station: m.station,
        type: 'Condition',
        severity: 'Warning',
        description: 'Performance warning detected',
        status: 'Open',
      });
    }
    if (m.anomaly_score > 0.4) {
      events.push({
        id: `${m.machine_id}-anomaly`,
        timestamp: new Date(now.getTime() - 30000).toISOString(),
        machine_id: m.machine_id,
        station: m.station,
        type: 'Condition',
        severity: m.anomaly_score > 0.6 ? 'Warning' : 'Info',
        description: `Anomaly score elevated: ${m.anomaly_score}`,
        status: 'Open',
      });
    }
    if (m.tool_wear !== null && m.tool_wear > 60) {
      events.push({
        id: `${m.machine_id}-toolwear`,
        timestamp: new Date(now.getTime() - 20000).toISOString(),
        machine_id: m.machine_id,
        station: m.station,
        type: 'Maintenance',
        severity: 'Warning',
        description: `Tool wear at ${m.tool_wear.toFixed(0)}%`,
        status: 'Open',
      });
    }
    // Normal production event
    events.push({
      id: `${m.machine_id}-prod-${m.production_count}`,
      timestamp: new Date(now.getTime() - 60000).toISOString(),
      machine_id: m.machine_id,
      station: m.station,
      type: 'Production',
      severity: 'Info',
      description: `Output: ${m.production_count} pcs`,
      status: 'Closed',
    });
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export default function EventsPage() {
  const { data: machines } = useMachines(2000);
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');

  const events = useMemo(() => generateEvents(machines), [machines]);

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
        <p>Centralized event log — {filtered.length} events</p>
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
              <th>Machine</th>
              <th>Station</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                  {new Date(e.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
                </td>
                <td className="table-machine-id">{e.machine_id}</td>
                <td>{e.station}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
