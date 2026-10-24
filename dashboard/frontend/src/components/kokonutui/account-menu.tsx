"use client";

/**
 * @author: @dorianbaffier (adapted for Digital Twin Command Center)
 * @description: Account Menu / Collapsible Profile Card
 * @version: 2.1.0
 * @license: MIT
 * @website: https://kokonutui.com
 */

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  User,
  Shield,
  Activity,
} from "lucide-react";
import {
  animate,
  motion,
  type Transition,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface Account {
  id: string;
  name: string;
  email: string;
  /** Shown in the avatar. Defaults to the first letters of `name`. */
  initials?: string;
  /** Plain label shown in the menu header, such as "Lead Engineer". */
  plan?: string;
}

export type AccountStatus = "online" | "away" | "busy";
export type AccountTheme = "light" | "dark" | "system";

export interface ProfileMenuItem {
  label: string;
  icon?: ReactNode;
  value?: string;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
}

interface ProfileDropdownProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  accounts?: Account[];
  defaultAccountId?: string;
  onAccountChange?: (account: Account) => void;
  onAddAccount?: () => void;
  items?: ProfileMenuItem[];
  theme?: AccountTheme;
  defaultTheme?: AccountTheme;
  onThemeChange?: (theme: AccountTheme) => void;
  status?: AccountStatus;
  defaultStatus?: AccountStatus;
  onStatusChange?: (status: AccountStatus) => void;
  onSignOut?: () => void;
  holdDuration?: number;
}

const SAMPLE_ACCOUNTS: Account[] = [
  { id: "lead", name: "Alex Rivera", email: "alex.rivera@twin-command.io", plan: "Plant Engineer", initials: "AR" },
  { id: "architect", name: "Elena Rostova", email: "elena.rostova@twin-command.io", plan: "OT Architect", initials: "ER" },
  { id: "supervisor", name: "Shift A Supervisor", email: "shift.lead@twin-command.io", plan: "Floor Lead", initials: "SA" },
];

const SAMPLE_ITEMS: ProfileMenuItem[] = [
  { label: "Operator Profile", icon: <User className="size-4" /> },
  { label: "Twin Calibrations", icon: <Settings className="size-4" />, value: "ISO-22400" },
  { label: "Safety Protocols", icon: <Shield className="size-4" />, value: "Active" },
];

const STATUSES: {
  id: AccountStatus;
  label: string;
  name: string;
  dot: string;
}[] = [
  { id: "online", label: "Online", name: "Online", dot: "bg-emerald-500" },
  { id: "away", label: "Shift Break", name: "Away", dot: "bg-amber-400" },
  { id: "busy", label: "Incident Mode", name: "Do not disturb", dot: "bg-red-500" },
];

const THEMES = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
] as const;

const AVATAR_TONES = [
  "bg-sky-600 text-white dark:bg-sky-500 dark:text-zinc-950",
  "bg-amber-600 text-white dark:bg-amber-500 dark:text-zinc-950",
  "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950",
];

const WHITESPACE = /\s+/;
const PANEL_W = 288;
const RADIUS = 16;
const SPRING: Transition = { type: "spring", duration: 0.3, bounce: 0 };
const INDICATOR_SPRING: Transition = {
  type: "spring",
  duration: 0.25,
  bounce: 0,
};
const INSTANT: Transition = { duration: 0 };
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const NAV_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

const ITEM_CLASS =
  "flex w-full cursor-default items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-xs font-medium text-zinc-700 outline-none transition-colors duration-100 focus:bg-zinc-100 focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-zinc-800/80 dark:focus:text-zinc-50";

type Phase = "closed" | "open" | "closing";
type Page = "main" | "accounts";
type Via = "pointer" | "keyboard";

function initialsOf(account: Account) {
  if (account.initials) {
    return account.initials;
  }
  return account.name
    .split(WHITESPACE)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function viaOf(event: MouseEvent): Via {
  return event.detail === 0 ? "keyboard" : "pointer";
}

function menuItems(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>("[data-menu-item]"));
}

function sideTarget(items: HTMLElement[], current: HTMLElement, step: number) {
  const row = items.filter((item) => item.dataset.row === current.dataset.row);
  if (row.length < 2) return;
  const index = row.indexOf(current);
  return row[(index + step + row.length) % row.length];
}

