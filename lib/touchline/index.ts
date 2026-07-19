// Touchline pure engine — barrel export.
//
// Deterministic, dependency-free decision core (TOUCHLINE_PRD §8–§10).
// Imported by the Convex agentTick loop (convex/touchline.ts) and the UI.
// Type and value re-exports are kept explicit so isolatedModules bundlers
// (esbuild/tsx/Next) resolve every symbol unambiguously.

export type {
  OddsQuote,
  ProbDist,
  SignalType,
  AgentAction,
  MarketStatus,
  MarketState,
  AgentThresholds,
  Signal,
  Tick,
  ScoreEvent,
} from "./types";
export { DEFAULT_THRESHOLDS } from "./types";

export { normalizeOdds, normalizeProbs, fairOdds } from "./normalize";
export { riskScore } from "./risk-score";
export {
  evaluateMarket,
  detectEventDivergence,
  detectPriceShock,
} from "./strategy";
export { explainDecision } from "./explain";
export type { AgentRuntime, StepResult } from "./runtime";
export { stepAgent, initialRuntime } from "./runtime";
export type { MarketDataSource, ReplayEvent, ReplayTimeline } from "./source";
export {
  replayDuration,
  replayEventsBetween,
  replayPosition,
  tickFromOdds,
  scoreEventFrom,
} from "./source";
