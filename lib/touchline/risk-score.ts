// Deterministic 0–100 risk score (drives the agent decision card).
//
// Pure function of the observed trigger vs the configured threshold — no
// randomness, so the same inputs always yield the same score (auditable).

import type { SignalType } from "./types";

/**
 * Risk score for a detected signal.
 *
 * - EVENT_MARKET_DIVERGENCE: risk rises as the observed post-event move falls
 *   further BELOW the expected repricing threshold (a fully stale market —
 *   zero move — is maximally risky).
 * - UNEXPLAINED_PRICE_SHOCK: risk rises as the unexplained volatility exceeds
 *   the threshold.
 *
 * @param triggerValue observed move (divergence) or volatility (shock), prob units
 * @param threshold    the configured threshold breached, prob units
 */
export function riskScore(
  type: SignalType,
  triggerValue: number,
  threshold: number,
): number {
  if (!(threshold > 0)) return 0;
  const mag = Math.abs(triggerValue);

  if (type === "EVENT_MARKET_DIVERGENCE") {
    // Staleness ratio in [0,1]: 1 when the market didn't move at all.
    const shortfall = Math.max(0, threshold - Math.min(mag, threshold));
    const ratio = shortfall / threshold;
    return clamp(Math.round(45 + 55 * ratio));
  }

  // Price shock: how far past the threshold, capped at ~2x over.
  const excess = Math.max(0, mag - threshold) / threshold;
  return clamp(Math.round(50 + 50 * Math.min(1, excess)));
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
