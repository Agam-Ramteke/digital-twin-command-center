"use client";

/**
 * @author: @dorianbaffier (adapted for Digital Twin Command Center)
 * @description: Stack Panel for Industrial Digital Twin Orchestration & Configuration
 * @version: 1.1.0
 * @license: MIT
 * @website: https://kokonutui.com
 */

import { Check, ChevronLeft, ChevronRight, Sliders, Shield, Cpu, Radio, RotateCcw, AlertTriangle } from "lucide-react";
import {
  AnimatePresence,
  animate,
  MotionConfig,
  motion,
  type PanInfo,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

export interface StackRow {
  id: string;
  label: string;
  /** Grey text on the right, like current setting or telemetry value */
  detail?: string;
  /** Id of the page this row opens */
  to?: string;
  /** Anything else on the right: a switch, a badge, an icon */
  trailing?: ReactNode;
  onSelect?: () => void;
  /** Shows a check, for rows that pick one option of a section */
  selected?: boolean;
  /** Shows a switch in this state, for rows that turn something on */
  checked?: boolean;
  tone?: "default" | "danger" | "warn";
}

export interface StackSection {
  title?: string;
  rows: StackRow[];
  /** Small print under the section */
  footer?: string;
}

export interface StackPage {
  title: string;
  sections: StackSection[];
}

export interface StackPanelProps {
  pages: Record<string, StackPage>;
  /** The page the panel starts on */
  root: string;
  className?: string;
}

// Spring animation profiles
const PUSH = { type: "spring", duration: 0.42, bounce: 0 } as const;
const HEIGHT = { type: "spring", duration: 0.38, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const PARALLAX = 0.3;
const POP_DISTANCE = 0.35;
const POP_VELOCITY = 500;

interface Origin {
  left: number;
  top: number;
  height: number;
  fontSize: number;
}

function Title({
  text,
  origin,
  direction,
  panel,
}: {
  text: string;
  origin: Origin | null;
  direction: 1 | -1;
  panel: HTMLElement | null;
}) {
  const [scope, run] = useAnimate<HTMLSpanElement>();
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = scope.current;
    if (!(el && panel)) {
      return;
    }
    if (!origin || reduced) {
      run(
        el,
        { opacity: [0, 1], x: [direction * 24, 0] },
        { duration: reduced ? 0 : 0.28, ease: EASE_OUT }
      );
      return;
    }
    const box = panel.getBoundingClientRect();
    const own = el.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(el).fontSize);
    const scale = origin.fontSize / fontSize;
    const dx = origin.left - (own.left - box.left);
    const dy =
      origin.top + origin.height / 2 - (own.top - box.top + own.height / 2);

    el.style.transform = `translateX(${dx}px) translateY(${dy}px) scale(${scale})`;
    run(
      el,
      { x: [dx, 0], y: [dy, 0], scale: [scale, 1], opacity: [1, 1] },
      PUSH
    );
  }, [scope, run, origin, direction, panel, reduced]);

  return (
    <motion.span
      className="absolute inset-x-0 top-1/2 mx-auto w-fit max-w-[65%] -translate-y-1/2 truncate font-semibold text-[14px] text-zinc-900 dark:text-zinc-100 tracking-tight"
      exit={{
        opacity: 0,
        x: direction * -40,
        transition: { duration: 0.18, ease: EASE_OUT },
      }}
      ref={scope}
      style={{ transformOrigin: "left center" }}
    >
      {text}
    </motion.span>
  );
}

