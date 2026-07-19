// Touchline shared UI primitives — the terminal chrome the panels are built
// from (TOUCHLINE_PRD §21). Server-safe (no hooks); usable from any page.

import type { CSSProperties, ReactNode } from "react";
import { TL } from "./theme";

export function Panel({
  children,
  title,
  right,
  className = "",
  style,
}: {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`rounded-lg border ${className}`}
      style={{ background: "var(--tl-panel)", borderColor: "var(--tl-line)", ...style }}
    >
      {(title || right) && (
        <header
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: "var(--tl-line)" }}
        >
          {title && <Label>{title}</Label>}
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Small uppercase monospace system label. */
export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.16em]"
      style={{ fontSize: 10.5, color: "var(--tl-muted)", ...style }}
    >
      {children}
    </span>
  );
}

/** A pulsing status dot + label (AGENT ● LIVE). */
export function StatusDot({
  label,
  state,
  color,
}: {
  label: string;
  state?: string;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex" style={{ width: 8, height: 8 }}>
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 tl-ping"
          style={{ background: color }}
        />
        <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: color }} />
      </span>
      <Label>
        {label}
        {state ? <span style={{ color, marginLeft: 6 }}>{state}</span> : null}
      </Label>
    </span>
  );
}

/** A big-number metric tile (MATCHES / SIGNALS / ACTIONS / PROOFS). */
export function MetricTile({
  label,
  value,
  sub,
  accent = TL.text,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ background: "var(--tl-raised)", borderColor: "var(--tl-line)" }}
    >
      <Label>{label}</Label>
      <div className="mt-1 font-mono tabular-nums leading-none" style={{ fontSize: 30, color: accent }}>
        {value}
      </div>
      {sub ? <div className="mt-1 font-mono" style={{ fontSize: 11, color: "var(--tl-muted)" }}>{sub}</div> : null}
    </div>
  );
}

/** A coloured pill/badge. */
export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 font-mono uppercase tracking-wider"
      style={{ fontSize: 10, color, background: `${color}1f`, border: `1px solid ${color}55` }}
    >
      {children}
    </span>
  );
}

export function KeyVal({ k, v, color }: { k: string; v: ReactNode; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <Label>{k}</Label>
      <span className="font-mono tabular-nums" style={{ fontSize: 13, color: color ?? "var(--tl-text)" }}>
        {v}
      </span>
    </div>
  );
}
