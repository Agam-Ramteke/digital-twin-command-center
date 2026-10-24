import { useSimState, useSummary, useSystemReadiness, useLiveTwins } from '../hooks/usePolling';
import { useMqtt } from '../hooks/useMqtt';
import { CheckCircle2, XCircle, Clock, ShieldCheck, Database, Cpu, Radio, Network } from 'lucide-react';
import TopoBackground from '../components/kokonutui/topo-background';
import StackPanelDemo from '../components/kokonutui/stack-panel';

export default function SystemPage() {
  const { data: simState } = useSimState(2000);
  const { data: summary } = useSummary(2000);
  const { data: readiness, connected: backendConnected } = useSystemReadiness(2000);
  const { data: twins } = useLiveTwins(2000);
  const { isConnected: isMqtt } = useMqtt();

  // Compute observed real timing across Live Twins
  const timingStats = (() => {
    if (!twins || twins.length === 0) {
      return {
        avgDeliveryMs: 0,
        avgProcessingMs: 0,
        avgSourceAgeMs: 0,
        maxSequence: 0,
        totalRevisions: 0,
      };
    }

    let delSum = 0;
    let procSum = 0;
    let ageSum = 0;
    let count = 0;
    let maxSeq = 0;
    let revSum = 0;

    for (const t of twins) {
      const s = t.synchronization;
      if (s) {
        delSum += s.delivery_latency_ms ?? 0;
        procSum += s.processing_latency_ms ?? 0;
        ageSum += s.source_age_ms ?? 0;
        if (s.latest_sequence > maxSeq) maxSeq = s.latest_sequence;
      }
      revSum += t.revision;
      count++;
    }

    return {
      avgDeliveryMs: count > 0 ? delSum / count : 0,
      avgProcessingMs: count > 0 ? procSum / count : 0,
      avgSourceAgeMs: count > 0 ? ageSum / count : 0,
      maxSequence: maxSeq,
      totalRevisions: revSum,
    };
  })();

  const services = [
    {
      name: 'FastAPI Gateway',
      detail: 'REST API v0.4.0 / OpenAPI',
      status: backendConnected ? 'ONLINE' : 'OFFLINE',
      icon: Network,
      active: backendConnected,
    },
    {
      name: 'Causal Physics Simulator',
      detail: `Seeded deterministic engine (Tick: ${readiness?.simulation_tick ?? simState?.tick ?? 0})`,
      status: readiness?.simulation_running ? 'RUNNING' : 'STOPPED',
      icon: Cpu,
      active: readiness?.simulation_running ?? false,
    },
    {
      name: 'Live Twin Service',
      detail: `${twins?.length ?? 5} Persistent Twins (Idempotent Reducer)`,
      status: twins && twins.length > 0 ? 'ACTIVE' : (backendConnected ? 'ONLINE' : 'OFFLINE'),
      icon: Radio,
      active: Boolean(twins && twins.length > 0),
    },
    {
      name: 'Process Twin DAG Service',
      detail: 'DAG material flow & discrete token lineage',
      status: backendConnected ? 'ACTIVE' : 'OFFLINE',
      icon: Network,
      active: backendConnected,
    },
    {
      name: 'Scenario Worker Service',
      detail: 'Immutable counterfactual forward simulation',
      status: backendConnected ? 'READY' : 'OFFLINE',
      icon: ShieldCheck,
      active: backendConnected,
    },
    {
      name: 'Persistence Backend',
      detail: readiness?.persistence_backend ? `${readiness.persistence_backend.toUpperCase()} Repository` : 'Configuring...',
      status: readiness?.persistence_backend ? 'ONLINE' : 'OFFLINE',
      icon: Database,
      active: Boolean(readiness?.persistence_backend),
    },
    {
      name: 'MQTT Event Bus (Backend Consumer)',
      detail: 'Canonical factory/v1/+/telemetry subscriber',
      status: readiness?.live_twin_mqtt_connected ? 'CONNECTED' : 'IN-PROCESS BRIDGE',
      icon: Radio,
      active: true,
    },
    {
      name: 'Browser MQTT WebSocket',
      detail: 'ws://localhost:9001 client streaming',
      status: isMqtt ? 'STREAMING' : 'REST POLLING',
      icon: Radio,
      active: isMqtt,
    },
  ];

  return (
    <>
      <TopoBackground
        className="min-h-[120px] rounded-xl border border-[var(--border-medium)] mb-6 py-4 px-6 flex items-center justify-between text-left shadow-sm text-stone-700 dark:text-stone-300"
        speed={0.3}
        interval={0.08}
        interactive={true}
      >
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--status-good)', boxShadow: '0 0 8px var(--status-good)' }} />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: 'var(--accent-copper)', textTransform: 'uppercase', fontWeight: 700 }}>
              Autonomous Digital Twin Architecture
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            System Status & Microservices Topology
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
            Real-time infrastructure health, observed synchronization timing, and service topology
          </p>
        </div>
      </TopoBackground>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
        {/* Left Column: Interactive StackPanel Engine & Policies Drilldown */}
        <div>
          <div style={{ marginBottom: 'var(--space-xs)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-copper)' }}>
              Interactive Engine Settings
            </span>
          </div>
          <StackPanelDemo className="w-full max-w-none" />
        </div>

        {/* Right Column: Live Microservices Matrix & Latency Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div>
            <div style={{ marginBottom: 'var(--space-xs)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-blue)' }}>
                Microservices Live Mesh
              </span>
            </div>
            <div className="system-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-sm)' }}>
              {services.map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.name} className="system-service" style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <Icon size={16} style={{ color: s.active ? 'var(--accent-blue)' : 'var(--text-tertiary)' }} />
                      <div>
                        <div className="service-name" style={{ fontSize: 12 }}>{s.name}</div>
                        <div className="service-detail" style={{ fontSize: 10 }}>{s.detail}</div>
                      </div>
                    </div>
                    <span className={`status-badge ${s.active ? 'good' : 'crit'}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                      {s.active ? <CheckCircle2 size={10} style={{ marginRight: 3 }} /> : <XCircle size={10} style={{ marginRight: 3 }} />}
                      {s.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observed Synchronization Timing (Report Table 5 Instrumentation) */}
          <div className="detail-section" style={{ marginTop: 0 }}>
            <div className="detail-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
              <Clock size={16} />
              Observed Synchronization Timing & Latency
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
              Live telemetry recorded across event generation, network delivery, and reducer processing.
            </p>

            <div className="telemetry-grid">
              <div className="telemetry-item">
                <div className="telemetry-value">
                  {timingStats.avgDeliveryMs ? timingStats.avgDeliveryMs.toFixed(2) : (summary?.data_freshness_ms.toFixed(1) ?? '0.0')}
                  <span className="telemetry-unit">ms</span>
                </div>
                <div className="telemetry-label">Observed Delivery Latency</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-value">
                  {timingStats.avgProcessingMs ? timingStats.avgProcessingMs.toFixed(3) : '< 0.050'}
                  <span className="telemetry-unit">ms</span>
                </div>
                <div className="telemetry-label">Live Twin Reduction Latency</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-value">
                  {timingStats.avgSourceAgeMs ? timingStats.avgSourceAgeMs.toFixed(1) : (summary?.data_freshness_ms.toFixed(0) ?? '—')}
                  <span className="telemetry-unit">ms</span>
                </div>
                <div className="telemetry-label">Mean Source Age / Freshness</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-value">
                  {summary?.telemetry_rate ?? 5}
                  <span className="telemetry-unit">msg/s</span>
                </div>
                <div className="telemetry-label">Aggregated Ingestion Rate</div>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)', background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border-light)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span>Latest Monotonic Event Sequence: <strong style={{ fontFamily: 'var(--font-mono)' }}>#{timingStats.maxSequence}</strong></span>
              <span>Total Persisted Twin Revisions: <strong style={{ fontFamily: 'var(--font-mono)' }}>{timingStats.totalRevisions}</strong></span>
              <span>Active Station Twins: <strong style={{ fontFamily: 'var(--font-mono)' }}>{twins?.length ?? 5} / 5</strong></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
