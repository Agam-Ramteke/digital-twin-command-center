/**
 * In-browser mock simulation engine matching simulator.py physics.
 * Seamlessly provides live 1s telemetry, fault injection, and reset when running on Vercel or when local backend is unreachable.
 */

import type { MachineTelemetry, FactorySummary, MachineTwinState, SimulationState, StationType } from '../types';

interface InternalMachine {
  id: string;
  station: StationType;
  tempBase: number;
  vibBase: number;
  rpmBase: number;
  currentBase: number;
  cycleTimeBase: number;
  energyBase: number;
  temp: number;
  vib: number;
  rpm: number;
  current: number;
  cycleTime: number;
  energy: number;
  health: number;
  productionCount: number;
  toolWear: number | null;
  rulCycles: number | null;
  anomalyScore: number;
  loadFactor: number;
  faultActive: boolean;
  faultType: string;
  faultSeverity: 'Warning' | 'Critical';
  faultTicks: number;
}

const INITIAL_CONFIGS: Record<string, { station: StationType; temp: number; vib: number; rpm: number; current: number; cycle: number; energy: number }> = {
  'STAMPING-01': { station: 'STAMPING', temp: 55, vib: 2.0, rpm: 1200, current: 12.0, cycle: 8.5, energy: 18.0 },
  'CNC-01': { station: 'CNC', temp: 65, vib: 3.2, rpm: 3400, current: 8.0, cycle: 42.0, energy: 24.0 },
  'WELDING-01': { station: 'WELDING', temp: 80, vib: 1.8, rpm: 0, current: 45.0, cycle: 15.0, energy: 35.0 },
  'INSPECTION-01': { station: 'INSPECTION', temp: 28, vib: 0.4, rpm: 0, current: 2.5, cycle: 6.0, energy: 5.0 },
  'PACKAGING-01': { station: 'PACKAGING', temp: 32, vib: 1.2, rpm: 800, current: 4.0, cycle: 10.0, energy: 8.0 },
};

class ClientSimulator {
  private machines: Record<string, InternalMachine> = {};
  private tickCount = 0;
  private timer: number | null = null;
  private cncDegrading = false;

  constructor() {
    this.resetAll();
    this.start();
  }

  private resetAll() {
    this.tickCount = 0;
    this.cncDegrading = false;
    for (const [id, cfg] of Object.entries(INITIAL_CONFIGS)) {
      this.machines[id] = {
        id,
        station: cfg.station,
        tempBase: cfg.temp,
        vibBase: cfg.vib,
        rpmBase: cfg.rpm,
        currentBase: cfg.current,
        cycleTimeBase: cfg.cycle,
        energyBase: cfg.energy,
        temp: cfg.temp,
        vib: cfg.vib,
        rpm: cfg.rpm,
        current: cfg.current,
        cycleTime: cfg.cycle,
        energy: cfg.energy,
        health: 96 + (Math.random() * 3 - 1),
        productionCount: Math.floor(Math.random() * 40 + 120),
        toolWear: cfg.station === 'CNC' ? 18.5 : null,
        rulCycles: cfg.station === 'CNC' ? 890 : null,
        anomalyScore: 0.04,
        loadFactor: 0.5,
        faultActive: false,
        faultType: 'nominal',
        faultSeverity: 'Warning',
        faultTicks: 0,
      };
    }
  }

  public start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    this.tickCount += 1;
    const noise = (scale = 1.0) => (Math.random() - 0.5) * 2 * scale;

