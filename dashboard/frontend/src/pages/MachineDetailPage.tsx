import { useParams, useNavigate } from 'react-router-dom';
import { useMachine, useMachineTwin, useTelemetryHistory } from '../hooks/usePolling';
import { useMqtt } from '../hooks/useMqtt';
import { api } from '../services/api';
import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, AreaChart, Area,
} from 'recharts';
import {
  ArrowLeft, Activity, Zap, Gauge, Thermometer, AlertTriangle, CheckCircle, ShieldCheck, Cpu, RefreshCw, BarChart2,
} from 'lucide-react';
import { STATION_ORDER, MACHINE_IDS } from '../types';
import DialGauge from '../components/charts/DialGauge';
import CalibratedSparkline from '../components/charts/CalibratedSparkline';

/* Station technical specifications dictionary with certified calibration baselines and limits */
const STATION_SPECS: Record<string, {
  model: string;
  power: string;
  voltage: string;
  freq: string;
  baselines: { temperature: number; vibration: number; current: number; rpm: number };
  limits: { temperature: { lsl: number; target: number; uwl: number; usl: number };
            vibration: { lsl: number; target: number; uwl: number; usl: number };
            current: { lsl: number; target: number; uwl: number; usl: number };
            rpm: { lsl: number; target: number; uwl: number; usl: number } };
}> = {
  'STAMPING-01': {
    model: 'Hydraulic Press HP-250T',
    power: '18.5 kW',
    voltage: '415 V, 3-Phase',
    freq: '50 Hz',
    baselines: { temperature: 55.0, vibration: 2.0, current: 12.0, rpm: 1200 },
    limits: {
      temperature: { lsl: 30, target: 55, uwl: 65, usl: 75 },
      vibration: { lsl: 0.5, target: 2.0, uwl: 3.2, usl: 4.5 },
      current: { lsl: 5, target: 12, uwl: 15, usl: 18 },
      rpm: { lsl: 1000, target: 1200, uwl: 1280, usl: 1350 },
    },
  },
  'CNC-01': {
    model: '5-Axis Machining Center VMX-42',
    power: '15.0 kW',
    voltage: '415 V, 3-Phase',
    freq: '50 Hz',
    baselines: { temperature: 65.0, vibration: 3.2, current: 8.0, rpm: 3400 },
    limits: {
      temperature: { lsl: 40, target: 65, uwl: 75, usl: 85 },
      vibration: { lsl: 1.0, target: 3.2, uwl: 4.8, usl: 6.5 },
      current: { lsl: 4, target: 8, uwl: 11, usl: 14 },
      rpm: { lsl: 3000, target: 3400, uwl: 3550, usl: 3700 },
    },
  },
  'WELDING-01': {
    model: 'Robotic MIG Cell WR-600',
    power: '22.0 kW',
    voltage: '415 V, 3-Phase',
    freq: '50 Hz',
    baselines: { temperature: 80.0, vibration: 1.8, current: 45.0, rpm: 0 },
    limits: {
      temperature: { lsl: 50, target: 80, uwl: 92, usl: 105 },
      vibration: { lsl: 0.5, target: 1.8, uwl: 2.8, usl: 4.0 },
      current: { lsl: 20, target: 45, uwl: 55, usl: 65 },
      rpm: { lsl: 0, target: 0, uwl: 0, usl: 0 },
    },
  },
  'INSPECTION-01': {
    model: 'Vision & CMM Laser Scan IV-80',
    power: '3.5 kW',
    voltage: '230 V, 1-Phase',
    freq: '50 Hz',
    baselines: { temperature: 28.0, vibration: 0.4, current: 2.5, rpm: 0 },
    limits: {
      temperature: { lsl: 18, target: 28, uwl: 34, usl: 40 },
      vibration: { lsl: 0.1, target: 0.4, uwl: 0.8, usl: 1.2 },
      current: { lsl: 1, target: 2.5, uwl: 3.8, usl: 5.0 },
      rpm: { lsl: 0, target: 0, uwl: 0, usl: 0 },
    },
  },
  'PACKAGING-01': {
    model: 'Automated Palletizer AP-120',
    power: '7.5 kW',
    voltage: '415 V, 3-Phase',
    freq: '50 Hz',
    baselines: { temperature: 32.0, vibration: 1.2, current: 4.0, rpm: 800 },
    limits: {
      temperature: { lsl: 20, target: 32, uwl: 40, usl: 50 },
      vibration: { lsl: 0.4, target: 1.2, uwl: 2.2, usl: 3.0 },
      current: { lsl: 1.5, target: 4.0, uwl: 5.5, usl: 7.0 },
      rpm: { lsl: 650, target: 800, uwl: 880, usl: 950 },
    },
  },
};

