// Touchline design tokens (TOUCHLINE_PRD §21).
//
// "Bloomberg Terminal × F1 Pit Wall × Modern Football Broadcast" — dark
// charcoal, large numeric type, small monospace labels. Green = verification /
// success, amber = monitoring / warning, red = intervention / freeze.
//
// Exposed both as JS constants (charts, inline styles) and as CSS variables set
// on the layout root (.tl-root), so components can use `var(--tl-green)` too.

export const TL = {
  bg: "#0a0c10",
  panel: "#11151b",
  raised: "#161b23",
  line: "rgba(255,255,255,0.09)",
  text: "#e9eef5",
  muted: "#8994a4",
  faint: "#5b6472",
  green: "#25e29a", // verified / active / up
  amber: "#ffb020", // monitoring / warning
  red: "#ff4d5e", // intervention / freeze / down
  cyan: "#39b6f0", // data / streaming
  violet: "#8b7cff", // hedge / accent
} as const;

export const TL_CSS_VARS: React.CSSProperties = {
  ["--tl-bg" as string]: TL.bg,
  ["--tl-panel" as string]: TL.panel,
  ["--tl-raised" as string]: TL.raised,
  ["--tl-line" as string]: TL.line,
  ["--tl-text" as string]: TL.text,
  ["--tl-muted" as string]: TL.muted,
  ["--tl-green" as string]: TL.green,
  ["--tl-amber" as string]: TL.amber,
  ["--tl-red" as string]: TL.red,
  ["--tl-cyan" as string]: TL.cyan,
  ["--tl-violet" as string]: TL.violet,
};

/** Colour for an agent action / market status. */
export function actionColor(action: string): string {
  switch (action) {
    case "FREEZE_MARKET":
      return TL.red;
    case "REOPEN_MARKET":
      return TL.green;
    case "PAPER_HEDGE":
      return TL.violet;
    default:
      return TL.muted;
  }
}

export function statusColor(status: string): string {
  return status === "FROZEN" ? TL.red : TL.green;
}

/** Format a 0-1 probability as a percentage string. */
export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** Format a signed 0-1 delta as a percentage string. */
export function signedPct(x: number, digits = 1): string {
  const v = x * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** Compact wall-clock time (HH:MM:SS) for the audit log. */
export function clock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtMinute(minute: number | null | undefined): string {
  if (minute == null) return "--'";
  return `${minute}'`;
}
