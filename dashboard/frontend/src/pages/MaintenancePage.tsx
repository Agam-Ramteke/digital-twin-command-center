import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMachines, useTelemetryHistory } from '../hooks/usePolling';
import { api } from '../services/api';
import type {
  ManagerExecutiveBrief,
  WorkerWorkOrder,
  DecisionStrategy,
} from '../types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import {
  Wrench,
  ShieldAlert,
  DollarSign,
  ClipboardCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  FileText,
  Activity,
  Layers,
  ChevronRight,
  HardHat,
  Briefcase,
  Play,
  RotateCcw,
  Zap,
  TrendingDown,
  TrendingUp,
  Cpu,
  Check,
  ShieldCheck,
  Box,
  Sliders,
  History,
  Timer,
  CheckSquare,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import Loader from '../components/kokonutui/loader';
import './MaintenancePage.css';

interface AuditRecord {
  id: string;
  station: string;
  machineModel: string;
  timestamp: string;
  strategy: string;
  downtimeMin: number;
  preVib: number;
  postVib: number;
  healthRestored: string;
  costSaved: number;
  signee: string;
  status: 'CERTIFIED & CLOSED';
}

const INITIAL_AUDIT_LOG: AuditRecord[] = [
  {
    id: 'WO-2026-7841',
    station: 'STAMPING-01',
    machineModel: 'Hydraulic Press HP-250T',
    timestamp: '2026-10-20 18:40',
    strategy: 'Preventive Hydraulic Seal Flush',
    downtimeMin: 15,
    preVib: 3.42,
    postVib: 1.85,
    healthRestored: '84.2% → 100.0%',
    costSaved: 3820.0,
    signee: 'Alex Rivera (Plant Engineer)',
    status: 'CERTIFIED & CLOSED',
  },
  {
    id: 'WO-2026-7419',
    station: 'WELDING-01',
    machineModel: 'Robotic MIG Cell WR-600',
    timestamp: '2026-10-20 11:15',
    strategy: 'Torch Nozzle & Contact Tip Replacement',
    downtimeMin: 8,
    preVib: 2.91,
    postVib: 1.22,
    healthRestored: '88.5% → 100.0%',
    costSaved: 2150.0,
    signee: 'Shift A Maintenance Lead',
    status: 'CERTIFIED & CLOSED',
  },
];

const STATION_MODELS: Record<string, string> = {
  'STAMPING-01': 'Hydraulic Press HP-250T',
  'CNC-01': '5-Axis Machining Center VMX-42',
  'WELDING-01': 'Robotic MIG Cell WR-600',
  'INSPECTION-01': 'Vision & CMM Laser Scan IV-80',
  'PACKAGING-01': 'Cartesian Gantry Palletizer PAL-400',
};

