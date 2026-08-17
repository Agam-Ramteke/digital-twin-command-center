import React, { useMemo } from 'react';

interface CalibratedSparklineProps {
  label: string;
  unit: string;
  values: number[];
  currentValue: number;
  lsl?: number; // Lower specification limit
  usl: number;  // Upper specification limit
  target: number;
  color: string;
  icon: React.ReactNode;
}

export default function CalibratedSparkline({
  label,
  unit,
  values,
  currentValue,
  lsl = 0,
  usl,
  target,
  color,
  icon,
}: CalibratedSparklineProps) {
  const stats = useMemo(() => {
    if (!values || values.length === 0) {
      return { min: currentValue, max: currentValue, avg: currentValue, delta: 0 };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const delta = values.length > 5 ? values[values.length - 1] - values[0] : 0;
    return { min, max, avg, delta };
  }, [values, currentValue]);

  // Determine bounds for calibrated Y scale
  const yMin = Math.min(lsl, stats.min * 0.95);
  const yMax = Math.max(usl * 1.08, stats.max * 1.05);
  const yRange = yMax - yMin || 1;

  const width = 240;
  const height = 54;
  const paddingBottom = 6;
  const paddingTop = 6;
  const plotH = height - paddingTop - paddingBottom;

  const getY = (val: number) => {
    return paddingTop + plotH - ((val - yMin) / yRange) * plotH;
  };

  const points = useMemo(() => {
    if (!values || values.length < 2) return '';
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = getY(v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, yMin, yRange]);

  const areaPoints = useMemo(() => {
    if (!values || values.length < 2) return '';
    const bottom = height - paddingBottom;
    const basePoints = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = getY(v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `0,${bottom} ${basePoints} ${width},${bottom}`;
  }, [values, yMin, yRange]);

  const isOutOfTolerance = currentValue > usl || (lsl > 0 && currentValue < lsl);
  const uslY = getY(usl);
  const targetY = getY(target);

  return (
    <div className="spark-card">
      <div className="spark-card-header">
        <span className="spark-card-label">
          {icon} {label}
        </span>
        <span
          className={`status-badge ${isOutOfTolerance ? 'degraded' : 'running'}`}
          style={{ fontSize: '10px', padding: '2px 6px' }}
        >
          {isOutOfTolerance ? 'LIMIT EXCEEDED' : 'IN TOLERANCE'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 0' }}>
        <div className="spark-card-value" style={{ color: isOutOfTolerance ? 'var(--status-error)' : 'var(--text-primary)', margin: 0 }}>
          {currentValue.toFixed(1)}{' '}
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-tertiary)' }}>{unit}</span>
        </div>
        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: stats.delta > 0 ? 'var(--status-warn)' : 'var(--status-good)' }}>
          {stats.delta >= 0 ? `▲ +${stats.delta.toFixed(1)}` : `▼ ${stats.delta.toFixed(1)}`} <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>/window</span>
        </div>
      </div>

      {/* Engineering Stats Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          background: 'var(--bg-surface-alt)',
          padding: '2px 6px',
          borderRadius: '3px',
          marginBottom: '6px',
        }}
      >
        <span>Min: <strong style={{ color: 'var(--text-secondary)' }}>{stats.min.toFixed(1)}</strong></span>
        <span>Avg: <strong style={{ color: 'var(--text-secondary)' }}>{stats.avg.toFixed(1)}</strong></span>
        <span>Max: <strong style={{ color: 'var(--text-secondary)' }}>{stats.max.toFixed(1)}</strong></span>
        <span>USL: <strong style={{ color: 'var(--status-error)' }}>{usl}</strong></span>
      </div>

      {/* Calibrated Plot with Reference Lines */}
      <div style={{ width: '100%', height: height, position: 'relative' }}>
        {(() => {
          const gradId = `spark-grad-${label.replace(/[^a-zA-Z0-9]/g, '-')}`;
          return (
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isOutOfTolerance ? 'var(--status-error)' : color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={isOutOfTolerance ? 'var(--status-error)' : color} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* Background Grid Lines */}
              <line x1="0" y1={paddingTop} x2={width} y2={paddingTop} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1={height - paddingBottom} x2={width} y2={height - paddingBottom} stroke="var(--border-light)" strokeWidth="1" />

              {/* Nominal Target Reference Line (Greenish dashed) */}
              {targetY >= paddingTop && targetY <= height - paddingBottom && (
                <g>
                  <line x1="0" y1={targetY} x2={width} y2={targetY} stroke="rgba(74, 124, 89, 0.4)" strokeWidth="1.2" strokeDasharray="2 2" />
                  <text x={width - 2} y={targetY - 2} textAnchor="end" fontSize="7" fill="var(--status-good)" fontFamily="var(--font-mono)">
                    Nominal ({target})
                  </text>
                </g>
              )}

              {/* Upper Specification Limit (USL) Red Line */}
              {uslY >= paddingTop && uslY <= height - paddingBottom && (
                <g>
                  <line x1="0" y1={uslY} x2={width} y2={uslY} stroke="rgba(184, 92, 74, 0.7)" strokeWidth="1.5" strokeDasharray="4 2" />
                  <text x={2} y={uslY - 2} fontSize="7" fill="var(--status-error)" fontWeight="700" fontFamily="var(--font-mono)">
                    USL {usl}{unit}
                  </text>
                </g>
              )}

              {/* Shaded Area */}
              {areaPoints && <polygon points={areaPoints} fill={`url(#${gradId})`} />}

              {/* Telemetry Waveform Line */}
              {points && (
                <polyline
                  fill="none"
                  stroke={isOutOfTolerance ? 'var(--status-error)' : color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              )}

              {/* Latest Point Pulsing Dot */}
              {values.length > 0 && (
                <g>
                  <circle
                    cx={width}
                    cy={getY(currentValue)}
                    r="3.5"
                    fill={isOutOfTolerance ? 'var(--status-error)' : color}
                  />
                  <circle
                    cx={width}
                    cy={getY(currentValue)}
                    r="6"
                    fill={isOutOfTolerance ? 'var(--status-error)' : color}
                    opacity="0.3"
                  />
                </g>
              )}
            </svg>
          );
        })()}
      </div>

      {/* Time axis footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
        <span>-60s</span>
        <span>-30s</span>
        <span>LIVE (Now)</span>
      </div>
    </div>
  );
}
