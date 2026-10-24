"use client";

/**
 * @author: @dorianbaffier (adapted for Digital Twin Command Center)
 * @description: Interactive Telemetry Metric Card with Spline Morphing & Breakdown
 * @version: 2.2.0
 * @license: MIT
 * @website: https://kokonutui.com
 */

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// Drawing viewBox dimensions
const W = 400;
const H = 120;
const PAD_Y = 10;
const SAMPLES = 90;
const MORPH_MS = 420;
const DAY = 86_400_000;
const DIGIT = /\d/;
const SNAP_PX = 6;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// High-tech industrial swatches
const SWATCHES = [
  "bg-sky-600 dark:bg-sky-400",
  "bg-amber-600 dark:bg-amber-500",
  "bg-rose-600 dark:bg-rose-400",
  "bg-emerald-600 dark:bg-emerald-400",
];

export interface MetricPoint {
  /** YYYY-MM-DD */
  date: string;
  /** One value per segment, in the order of `segments`. */
  parts: number[];
}

export interface MetricEvent {
  /** YYYY-MM-DD */
  date: string;
  label: string;
}

export interface MetricCardProps {
  label?: string;
  /** Names of the parts that add up to the metric. */
  segments?: string[];
  /** Daily values, oldest first. */
  data?: MetricPoint[];
  /** Industrial milestones (calibration, spur activation, maintenance window) */
  events?: MetricEvent[];
  periods?: number[];
  defaultPeriod?: number;
  format?: "currency" | "number";
  currency?: string;
  unit?: string;
  className?: string;
}

interface Span {
  lo: number;
  hi: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

/** Generate authentic industrial production workpiece counts */
function demoIndustrialData(days: number, end: string): MetricPoint[] {
  let seed = 108;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const last = Date.parse(`${end}T00:00:00Z`);
  const out: MetricPoint[] = [];

  let stamping = 850;
  let cnc = 410;
  let welding = 280;
  let packaging = 240;

  for (let i = 0; i < days; i++) {
    const t = last - (days - 1 - i) * DAY;
    const weekday = new Date(t).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;

    stamping += 1.8 + (random() - 0.5) * 8;
    if (i === days - 27) {
      cnc *= 1.35;
      welding *= 1.15;
    }
    if (i === days - 12) {
      stamping *= 1.05;
      packaging *= 1.12;
    }

    cnc += 0.8 + (random() - 0.5) * 10;
    welding += 0.6 + (random() - 0.5) * 6;
    packaging += 0.5 + (random() - 0.5) * 5;

    out.push({
      date: new Date(t).toISOString().slice(0, 10),
      parts: [
        Math.round(stamping * (weekend ? 0.75 : 1) * (0.97 + random() * 0.06)),
        Math.round(cnc * (weekend ? 0.70 : 1) * (0.96 + random() * 0.08)),
        Math.round(welding * (weekend ? 0.65 : 1) * (0.95 + random() * 0.10)),
        Math.round(packaging * (weekend ? 0.60 : 1) * (0.97 + random() * 0.05)),
      ],
    });
  }
  return out;
}

/** Generate authentic industrial electrical energy consumption (kWh) */
function demoEnergyData(days: number, end: string): MetricPoint[] {
  let seed = 271;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const last = Date.parse(`${end}T00:00:00Z`);
  const out: MetricPoint[] = [];

  let hydraulics = 490;
  let spindles = 360;
  let robots = 190;
  let aux = 150;

  for (let i = 0; i < days; i++) {
    const t = last - (days - 1 - i) * DAY;
    const weekday = new Date(t).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;

    hydraulics += 0.4 + (random() - 0.5) * 4;
    spindles += 0.3 + (random() - 0.5) * 5;
    robots += 0.2 + (random() - 0.5) * 3;
    aux += 0.1 + (random() - 0.5) * 2;

    if (i === days - 24) {
      spindles *= 0.88; // Spindle Eco-Mode
    }

    out.push({
      date: new Date(t).toISOString().slice(0, 10),
      parts: [
        Math.round(hydraulics * (weekend ? 0.65 : 1) * (0.97 + random() * 0.05)),
        Math.round(spindles * (weekend ? 0.60 : 1) * (0.96 + random() * 0.06)),
        Math.round(robots * (weekend ? 0.55 : 1) * (0.95 + random() * 0.08)),
        Math.round(aux * (weekend ? 0.50 : 1) * (0.98 + random() * 0.04)),
      ],
    });
  }
  return out;
}

export const DEFAULT_INDUSTRIAL_DATA = demoIndustrialData(180, "2026-10-20");
export const DEFAULT_INDUSTRIAL_EVENTS: MetricEvent[] = [
  { date: DEFAULT_INDUSTRIAL_DATA[180 - 27].date, label: "Parallel CNC Spur Active" },
  { date: DEFAULT_INDUSTRIAL_DATA[180 - 12].date, label: "Tool Calibration Complete" },
];

export const DEFAULT_ENERGY_DATA = demoEnergyData(180, "2026-10-20");
export const DEFAULT_ENERGY_EVENTS: MetricEvent[] = [
  { date: DEFAULT_ENERGY_DATA[180 - 24].date, label: "Spindle Eco-Mode Active" },
  { date: DEFAULT_ENERGY_DATA[180 - 9].date, label: "Power Factor Optimization" },
];

const formatDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const formatShort = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function resample(values: number[], count: number) {
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1)) * (values.length - 1);
    const lo = Math.floor(at);
    const hi = Math.min(values.length - 1, lo + 1);
    out[i] = values[lo] + (values[hi] - values[lo]) * (at - lo);
  }
  return out;
}