function rowTarget(items: HTMLElement[], current: HTMLElement, step: number) {
  const rows = [...new Set(items.map((item) => item.dataset.row))];
  const index = rows.indexOf(current.dataset.row);
  const next = rows[(index + step + rows.length) % rows.length];
  const candidates = items.filter((item) => item.dataset.row === next);
  return (
    candidates.find((item) => item.getAttribute("aria-checked") === "true") ??
    candidates[0]
  );
}

function nextTarget(
  items: HTMLElement[],
  active: Element | null,
  key: string
): HTMLElement | undefined {
  if (key === "Home") return items[0];
  if (key === "End") return items.at(-1);
  const current = items.find((item) => item === active);
  if (!current) {
    return key === "ArrowUp" ? items.at(-1) : items[0];
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    return sideTarget(items, current, key === "ArrowRight" ? 1 : -1);
  }
  return rowTarget(items, current, key === "ArrowDown" ? 1 : -1);
}

function useControllable<T>(
  value: T | undefined,
  fallback: T,
  onChange?: (next: T) => void
) {
  const [local, setLocal] = useState(fallback);
  const set = (next: T) => {
    setLocal(next);
    onChange?.(next);
  };
  return [value ?? local, set] as const;
}

function Avatar({
  account,
  tone,
  status,
  className,
}: {
  account: Account;
  tone: number;
  status?: AccountStatus;
  className?: string;
}) {
  const dot = STATUSES.find((entry) => entry.id === status)?.dot;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 select-none place-items-center rounded-full font-bold text-[10px] tracking-wide",
        AVATAR_TONES[tone % AVATAR_TONES.length],
        className
      )}
    >
      {initialsOf(account)}
      {dot ? (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-white transition-colors duration-200 dark:ring-zinc-900",
            dot
          )}
        />
      ) : null}
    </span>
  );
}

function Identity({
  uid,
  shared,
  account,
  tone,
  status,
  transition,
  stacked,
}: {
  uid: string;
  shared: boolean;
  account: Account;
  tone: number;
  status: AccountStatus;
  transition: Transition;
  stacked: boolean;
}) {
  const hidden = shared ? undefined : "invisible";
  return (
    <span
      className={cn(
        "flex min-w-0",
        stacked ? "flex-col items-start gap-2.5" : "items-center gap-2"
      )}
    >
      <motion.span
        className={cn("relative z-20 block", hidden)}
        key={shared ? "avatar-shared" : "avatar-static"}
        layoutId={shared ? `${uid}-avatar` : undefined}
        transition={transition}
      >
        <Avatar
          account={account}
          className={stacked ? "size-9" : "size-7"}
          status={status}
          tone={tone}
        />
      </motion.span>
      <span className="flex min-w-0 flex-col text-left">
        <motion.span
          className={cn(
            "relative z-20 block truncate font-semibold text-xs text-zinc-900 leading-4 dark:text-zinc-100",
            hidden
          )}
          key={shared ? "name-shared" : "name-static"}
          layoutId={shared ? `${uid}-name` : undefined}
          transition={transition}
        >
          {account.name}
        </motion.span>
        <motion.span
          className={cn(
            "relative z-20 block truncate text-[11px] text-zinc-500 leading-3 font-mono dark:text-zinc-400",
            hidden
          )}
          key={shared ? "email-shared" : "email-static"}
          layoutId={shared ? `${uid}-email` : undefined}
          transition={transition}
        >
          {account.email}
        </motion.span>
      </span>
    </span>
  );
}

function Separator() {
  return (
    <hr className="mx-2 my-1.5 h-px border-0 bg-zinc-200/80 dark:bg-zinc-800" />
  );
}

