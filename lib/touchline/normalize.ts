// Probability normalization (TOUCHLINE_PRD §8).
//
// Raw decimal odds carry the bookmaker's margin (the "overround"), so the
// implied probabilities 1/odds sum to > 1. We strip the margin by normalizing
// across the three outcomes, giving a clean distribution the strategy engine
// can compare tick-to-tick.

import type { OddsQuote, ProbDist } from "./types";

/**
 * Convert decimal 1X2 odds into a normalized implied-probability distribution.
 *
 *   rawProbability = 1 / decimalOdds
 *   normalizedProbabilityA = rawA / (rawHome + rawDraw + rawAway)
 *
 * Returns an even split if any odd is non-finite/≤1 (defensive — never throws).
 */
export function normalizeOdds(odds: OddsQuote): ProbDist {
  const raw = {
    home: safeInverse(odds.home),
    draw: safeInverse(odds.draw),
    away: safeInverse(odds.away),
  };
  const total = raw.home + raw.draw + raw.away;
  if (!(total > 0)) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return {
    home: raw.home / total,
    draw: raw.draw / total,
    away: raw.away / total,
  };
}

/** Normalize an already-probability-shaped triple (e.g. TxLINE `Pct`) to sum 1. */
export function normalizeProbs(p: ProbDist): ProbDist {
  const total = p.home + p.draw + p.away;
  if (!(total > 0)) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: p.home / total, draw: p.draw / total, away: p.away / total };
}

/** Fair decimal odds implied by a probability (inverse of normalizeOdds). */
export function fairOdds(probability: number): number {
  if (!(probability > 0)) return 1.01;
  return Math.max(1.01, Math.round((1 / probability) * 100) / 100);
}

function safeInverse(odd: number): number {
  return Number.isFinite(odd) && odd > 1 ? 1 / odd : 0;
}
