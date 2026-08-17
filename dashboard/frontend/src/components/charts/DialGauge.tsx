import React from 'react';

interface DialGaugeProps {
  value: number;
  min?: number;
  max?: number;
  title: string;
  unit?: string;
  statusLabel?: string;
  statusType?: 'good' | 'warn' | 'error';
  targetValue?: number;
  anomalyScore?: number;
  subtext?: string;
  size?: number;
}

export default function DialGauge({
  value,
  min = 0,
  max = 100,
  title,
  unit = '%',
  statusLabel,
  statusType,
  targetValue,
  anomalyScore,
  subtext,
  size = 140,
}: DialGaugeProps) {
  const clampedVal = Math.min(max, Math.max(min, value));
  const percentage = (clampedVal - min) / (max - min);

  // 220 degree arc from -200 deg (bottom left) to 20 deg (bottom right)
  const startAngle = -200;
  const endAngle = 20;
  const totalAngle = endAngle - startAngle; // 220 deg
  const needleAngle = startAngle + percentage * totalAngle;

  const radius = 52;
  const centerX = 70;
  const centerY = 70;

  // Helper for polar coordinates
  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, r: number, startA: number, endA: number) => {
    const start = polarToCartesian(x, y, r, endA);
    const end = polarToCartesian(x, y, r, startA);
    const largeArcFlag = endA - startA <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  // Color arcs: 0-60% (Error/Red), 60-85% (Warn/Yellow), 85-100% (Good/Green)
  const arcRedEnd = startAngle + 0.6 * totalAngle;
  const arcWarnEnd = startAngle + 0.85 * totalAngle;

  // Determine active color
  const activeColor =
    statusType === 'good' || (!statusType && clampedVal >= 85)
      ? 'var(--status-good)'
      : statusType === 'warn' || (!statusType && clampedVal >= 65)
      ? 'var(--status-warn)'
      : 'var(--status-error)';

  // Ticks at 0, 25, 50, 75, 100%
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <div style={{ width: size, height: size * 0.88, position: 'relative' }}>
        <svg viewBox="0 0 140 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Background Track Arc */}
          <path
            d={describeArc(centerX, centerY, radius, startAngle, endAngle)}
            fill="none"
            stroke="var(--bg-secondary)"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Critical Zone Arc (Red) */}
          <path
            d={describeArc(centerX, centerY, radius, startAngle, arcRedEnd)}
            fill="none"
            stroke="rgba(184, 92, 74, 0.35)"
            strokeWidth="8"
          />

          {/* Warning Zone Arc (Yellow) */}
          <path
            d={describeArc(centerX, centerY, radius, arcRedEnd, arcWarnEnd)}
            fill="none"
            stroke="rgba(196, 154, 59, 0.35)"
            strokeWidth="8"
          />

          {/* Optimal Zone Arc (Green) */}
          <path
            d={describeArc(centerX, centerY, radius, arcWarnEnd, endAngle)}
            fill="none"
            stroke="rgba(74, 124, 89, 0.45)"
            strokeWidth="8"
          />

          {/* Active Value Progress Arc */}
          {percentage > 0.01 && (
            <path
              d={describeArc(centerX, centerY, radius, startAngle, Math.max(startAngle + 2, needleAngle))}
              fill="none"
              stroke={activeColor}
              strokeWidth="10"
              strokeLinecap="round"
            />
          )}

          {/* Ticks & Labels */}
          {ticks.map((t, idx) => {
            const angle = startAngle + t * totalAngle;
            const p1 = polarToCartesian(centerX, centerY, radius - 7, angle);
            const p2 = polarToCartesian(centerX, centerY, radius + 7, angle);
            const pText = polarToCartesian(centerX, centerY, radius - 15, angle);
            const labelVal = Math.round(min + t * (max - min));

            return (
              <g key={idx}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--border-medium)" strokeWidth="1.5" />
                <text
                  x={pText.x}
                  y={pText.y + 3}
                  textAnchor="middle"
                  fontSize="7"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  fill="var(--text-tertiary)"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Target marker if defined */}
          {targetValue !== undefined && (
            (() => {
              const targetPerc = (targetValue - min) / (max - min);
              const targetAng = startAngle + targetPerc * totalAngle;
              const tp1 = polarToCartesian(centerX, centerY, radius - 9, targetAng);
              const tp2 = polarToCartesian(centerX, centerY, radius + 9, targetAng);
              return <line x1={tp1.x} y1={tp1.y} x2={tp2.x} y2={tp2.y} stroke="var(--accent-blue)" strokeWidth="2.5" strokeDasharray="2 1" />;
            })()
          )}

          {/* Needle Pointer */}
          {(() => {
            const needleTip = polarToCartesian(centerX, centerY, radius - 4, needleAngle);
            const needleBase1 = polarToCartesian(centerX, centerY, 5, needleAngle - 90);
            const needleBase2 = polarToCartesian(centerX, centerY, 5, needleAngle + 90);
            return (
              <g>
                <polygon
                  points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
                  fill="var(--text-primary)"
                  opacity="0.85"
                />
                <circle cx={centerX} cy={centerY} r="6" fill="var(--text-primary)" />
                <circle cx={centerX} cy={centerY} r="2.5" fill="var(--bg-surface)" />
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Numerical readout & diagnostics */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
            {clampedVal.toFixed(1)}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-tertiary)' }}>{unit}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: activeColor,
            }}
          />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: activeColor }}>
            {statusLabel || (clampedVal >= 85 ? 'Optimal' : clampedVal >= 65 ? 'Warning Threshold' : 'Critical Action Needed')}
          </span>
        </div>

        {subtext && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {subtext}
          </div>
        )}

        {anomalyScore !== undefined && (
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 2 }}>
            Anomaly Index: <strong style={{ color: anomalyScore > 0.3 ? 'var(--status-error)' : 'var(--text-secondary)' }}>{anomalyScore.toFixed(3)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