function HoldSignOut({
  duration,
  onComplete,
}: {
  duration: number;
  onComplete: (via: Via) => void;
}) {
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [nudge, setNudge] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const nudgeTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(nudgeTimer.current);
    },
    []
  );

  const start = (via: Via) => {
    if (timer.current !== undefined || done) return;
    window.clearTimeout(nudgeTimer.current);
    setNudge(false);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      setDone(true);
      onComplete(via);
    }, duration);
  };

  const cancel = () => {
    if (timer.current === undefined) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
    setNudge(true);
    nudgeTimer.current = window.setTimeout(() => setNudge(false), 1400);
  };

  const label = (
    <>
      <LogOut className="size-3.5" />
      <span className="flex-1">Sign Out Operator</span>
      <span className="text-[10px] font-mono opacity-60">
        {nudge ? "Keep holding" : "Hold"}
      </span>
    </>
  );

  return (
    <button
      className={cn(ITEM_CLASS, "relative touch-none select-none text-red-600 dark:text-red-400")}
      data-menu-item=""
      data-row="sign-out"
      onBlur={cancel}
      onClick={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) start("keyboard");
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cancel();
        }
      }}
      onPointerCancel={cancel}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start("pointer");
      }}
      onPointerUp={cancel}
      role="menuitem"
      tabIndex={-1}
      type="button"
    >
      {label}
      <span className="sr-only">, press and hold to confirm operator sign out</span>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center gap-2.5 rounded-[10px] bg-red-600 px-2.5 text-white dark:bg-red-500 dark:text-zinc-950"
        style={{
          clipPath:
            holding || done
              ? "inset(0 0 0 0 round 10px)"
              : "inset(0 100% 0 0 round 10px)",
          transition: holding
            ? `clip-path ${duration}ms linear`
            : "clip-path 240ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function StatusRow({
  status,
  onChange,
}: {
  status: AccountStatus;
  onChange: (status: AccountStatus) => void;
}) {
  return (
    <fieldset
      aria-label="Status"
      className="m-0 flex min-w-0 items-center justify-between border-0 py-1 pr-1 pl-2"
    >
      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Status</span>
      <span className="flex">
        {STATUSES.map((entry) => {
          const checked = entry.id === status;
          return (
            <button
              aria-checked={checked}
              aria-label={entry.name}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 outline-none transition-colors duration-100 focus:bg-zinc-100 aria-checked:text-zinc-900 dark:text-zinc-400 dark:aria-checked:text-zinc-100 dark:focus:bg-zinc-800"
              data-menu-item=""
              data-row="status"
              key={entry.id}
              onClick={() => onChange(entry.id)}
              role="menuitemradio"
              tabIndex={-1}
              type="button"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors duration-200",
                  checked ? entry.dot : "bg-zinc-300 dark:bg-zinc-600"
                )}
              />
              {entry.label}
            </button>
          );
        })}
      </span>
    </fieldset>
  );
}

function ThemeRow({
  uid,
  theme,
  onChange,
  reduced,
}: {
  uid: string;
  theme: AccountTheme;
  onChange: (theme: AccountTheme) => void;
  reduced: boolean;
}) {
  return (
    <fieldset
      aria-label="Theme"
      className="m-0 flex min-w-0 items-center justify-between border-0 py-1 pr-1 pl-2"
    >
      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Theme</span>
      <span className="flex rounded-[8px] bg-zinc-100 p-0.5 dark:bg-zinc-800">
        {THEMES.map(({ id, label, Icon }) => {
          const checked = id === theme;
          return (
            <button
              aria-checked={checked}
              aria-label={label}
              className="relative grid h-6 w-8 place-items-center rounded-[6px] text-zinc-500 outline-none transition-colors duration-150 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400 aria-checked:text-zinc-900 dark:text-zinc-400 dark:aria-checked:text-zinc-50 dark:hover:text-zinc-200"
              data-menu-item=""
              data-row="theme"
              key={id}
              onClick={() => onChange(id)}
              role="menuitemradio"
              tabIndex={-1}
              type="button"
            >
              {checked ? (
                <motion.span
                  className="absolute inset-0 rounded-[6px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:bg-zinc-700"
                  layoutId={`${uid}-theme`}
                  transition={reduced ? INSTANT : INDICATOR_SPRING}
                />
              ) : null}
              <Icon className="relative size-3" />
            </button>
          );
        })}
      </span>
    </fieldset>
  );
}

function LinkItem({
  item,
  index,
  onSelect,
}: {
  item: ProfileMenuItem;
  index: number;
  onSelect: (event: MouseEvent, run?: () => void) => void;
}) {
  const inner = (
    <>
      <span className="text-zinc-400 dark:text-zinc-500">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {item.value ? (
        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          {item.value}
        </span>
      ) : null}
    </>
  );
  const common = {
    className: ITEM_CLASS,
    "data-menu-item": "",
    "data-row": `item-${index}`,
    onClick: (event: MouseEvent) => onSelect(event, item.onSelect),
    role: "menuitem",
    tabIndex: -1,
  } as const;
  if (item.href) {
    return (
      <a
        {...common}
        href={item.href}
        {...(item.external && { rel: "noopener noreferrer", target: "_blank" })}
      >
        {inner}
      </a>
    );
  }
  return (
    <button {...common} type="button">
      {inner}
    </button>
  );
}