    for (const m of Object.values(this.machines)) {
      m.loadFactor = Math.max(0.3, Math.min(0.9, m.loadFactor + noise(0.03)));
      const faultMult = m.faultSeverity === 'Critical' ? 1.0 : 0.65;
      const faultFactor = m.faultActive ? Math.min(m.faultTicks / 40.0, 1.0) * faultMult : 0;
      if (m.faultActive) m.faultTicks += 1;

      if (m.station === 'STAMPING') {
        m.current = +(m.currentBase * (0.7 + 0.6 * m.loadFactor) + faultFactor * 5.2 + noise(0.2)).toFixed(1);
        m.temp = +(m.tempBase + (m.loadFactor - 0.5) * 6 + faultFactor * 16.0 + (m.current - m.currentBase) * 0.4 + noise(0.3)).toFixed(1);
        m.vib = +Math.max(0.1, m.vibBase + (m.loadFactor - 0.5) * 0.4 + faultFactor * 2.1 + noise(0.12)).toFixed(1);
        m.rpm = Math.max(500, Math.round(m.rpmBase * (1 - faultFactor * 0.1) + noise(10)));
        m.cycleTime = +(m.cycleTimeBase * (1 + faultFactor * 0.35) + noise(0.2)).toFixed(1);
        m.health = +Math.max(15, Math.min(100, 100 - faultFactor * 45 - Math.max(0, m.vib - m.vibBase) * 3.5 + noise(0.2))).toFixed(1);
        m.anomalyScore = +Math.min(1, Math.max(0.02, 0.04 + faultFactor * 0.82 + noise(0.01))).toFixed(3);
      } else if (m.station === 'CNC') {
        m.toolWear = +Math.min(100, 15 + faultFactor * 72).toFixed(1);
        m.current = +(m.currentBase * (0.7 + 0.6 * m.loadFactor) * (1 + faultFactor * 0.35) + noise(0.2)).toFixed(1);
        m.temp = +(m.tempBase + (m.loadFactor - 0.5) * 8 + (m.current - m.currentBase) * 0.5 + faultFactor * 14.0 + noise(0.3)).toFixed(1);
        m.vib = +Math.max(0.1, m.vibBase + (m.toolWear / 100) * 4.8 + noise(0.15)).toFixed(1);
        m.rpm = Math.max(1000, Math.round(m.rpmBase * (1 - faultFactor * 0.06) + noise(15)));
        m.rulCycles = Math.max(10, Math.round(900 * (1 - m.toolWear / 100)));
        m.cycleTime = +(m.cycleTimeBase * (1 + faultFactor * 0.18) + noise(0.3)).toFixed(1);
        m.health = +Math.max(15, Math.min(100, 100 - (m.toolWear / 100) * 35 - Math.max(0, m.vib - m.vibBase) * 3.5 + noise(0.2))).toFixed(1);
        m.anomalyScore = +Math.min(1, Math.max(0.02, 0.05 + faultFactor * 0.85 + noise(0.01))).toFixed(3);
      } else if (m.station === 'WELDING') {
        m.current = +(m.currentBase * (0.7 + 0.6 * m.loadFactor) + faultFactor * 18.0 + noise(0.4)).toFixed(1);
        m.temp = +(m.tempBase + (m.loadFactor - 0.5) * 8 + faultFactor * 22.0 + noise(0.4)).toFixed(1);
        m.vib = +Math.max(0.1, m.vibBase + faultFactor * 1.6 + noise(0.1)).toFixed(1);
        m.cycleTime = +(m.cycleTimeBase * (1 + faultFactor * 0.2) + noise(0.3)).toFixed(1);
        m.health = +Math.max(15, Math.min(100, 100 - faultFactor * 48 + noise(0.3))).toFixed(1);
        m.anomalyScore = +Math.min(1, Math.max(0.02, 0.03 + faultFactor * 0.90 + noise(0.01))).toFixed(3);
      } else if (m.station === 'INSPECTION') {
        m.current = +(m.currentBase * (0.8 + 0.4 * m.loadFactor) + faultFactor * 1.8 + noise(0.1)).toFixed(1);
        m.temp = +(m.tempBase + (m.loadFactor - 0.5) * 3 + faultFactor * 7.5 + noise(0.2)).toFixed(1);
        m.vib = +Math.max(0.05, m.vibBase + faultFactor * 0.85 + noise(0.05)).toFixed(1);
        m.cycleTime = +(m.cycleTimeBase * (1 + faultFactor * 0.65) + noise(0.2)).toFixed(1);
        m.health = +Math.max(20, Math.min(100, 100 - faultFactor * 42 + noise(0.2))).toFixed(1);
        m.anomalyScore = +Math.min(1, Math.max(0.02, 0.05 + faultFactor * 0.94 + noise(0.01))).toFixed(3);
      } else if (m.station === 'PACKAGING') {
        m.current = +(m.currentBase * (0.7 + 0.6 * m.loadFactor) + faultFactor * 5.0 + noise(0.2)).toFixed(1);
        m.temp = +(m.tempBase + (m.loadFactor - 0.5) * 6 + faultFactor * 15.0 + noise(0.3)).toFixed(1);
        m.vib = +Math.max(0.1, m.vibBase + faultFactor * 2.0 + noise(0.12)).toFixed(1);
        m.rpm = Math.max(250, Math.round(m.rpmBase * (1 - faultFactor * 0.28) + noise(10)));
        m.cycleTime = +(m.cycleTimeBase * (1 + faultFactor * 0.3) + noise(0.2)).toFixed(1);
        m.health = +Math.max(15, Math.min(100, 100 - faultFactor * 46 + noise(0.2))).toFixed(1);
        m.anomalyScore = +Math.min(1, Math.max(0.02, 0.04 + faultFactor * 0.84 + noise(0.01))).toFixed(3);
      }

      m.energy = +(m.energyBase * (0.8 + 0.4 * m.loadFactor) + (m.current / m.currentBase) * 1.5 + noise(0.2)).toFixed(1);
      if (this.tickCount % Math.max(1, Math.floor(m.cycleTime / 3)) === 0) {
        m.productionCount += 1;
      }
    }
  }

  private toTelemetry(m: InternalMachine): MachineTelemetry {
    const faultFactor = m.faultActive ? Math.min(m.faultTicks / 40.0, 1.0) : 0;
    const status = faultFactor > 0.45 ? 'DEGRADED' : faultFactor > 0.15 ? 'WARNING' : 'RUNNING';
    return {
      machine_id: m.id,
      station: m.station,
      timestamp: new Date().toISOString(),
      status,
      temperature: m.temp,
      vibration: m.vib,
      rpm: m.rpm,
      current: m.current,
      production_count: m.productionCount,
      cycle_time: m.cycleTime,
      energy_kwh: m.energy,
      health: m.health,
      tool_wear: m.toolWear,
      anomaly_score: m.anomalyScore,
      rul_cycles: m.rulCycles,
      latency_ms: Math.round(20 + Math.random() * 40),
    };
  }

  public getMachines(): MachineTelemetry[] {
    return Object.values(this.machines).map(m => this.toTelemetry(m));
  }

  public getMachine(id: string): MachineTelemetry {
    const m = this.machines[id] || this.machines['CNC-01'];
    return this.toTelemetry(m);
  }

  public getSummary(): FactorySummary {
    const list = Object.values(this.machines);
    const totalOutput = list.reduce((s, m) => s + m.productionCount, 0);
    const totalEnergy = +list.reduce((s, m) => s + m.energy, 0).toFixed(1);
    const avgHealth = +(list.reduce((s, m) => s + m.health, 0) / list.length).toFixed(1);
    return {
      oee: +(88.5 + (avgHealth - 90) * 0.4).toFixed(1),
      total_output: totalOutput,
      total_energy_kwh: totalEnergy,
      twin_health: +(avgHealth * 0.98).toFixed(1),
      machines_online: list.length,
      machines_total: list.length,
      data_freshness_ms: Math.round(30 + Math.random() * 30),
      telemetry_rate: 5.0,
      timestamp: new Date().toISOString(),
    };
  }

  public getTwinState(id: string): MachineTwinState {
    const m = this.machines[id] || this.machines['CNC-01'];
    return {
      machine_id: id,
      comparisons: [
        { signal: 'Temperature', physical: m.temp, twin: +(m.temp * 1.005).toFixed(1), error: +(m.temp * 0.005).toFixed(2), unit: '°C' },
        { signal: 'Vibration', physical: m.vib, twin: +(m.vib * 0.99).toFixed(1), error: +(m.vib * 0.01).toFixed(2), unit: 'mm/s' },
        { signal: 'RPM', physical: m.rpm, twin: m.rpm, error: 0, unit: 'RPM' },
        { signal: 'Current', physical: m.current, twin: +(m.current * 1.008).toFixed(1), error: +(m.current * 0.008).toFixed(2), unit: 'A' },
      ],
      sync_percent: 98.6,
      data_freshness_ms: 35,
      telemetry_rate: 1.0,
    };
  }

  public getSimState(): SimulationState {
    return {
      running: true,
      tick: this.tickCount,
      cnc_degrading: this.cncDegrading,
      scenario: this.cncDegrading ? 'CNC_DEGRADATION' : 'NORMAL',
    };
  }

  public injectFault(id: string, faultType: string, severity: 'Warning' | 'Critical') {
    const m = this.machines[id];
    if (m) {
      m.faultActive = true;
      m.faultType = faultType;
      m.faultSeverity = severity;
      m.faultTicks = 0;
      if (id === 'CNC-01') this.cncDegrading = true;
    }
  }

  public resetMachine(id: string) {
    const m = this.machines[id];
    if (m) {
      m.faultActive = false;
      m.faultType = 'nominal';
      m.faultTicks = 0;
      m.health = 96 + (Math.random() * 2 - 1);
      if (id === 'CNC-01') {
        this.cncDegrading = false;
        m.toolWear = 15.0;
        m.rulCycles = 900;
      }
    }
  }

  public degradeCnc() {
    this.injectFault('CNC-01', 'tool_wear', 'Critical');
  }

  public resetCnc() {
    this.resetMachine('CNC-01');
  }

  public resetAllGlobal() {
    this.resetAll();
  }
}

export const clientSim = new ClientSimulator();
