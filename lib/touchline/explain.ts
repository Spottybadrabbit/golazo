// Explanation layer (TOUCHLINE_PRD §10).
//
// The engine DECIDES; this only EXPLAINS. Deterministic templated prose so the
// MVP needs no live LLM on the critical path — a real LLM can be swapped in
// later behind the same signature without touching the decision logic.

import type { AgentAction, Signal } from "./types";

const ACTION_VERB: Record<AgentAction, string> = {
  FREEZE_MARKET: "froze this market",
  PAPER_HEDGE: "opened a simulated hedge",
  REOPEN_MARKET: "reopened this market",
  HOLD: "took no action",
};

/**
 * A one-sentence, human-readable rationale for an autonomous decision.
 * Example: "Touchline froze this market because a verified match event
 * occurred while the win probability moved only +1.2% over the following 8s,
 * below the configured +5.0% repricing threshold."
 */
export function explainDecision(
  action: AgentAction,
  signal: Signal | null,
  ctx?: { minute?: number; secondsSinceEvent?: number },
): string {
  const verb = ACTION_VERB[action];
  if (!signal) {
    return `Touchline ${verb}: market behaviour is within configured thresholds.`;
  }

  const move = fmt(signal.triggerValue);
  const threshold = fmt(signal.threshold);
  const at = ctx?.minute != null ? ` at ${formatMinute(ctx.minute)}` : "";

  if (signal.type === "EVENT_MARKET_DIVERGENCE") {
    const window =
      ctx?.secondsSinceEvent != null
        ? ` over the following ${ctx.secondsSinceEvent}s`
        : "";
    return (
      `Touchline ${verb} because a verified match event occurred${at}, ` +
      `while the normalized win probability moved only ${move}${window} — ` +
      `below the configured ${threshold} repricing threshold.`
    );
  }

  return (
    `Touchline ${verb} because the market probability moved ${move} with no ` +
    `corresponding match event, exceeding the ${threshold} volatility threshold.`
  );
}

function fmt(x: number): string {
  const v = x * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function formatMinute(minute: number): string {
  return `${minute}'`;
}