// Station-specific fault injection scenarios and diagnostic rules
const STATION_FAULTS: Record<
  string,
  {
    faults: { id: string; name: string; desc: string; actions: string[] }[];
    healthyDesc: string;
    healthyActions: string[];
  }
> = {
  'STAMPING-01': {
    faults: [
      {
        id: 'hydraulic_leak',
        name: 'Hydraulic Cylinder Seal Leak & High Friction',
        desc: 'Hydraulic pressure drops 28%, fluid temperature reaches 74°C, stroke cycle sluggish (+3.5s).',
        actions: [
          'Inspect hydraulic cylinder piston seals',
          'Check accumulator nitrogen precharge pressure',
          'Inspect proportional directional valve spool',
        ],
      },
      {
        id: 'valve_fault',
        name: 'Pressure Relief Valve Stiction & Spikes',
        desc: 'Pressure relief valve chatter causing high hydraulic pressure ripple and fluid heating.',
        actions: [
          'Flush hydraulic line and replace pilot filter',
          'Recalibrate main relief valve spring tension',
          'Verify fluid viscosity and thermal breakdown',
        ],
      },
      {
        id: 'die_wear',
        name: 'Forming Die Misalignment & Chipping',
        desc: 'Uneven press tonnage distribution and mechanical tooling chatter during bottom dead center.',
        actions: [
          'Check guide post clearance and bolster parallelity',
          'Inspect die cutting edges for micro-cracks',
          'Re-torque die clamp hydraulic fasteners',
        ],
      },
    ],
    healthyDesc: 'Hydraulic tonnage, stroke velocity, and fluid temperatures are within certified ISO-19921 tolerances.',
    healthyActions: [
      'Maintain standard hydraulic fluid top-up levels',
      'Monitor main cylinder pressure transducer',
      'No operator intervention required',
    ],
  },
  'CNC-01': {
    faults: [
      {
        id: 'tool_wear',
        name: 'Spindle Cutting Tool Flank Wear & Chatter',
        desc: 'Cutting insert flank wear at 85%, cutting force surges +35%, vibration velocity exceeds UWL (4.8 mm/s).',
        actions: [
          'Inspect carbide insert cutting edge geometry',
          'Verify spindle runout and toolholder clamping force',
          'Schedule cutting insert replacement in current shift',
        ],
      },
      {
        id: 'bearing_wear',
        name: 'Spindle Ceramic Bearing Harmonic Resonance',
        desc: 'High frequency vibration envelope spikes at 3.4kHz indicative of inner raceway spalling.',
        actions: [
          'Check spindle air-oil lubrication dosage',
          'Inspect spindle chiller circulating temperature',
          'Perform vibration spectral FFT demodulation',
        ],
      },
      {
        id: 'thermal_drift',
        name: 'X/Y/Z Axis Ballscrew Thermal Expansion',
        desc: 'Axis feed drive thermal growth causing dimensional backlash and current draw elevation.',
        actions: [
          'Calibrate laser interferometer positioning error',
          'Check axis ballscrew cooling circuit flow',
          'Clean linear optical scale glass and encoder head',
        ],
      },
    ],
    healthyDesc: 'Spindle harmonics, tool wear index, and cutting load metrics are within certified ISO-10816 tolerances.',
    healthyActions: [
      'Maintain standard synthetic coolant concentration (8%)',
      'Verify automatic tool changer (ATC) magazine indexing',
      'No operator intervention required',
    ],
  },
  'WELDING-01': {
    faults: [
      {
        id: 'gas_starvation',
        name: 'Shielding Gas Flow Starvation & Porosity',
        desc: 'Shielding gas flow rate drops below 12 L/min, arc current fluctuates ±22A with erratic weld spatter.',
        actions: [
          'Inspect Argon/CO2 gas line regulator and solenoid',
          'Clean torch nozzle spatter and gas diffuser ports',
          'Check robotic torch angle and standoff distance',
        ],
      },
      {
        id: 'wire_feed_slip',
        name: 'Wire Drive Roll Slippage & Arc Flutter',
        desc: 'Wire feed motor drag causing irregular deposition rate and high arc voltage jitter.',
        actions: [
          'Check wire drive feed rolls tension and groove wear',
          'Replace torch liner and inspect wire spool brake',
          'Inspect contact tip orifice for ovalization',
        ],
      },
      {
        id: 'nozzle_overheat',
        name: 'Water-Cooled Torch Thermal Overload',
        desc: 'Torch cooling loop flow restriction causing contact tip temperature to surge >98°C.',
        actions: [
          'Inspect recirculating torch water chiller pump',
          'De-scale torch coolant passage lines',
          'Replace deteriorated torch insulator ring',
        ],
      },
    ],
    healthyDesc: 'Arc current stability, shielding gas coverage, and robotic seam tracking are fully nominal and in-spec.',
    healthyActions: [
      'Maintain standard shielding gas supply line pressure (4.5 bar)',
      'Perform periodic robotic torch nozzle reaming',
      'No operator intervention required',
    ],
  },
  'INSPECTION-01': {
    faults: [
      {
        id: 'laser_drift',
        name: '3D Laser Triangulation Optical Drift',
        desc: 'Laser line sensor calibration offset causing point cloud noise and repeated scan retries (+4.5s).',
        actions: [
          'Run automated sphere-target calibration routine',
          'Clean optical bandpass filter and laser emitter lens',
          'Check ambient temperature compensation sensors',
        ],
      },
      {
        id: 'gantry_vibration',
        name: 'CMM Gantry Air Bearing Contamination',
        desc: 'Micro-vibration on high-speed scanning gantry exceeding optical accuracy threshold.',
        actions: [
          'Clean granite surface plate and guideway tracks',
          'Verify clean dry compressed air supply (0.55 MPa)',
          'Check linear motor drive amplifier tuning',
        ],
      },
      {
        id: 'camera_exposure',
        name: 'Telecentric Vision Illumination Degradation',
        desc: 'LED strobe light intensity drop causing low contrast and edge detection ambiguity.',
        actions: [
          'Calibrate illumination strobe controller PWM',
          'Inspect telecentric lens aperture locking ring',
          'Verify exposure histogram on reference datum',
        ],
      },
    ],
    healthyDesc: 'Laser triangulation accuracy, CMM repeatability, and machine vision contrast are within 5-micron tolerances.',
    healthyActions: [
      'Maintain optical enclosure cleanliness and positive pressure',
      'Verify master calibration coupon measurement',
      'No operator intervention required',
    ],
  },
  'PACKAGING-01': {
    faults: [
      {
        id: 'conveyor_jam',
        name: 'Palletizer Conveyor Drag & Motor Stall',
        desc: 'Drive motor phase current surges to 8.8A (+120%), roller speed slips -240 RPM under excessive friction.',
        actions: [
          'Inspect roller chain drive lubrication and tension',
          'Clear conveyor roller foreign object obstruction',
          'Check variable frequency drive (VFD) thermal trip',
        ],
      },
      {
        id: 'gripper_leak',
        name: 'Vacuum / Pneumatic Gripper Pressure Loss',
        desc: 'Gripper manifold vacuum drop causing unstable box transfer and cycle time delay.',
        actions: [
          'Inspect vacuum suction cups for wear or cracking',
          'Check pneumatic solenoid valve switching response',
          'Verify system vacuum sensor threshold switch',
        ],
      },
      {
        id: 'motor_overheat',
        name: 'Indexing Motor Winding Thermal Overload',
        desc: 'High duty-cycle indexing causing stator temperature to climb >52°C.',
        actions: [
          'Clean motor cooling fan cowling and heatsink fins',
          'Verify motor encoder resolution and brake gap',
          'Check reducer gearbox oil level and viscosity',
        ],
      },
    ],
    healthyDesc: 'Conveyor drive current, palletizer cycle rates, and pneumatic pressures are within nominal limits.',
    healthyActions: [
      'Maintain regular mechanical grease lubrication schedule',
      'Inspect photoelectric pallet presence sensors',
      'No operator intervention required',
    ],
  },
};