function Page({
  page,
  onOpen,
  measureRef,
}: {
  page: StackPage;
  onOpen: (row: StackRow, label: HTMLElement) => void;
  measureRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-3 pt-2 pb-4" ref={measureRef}>
      {page.sections.map((section, index) => (
        <section key={section.title ?? index}>
          {section.title && (
            <h3 className="mb-1.5 px-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {section.title}
            </h3>
          )}
          <ul className="divide-y divide-zinc-200/60 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/90 dark:divide-zinc-800/70 dark:border-zinc-800 dark:bg-zinc-900/80">
            {section.rows.map((row) => (
              <li key={row.id}>
                <RowView onOpen={onOpen} row={row} />
              </li>
            ))}
          </ul>
          {section.footer && (
            <p className="mt-1.5 px-3 text-[11px] text-zinc-400 leading-normal dark:text-zinc-500">
              {section.footer}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function RowView({
  row,
  onOpen,
}: {
  row: StackRow;
  onOpen: (row: StackRow, label: HTMLElement) => void;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const interactive = Boolean(row.to || row.onSelect);
  const content = (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[13px] font-medium",
          row.tone === "danger"
            ? "text-red-600 dark:text-red-400 font-semibold"
            : row.tone === "warn"
            ? "text-amber-600 dark:text-amber-400"
            : "text-zinc-900 dark:text-zinc-100"
        )}
        ref={labelRef}
      >
        {row.label}
      </span>
      {row.detail && (
        <span className="max-w-[48%] shrink-0 truncate text-[12px] font-mono text-zinc-500 dark:text-zinc-400">
          {row.detail}
        </span>
      )}
      {row.trailing}
      {row.checked !== undefined && <Toggle on={row.checked} />}
      {row.selected !== undefined && (
        <Check
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-emerald-600 dark:text-emerald-400",
            !row.selected && "invisible"
          )}
        />
      )}
      {row.to && (
        <ChevronRight
          aria-hidden="true"
          className="-mr-1 size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
        />
      )}
    </>
  );
  const base = "flex min-h-10 w-full items-center gap-2 px-3 py-2";
  if (!interactive) {
    return <div className={base}>{content}</div>;
  }
  const className = cn(
    base,
    "outline-none transition-colors duration-150 hover:bg-zinc-100/90 focus-visible:bg-zinc-100 active:bg-zinc-100 dark:active:bg-zinc-800 dark:focus-visible:bg-zinc-800 dark:hover:bg-zinc-800/60"
  );
  const onClick = () => {
    if (labelRef.current) {
      onOpen(row, labelRef.current);
    }
  };
  if (row.checked !== undefined) {
    return (
      <button
        aria-checked={row.checked}
        className={className}
        onClick={onClick}
        role="switch"
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <button
      aria-pressed={row.selected}
      className={className}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

export function StackPanel({ pages, root, className }: StackPanelProps) {
  const [stack, setStack] = useState<string[]>([root]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const x = useMotionValue(0);
  const [width, setWidth] = useState(360);
  const underX = useTransform(x, (v) => -PARALLAX * (width - v));
  const shade = useTransform(x, [0, width], [0.06, 0]);

  const top = stack.at(-1) ?? root;
  const under = stack.length > 1 ? stack.at(-2) : undefined;
  const parent = under ? pages[under] : undefined;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const watch = new ResizeObserver(() => setWidth(body.clientWidth));
    watch.observe(body);
    return () => {
      watch.disconnect();
      observer.current?.disconnect();
    };
  }, []);

  const measure = (el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.current.observe(el);
  };

  const push = (row: StackRow, label: HTMLElement) => {
    row.onSelect?.();
    if (!(row.to && pages[row.to]) || busy) {
      return;
    }
    const box = panelRef.current?.getBoundingClientRect();
    const rect = label.getBoundingClientRect();
    setOrigin(
      box
        ? {
            left: rect.left - box.left,
            top: rect.top - box.top,
            height: rect.height,
            fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
          }
        : null
    );
    setDirection(1);
    setBusy(true);
    x.set(width);
    const to = row.to;
    flushSync(() => setStack((s) => [...s, to]));
    animate(x, 0, PUSH).then(() => setBusy(false));
    backRef.current?.focus({ preventScroll: true });
  };

  const pop = () => {
    if (stack.length < 2) return;
    setOrigin(null);
    setDirection(-1);
    setBusy(true);
    animate(x, width, { ...PUSH, duration: 0.34 }).then(() => {
      flushSync(() => setStack((s) => s.slice(0, -1)));
      x.set(0);
      setBusy(false);
    });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (x.get() > width * POP_DISTANCE || info.velocity.x > POP_VELOCITY) {
      pop();
    } else {
      animate(x, 0, PUSH);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && stack.length > 1) {
      event.preventDefault();
      pop();
      backRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 shadow-md",
          className
        )}
        onKeyDown={onKeyDown}
        ref={panelRef}
      >
        <div className="relative z-10 flex h-11 items-center border-zinc-200/80 border-b bg-zinc-50/80 px-2 dark:border-zinc-800/80 dark:bg-zinc-950/80">
          <AnimatePresence initial={false}>
            {parent && (
              <motion.button
                animate={{ opacity: 1 }}
                className="relative z-10 flex max-w-[35%] items-center rounded-lg py-1 pr-2 pl-1 text-xs font-medium text-zinc-600 outline-none transition-colors duration-150 hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key="back"
                onClick={pop}
                ref={backRef}
                transition={{ duration: 0.18 }}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{parent.title}</span>
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            <Title
              direction={direction}
              key={`${top}-${stack.length}`}
              origin={origin}
              panel={panelRef.current}
              text={pages[top]?.title ?? ""}
            />
          </AnimatePresence>
        </div>

        <motion.div
          animate={{ height }}
          className="relative"
          ref={bodyRef}
          transition={HEIGHT}
        >
          {under && pages[under] && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0"
              inert
              key={`${under}-${stack.length - 1}`}
              style={{ x: underX }}
            >
              <Page onOpen={() => undefined} page={pages[under]} />
              <motion.div
                className="absolute inset-0 bg-black"
                style={{ opacity: shade }}
              />
            </motion.div>
          )}
          {pages[top] && (
            <motion.div
              className="relative bg-white dark:bg-zinc-950"
              drag={stack.length > 1 && !busy ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragDirectionLock
              dragElastic={{ left: 0, right: 1 }}
              dragMomentum={false}
              key={`${top}-${stack.length}`}
              onDragEnd={onDragEnd}
              style={{
                x,
                boxShadow:
                  stack.length > 1 ? "-8px 0 24px -12px rgb(0 0 0 / 0.18)" : "",
              }}
            >
              <Page measureRef={measure} onOpen={push} page={pages[top]} />
            </motion.div>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative h-[20px] w-9 shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-emerald-600 dark:bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] dark:bg-zinc-950",
          on && "translate-x-4"
        )}
      />
    </span>
  );
}

/**
 * Authentic Industrial Digital Twin Command Center Configuration
 * Replaces generic SaaS demo templates with authentic manufacturing orchestration data.
 */
export default function StackPanelDemo({ className }: { className?: string }) {
  const [qos, setQos] = useState("QoS 1 (At Least Once)");
  const [tickRate, setTickRate] = useState("1,000 ms (Nominal)");
  const [shift, setShift] = useState("Shift A (06:00 – 14:00)");
  const [policies, setPolicies] = useState({
    anomalyAlerts: true,
    whatIfSpur: true,
    autoShutoff: true,
    isoBenchmarking: true,
  });

  const flip = (key: keyof typeof policies) => () =>
    setPolicies((p) => ({ ...p, [key]: !p[key] }));

  const toggleRow = (id: keyof typeof policies, label: string): StackRow => ({
    id,
    label,
    onSelect: flip(id),
    checked: policies[id],
  });

  const choice = (
    value: string,
    current: string,
    set: (v: string) => void
  ): StackRow => ({
    id: value,
    label: value,
    selected: value === current,
    onSelect: () => set(value),
  });

  const pages: Record<string, StackPage> = {
    settings: {
      title: "Digital Twin Engine Settings",
      sections: [
        {
          title: "Microservices & Ingestion",
          rows: [
            {
              id: "mqtt",
              label: "MQTT Broker & Edge Bus",
              detail: "ws://localhost:9001",
              to: "mqtt",
            },
            {
              id: "simulator",
              label: "Causal Physics Simulator",
              detail: tickRate.split(" ")[0],
              to: "simulator",
            },
            {
              id: "shifts",
              label: "Active Production Shift",
              detail: "Shift A",
              to: "shifts",
            },
          ],
        },
        {
          title: "Autonomous Fleet Policies",
          rows: [
            toggleRow("anomalyAlerts", "ISO-22400 Anomaly Alarms"),
            toggleRow("whatIfSpur", "Parallel CNC Spur (What-If)"),
            toggleRow("autoShutoff", "Critical Vibration Interlock"),
            toggleRow("isoBenchmarking", "Live World-Class OEE Benchmark"),
          ],
          footer: "Automated interlocks trigger emergency line pauses upon persistent > 4.5 mm/s spindle vibration.",
        },
        {
          title: "Line Hardware Interlocks",
          rows: [
            { id: "safety", label: "Station Safety Enclosures", detail: "5 / 5 Nominal", to: "safety" },
            { id: "station_thresholds", label: "Station Warning Thresholds", detail: "Calibrated", to: "station_thresholds" },
          ],
        },
      ],
    },

    mqtt: {
      title: "MQTT Broker & Protocol",
      sections: [
        {
          title: "Connection Endpoints",
          rows: [
            { id: "endpoint", label: "TCP Ingestion Port", detail: "1883 (Active)" },
            { id: "ws_endpoint", label: "Browser WebSocket", detail: "9001 (Streaming)" },
            { id: "rate", label: "Aggregated Telemetry Rate", detail: "5 msgs / sec" },
          ],
          footer: "Canonical topic pattern: factory/v1/{station_id}/telemetry",
        },
        {
          title: "Delivery Quality of Service",
          rows: [
            "QoS 0 (At Most Once)",
            "QoS 1 (At Least Once)",
            "QoS 2 (Exactly Once)",
          ].map((v) => choice(v, qos, setQos)),
        },
      ],
    },

    simulator: {
      title: "Causal Physics Engine",
      sections: [
        {
          title: "Simulation Cadence",
          rows: [
            "500 ms (High-Resolution)",
            "1,000 ms (Nominal)",
            "2,000 ms (Resource Saving)",
          ].map((v) => choice(v, tickRate, setTickRate)),
          footer: "Clock ticks advance discrete material tokens through the Theory of Constraints pipeline.",
        },
        {
          title: "Deterministic Seed",
          rows: [
            { id: "seed", label: "RNG Seed Value", detail: "42 (Certified Stable)" },
            { id: "noise", label: "Thermal Drift Variance", detail: "± 0.4 °C / min" },
            { id: "physics", label: "Euler Integration Step", detail: "dt = 0.10s" },
          ],
        },
      ],
    },

    shifts: {
      title: "Production Shift Schedule",
      sections: [
        {
          title: "Select Operational Shift",
          rows: [
            "Shift A (06:00 – 14:00)",
            "Shift B (14:00 – 22:00)",
            "Maintenance Window (22:00 – 06:00)",
          ].map((v) => choice(v, shift, setShift)),
          footer: "Shift handover automatically archives active WIP balances into persistent MongoDB audit collections.",
        },
      ],
    },

    safety: {
      title: "Station Safety Enclosures",
      sections: [
        {
          title: "Optoelectronic & Perimeter Guards",
          rows: [
            { id: "stamping_light", label: "STAMPING-01 Light Curtain", detail: "100% Armed" },
            { id: "cnc_interlock", label: "CNC-01 Enclosure Interlock", detail: "Sealed & Locked" },
            { id: "welding_flash", label: "WELDING-01 Flash Partition", detail: "Active" },
            { id: "cmm_laser", label: "INSPECTION-01 Laser Shield", detail: "Calibrated" },
            { id: "pack_estop", label: "PACKAGING-01 E-Stop String", detail: "Nominal" },
          ],
          footer: "Tripping any interlock instantly drops line hydraulic pressure to zero.",
        },
      ],
    },

    station_thresholds: {
      title: "Warning Thresholds",
      sections: [
        {
          title: "Spindle & Hydraulic Triggers",
          rows: [
            { id: "vib_limit", label: "Max Allowable Vibration", detail: "4.50 mm/s" },
            { id: "temp_limit", label: "Spindle Thermal Cutoff", detail: "82.0 °C" },
            { id: "press_limit", label: "Stamping Hydraulic Min", detail: "140 bar" },
            { id: "weld_limit", label: "MIG Current Variance Limit", detail: "± 12 A" },
          ],
          footer: "Exceeding warning limits flags anomaly badges on the 3D Factory Floor HUD.",
        },
      ],
    },
  };

  return <StackPanel className={className} pages={pages} root="settings" />;
}