const yOf = (height: number) => PAD_Y + (1 - height) * (H - PAD_Y * 2);

function toPath(heights: number[]) {
  const pts = heights.map((h, i) => [(i / (heights.length - 1)) * W, yOf(h)]);
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

const toArea = (line: string) => `${line}L${W} ${H}L0 ${H}Z`;

interface Shape {
  current: number[];
  previous: number[];
}

interface Paths {
  current: string;
  previous: string;
}

function buildPeriod(data: MetricPoint[], days: number, focus: number | null) {
  const current = data.slice(-days);
  const previous = data.slice(-days * 2, -days);
  const pick = (p: MetricPoint) =>
    focus === null ? sum(p.parts) : (p.parts[focus] ?? 0);
  const now = current.map(pick);
  const before = previous.map(pick);
  const all = [...now, ...before];
  const lo = Math.min(...all) * 0.85;
  const hi = Math.max(...all) * 1.04;
  const norm = (v: number) => (v - lo) / (hi - lo || 1);
  return {
    current,
    previous,
    now,
    before,
    shape: {
      current: resample(now.map(norm), SAMPLES),
      previous: resample(before.map(norm), SAMPLES),
    } as Shape,
    paths: {
      current: toPath(now.map(norm)),
      previous: toPath(before.map(norm)),
    } as Paths,
    norm,
  };
}

const total = (values: number[], span: Span | null) =>
  sum(span ? values.slice(span.lo, span.hi + 1) : values);

function breakdown(points: MetricPoint[], span: Span | null, count: number) {
  const parts = new Array<number>(count).fill(0);
  const days = span ? points.slice(span.lo, span.hi + 1) : points;
  for (const point of days) {
    for (let i = 0; i < count; i++) {
      parts[i] += point.parts[i] ?? 0;
    }
  }
  return parts;
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

function RollingNumber({ value }: { value: string }) {
  const chars = value.split("");
  return (
    <span aria-hidden className="inline-flex tabular-nums font-mono">
      {chars.map((char, i) => {
        const key = chars.length - i;
        if (!DIGIT.test(char)) {
          return <span key={`s${key}`}>{char}</span>;
        }
        return (
          <span
            className="relative inline-block h-[1em] overflow-hidden leading-none"
            key={`d${key}`}
          >
            <span className="invisible">0</span>
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[380ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{ transform: `translateY(-${Number(char) * 10}%)` }}
            >
              {DIGITS.map((d) => (
                <span className="block h-[1em] leading-none" key={d}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

type Period = ReturnType<typeof buildPeriod>;

function spanOf(
  range: { a: number; b: number } | null,
  cursor: number | null,
  last: number
): { span: Span | null; ranged: boolean } {
  if (range && range.a !== range.b) {
    return {
      span: { lo: Math.min(range.a, range.b), hi: Math.max(range.a, range.b) },
      ranged: true,
    };
  }
  if (cursor !== null && cursor <= last) {
    return { span: { lo: cursor, hi: cursor }, ranged: false };
  }
  return { span: null, ranged: false };
}

function readOf(
  info: Period,
  span: Span | null,
  ranged: boolean,
  period: number,
  events: MetricEvent[]
) {
  const day = span && !ranged ? info.current[span.lo] : undefined;
  const twin = span && !ranged ? info.previous[span.lo] : undefined;
  const value = total(info.now, span);
  const compare = total(info.before, span);
  const event = day ? events.find((e) => e.date === day.date) : undefined;
  let caption = `vs previous ${period} days`;
  if (ranged && span) {
    const days = span.hi - span.lo + 1;
    caption = `${formatShort(info.current[span.lo].date)} – ${formatShort(info.current[span.hi].date)} vs prior ${days} days`;
  } else if (day) {
    caption = `${formatDay(day.date)} vs ${formatShort(twin?.date ?? day.date)}`;
  }
  return {
    day,
    twin,
    value,
    delta: compare ? (value - compare) / compare : 0,
    event,
    caption,
  };
}

function Breakdown({
  segments,
  parts,
  focus,
  label,
  format,
  onChoose,
}: {
  segments: string[];
  parts: number[];
  focus: number | null;
  label: string;
  format: (value: number) => string;
  onChoose: (index: number) => void;
}) {
  const partsTotal = sum(parts);
  const swatch = (i: number) => SWATCHES[focus === i ? 0 : i % SWATCHES.length];
  return (
    <div className="mt-4 border-zinc-200/80 border-t pt-3 dark:border-zinc-800">
      <div aria-hidden className="flex h-1.5 gap-0.5">
        {segments.map((name, i) => (
          <span
            className={cn(
              "min-w-0 rounded-full transition-[flex-grow,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              swatch(i),
              focus !== null && focus !== i && "opacity-25"
            )}
            key={name}
            style={{ flexGrow: parts[i] ?? 0 }}
          />
        ))}
      </div>
      <ul className="-mx-2 mt-2">
        {segments.map((name, i) => {
          const share = partsTotal ? (parts[i] / partsTotal) * 100 : 0;
          return (
            <li key={name}>
              <button
                aria-label={
                  focus === i ? `Show all of ${label}` : `Show only ${name}`
                }
                aria-pressed={focus === i}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs outline-none transition-[background-color,opacity] duration-150 ease-out hover:bg-zinc-100/80 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-900/80",
                  focus === i &&
                    "bg-zinc-100 dark:bg-zinc-800/80",
                  focus !== null && focus !== i && "opacity-40"
                )}
                onClick={() => onChoose(i)}
                type="button"
              >
                <span
                  className={cn("size-2 shrink-0 rounded-full", swatch(i))}
                />
                <span className="flex-1 truncate font-medium text-zinc-700 dark:text-zinc-300">
                  {name}
                </span>
                <span className="font-semibold tabular-nums font-mono text-zinc-900 dark:text-zinc-100">
                  {format(parts[i] ?? 0)}
                </span>
                <span className="w-10 text-right text-zinc-400 tabular-nums font-mono dark:text-zinc-500">
                  {share.toFixed(0)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function keyStep(key: string, last: number) {
  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    Home: -last,
    End: last,
  };
  return moves[key];
}

export default function MetricCard({
  label = "Plant Production Output",
  segments = ["Stamping Press", "CNC Machining", "Robotic Welding", "Inspection & Pack"],
  data,
  events,
  periods = [7, 30, 90],
  defaultPeriod = 30,
  format = "number",
  currency = "USD",
  unit = "pcs",
  className,
}: MetricCardProps) {
  const isEnergy = unit === "kWh" || label.toLowerCase().includes("energy");
  const activeData = data ?? (isEnergy ? DEFAULT_ENERGY_DATA : DEFAULT_INDUSTRIAL_DATA);
  const activeEvents = events ?? (isEnergy ? DEFAULT_ENERGY_EVENTS : DEFAULT_INDUSTRIAL_EVENTS);

  const clipId = `${useId().replace(/:/g, "")}-lit`;
  const [period, setPeriod] = useState(defaultPeriod);
  const [focus, setFocus] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const drag = useRef<number | null>(null);

  const info = useMemo(
    () => buildPeriod(activeData, period, focus),
    [activeData, period, focus]
  );

  const currentRef = useRef<SVGPathElement>(null);
  const currentDimRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const previousRef = useRef<SVGPathElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const shown = useRef<Shape>(info.shape);
  const morph = useRef({ raf: 0 });

  const numFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: format === "currency" ? "currency" : "decimal",
        currency: format === "currency" ? currency : undefined,
        maximumFractionDigits: 0,
      }),
    [format, currency]
  );

  const formatWithUnit = useCallback(
    (v: number) => {
      const base = numFormatter.format(v);
      return unit ? `${base} ${unit}` : base;
    },
    [numFormatter, unit]
  );

  useEffect(() => {
    const from = shown.current;
    const to = info.shape;
    const m = morph.current;
    cancelAnimationFrame(m.raf);
    const paint = (paths: Paths) => {
      currentRef.current?.setAttribute("d", paths.current);
      currentDimRef.current?.setAttribute("d", paths.current);
      areaRef.current?.setAttribute("d", toArea(paths.current));
      previousRef.current?.setAttribute("d", paths.previous);
    };
    const land = () => {
      shown.current = to;
      paint(info.paths);
    };
    if (
      from === to ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      land();
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      const t = easeInOut(Math.min(1, (now - start) / MORPH_MS));
      const mix = (a: number[], b: number[]) =>
        a.map((v, i) => v + (b[i] - v) * t);
      shown.current = {
        current: mix(from.current, to.current),
        previous: mix(from.previous, to.previous),
      };
      if (t < 1) {
        paint({
          current: toPath(shown.current.current),
          previous: toPath(shown.current.previous),
        });
        m.raf = requestAnimationFrame(frame);
      } else {
        land();
      }
    };
    m.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(m.raf);
  }, [info.shape, info.paths]);

  const last = info.current.length - 1;

  const pinned = useMemo(
    () =>
      activeEvents
        .map((e) => ({
          ...e,
          at: info.current.findIndex((p) => p.date === e.date),
        }))
        .filter((e) => e.at >= 0),
    [activeEvents, info.current]
  );

  const indexAt = useCallback(
    (clientX: number) => {
      const rect = chartRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const t = clamp((clientX - rect.left) / rect.width, 0, 1);
      const near = pinned.find(
        (e) => Math.abs((e.at / (last || 1) - t) * rect.width) < SNAP_PX
      );
      return near ? near.at : Math.round(t * last);
    },
    [last, pinned]
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = indexAt(event.clientX);
    drag.current = at;
    setRange(null);
    setCursor(at);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const at = indexAt(event.clientX);
    if (drag.current !== null) {
      const anchor = drag.current;
      setRange((r) => (r || at !== anchor ? { a: anchor, b: at } : null));
      setCursor(at);
    } else if (event.pointerType === "mouse" && !range) {
      setCursor(at);
    }
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.pointerType !== "mouse") {
      setCursor(null);
    }
  };

  const clearRead = () => {
    setRange(null);
    setCursor(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      clearRead();
      return;
    }
    const move = keyStep(event.key, last);
    if (move === undefined) return;
    event.preventDefault();
    const from = range ? range.b : (cursor ?? last);
    const to = clamp(from + move, 0, last);
    if (event.shiftKey) {
      setRange({ a: range ? range.a : from, b: to });
    } else {
      setRange(null);
    }
    setCursor(to);
  };

  const choosePeriod = (days: number) => {
    clearRead();
    setPeriod(days);
  };

  const chooseSegment = (index: number) => {
    setFocus((f) => (f === index ? null : index));
  };

  const { span, ranged } = spanOf(range, cursor, last);
  const { day, twin, value, delta, event, caption } = readOf(
    info,
    span,
    ranged,
    period,
    activeEvents
  );
  const up = delta >= 0;
  const parts = breakdown(info.current, span, segments.length);
  const formatted = formatWithUnit(value);
  let valueText = `${formatted} in total`;
  if (ranged) {
    valueText = `${caption}: ${formatted}`;
  } else if (day) {
    valueText = `${formatDay(day.date)}: ${formatted}${event ? `, ${event.label}` : ""}`;
  }

  const xOf = (i: number) => (last ? (i / last) * W : W);
  const pct = (i: number) => (xOf(i) / W) * 100;
  const litFrom = ranged && span ? xOf(span.lo) : 0;
  const litTo = span ? xOf(span.hi) : W;
  const endY = info.now.length ? yOf(info.norm(info.now[last])) : 0;
  const firstDay = info.current[0];
  const lastDay = info.current.at(-1);
  const periodIndex = Math.max(0, periods.indexOf(period));

  return (
    <div
      className={cn(
        "w-full select-none rounded-2xl border border-zinc-200/90 bg-white/95 p-5 text-zinc-900 shadow-md backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100",
        className
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
          {focus !== null && (
            <span className="text-sky-600 dark:text-sky-400 font-bold">
              {" "}
              · {segments[focus]}
            </span>
          )}
        </p>
        <div className="relative flex shrink-0 rounded-full bg-zinc-100/90 p-0.5 text-xs dark:bg-zinc-900">
          <span
            aria-hidden
            className="absolute top-0.5 bottom-0.5 left-0.5 w-10 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:bg-zinc-700"
            style={{ transform: `translateX(${periodIndex * 100}%)` }}
          />
          {periods.map((days) => (
            <button
              aria-pressed={days === period}
              className={cn(
                "relative w-10 rounded-full py-0.5 font-mono text-[11px] font-semibold tabular-nums outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-zinc-400",
                days === period
                  ? "text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
              key={days}
              onClick={() => choosePeriod(days)}
              type="button"
            >
              {days}D
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2.5 font-bold text-3xl tracking-tight text-zinc-900 dark:text-zinc-50 flex items-baseline gap-1.5">
        <span className="sr-only">{formatted}</span>
        <RollingNumber value={numFormatter.format(value)} />
        {unit && (
          <span className="text-lg font-mono font-medium text-zinc-500 dark:text-zinc-400">
            {unit}
          </span>
        )}
      </p>

      <div className="mt-1 flex min-h-5 items-center gap-2 text-xs tabular-nums">
        <span
          className={cn(
            "shrink-0 font-bold",
            up
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          )}
        >
          {up ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}%
        </span>
        <span
          aria-live="polite"
          className="truncate text-zinc-500 dark:text-zinc-400 font-medium"
        >
          {caption}
          {event && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {" "}
              · {event.label}
            </span>
          )}
        </span>
        {ranged && (
          <button
            className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 outline-none transition-colors duration-150 ease-out hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            onClick={clearRead}
            type="button"
          >
            Clear Range
          </button>
        )}
      </div>

      <div
        aria-label={`${label} over the last ${period} days. Arrow keys read each day; hold Shift to select a range.`}
        aria-valuemax={info.current.length}
        aria-valuemin={1}
        aria-valuenow={span ? span.hi + 1 : info.current.length}
        aria-valuetext={valueText}
        className="relative mt-4 h-28 cursor-crosshair touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-4 dark:focus-visible:ring-offset-zinc-950"
        onBlur={() => setCursor(null)}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={release}
        onPointerCancel={release}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          if (drag.current === null && !range) {
            setCursor(null);
          }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={release}
        ref={chartRef}
        role="slider"
        tabIndex={0}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                height={H + 20}
                width={Math.max(0, litTo - litFrom)}
                x={litFrom}
                y={-10}
              />
            </clipPath>
          </defs>
          <line
            className="stroke-zinc-200 dark:stroke-zinc-800"
            vectorEffect="non-scaling-stroke"
            x1={0}
            x2={W}
            y1={H - 0.5}
            y2={H - 0.5}
          />
          <path
            className="fill-none stroke-zinc-400/60 dark:stroke-zinc-600/60"
            d={info.paths.previous}
            ref={previousRef}
            strokeDasharray="3 4"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="fill-sky-500/10 dark:fill-sky-400/10"
            clipPath={`url(#${clipId})`}
            d={toArea(info.paths.current)}
            ref={areaRef}
          />
          <path
            className="fill-none stroke-zinc-900/20 dark:stroke-zinc-100/20"
            d={info.paths.current}
            ref={currentDimRef}
            strokeLinecap="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="fill-none stroke-sky-600 dark:stroke-sky-400"
            clipPath={`url(#${clipId})`}
            d={info.paths.current}
            ref={currentRef}
            strokeLinecap="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {pinned.map((e) => (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px -translate-x-1/2"
            key={e.date}
            style={{ left: `${pct(e.at)}%` }}
          >
            <div className="absolute inset-y-0 left-0 border-amber-500/40 border-l border-dashed dark:border-amber-400/40" />
            <div className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-amber-500 ring-2 ring-white dark:bg-amber-400 dark:ring-zinc-950" />
          </div>
        ))}

        {ranged &&
          span &&
          [span.lo, span.hi].map((i) => (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-zinc-400 dark:bg-zinc-600"
              key={i}
              style={{ left: `${pct(i)}%` }}
            />
          ))}

        {day && span && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-sky-500/50"
              style={{ left: `${pct(span.lo)}%` }}
            />
            {twin && (
              <div
                aria-hidden
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-950"
                style={{
                  left: `${pct(span.lo)}%`,
                  top: `${(yOf(info.norm(info.before[span.lo])) / H) * 100}%`,
                }}
              />
            )}
            <div
              aria-hidden
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600 ring-4 ring-sky-500/20 dark:bg-sky-400 dark:ring-sky-400/20"
              style={{
                left: `${pct(span.lo)}%`,
                top: `${(yOf(info.norm(info.now[span.lo])) / H) * 100}%`,
              }}
            />
          </>
        )}

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-0 size-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600 ring-4 ring-sky-500/20 transition-[top,opacity] duration-[420ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none dark:bg-sky-400 dark:ring-sky-400/20",
            span ? "opacity-0" : "opacity-100"
          )}
          style={{ top: `${(endY / H) * 100}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-[11px] font-mono text-zinc-400 tabular-nums dark:text-zinc-500">
        <span>{firstDay ? formatShort(firstDay.date) : ""}</span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="h-px w-3 border-zinc-400 border-t border-dashed dark:border-zinc-600" />
          Previous Period
        </span>
        <span>{lastDay ? formatShort(lastDay.date) : ""}</span>
      </div>

      <Breakdown
        focus={focus}
        format={(v) => formatWithUnit(v)}
        label={label}
        onChoose={chooseSegment}
        parts={parts}
        segments={segments}
      />
    </div>
  );
}