export default function MachineDetailPage() {
  const { machineId } = useParams<{ machineId: string }>();
  const navigate = useNavigate();
  const id = machineId || 'CNC-01';

  const { data: machine, connected, isMqtt } = useMachine(id, 1000);
  const { data: twin } = useMachineTwin(id, 1000);
  const history = useTelemetryHistory(id, 60);
  const { publishCommand } = useMqtt();

  const [activeChartMetric, setActiveChartMetric] = useState<'all' | 'temperature' | 'vibration' | 'current' | 'rpm'>('all');
  const [selectedFault, setSelectedFault] = useState<string>('tool_wear');
  const [faultSeverity, setFaultSeverity] = useState<'Warning' | 'Critical'>('Warning');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const specs = useMemo(() => {
    return STATION_SPECS[id] || STATION_SPECS['CNC-01'];
  }, [id]);

  const stationConfig = useMemo(() => {
    return STATION_FAULTS[id] || STATION_FAULTS['CNC-01'];
  }, [id]);

  // Update selected fault when machine id changes
  useEffect(() => {
    const defaultFault = (STATION_FAULTS[id] || STATION_FAULTS['CNC-01']).faults[0]?.id || 'tool_wear';
    setSelectedFault(defaultFault);
    setActionNotice(null);
  }, [id]);

  // Formatted chart points with timestamps and normalized baseline delta
  const formattedHistory = useMemo(() => {
    return history.map((item, idx) => {
      const timeStr = item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString('en-GB', { hour12: false, second: '2-digit', minute: '2-digit' })
        : `T-${history.length - idx}s`;

      const b = specs.baselines;
      // Normalized to % of baseline (100% = nominal)
      const normTemp = b.temperature > 0 ? (item.temperature / b.temperature) * 100 : 100;
      const normVib = b.vibration > 0 ? (item.vibration / b.vibration) * 100 : 100;
      const normCurrent = b.current > 0 ? (item.current / b.current) * 100 : 100;
      const normRpm = b.rpm > 0 ? (item.rpm / b.rpm) * 100 : 100;

      // Historical drift calculation
      const drift = Math.abs(item.vibration - (b.vibration * 0.98));

      return {
        ...item,
        time: timeStr,
        normTemp: Math.round(normTemp * 10) / 10,
        normVib: Math.round(normVib * 10) / 10,
        normCurrent: Math.round(normCurrent * 10) / 10,
        normRpm: Math.round(normRpm * 10) / 10,
        drift: Math.round(drift * 100) / 100,
      };
    });
  }, [history, specs]);

  // Extract arrays for sparklines
  const tempValues = useMemo(() => history.map(h => h.temperature), [history]);
  const vibValues = useMemo(() => history.map(h => h.vibration), [history]);
  const currValues = useMemo(() => history.map(h => h.current), [history]);
  const rpmValues = useMemo(() => history.map(h => h.rpm), [history]);

  // Statistical calculations for the currently active tab
  const activeStats = useMemo(() => {
    if (activeChartMetric === 'all') return null;
    const vals = history.map(h => h[activeChartMetric]);
    if (vals.length === 0) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
    const stdDev = Math.sqrt(variance);
    const current = vals[vals.length - 1];
    const limits = specs.limits[activeChartMetric];
    const isOutOfBounds = current > limits.usl;
    return { min, max, mean, stdDev, current, limits, isOutOfBounds };
  }, [history, activeChartMetric, specs]);

  if (!connected && !machine) {
    return (
      <div style={{ padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
        Connecting to machine telemetry ({id})...
      </div>
    );
  }

  if (!machine) {
    return (
      <div style={{ padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
        Loading {id} state...
      </div>
    );
  }

  const isCNC = machine.station === 'CNC';
  const isDegraded = machine.status === 'DEGRADED' || machine.status === 'WARNING';
  const syncScore = twin?.sync_percent ?? 98.4;
  const currentDrift = Math.abs(machine.vibration - (specs.baselines.vibration * 0.98));

  // Find active fault object
  const activeFaultObj = stationConfig.faults.find(f => f.id === selectedFault) || stationConfig.faults[0];

  const handleInjectFault = async () => {
    try {
      await api.injectFault(machine.machine_id, selectedFault, faultSeverity);
      publishCommand(`inject_fault_${machine.machine_id}`);
      setActionNotice(`⚡ Fault Injected on ${machine.machine_id}: ${activeFaultObj?.name} (${faultSeverity})`);
    } catch (e) {
      console.error(e);
      setActionNotice(`Error injecting fault on ${machine.machine_id}`);
    }
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleReset = async () => {
    try {
      await api.resetMachine(machine.machine_id);
      publishCommand(`reset_${machine.machine_id}`);
      setActionNotice(`🔧 Maintenance Complete: ${machine.machine_id} recalibrated to nominal baseline.`);
    } catch (e) {
      console.error(e);
      setActionNotice(`Error resetting ${machine.machine_id}`);
    }
    setTimeout(() => setActionNotice(null), 5000);
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto' }}>
      {/* Header Bar with Station Navigation */}
      <div className="machine-nav-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <button className="btn btn-sm" onClick={() => navigate('/machines')} style={{ gap: '6px' }}>
            <ArrowLeft size={14} /> Fleet Overview
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: 0 }}>
                {machine.machine_id}
              </h2>
              <span className={`status-badge ${machine.status.toLowerCase()}`}>
                {machine.status}
              </span>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {specs.model} • {machine.station} STATION
            </span>
          </div>
        </div>

        {/* Station switcher tabs */}
        <div className="station-pills">
          {STATION_ORDER.map(s => {
            const mId = MACHINE_IDS[s];
            const active = mId === id;
            return (
              <button
                key={mId}
                className={`station-pill ${active ? 'active' : ''}`}
                onClick={() => navigate(`/machines/${mId}`)}
              >
                {mId}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="rca-alert-box healthy" style={{ marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            <CheckCircle size={14} color="var(--status-good)" />
            {actionNotice}
          </div>
        </div>
      )}

      {/* ROW 1: 3 High-Level Calibrated Diagnostic Cards */}
      <div className="detail-top-grid">
        {/* Card 1: Machine Operational State */}
        <div className="dense-kpi-card">
          <div className="dense-kpi-header">
            <span className="dense-kpi-title">Operational Health</span>
            <span className={`status-dot ${isDegraded ? 'warn' : ''}`} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: isDegraded ? 'var(--status-error)' : 'var(--status-good)', marginBottom: 2 }}>
              {machine.status === 'RUNNING' ? 'NOMINAL PROCESS STATE' : 'ELEVATED DEGRADATION DETECTED'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {machine.status === 'RUNNING'
                ? 'Harmonics, thermal dissipation, and electrical load are within certified ISO-10816 tolerances.'
                : 'Accelerated tool wear and high spindle vibration detected. Maintenance threshold exceeded.'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-light)', paddingTop: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>
            <span>Cycle: <strong style={{ color: 'var(--text-primary)' }}>{machine.cycle_time}s</strong></span>
            <span>Cumulative: <strong style={{ color: 'var(--text-primary)' }}>{machine.production_count} pcs</strong></span>
            <span>Energy: <strong style={{ color: 'var(--text-primary)' }}>{machine.energy_kwh.toFixed(1)} kWh</strong></span>
          </div>
        </div>

        {/* Card 2: Calibrated Health Score Dial Gauge */}
        <div className="dense-kpi-card">
          <div className="dense-kpi-header">
            <span className="dense-kpi-title">Calibrated Health Gauge</span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              ISO Class II
            </span>
          </div>
          <DialGauge
            value={machine.health}
            min={0}
            max={100}
            unit="%"
            title="Health"
            targetValue={98.0}
            anomalyScore={machine.anomaly_score}
            subtext={machine.health >= 85 ? 'Normal Baseline (±2%)' : 'Degraded (Inspection Advised)'}
          />
        </div>

        {/* Card 3: Calibrated Twin Synchronization Dial Gauge */}
        <div className="dense-kpi-card">
          <div className="dense-kpi-header">
            <span className="dense-kpi-title">Twin Synchronization Gauge</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-good)', fontWeight: 600 }}>
              {isMqtt ? 'MQTT 10Hz' : 'REST 1Hz'}
            </span>
          </div>
          <DialGauge
            value={syncScore}
            min={80}
            max={100}
            unit="%"
            title="Sync"
            targetValue={99.0}
            subtext={`Latency: ${machine.latency_ms.toFixed(0)} ms (Jitter < 5ms)`}
            statusLabel={syncScore >= 95 ? 'Model In Sync' : 'Model Drift Detected'}
          />
        </div>
      </div>

      {/* ROW 2: 4 Calibrated Micro-Telemetry Sparklines */}
      <div className="telemetry-spark-grid">
        <CalibratedSparkline
          label="Temperature"
          unit="°C"
          values={tempValues}
          currentValue={machine.temperature}
          lsl={specs.limits.temperature.lsl}
          target={specs.limits.temperature.target}
          usl={specs.limits.temperature.usl}
          color="var(--accent-copper)"
          icon={<Thermometer size={14} color="var(--accent-copper)" />}
        />

        <CalibratedSparkline
          label="Vibration Velocity"
          unit="mm/s"
          values={vibValues}
          currentValue={machine.vibration}
          lsl={specs.limits.vibration.lsl}
          target={specs.limits.vibration.target}
          usl={specs.limits.vibration.usl}
          color="var(--status-error)"
          icon={<Activity size={14} color="var(--status-error)" />}
        />

        <CalibratedSparkline
          label="Phase Current"
          unit="A"
          values={currValues}
          currentValue={machine.current}
          lsl={specs.limits.current.lsl}
          target={specs.limits.current.target}
          usl={specs.limits.current.usl}
          color="var(--status-warn)"
          icon={<Zap size={14} color="var(--status-warn)" />}
        />

        <CalibratedSparkline
          label={machine.station === 'WELDING' ? 'Arc Active' : 'Spindle RPM'}
          unit={machine.rpm > 0 ? 'RPM' : ''}
          values={rpmValues}
          currentValue={machine.rpm}
          lsl={specs.limits.rpm.lsl}
          target={specs.limits.rpm.target}
          usl={specs.limits.rpm.usl}
          color="var(--status-good)"
          icon={<Gauge size={14} color="var(--status-good)" />}
        />
      </div>

      {/* ROW 3: Digital Twin Specifications (Left) & Multi-Channel Engineering Telemetry Chart (Right) */}
      <div className="detail-mid-grid">
        {/* Left: Digital Twin Model Specifications Table */}
        <div className="twin-spec-card">
          <div className="spec-asset-header">
            <div className="spec-asset-icon-box">
              <Cpu size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
                {machine.machine_id} Twin Asset
              </div>
              <span className="status-badge running" style={{ marginTop: 4, display: 'inline-flex' }}>
                <ShieldCheck size={12} style={{ marginRight: 4 }} /> TWIN ACTIVE & CALIBRATED
              </span>
            </div>
          </div>

          <table className="spec-table">
            <tbody>
              <tr>
                <td>Asset Model</td>
                <td>{specs.model}</td>
              </tr>
              <tr>
                <td>Rated Motor Power</td>
                <td>{specs.power}</td>
              </tr>
              <tr>
                <td>Nominal Voltage</td>
                <td>{specs.voltage}</td>
              </tr>
              <tr>
                <td>Line Frequency</td>
                <td>{specs.freq}</td>
              </tr>
              <tr>
                <td>Target Cycle Time</td>
                <td>{specs.baselines.temperature > 0 ? `${machine.cycle_time}s` : 'N/A'}</td>
              </tr>
              <tr>
                <td>Cumulative Energy</td>
                <td>{machine.energy_kwh.toFixed(1)} kWh</td>
              </tr>
              {isCNC && (
                <>
                  <tr>
                    <td>Tool Wear Estimate</td>
                    <td style={{ color: (machine.tool_wear ?? 0) > 60 ? 'var(--status-error)' : 'inherit' }}>
                      {(machine.tool_wear ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td>Remaining Useful Life (RUL)</td>
                    <td style={{ color: (machine.rul_cycles ?? 0) < 300 ? 'var(--status-error)' : 'inherit' }}>
                      {machine.rul_cycles ?? 0} cycles
                    </td>
                  </tr>
                </>
              )}
              <tr>
                <td>Data Freshness</td>
                <td>{machine.latency_ms.toFixed(0)} ms</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right: Informative Engineering Multi-Channel Analysis Chart */}
        <div className="twin-spec-card" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                {activeChartMetric === 'all'
                  ? 'Normalized Comparative Telemetry (% of Baseline Nominal)'
                  : `${activeChartMetric.toUpperCase()} Engineering Waveform Analysis`}
              </span>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {activeChartMetric === 'all'
                  ? 'Normalized comparison: 100% represents nominal calibrated target for each sensor'
                  : `Real-time engineering plot with Upper Warning Limit (UWL) & Upper Specification Limit (USL)`}
              </div>
            </div>

            <div className="chart-tabs">
              {(['all', 'temperature', 'vibration', 'current', 'rpm'] as const).map(tab => (
                <button
                  key={tab}
                  className={`chart-tab ${activeChartMetric === tab ? 'active' : ''}`}
                  onClick={() => setActiveChartMetric(tab)}
                >
                  {tab === 'all' ? 'All (Normalized %)' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Statistical KPI bar when viewing single channel */}
          {activeStats && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: 'var(--bg-surface-alt)',
                borderRadius: '4px',
                border: '1px solid var(--border-light)',
                marginBottom: 'var(--space-sm)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>Current: <strong style={{ color: activeStats.isOutOfBounds ? 'var(--status-error)' : 'var(--text-primary)' }}>{activeStats.current.toFixed(1)}</strong></span>
              <span>Mean (μ): <strong>{activeStats.mean.toFixed(1)}</strong></span>
              <span>Min: <strong>{activeStats.min.toFixed(1)}</strong></span>
              <span>Max (Peak): <strong style={{ color: activeStats.max > activeStats.limits.uwl ? 'var(--status-error)' : 'var(--text-primary)' }}>{activeStats.max.toFixed(1)}</strong></span>
              <span>Std Dev (σ): <strong>±{activeStats.stdDev.toFixed(2)}</strong></span>
              <span
                className={`status-badge ${activeStats.isOutOfBounds ? 'degraded' : activeStats.current > activeStats.limits.uwl ? 'warning' : 'running'}`}
                style={{ padding: '1px 6px', fontSize: 10 }}
              >
                {activeStats.isOutOfBounds ? 'USL BREACH' : activeStats.current > activeStats.limits.uwl ? 'UWL WARNING' : 'NOMINAL'}
              </span>
            </div>
          )}

          {/* Chart Rendering */}
          <ResponsiveContainer width="100%" height={230}>
            {activeChartMetric === 'all' ? (
              /* Normalized Multi-Signal Line Chart */
              <LineChart data={formattedHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="time" fontSize={10} stroke="var(--text-tertiary)" />
                <YAxis
                  domain={[60, 180]}
                  ticks={[80, 100, 120, 140, 160]}
                  unit="%"
                  fontSize={10}
                  stroke="var(--text-tertiary)"
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 4,
                    fontSize: 12,
                    boxShadow: 'var(--shadow-md)',
                  }}
                  formatter={(val: any, name: any) => [`${val}% of baseline`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                {/* Nominal 100% Target Reference Line */}
                <ReferenceLine y={100} stroke="var(--status-good)" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: 'Nominal 100%', fill: 'var(--status-good)', fontSize: 10 }} />
                {/* 140% Alert Line */}
                <ReferenceLine y={140} stroke="var(--status-error)" strokeWidth={1.2} strokeDasharray="3 3" label={{ value: '+40% Limit', fill: 'var(--status-error)', fontSize: 10 }} />
                
                <Line type="monotone" dataKey="normTemp" name={`Temp (% of ${specs.baselines.temperature}°C)`} stroke="var(--accent-copper)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="normVib" name={`Vibration (% of ${specs.baselines.vibration}mm/s)`} stroke="var(--status-error)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="normCurrent" name={`Current (% of ${specs.baselines.current}A)`} stroke="var(--accent-blue)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                {specs.baselines.rpm > 0 && (
                  <Line type="monotone" dataKey="normRpm" name={`RPM (% of ${specs.baselines.rpm})`} stroke="var(--status-good)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                )}
              </LineChart>
            ) : (
              /* Dedicated Single-Channel Area Plot with Specification Limits */
              <AreaChart data={formattedHistory}>
                <defs>
                  <linearGradient id="singleChannelGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="time" fontSize={10} stroke="var(--text-tertiary)" />
                <YAxis
                  domain={[
                    specs.limits[activeChartMetric].lsl,
                    Math.ceil(specs.limits[activeChartMetric].usl * 1.1),
                  ]}
                  fontSize={10}
                  stroke="var(--text-tertiary)"
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 4,
                    fontSize: 12,
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                {/* Nominal Target Line */}
                <ReferenceLine
                  y={specs.limits[activeChartMetric].target}
                  stroke="var(--status-good)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  label={{ value: `Target (${specs.limits[activeChartMetric].target})`, fill: 'var(--status-good)', fontSize: 10 }}
                />
                {/* Upper Warning Limit */}
                <ReferenceLine
                  y={specs.limits[activeChartMetric].uwl}
                  stroke="var(--status-warn)"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  label={{ value: `UWL (${specs.limits[activeChartMetric].uwl})`, fill: 'var(--status-warn)', fontSize: 10 }}
                />
                {/* Upper Specification Limit */}
                <ReferenceLine
                  y={specs.limits[activeChartMetric].usl}
                  stroke="var(--status-error)"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  label={{ value: `USL (${specs.limits[activeChartMetric].usl})`, fill: 'var(--status-error)', fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey={activeChartMetric}
                  name={`${activeChartMetric.toUpperCase()}`}
                  stroke="var(--accent-blue)"
                  fill="url(#singleChannelGrad)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          style={{
            margin: 'var(--space-md) 0 var(--space-xs) 0',
            padding: '10px 16px',
            borderRadius: '6px',
            background: actionNotice.includes('⚡') ? 'rgba(184, 92, 74, 0.12)' : 'rgba(74, 124, 89, 0.12)',
            border: `1px solid ${actionNotice.includes('⚡') ? 'var(--status-error)' : 'var(--status-good)'}`,
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ROW 4: 3-Column Diagnostic, Fault Injection & Enhanced Twin Drift Monitor */}
      <div className="detail-bottom-grid">
        {/* Column 1: Diagnostics & Root Cause Analysis */}
        <div className="diagnostics-panel">
          <div className="dense-kpi-header">
            <span className="dense-kpi-title">Diagnostics & RCA Engine</span>
            <span className={`status-badge ${isDegraded ? 'warning' : 'running'}`}>
              {isDegraded ? 'FAULT CLASSIFIED' : 'HEALTHY'}
            </span>
          </div>

          <div className={`rca-alert-box ${machine.health < 65 ? 'critical' : isDegraded ? 'warning' : 'healthy'}`}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)', marginBottom: 2 }}>
              {isDegraded ? (activeFaultObj ? activeFaultObj.name : 'Abnormal Process State') : 'Nominal Operational Envelope'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {isDegraded
                ? (activeFaultObj ? activeFaultObj.desc : `Vibration velocity at ${machine.vibration} mm/s exceeds UWL threshold.`)
                : stationConfig.healthyDesc}
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginTop: 'var(--space-sm)' }}>
            Recommended Engineering Actions:
          </div>
          <ul className="action-checklist">
            {(isDegraded ? (activeFaultObj ? activeFaultObj.actions : ['Inspect component tolerances', 'Verify lubrication and cooling', 'Schedule preventive inspection']) : stationConfig.healthyActions).map((action, i) => (
              <li key={i} className="action-item">
                <span className="action-bullet">→</span>
                {action}
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-sm)', borderTop: '1px solid var(--border-light)', paddingTop: 'var(--space-xs)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Diagnostic Confidence</span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-good)' }}>
              {isDegraded ? '94.8%' : '99.2%'}
            </span>
          </div>
        </div>

        {/* Column 2: Fault Injection & Simulation Control */}
        <div className="fault-box">
          <div className="dense-kpi-header">
            <span className="dense-kpi-title">Fault Injection Control</span>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Simulation Rig</span>
          </div>

          <div className="fault-form-group">
            <label className="fault-form-label">Select Fault Scenario</label>
            <select
              className="fault-select"
              value={selectedFault}
              onChange={e => setSelectedFault(e.target.value)}
            >
              {stationConfig.faults.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="fault-form-group">
            <label className="fault-form-label">Severity Level</label>
            <div className="severity-radios">
              <label className="severity-radio-label">
                <input
                  type="radio"
                  name="severity"
                  checked={faultSeverity === 'Warning'}
                  onChange={() => setFaultSeverity('Warning')}
                />
                Warning
              </label>
              <label className="severity-radio-label">
                <input
                  type="radio"
                  name="severity"
                  checked={faultSeverity === 'Critical'}
                  onChange={() => setFaultSeverity('Critical')}
                />
                Critical
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
            <button className="btn btn-warn btn-sm" onClick={handleInjectFault} style={{ width: '100%', justifyContent: 'center' }}>
              ⚡ Inject Fault Scenario
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleReset} style={{ width: '100%', justifyContent: 'center' }}>
              🔧 Calibrate & Run Maintenance
            </button>
          </div>
        </div>

        {/* Column 3: Calibrated Twin Drift Monitor */}
        <div className="drift-panel">
          <div className="dense-kpi-header">
            <span className="dense-kpi-title">Twin Drift Monitor</span>
            <span className={`status-badge ${currentDrift > 1.2 ? 'warning' : 'running'}`}>
              {currentDrift > 1.2 ? 'DRIFT DETECTED' : 'SYNCHRONIZED'}
            </span>
          </div>

          <div className="drift-comparison-row">
            <div className="drift-val-box">
              <div className="val" style={{ color: 'var(--accent-copper)' }}>{machine.vibration.toFixed(1)}</div>
              <div className="lbl">Physical Sensor (mm/s)</div>
            </div>
            <div className="drift-arrow-box">
              <span style={{ color: currentDrift > 1.2 ? 'var(--status-error)' : 'var(--status-good)' }}>
                {currentDrift > 1.2 ? `+${currentDrift.toFixed(1)} mm/s` : '±0.1 mm/s'}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Delta Divergence</span>
            </div>
            <div className="drift-val-box">
              <div className="val" style={{ color: 'var(--status-good)' }}>
                {(specs.baselines.vibration * 0.98).toFixed(1)}
              </div>
              <div className="lbl">Twin Model (mm/s)</div>
            </div>
          </div>

          {/* Historical Drift Mini Plot */}
          <div style={{ height: 48, width: '100%', marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedHistory}>
                <CartesianGrid strokeDasharray="2 2" stroke="var(--border-light)" />
                <ReferenceLine y={1.2} stroke="var(--status-warn)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="drift" name="Drift" stroke={currentDrift > 1.2 ? 'var(--status-error)' : 'var(--accent-blue)'} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            <span>Drift Range: 0.0 - 5.0 mm/s</span>
            <span>Threshold: &lt; 1.2 mm/s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