export default function PredictiveMaintenancePage() {
  const { data: machines } = useMachines(1500);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as 'manager' | 'worker' | 'audit' | null;

  // Operational State
  const [targetMachine, setTargetMachine] = useState<string>('CNC-01');
  const [shiftQuota, setShiftQuota] = useState<number>(120);
  const [activeTab, setActiveTabState] = useState<'manager' | 'worker' | 'audit'>(tabParam || 'manager');

  const setActiveTab = (tab: 'manager' | 'worker' | 'audit') => {
    setActiveTabState(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTabState(tabParam);
    }
  }, [tabParam]);
  const [loadingDecision, setLoadingDecision] = useState<boolean>(true);
  const [managerBrief, setManagerBrief] = useState<ManagerExecutiveBrief | null>(null);
  const [workerOrder, setWorkerOrder] = useState<WorkerWorkOrder | null>(null);
  const [strategies, setStrategies] = useState<DecisionStrategy[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Active Work Order Execution Stepper (Stage 1..4)
  const [execStage, setExecStage] = useState<1 | 2 | 3 | 4 | 'completed'>(1);
  const [lotoChecked, setLotoChecked] = useState<boolean[]>([false, false, false, false]);
  const [sopChecked, setSopChecked] = useState<boolean[]>([false, false, false, false, false]);
  const [verifyChecked, setVerifyChecked] = useState<boolean[]>([false, false, false]);
  const [isDrySpinning, setIsDrySpinning] = useState<boolean>(false);
  const [auditLog, setAuditLog] = useState<AuditRecord[]>(INITIAL_AUDIT_LOG);

  // Rolling Telemetry for Target Station
  const historyData = useTelemetryHistory(targetMachine, 30);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // Fetch decision analysis from backend ScenarioReasoningService
  const loadStrategies = useCallback(async (machineId: string, quota: number) => {
    setLoadingDecision(true);
    setFetchError(null);
    try {
      const data = await api.getDecisionStrategies(machineId, quota);
      if (data) {
        setManagerBrief(data.manager_brief);
        setWorkerOrder(data.worker_order);
        setStrategies(data.strategies);
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDecision(false);
    }
  }, []);

  useEffect(() => {
    loadStrategies(targetMachine, shiftQuota);
  }, [targetMachine, shiftQuota, loadStrategies]);

  // Current Target Machine Telemetry
  const targetTelemetry = useMemo(() => {
    if (!machines) return null;
    return machines.find(m => m.machine_id === targetMachine) || null;
  }, [machines, targetMachine]);

  // Fleet Statistics
  const { meanRul, fleetHealthAvg, riskStationCount, totalPotentialSavings } = useMemo(() => {
    if (!machines || machines.length === 0) {
      return { meanRul: 1045, fleetHealthAvg: 94.8, riskStationCount: 0, totalPotentialSavings: 5375 };
    }
    const ruls = machines.map(m => m.rul_cycles ?? 1000);
    const meanRulVal = Math.round(ruls.reduce((acc, v) => acc + v, 0) / ruls.length);
    const avgH = machines.reduce((acc, m) => acc + m.health, 0) / machines.length;
    const riskCount = machines.filter(m => m.health < 85 || (m.rul_cycles !== null && m.rul_cycles < 300)).length;
    return {
      meanRul: meanRulVal,
      fleetHealthAvg: avgH,
      riskStationCount: riskCount,
      totalPotentialSavings: 5375,
    };
  }, [machines]);

  // Degradation Stress Simulation
  const handleSimulateDegradation = async () => {
    setActionBusy(true);
    try {
      if (targetMachine === 'CNC-01') {
        await api.simDegradeCnc();
      } else {
        await api.injectFault(targetMachine, 'Mechanical Vibration Surge', 'Warning');
      }
      showNotice(`Degradation stress injected on ${targetMachine}. Predictive RUL declining.`);
      await loadStrategies(targetMachine, shiftQuota);
    } catch (err) {
      showNotice(`Degradation trigger failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  // Emergency Recalibration Action
  const handleResetMachine = async () => {
    setActionBusy(true);
    try {
      if (targetMachine === 'CNC-01') {
        await api.simResetCnc();
      } else {
        await api.resetMachine(targetMachine);
      }
      showNotice(`${targetMachine} recalibrated to nominal 100% operational baseline.`);
      await loadStrategies(targetMachine, shiftQuota);
    } catch (err) {
      showNotice(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  // Authorize Strategy B -> Switch to Technician Execution Console
  const handleAuthorizeStrategy = () => {
    setActiveTab('worker');
    setExecStage(1);
    setLotoChecked([false, false, false, false]);
    setSopChecked([false, false, false, false, false]);
    setVerifyChecked([false, false, false]);
    showNotice(`Strategy Authorized! Work Order ${workerOrder?.work_order_id || 'WO-LIVE'} dispatched to Technician Console.`);
  };

  // Stepper Transitions
  const handleCertifyLoto = () => {
    setExecStage(2);
    showNotice('LOTO Safety Certified. Buffer maintenance window active.');
  };

  const handleCompleteSop = () => {
    setExecStage(3);
    showNotice('SOP Procedure Completed. Ready for Cold Dry-Spin Verification.');
  };

  const handleTriggerDrySpin = () => {
    setIsDrySpinning(true);
    setTimeout(() => {
      setIsDrySpinning(false);
      setVerifyChecked([true, true, true]);
      setExecStage(4);
      showNotice('Cold Dry-Spin verification successful. Spindle vibration reduced to nominal.');
    }, 2500);
  };

  const handleFinalSignOff = async () => {
    setActionBusy(true);
    try {
      if (targetMachine === 'CNC-01') {
        await api.simResetCnc();
      } else {
        await api.resetMachine(targetMachine);
      }

      const preV = targetTelemetry ? Number(targetTelemetry.vibration.toFixed(2)) : 5.85;
      const preH = targetTelemetry ? targetTelemetry.health.toFixed(1) : '78.5';
      const record: AuditRecord = {
        id: workerOrder?.work_order_id || `WO-${Date.now().toString().slice(-6)}`,
        station: targetMachine,
        machineModel: STATION_MODELS[targetMachine] || 'Industrial Asset',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
        strategy: managerBrief?.recommended_strategy_name || 'Immediate Maintenance Insert Swap',
        downtimeMin: workerOrder?.estimated_duration_min || 12,
        preVib: preV,
        postVib: 1.45,
        healthRestored: `${preH}% → 100.0%`,
        costSaved: managerBrief?.financial_advantage_usd || 5375.0,
        signee: 'Elena Rostova (Lead Reliability Engineer)',
        status: 'CERTIFIED & CLOSED',
      };

      setAuditLog(prev => [record, ...prev]);
      setExecStage('completed');
      showNotice(`Work Order ${record.id} signed off! ${targetMachine} restored to Fleet Line.`);
      await loadStrategies(targetMachine, shiftQuota);
    } catch (err) {
      showNotice(`Sign-off error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  // Prepare chart data with rolling vibration and dynamic threshold references
  const chartPoints = useMemo(() => {
    if (!historyData || historyData.length === 0) {
      return Array.from({ length: 15 }, (_, i) => ({
        tick: `-${15 - i}s`,
        vibration: targetTelemetry ? targetTelemetry.vibration : 2.1,
        wear: targetTelemetry?.tool_wear ?? 12,
      }));
    }
    return historyData.slice(-25).map((d, i) => ({
      tick: `-${historyData.slice(-25).length - i}s`,
      vibration: Number(d.vibration.toFixed(2)),
      wear: Number((d.tool_wear ?? 15).toFixed(1)),
      rpm: d.rpm,
    }));
  }, [historyData, targetTelemetry]);

  return (
    <div className="maint-container">
      {/* 1. Header with Operational Context & Actions */}
      <div className="maint-header">
        <div className="maint-title-group">
          <h2>
            <Wrench size={22} color="var(--accent-copper)" />
            Predictive Maintenance & Autonomous Decision Engine
          </h2>
          <p>
            Causal RUL degradation forecasting, plant manager financial trade-offs, and interactive technician execution
          </p>
        </div>

        <div className="maint-header-actions">
          <button
            className="btn btn-sm"
            onClick={handleSimulateDegradation}
            disabled={actionBusy}
            title="Inject wear & harmonic chatter to evaluate predictive response"
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: 'var(--status-warn)' }}
          >
            <TrendingDown size={14} color="var(--status-warn)" />
            Stress Degrade {targetMachine}
          </button>

          <button
            className="btn btn-sm"
            onClick={() => loadStrategies(targetMachine, shiftQuota)}
            disabled={loadingDecision || actionBusy}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={loadingDecision ? 'animate-spin' : ''} />
            Recalibrate
          </button>
        </div>
      </div>

      {/* Global Alert Notice Banner */}
      {notice && (
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(91, 123, 148, 0.15)',
            border: '1px solid var(--accent-blue)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles size={16} color="var(--accent-copper)" />
          <span>{notice}</span>
        </div>
      )}

      {/* 2. Four High-Impact Fleet Operational KPIs */}
      <div className="maint-kpi-grid">
        <div className="maint-kpi-card copper">
          <div className="maint-kpi-label">
            <span>Fleet Mean RUL</span>
            <Clock size={14} color="var(--accent-copper)" />
          </div>
          <div className="maint-kpi-val">
            {meanRul.toLocaleString()} <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>cycles</span>
          </div>
          <div className="maint-kpi-sub">
            <TrendingUp size={12} color="var(--status-good)" />
            <span>Horizon: ~14.8 hrs nominal run-time</span>
          </div>
        </div>

        <div className={`maint-kpi-card ${riskStationCount > 0 ? 'warn' : 'good'}`}>
          <div className="maint-kpi-label">
            <span>Active Asset Integrity</span>
            <Activity size={14} color={riskStationCount > 0 ? 'var(--status-warn)' : 'var(--status-good)'} />
          </div>
          <div className={`maint-kpi-val ${riskStationCount > 0 ? 'warn' : 'good'}`}>
            {fleetHealthAvg.toFixed(1)}%
          </div>
          <div className="maint-kpi-sub">
            <span>{riskStationCount > 0 ? `${riskStationCount} station requires attention` : 'All 5 stations nominal'}</span>
          </div>
        </div>

        <div className="maint-kpi-card good">
          <div className="maint-kpi-label">
            <span>Preventive Maintenance ROI</span>
            <DollarSign size={14} color="var(--status-good)" />
          </div>
          <div className="maint-kpi-val good">
            +${totalPotentialSavings.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="maint-kpi-sub">
            <span>Net savings vs unplanned catastrophic stop</span>
          </div>
        </div>

        <div className="maint-kpi-card">
          <div className="maint-kpi-label">
            <span>Work Order Execution</span>
            <ShieldCheck size={14} color="var(--accent-blue)" />
          </div>
          <div className="maint-kpi-val" style={{ fontSize: '1.25rem' }}>
            {execStage === 'completed' ? 'RESTORED' : execStage === 1 ? 'STAGE 1: LOTO' : execStage === 2 ? 'STAGE 2: SOP' : execStage === 3 ? 'STAGE 3: VERIFY' : 'STAGE 4: SIGN-OFF'}
          </div>
          <div className="maint-kpi-sub">
            <span>Target: {targetMachine} ({STATION_MODELS[targetMachine] || 'CNC'})</span>
          </div>
        </div>
      </div>

      {/* 3. Fleet Station Selector Cards */}
      <div className="maint-fleet-grid">
        {(machines || []).map((m) => {
          const isSelected = m.machine_id === targetMachine;
          const healthColor =
            m.health < 65
              ? 'var(--status-error)'
              : m.health < 85
              ? 'var(--status-warn)'
              : 'var(--status-good)';
          return (
            <div
              key={m.machine_id}
              className={`maint-station-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setTargetMachine(m.machine_id)}
            >
              <div className="maint-station-header">
                <span className="maint-station-id">
                  {m.machine_id}
                  {isSelected && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-blue)' }} />
                  )}
                </span>
                <span className={`status-badge ${m.status.toLowerCase()}`} style={{ fontSize: 9 }}>
                  {m.status}
                </span>
              </div>
              <div className="maint-station-type">{STATION_MODELS[m.machine_id] || m.station}</div>

              <div className="maint-station-health-row">
                <div className="maint-station-bar-bg">
                  <div
                    className="maint-station-bar-fill"
                    style={{ width: `${Math.min(100, m.health)}%`, background: healthColor }}
                  />
                </div>
                <span className="maint-station-health-val" style={{ color: healthColor }}>
                  {m.health.toFixed(1)}%
                </span>
              </div>

              <div className="maint-station-meta-grid">
                <div className="maint-station-meta-item">
                  <span className="maint-station-meta-label">RUL Cycles</span>
                  <span className="maint-station-meta-val">{m.rul_cycles ?? '>500'}</span>
                </div>
                <div className="maint-station-meta-item">
                  <span className="maint-station-meta-label">Vibration</span>
                  <span className="maint-station-meta-val">{m.vibration.toFixed(2)} mm/s</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Real-Time Telemetry & Causal Degradation Trajectory Chart */}
      <div className="maint-sensor-chart-card">
        <div className="maint-chart-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color="var(--accent-blue)" />
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {targetMachine} Dynamic Vibration Trajectory & ISO 10816 Thresholds
              </strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Synchronized 30-second rolling sensor window tracking bearing harmonic chatter and cutter stress
            </div>
          </div>

          <div className="maint-chart-legend">
            <div className="maint-legend-item">
              <span className="maint-legend-dot" style={{ background: '#38bdf8' }} />
              <span>Vibration (mm/s)</span>
            </div>
            <div className="maint-legend-item">
              <span className="maint-legend-dot" style={{ background: '#4a7c59' }} />
              <span>Nominal Baseline (2.0)</span>
            </div>
            <div className="maint-legend-item">
              <span className="maint-legend-dot" style={{ background: '#f59e0b' }} />
              <span>Alert Threshold (4.5)</span>
            </div>
            <div className="maint-legend-item">
              <span className="maint-legend-dot" style={{ background: '#ef4444' }} />
              <span>Critical Trip (7.1)</span>
            </div>
          </div>
        </div>

        <div style={{ width: '100%', height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vibGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="tick" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 8.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} unit=" mm/s" />
              <Tooltip
                contentStyle={{
                  background: '#181b20',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <ReferenceLine y={2.0} stroke="#4a7c59" strokeDasharray="3 3" label={{ value: 'Nominal', fill: '#4a7c59', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={4.5} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Warning', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={7.1} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'ISO Danger Trip', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Area type="monotone" dataKey="vibration" stroke="#38bdf8" strokeWidth={2.2} fillOpacity={1} fill="url(#vibGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. Operational Target Control Bar & Tab Switcher */}
      <div className="maint-control-bar">
        <div className="maint-control-group">
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Target Station:</span>
          <select
            className="maint-select"
            value={targetMachine}
            onChange={(e) => setTargetMachine(e.target.value)}
          >
            {(machines || []).map((m) => (
              <option key={m.machine_id} value={m.machine_id}>
                {m.machine_id} ({STATION_MODELS[m.machine_id] || m.station}) — Health: {m.health.toFixed(1)}%
              </option>
            ))}
          </select>

          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 8 }}>
            Shift Production Quota:
          </span>
          <input
            type="number"
            min={20}
            max={500}
            step={10}
            className="maint-input-number"
            value={shiftQuota}
            onChange={(e) => setShiftQuota(Number(e.target.value))}
          />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>units</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-sm"
            onClick={handleResetMachine}
            disabled={actionBusy}
            title="Instant baseline restoration"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={13} />
            Quick Reset {targetMachine}
          </button>
        </div>
      </div>

      {/* 6. Navigation Tabs: Manager Brief vs Technician Execution Console vs Audit Trail */}
      <div className="maint-tab-nav">
        <button
          className={`maint-tab-btn ${activeTab === 'manager' ? 'active' : ''}`}
          onClick={() => setActiveTab('manager')}
        >
          <Briefcase size={15} />
          <span>Plant Manager Executive Brief</span>
          {managerBrief && (
            <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 10 }}>
              ROI +${managerBrief.financial_advantage_usd.toLocaleString()}
            </span>
          )}
        </button>

        <button
          className={`maint-tab-btn ${activeTab === 'worker' ? 'active' : ''}`}
          onClick={() => setActiveTab('worker')}
        >
          <HardHat size={15} />
          <span>Technician Work Order Console</span>
          <span
            style={{
              fontSize: 10,
              background: execStage === 'completed' ? 'var(--status-good)' : 'var(--accent-copper)',
              color: '#fff',
              padding: '2px 6px',
              borderRadius: 10,
            }}
          >
            {execStage === 'completed' ? 'COMPLETED' : `PHASE ${execStage}`}
          </span>
        </button>

        <button
          className={`maint-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <History size={15} />
          <span>Operational Audit Trail ({auditLog.length})</span>
        </button>
      </div>

      {fetchError && (
        <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          <span>Decision Service Notice: {fetchError}</span>
        </div>
      )}

      {loadingDecision ? (
        <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', background: 'var(--bg-surface)', borderRadius: 8 }}>
          <Loader size="md" title="Calibrating Causal Strategy & Work Order..." subtitle={`Evaluating trade-offs for ${targetMachine} at ${shiftQuota} units`} />
        </div>
      ) : (
        <>
          {/* =========================================================================
              VIEW 1: PLANT MANAGER EXECUTIVE BRIEF
              ========================================================================= */}
          {activeTab === 'manager' && managerBrief && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-md)' }}>
                {/* Financial & Quota Decision Summary */}
                <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                  <div className="panel-header" style={{ marginBottom: 12 }}>
                    <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Briefcase size={16} color="var(--accent-blue)" />
                      Recommended Action & Financial Impact
                    </span>
                    <span className={`status-badge ${managerBrief.shift_quota_feasible ? 'running' : 'warning'}`}>
                      {managerBrief.shift_quota_feasible ? 'Quota Feasible' : 'Quota At Risk'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Net Financial Savings vs Run-To-Failure
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--status-good)', marginTop: 4 }}>
                        +${managerBrief.financial_advantage_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Mitigates tool shatter, scrap parts & line idle
                      </div>
                    </div>

                    <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Projected Shift Output
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                        {strategies.find(s => s.is_recommended)?.projected_output ?? 118} / {managerBrief.shift_quota_target}
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>units</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        98.5% confidence under 12-min buffer window
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                      Executive Recommendation
                    </div>
                    <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-copper)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
                        {managerBrief.recommended_action}
                      </div>
                      <p style={{ margin: '6px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {managerBrief.key_tradeoff_summary}
                      </p>
                    </div>
                  </div>

                  {/* Prominent CTA to dispatch technician console */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      className="maint-action-btn primary"
                      onClick={handleAuthorizeStrategy}
                    >
                      <HardHat size={15} />
                      Authorize Strategy & Dispatch Technician Console
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Causal Risk Analysis & AI Synthesis */}
                <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                  <div className="panel-header" style={{ marginBottom: 12 }}>
                    <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShieldAlert size={16} color="var(--status-warn)" />
                      Risk Assessment & Digital Twin Synthesis
                    </span>
                  </div>

                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-warn)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Operating Risk Profile
                    </div>
                    <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-primary)', margin: 0 }}>
                      {managerBrief.risk_assessment}
                    </p>

                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', margin: '12px 0 4px 0' }}>
                      Causal Physics Evaluation
                    </div>
                    <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>
                      {managerBrief.ai_reasoning_narrative}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Station Under Review:</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{targetMachine}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Selected Policy:</span>
                      <strong style={{ color: 'var(--accent-copper)' }}>{managerBrief.recommended_strategy_name}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Buffer Starvation Risk:</span>
                      <strong style={{ color: 'var(--status-good)' }}>0.0% (Protected by 5 pcs buffer)</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-Strategy Trade-Off Matrix Table */}
              <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                <div className="panel-header" style={{ marginBottom: 12 }}>
                  <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={16} color="var(--accent-blue)" />
                    Multi-Strategy Comparative Tradeoff Matrix
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                    Preventive Service vs Feed Derating vs Catastrophic Run-to-Failure
                  </span>
                </div>

                <div className="machine-table-wrapper" style={{ border: 'none' }}>
                  <table className="maint-audit-table">
                    <thead>
                      <tr>
                        <th>Strategy</th>
                        <th>Action Protocol</th>
                        <th>Total Cost ($USD)</th>
                        <th>Projected Yield</th>
                        <th>Line Downtime</th>
                        <th>Risk Level</th>
                        <th>Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strategies.map((strat) => (
                        <tr
                          key={strat.strategy_id}
                          style={{
                            background: strat.is_recommended ? 'rgba(74, 124, 89, 0.08)' : undefined,
                          }}
                        >
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {strat.name}
                            {strat.is_recommended && (
                              <span className="status-badge running" style={{ marginLeft: 8, fontSize: 9 }}>
                                RECOMMENDED
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {strat.action_label}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: strat.is_recommended ? 'var(--status-good)' : 'var(--text-primary)' }}>
                            ${strat.total_cost_usd.toFixed(2)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {strat.projected_output} units
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {strat.downtime_minutes} min
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                strat.risk_level === 'LOW'
                                  ? 'running'
                                  : strat.risk_level === 'MEDIUM'
                                  ? 'warning'
                                  : 'error'
                              }`}
                            >
                              {strat.risk_level}
                            </span>
                          </td>
                          <td>
                            {strat.is_recommended ? (
                              <button
                                className="btn btn-sm"
                                onClick={handleAuthorizeStrategy}
                                style={{ background: 'var(--status-good)', color: '#fff', fontSize: 11 }}
                              >
                                Execute Now
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Alternative</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 2: FIELD TECHNICIAN INTERACTIVE WORK ORDER CONSOLE (OPERATIONAL ENGINE)
              ========================================================================= */}
          {activeTab === 'worker' && workerOrder && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {/* 4-Phase Stepper */}
              <div className="maint-stepper">
                <div className={`maint-step ${execStage === 1 ? 'active' : (typeof execStage === 'number' && execStage > 1) || execStage === 'completed' ? 'completed' : ''}`}>
                  <div className="maint-step-badge">1</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Phase 1: LOTO Safety</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Lockout / Tagout</div>
                  </div>
                </div>

                <div className={`maint-step ${execStage === 2 ? 'active' : (typeof execStage === 'number' && execStage > 2) || execStage === 'completed' ? 'completed' : ''}`}>
                  <div className="maint-step-badge">2</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Phase 2: SOP Service</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Insert / Tool Swap</div>
                  </div>
                </div>

                <div className={`maint-step ${execStage === 3 ? 'active' : (typeof execStage === 'number' && execStage > 3) || execStage === 'completed' ? 'completed' : ''}`}>
                  <div className="maint-step-badge">3</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Phase 3: Telemetry Test</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Cold Dry-Spin</div>
                  </div>
                </div>

                <div className={`maint-step ${execStage === 4 || execStage === 'completed' ? 'completed' : ''}`}>
                  <div className="maint-step-badge">4</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Phase 4: Line Return</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Sign-off & Restore</div>
                  </div>
                </div>
              </div>

              {/* Work Order Header Card */}
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-copper)' }}>
                      {workerOrder.work_order_id}
                    </span>
                    <span className="status-badge running" style={{ fontSize: 10 }}>
                      DISPATCHED: {targetMachine}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Asset: {STATION_MODELS[targetMachine] || workerOrder.station_name} • Technician: Shift A Engineering Lead
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Target Downtime</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {workerOrder.estimated_duration_min} min window
                    </div>
                  </div>
                  <div style={{ height: 28, width: 1, background: 'var(--border-color)' }} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Buffer Cushion</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--status-good)', fontFamily: 'var(--font-mono)' }}>
                      5 WIP (3.5 min)
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 1: LOTO LOCKOUT / TAGOUT VERIFICATION */}
              {execStage === 1 && (
                <div className="maint-loto-card">
                  <div className="maint-loto-header">
                    <div className="maint-loto-title">
                      <Lock size={16} />
                      Phase 1: OSHA Lockout / Tagout (LOTO) Mandatory Safety Check
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--status-error)', fontWeight: 600 }}>
                      Safety Lock Required Prior to Physical Cell Access
                    </span>
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Technician must inspect and acknowledge each isolation protocol to authorize physical cell access:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {workerOrder.safety_loto_steps.map((loto, idx) => {
                      const isChecked = lotoChecked[idx];
                      return (
                        <div
                          key={idx}
                          className={`maint-check-item ${isChecked ? 'checked' : ''}`}
                          onClick={() => {
                            const updated = [...lotoChecked];
                            updated[idx] = !updated[idx];
                            setLotoChecked(updated);
                          }}
                        >
                          <div className="maint-check-box">
                            {isChecked && <Check size={12} />}
                          </div>
                          <div className="maint-check-text">
                            <strong>LOTO-{idx + 1}:</strong> {loto}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button
                      className="maint-action-btn primary"
                      disabled={!lotoChecked.every(Boolean)}
                      onClick={handleCertifyLoto}
                    >
                      <ShieldCheck size={15} />
                      Certify LOTO & Begin Maintenance Window
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 2: PHYSICAL PROCEDURE EXECUTION */}
              {execStage === 2 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-md)' }}>
                  <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                    <div className="panel-header" style={{ marginBottom: 12 }}>
                      <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ClipboardCheck size={16} color="var(--accent-copper)" />
                        Phase 2: Standard Operating Procedure (SOP) Protocol
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--status-good)', fontWeight: 600 }}>
                        Cell Locked Safe
                      </span>
                    </div>

                    <div style={{ padding: 10, background: 'rgba(74, 124, 89, 0.1)', border: '1px solid rgba(74, 124, 89, 0.3)', borderRadius: 6, marginBottom: 14, fontSize: 12, color: 'var(--status-good)' }}>
                      <strong>Active Buffer Cushion:</strong> {workerOrder.optimal_window_description}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {workerOrder.sop_procedure_steps.map((step, idx) => {
                        const isChecked = sopChecked[idx];
                        return (
                          <div
                            key={idx}
                            className={`maint-check-item ${isChecked ? 'checked' : ''}`}
                            onClick={() => {
                              const updated = [...sopChecked];
                              updated[idx] = !updated[idx];
                              setSopChecked(updated);
                            }}
                          >
                            <div className="maint-check-box">
                              {isChecked && <Check size={12} />}
                            </div>
                            <div className="maint-check-text">
                              <strong>Step {idx + 1}:</strong> {step}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <button
                        className="maint-action-btn primary"
                        disabled={!sopChecked.every(Boolean)}
                        onClick={handleCompleteSop}
                      >
                        <CheckCircle2 size={15} />
                        Complete Procedure & Advance to Verification
                      </button>
                    </div>
                  </div>

                  {/* Required Tooling & Inventory Tray */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                      <div className="panel-header" style={{ marginBottom: 12 }}>
                        <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Wrench size={16} color="var(--accent-blue)" />
                          Tooling & Replacement Parts Tray
                        </span>
                      </div>

                      <div className="maint-tooling-tray">
                        {workerOrder.required_tools_and_parts.map((item, idx) => (
                          <div key={idx} className="maint-tooling-pill">
                            <Box size={13} color="var(--accent-copper)" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-primary)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                        <strong>Torque Specification:</strong> Torx clamp screw must be tightened strictly to <strong>4.2 N·m</strong> using calibrated wrench. Clean spindle taper with lint-free solvent wipe before reseating.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 3: TELEMETRY & COLD DRY-SPIN VERIFICATION */}
              {execStage === 3 && (
                <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                  <div className="panel-header" style={{ marginBottom: 12 }}>
                    <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity size={16} color="var(--accent-blue)" />
                      Phase 3: Post-Maintenance Telemetry & Cold Dry-Spin Verification
                    </span>
                  </div>

                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                    Remove technician padlock, re-engage 415V supply isolator, and initiate automated 30-second cold dry-spin to confirm spindle harmonics return to nominal thresholds.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                    <button
                      className="maint-action-btn primary"
                      onClick={handleTriggerDrySpin}
                      disabled={isDrySpinning}
                    >
                      <Play size={15} className={isDrySpinning ? 'animate-spin' : ''} />
                      {isDrySpinning ? 'Spinning Spindle at 1,500 RPM...' : 'Initiate 30s Cold Dry-Spin Calibration'}
                    </button>

                    {isDrySpinning && (
                      <span style={{ fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                        Evaluating vibration FFT & dynamic balance...
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {workerOrder.post_maintenance_verification.map((v, idx) => {
                      const isChecked = verifyChecked[idx];
                      return (
                        <div
                          key={idx}
                          className={`maint-check-item ${isChecked ? 'checked' : ''}`}
                          onClick={() => {
                            const updated = [...verifyChecked];
                            updated[idx] = !updated[idx];
                            setVerifyChecked(updated);
                          }}
                        >
                          <div className="maint-check-box">
                            {isChecked && <Check size={12} />}
                          </div>
                          <div className="maint-check-text">
                            <strong>Verification {idx + 1}:</strong> {v}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <button
                      className="maint-action-btn success"
                      disabled={!verifyChecked.every(Boolean)}
                      onClick={() => setExecStage(4)}
                    >
                      <CheckCircle2 size={15} />
                      All Checks Passed — Proceed to Fleet Sign-Off
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 4: DIGITAL TWIN SIGN-OFF & RESTORATION */}
              {(execStage === 4 || execStage === 'completed') && (
                <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
                  <div className="panel-header" style={{ marginBottom: 12 }}>
                    <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShieldCheck size={18} color="var(--status-good)" />
                      Phase 4: Official Digital Twin Sign-Off & Line Re-entry
                    </span>
                    <span className="status-badge running">
                      {execStage === 'completed' ? 'WORK ORDER COMPLETED' : 'AWAITING FINAL RESTORATION'}
                    </span>
                  </div>

                  {execStage === 'completed' ? (
                    <div style={{ padding: 16, background: 'rgba(74, 124, 89, 0.1)', border: '1px solid var(--status-good)', borderRadius: 8, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--status-good)', fontWeight: 700, fontSize: 15 }}>
                        <CheckCircle2 size={20} />
                        Work Order Successfully Certified and Restored to Fleet!
                      </div>
                      <p style={{ margin: '8px 0 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        Station {targetMachine} has been calibrated back to 100% asset health. Vibration reduced from 5.85 mm/s to 1.45 mm/s. The record has been permanently logged to the operational audit trail.
                      </p>
                    </div>
                  ) : (
                    <div style={{ padding: 14, background: 'var(--bg-primary)', borderRadius: 6, marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        Ready to Restore {targetMachine} ({STATION_MODELS[targetMachine] || 'Machining Center'})
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        Clicking below will execute a certified calibration on the live Digital Twin and physical simulator. Asset health will be reset to 100.0%, clearing all degraded tool warnings and returning line pace to maximum quota speed.
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    {execStage === 'completed' ? (
                      <button
                        className="maint-action-btn primary"
                        onClick={() => {
                          setExecStage(1);
                          setActiveTab('audit');
                        }}
                      >
                        <History size={15} />
                        View Operational Audit Trail
                      </button>
                    ) : (
                      <button
                        className="maint-action-btn success"
                        disabled={actionBusy}
                        onClick={handleFinalSignOff}
                      >
                        <Sparkles size={15} />
                        Sign-Off & Restore Machine to Fleet Line
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW 3: OPERATIONAL AUDIT TRAIL & COMPLIANCE LOG
              ========================================================================= */}
          {activeTab === 'audit' && (
            <div className="analytics-panel" style={{ padding: 'var(--space-md)' }}>
              <div className="panel-header" style={{ marginBottom: 12 }}>
                <div>
                  <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={16} color="var(--accent-blue)" />
                    Operational Maintenance Audit Trail & ISO-55000 Compliance Log
                  </span>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Permanent chronological record of preventive actions, vibration delta, downtime, and financial ROI
                  </div>
                </div>

                <span className="status-badge running" style={{ fontSize: 11 }}>
                  {auditLog.length} Records Verified
                </span>
              </div>

              <div className="machine-table-wrapper" style={{ border: 'none' }}>
                <table className="maint-audit-table">
                  <thead>
                    <tr>
                      <th>Work Order ID</th>
                      <th>Station & Model</th>
                      <th>Timestamp</th>
                      <th>Maintenance Strategy</th>
                      <th>Downtime</th>
                      <th>Vibration Delta</th>
                      <th>Health Restored</th>
                      <th>Net ROI</th>
                      <th>Signee</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-copper)' }}>
                          {row.id}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.station}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{row.machineModel}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.timestamp}</td>
                        <td style={{ fontSize: 12 }}>{row.strategy}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.downtimeMin} min</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          <span style={{ color: 'var(--status-warn)' }}>{row.preVib.toFixed(2)}</span>
                          <span style={{ margin: '0 4px', color: 'var(--text-tertiary)' }}>→</span>
                          <span style={{ color: 'var(--status-good)', fontWeight: 700 }}>{row.postVib.toFixed(2)} mm/s</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--status-good)' }}>
                          {row.healthRestored}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-good)' }}>
                          +${row.costSaved.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontSize: 11 }}>{row.signee}</td>
                        <td>
                          <span className="status-badge running" style={{ fontSize: 9 }}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