export default function ProfileDropdown({
  accounts = SAMPLE_ACCOUNTS,
  defaultAccountId,
  onAccountChange,
  onAddAccount,
  items = SAMPLE_ITEMS,
  theme: themeProp,
  defaultTheme = "system",
  onThemeChange,
  status: statusProp,
  defaultStatus = "online",
  onStatusChange,
  onSignOut,
  holdDuration = 1200,
  className,
  ...props
}: ProfileDropdownProps) {
  const uid = useId();
  const reduced = useReducedMotion() === true;
  const [phase, setPhase] = useState<Phase>("closed");
  const [instant, setInstant] = useState(false);
  const [page, setPage] = useState<Page>("main");
  const [openSeq, setOpenSeq] = useState(0);
  const [accountId, setAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id
  );
  const [theme, setTheme] = useControllable(
    themeProp,
    defaultTheme,
    onThemeChange
  );
  const [status, setStatus] = useControllable(
    statusProp,
    defaultStatus,
    onStatusChange
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("closed");
  phaseRef.current = phase;
  const openIntent = useRef<{
    focus: "first" | "last" | "menu";
    resume: boolean;
  }>({ focus: "menu", resume: false });
  const pageFocus = useRef<"first" | "switch" | null>(null);
  const closeSeq = useRef(0);
  const targetH = useRef(0);

  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const pageX = useMotionValue(0);
  const bodyOpacity = useMotionValue(1);
  const outerClip = useMotionTemplate`inset(0px 0px calc(100% - ${h}px) calc(100% - ${w}px) round ${RADIUS}px)`;
  const innerClip = useMotionTemplate`inset(1px 1px calc(100% - ${h}px + 1px) calc(100% - ${w}px + 1px) round ${RADIUS - 1}px)`;
  const pageTransform = useMotionTemplate`translate3d(${pageX}px, 0, 0)`;

  const account = accounts.find((entry) => entry.id === accountId) ??
    accounts[0] ?? { id: "operator", name: "Plant Operator", email: "" };
  const tone = Math.max(0, accounts.indexOf(account));
  const others = accounts.filter((entry) => entry.id !== account.id);
  const sharedTransition = instant ? INSTANT : SPRING;
  const sharedInPanel = phase === "open";
  const menuId = `${uid}-menu`;

  const pageEl = (target: Page) =>
    target === "main" ? mainRef.current : accountsRef.current;

  const openMenu = (via: Via, focus: "first" | "last" | "menu") => {
    if (phaseRef.current === "open") return;
    openIntent.current = { focus, resume: phaseRef.current === "closing" };
    closeSeq.current += 1;
    setInstant(via === "keyboard" || reduced);
    setPage("main");
    setPhase("open");
    setOpenSeq((seq) => seq + 1);
  };

  const closeMenu = (via: Via, returnFocus: boolean) => {
    if (phaseRef.current !== "open") return;
    const trigger = triggerRef.current;
    if (returnFocus) trigger?.focus({ preventScroll: true });
    if (via === "keyboard" || reduced || !trigger) {
      setInstant(true);
      setPhase("closed");
      return;
    }
    setInstant(false);
    setPhase("closing");
    const seq = ++closeSeq.current;
    animate(bodyOpacity, 0, { duration: 0.12, ease: EASE_OUT });
    animate(w, trigger.offsetWidth, SPRING);
    animate(h, trigger.offsetHeight, SPRING).then(() => {
      if (closeSeq.current === seq) {
        setPhase("closed");
      }
    });
  };

  const goTo = (target: Page) => {
    pageFocus.current = target === "accounts" ? "first" : "switch";
    setPage(target);
  };

  const select = (event: MouseEvent, run?: () => void) => {
    run?.();
    closeMenu(viaOf(event), true);
  };

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const main = mainRef.current;
    if (openSeq === 0 || phaseRef.current !== "open" || !trigger || !main) return;
    pageX.jump(0);
    targetH.current = main.offsetHeight;
    if (instant) {
      w.jump(PANEL_W);
      h.jump(targetH.current);
      bodyOpacity.jump(1);
    } else {
      if (!openIntent.current.resume) {
        w.jump(trigger.offsetWidth);
        h.jump(trigger.offsetHeight);
        bodyOpacity.jump(0);
      }
      animate(w, PANEL_W, SPRING);
      animate(h, targetH.current, SPRING);
      animate(bodyOpacity, 1, { duration: 0.2, delay: 0.05, ease: EASE_OUT });
    }
    const list = menuItems(main);
    const targets = {
      first: list[0],
      last: list.at(-1),
      menu: main.querySelector<HTMLElement>("[role=menu]"),
    };
    targets[openIntent.current.focus]?.focus({ preventScroll: true });
  }, [openSeq]);

  useEffect(() => {
    const el = pageEl(page);
    if (phaseRef.current !== "open" || !el) return;
    const x = page === "main" ? 0 : -PANEL_W;
    targetH.current = el.offsetHeight;
    if (reduced) {
      pageX.jump(x);
      h.jump(targetH.current);
    } else {
      animate(pageX, x, SPRING);
      animate(h, targetH.current, SPRING);
    }
    const intent = pageFocus.current;
    pageFocus.current = null;
    if (intent === "first") {
      const list = menuItems(el);
      const checked = list.find(
        (item) => item.getAttribute("aria-checked") === "true"
      );
      (checked ?? list[0])?.focus({ preventScroll: true });
    } else if (intent === "switch") {
      el.querySelector<HTMLElement>("[data-switch]")?.focus({
        preventScroll: true,
      });
    }
  }, [page]);

  useEffect(() => {
    if (phase !== "open") return;
    const observer = new ResizeObserver(() => {
      const el = pageEl(page);
      if (!el || phaseRef.current !== "open") return;
      const next = el.offsetHeight;
      if (Math.abs(next - targetH.current) < 0.5) return;
      targetH.current = next;
      animate(h, next, reduced ? INSTANT : SPRING);
    });
    for (const el of [mainRef.current, accountsRef.current]) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [phase, page]);

  useEffect(() => {
    if (phase !== "open") return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        closeMenu("pointer", false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [phase]);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu("keyboard", true);
      return;
    }
    if (page === "accounts" && event.key === "Backspace") {
      event.preventDefault();
      goTo("main");
      return;
    }
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    const active = document.activeElement;
    const target = nextTarget(menuItems(pageEl(page)), active, event.key);
    if (target) {
      target.focus({ preventScroll: true });
    } else if (page === "accounts" && event.key === "ArrowLeft") {
      goTo("main");
    } else if (
      event.key === "ArrowRight" &&
      active instanceof HTMLElement &&
      active.dataset.switch !== undefined
    ) {
      goTo("accounts");
    }
  };

  const onPanelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const item = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-menu-item]"
    );
    if (item && document.activeElement !== item) {
      item.focus({ preventScroll: true });
    }
  };

  return (
    <div
      className={cn(
        "relative isolate inline-block",
        phase !== "closed" && "z-50",
        className
      )}
      ref={wrapperRef}
      {...props}
    >
      <button
        aria-controls={sharedInPanel ? menuId : undefined}
        aria-expanded={sharedInPanel}
        aria-haspopup="menu"
        className="flex w-52 items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/95 p-1.5 pr-2.5 text-left outline-none transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/90 dark:focus-visible:ring-zinc-600 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80 shadow-sm"
        onClick={(event) => {
          const via = viaOf(event);
          openMenu(via, via === "keyboard" ? "first" : "menu");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu("keyboard", event.key === "ArrowDown" ? "first" : "last");
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <Identity
            account={account}
            shared={!sharedInPanel}
            stacked={false}
            status={status}
            tone={tone}
            transition={sharedTransition}
            uid={uid}
          />
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-zinc-400 transition-opacity duration-150 dark:text-zinc-500",
            phase !== "closed" && "opacity-0"
          )}
        />
      </button>

      {phase === "closed" ? null : (
        <div
          className="pointer-events-none absolute top-0 right-0 z-50"
          style={{ width: PANEL_W }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 [filter:drop-shadow(0_12px_24px_rgb(0_0_0/0.12))] dark:[filter:drop-shadow(0_12px_28px_rgb(0_0_0/0.6))]"
          >
            <motion.div
              className="absolute inset-0 bg-zinc-200 dark:bg-zinc-800"
              style={{ clipPath: outerClip }}
            />
            <motion.div
              className="absolute inset-0 bg-white/95 backdrop-blur-md dark:bg-zinc-950/95"
              style={{ clipPath: innerClip }}
            />
          </div>
          <motion.div
            className={cn("relative", sharedInPanel && "pointer-events-auto")}
            onKeyDown={onPanelKeyDown}
            onPointerMove={onPanelPointerMove}
            style={{ clipPath: innerClip }}
          >
            <motion.div
              className="flex w-max items-start"
              style={{ transform: pageTransform }}
            >
              <div
                className={cn(
                  "shrink-0 p-1.5 transition-opacity duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  page !== "main" && "opacity-0"
                )}
                inert={page !== "main"}
                ref={mainRef}
                style={{ width: PANEL_W }}
              >
                <div className="flex items-start justify-between px-2 pt-2 pb-2.5">
                  <Identity
                    account={account}
                    shared={sharedInPanel}
                    stacked
                    status={status}
                    tone={tone}
                    transition={sharedTransition}
                    uid={uid}
                  />
                  {account.plan ? (
                    <motion.span
                      className="shrink-0 pt-0.5 text-[11px] font-mono text-sky-600 dark:text-sky-400 font-semibold"
                      style={{ opacity: bodyOpacity }}
                    >
                      {account.plan}
                    </motion.span>
                  ) : null}
                </div>
                <motion.div
                  aria-label={account.name}
                  className="outline-none"
                  id={menuId}
                  role="menu"
                  style={{ opacity: bodyOpacity }}
                  tabIndex={-1}
                >
                  <StatusRow onChange={setStatus} status={status} />
                  <ThemeRow
                    onChange={setTheme}
                    reduced={reduced}
                    theme={theme}
                    uid={uid}
                  />
                  <Separator />
                  {items.map((item, index) => (
                    <LinkItem
                      index={index}
                      item={item}
                      key={item.label}
                      onSelect={select}
                    />
                  ))}
                  {accounts.length > 1 ? (
                    <button
                      aria-expanded={page === "accounts"}
                      aria-haspopup="menu"
                      className={ITEM_CLASS}
                      data-menu-item=""
                      data-row="switch"
                      data-switch=""
                      onClick={() => goTo("accounts")}
                      role="menuitem"
                      tabIndex={-1}
                      type="button"
                    >
                      <span className="flex -space-x-1.5">
                        {others.slice(0, 2).map((entry) => (
                          <Avatar
                            account={entry}
                            className="size-5 text-[7px] tracking-normal ring-2 ring-white dark:ring-zinc-900"
                            key={entry.id}
                            tone={accounts.indexOf(entry)}
                          />
                        ))}
                      </span>
                      <span className="flex-1">Switch operator</span>
                      <ChevronRight className="size-4 text-zinc-400 dark:text-zinc-500" />
                    </button>
                  ) : null}
                  <Separator />
                  <HoldSignOut
                    duration={holdDuration}
                    onComplete={(via) => {
                      onSignOut?.();
                      closeMenu(via, true);
                    }}
                  />
                </motion.div>
              </div>

              <div
                className={cn(
                  "shrink-0 p-1.5 transition-opacity duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  page !== "accounts" && "opacity-0"
                )}
                inert={page !== "accounts"}
                ref={accountsRef}
                style={{ width: PANEL_W }}
              >
                <motion.div
                  aria-label="Switch operator"
                  className="outline-none"
                  role="menu"
                  style={{ opacity: bodyOpacity }}
                  tabIndex={-1}
                >
                  <button
                    className={cn(ITEM_CLASS, "gap-1.5 pl-1.5 font-medium")}
                    data-menu-item=""
                    data-row="back"
                    onClick={() => goTo("main")}
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                  >
                    <ChevronLeft className="size-4 text-zinc-400 dark:text-zinc-500" />
                    <span className="sr-only">Back to </span>
                    Switch operator
                  </button>
                  <Separator />
                  {accounts.map((entry, index) => {
                    const checked = entry.id === account.id;
                    return (
                      <button
                        aria-checked={checked}
                        className={ITEM_CLASS}
                        data-menu-item=""
                        data-row={`account-${entry.id}`}
                        key={entry.id}
                        onClick={() => {
                          if (!checked) {
                            setAccountId(entry.id);
                            onAccountChange?.(entry);
                          }
                          goTo("main");
                        }}
                        role="menuitemradio"
                        tabIndex={-1}
                        type="button"
                      >
                        <Avatar
                          account={entry}
                          className="size-6"
                          status={checked ? status : undefined}
                          tone={index}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {entry.name}
                          </span>
                          <span className="truncate text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                            {entry.email}
                          </span>
                        </span>
                        {checked ? (
                          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : null}
                      </button>
                    );
                  })}
                  <Separator />
                  <button
                    className={ITEM_CLASS}
                    data-menu-item=""
                    data-row="add"
                    onClick={(event) => select(event, onAddAccount)}
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="grid size-6 place-items-center rounded-full border border-zinc-300 border-dashed text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                      <Plus className="size-3" />
                    </span>
                    Add Operator
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
