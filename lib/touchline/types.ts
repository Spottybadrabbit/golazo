// Touchline engine — shared types.
//
// The engine is a pure, deterministic, dependency-free core (no React, no
// Convex, no network) so it is trivially testable and auditable. Everything
// here is plain data. See TOUCHLINE_PRD §9/§10: the deterministic engine
// DECIDES; an LLM (explain.ts) only ever EXPLAINS.

/** Decimal (European) odds for the three 1X2 outcomes. */
export interface OddsQuote {
  home: number;
  draw: number;
  away: number;
}

/** A normalized probability distribution over the three outcomes (sums to 1). */
export interface ProbDist {
  home: number;
  draw: number;
  away: number;
}

export type SignalType = "EVENT_MARKET_DIVERGENCE" | "UNEXPLAINED_PRICE_SHOCK";

export type AgentAction =
  | "HOLD"
  | "FREEZE_MARKET"
  | "REOPEN_MARKET"
  | "PAPER_HEDGE";

/** Touchline's own simulated market status for a fixture. */
export type MarketStatus = "ACTIVE" | "FROZEN";

/**
 * The distilled state the decision engine reasons over for one fixture, at one
 * moment. Probabilities are in [0,1]; moves are signed deltas in probability
 * units (0.012 === a 1.2 percentage-point move).
 */
export interface MarketState {
  /** A match event (goal/card) was observed and is verifiable via TxLINE. */
  verifiedEventOccurred: boolean;
  /** Seconds elapsed since that event (used with the response window). */
  secondsSinceEvent: number;
  /** Signed change in the reference (home) win probability since the event. */
  probabilityMove: number;
  /** Whether Touchline has already frozen this simulated market. */
  marketFrozen: boolean;
  /** Absolute probability move NOT explained by any match event. */
  unexplainedVolatility: number;
}

/** Deterministic thresholds — defaults match TOUCHLINE_PRD §9; the Agent
 *  Control page can override them at runtime. */
export interface AgentThresholds {
  /** Response window after an event within which a freeze can trigger (s). */
  eventWindowSec: number;
  /** Minimum repricing expected after an event (prob units, e.g. 0.05). */
  minReprice: number;
  /** Volatility above which an unexplained move is a price shock (prob units). */
  volatilityThreshold: number;
  /** When false, the agent never emits FREEZE_MARKET (auto-freeze disabled).
   *  Undefined is treated as enabled for backwards compatibility. */
  autoFreeze?: boolean;
  /** When false, the agent never emits PAPER_HEDGE (auto-hedge disabled).
   *  Undefined is treated as enabled for backwards compatibility. */
  autoHedge?: boolean;
}

export const DEFAULT_THRESHOLDS: AgentThresholds = {
  eventWindowSec: 10,
  minReprice: 0.05,
  volatilityThreshold: 0.08,
  autoFreeze: true,
  autoHedge: true,
};

/** A detected market signal — the auditable "why" behind an action. */
export interface Signal {
  type: SignalType;
  fixtureId: number;
  /** 0–100 risk score (risk-score.ts). */
  severity: number;
  probabilityBefore: number;
  probabilityAfter: number;
  /** Observed move (divergence) or volatility (shock), in prob units. */
  triggerValue: number;
  /** The configured threshold the trigger breached. */
  threshold: number;
  /** TxLINE sequence of the event that triggered this signal, if any. */
  sequence?: number;
  reason: string;
}

/** One point in a probability/odds tick, used for detection + charts. */
export interface Tick {
  fixtureId: number;
  odds: OddsQuote;
  probs: ProbDist;
  timestamp: number;
  /** TxLINE sequence if this tick coincides with a scored event. */
  sequence?: number;
}

/** A discrete match event (goal, card) with its TxLINE sequence. */
export interface ScoreEvent {
  fixtureId: number;
  sequence: number;
  action: string; // GOAL | YELLOW | RED | KICKOFF | HT | FT ...
  homeScore: number;
  awayScore: number;
  timestamp: number;
}
