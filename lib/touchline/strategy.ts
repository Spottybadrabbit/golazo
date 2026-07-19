// Touchline decision engine (TOUCHLINE_PRD §9).
//
// `evaluateMarket` is the deterministic rule at the centre of the product:
//
//   INPUT (MarketState) -> RULE -> DECISION (AgentAction)
//
// It is pure and inspectable — no LLM, no randomness, no I/O. The detection
// helpers below turn a pair of ticks (+ optional score event) into the
// MarketState the rule reasons over, and into the auditable Signal record.

import {
  DEFAULT_THRESHOLDS,
  type AgentAction,
  type AgentThresholds,
  type MarketState,
  type Signal,
  type Tick,
} from "./types";
import { riskScore } from "./risk-score";

/**
 * The core decision. Mirrors TOUCHLINE_PRD §9 exactly, with the hard-coded
 * constants lifted into `thresholds` so the Agent Control page can tune them.
 *
 *   FREEZE  — a verified event just happened but the market barely moved.
 *   HEDGE   — the market moved sharply with no event to explain it.
 *   REOPEN  — a frozen market has now repriced past the threshold.
 *   HOLD    — nothing actionable.
 */
export function evaluateMarket(
  state: MarketState,
  thresholds: AgentThresholds = DEFAULT_THRESHOLDS,
): AgentAction {
  if (
    state.verifiedEventOccurred &&
    state.secondsSinceEvent <= thresholds.eventWindowSec &&
    Math.abs(state.probabilityMove) < thresholds.minReprice
  ) {
    return "FREEZE_MARKET";
  }

  if (
    !state.verifiedEventOccurred &&
    Math.abs(state.unexplainedVolatility) > thresholds.volatilityThreshold
  ) {
    return "PAPER_HEDGE";
  }

  if (
    state.marketFrozen &&
    Math.abs(state.probabilityMove) >= thresholds.minReprice
  ) {
    return "REOPEN_MARKET";
  }

  return "HOLD";
}

/**
 * Strategy A — Event / Market Divergence. A verified match event occurred but
 * the reference (home) win probability failed to move by the expected amount
 * within the response window → the market may be stale.
 */
export function detectEventDivergence(
  prev: Tick,
  curr: Tick,
  event: { secondsSinceEvent: number; sequence?: number },
  thresholds: AgentThresholds = DEFAULT_THRESHOLDS,
): Signal | null {
  const before = prev.probs.home;
  const after = curr.probs.home;
  const move = after - before;

  if (
    event.secondsSinceEvent <= thresholds.eventWindowSec &&
    Math.abs(move) < thresholds.minReprice
  ) {
    return {
      type: "EVENT_MARKET_DIVERGENCE",
      fixtureId: curr.fixtureId,
      severity: riskScore("EVENT_MARKET_DIVERGENCE", move, thresholds.minReprice),
      probabilityBefore: before,
      probabilityAfter: after,
      triggerValue: move,
      threshold: thresholds.minReprice,
      sequence: event.sequence ?? curr.sequence,
      reason:
        `Verified match event, but the market moved ${pct(move)} in ` +
        `${event.secondsSinceEvent}s — below the ${pct(thresholds.minReprice)} ` +
        `repricing threshold.`,
    };
  }
  return null;
}

/**
 * Strategy B — Unexplained Price Shock. The reference probability moved sharply
 * with no corresponding match event within the window.
 */
export function detectPriceShock(
  prev: Tick,
  curr: Tick,
  thresholds: AgentThresholds = DEFAULT_THRESHOLDS,
): Signal | null {
  const before = prev.probs.home;
  const after = curr.probs.home;
  const move = after - before;

  if (Math.abs(move) > thresholds.volatilityThreshold) {
    return {
      type: "UNEXPLAINED_PRICE_SHOCK",
      fixtureId: curr.fixtureId,
      severity: riskScore(
        "UNEXPLAINED_PRICE_SHOCK",
        move,
        thresholds.volatilityThreshold,
      ),
      probabilityBefore: before,
      probabilityAfter: after,
      triggerValue: move,
      threshold: thresholds.volatilityThreshold,
      sequence: curr.sequence,
      reason:
        `Probability moved ${pct(move)} in the window with no match event ` +
        `to explain it (threshold ${pct(thresholds.volatilityThreshold)}).`,
    };
  }
  return null;
}

/** Format a probability-unit delta as a signed percentage string. */
function pct(x: number): string {
  const v = x * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
