// Touchline agent runtime reducer.
//
// `evaluateMarket` is stateless; a live agent is not. Between ticks it must
// remember: the previous probability (for shock detection), the probability
// just before the last event (for divergence), and — once frozen — the level
// it froze at (for reopen). `stepAgent` folds one incoming tick into that
// state and returns the decision + the auditable Signal. It is pure (no I/O),
// so the whole FREEZE → REOPEN → HEDGE sequence is deterministically testable
// and Convex's agentTick stays a thin persistence wrapper around it.

import {
  DEFAULT_THRESHOLDS,
  type AgentAction,
  type AgentThresholds,
  type MarketState,
  type MarketStatus,
  type ScoreEvent,
  type Signal,
  type Tick,
} from "./types";
import { evaluateMarket, detectEventDivergence, detectPriceShock } from "./strategy";
import { riskScore } from "./risk-score";
import { explainDecision } from "./explain";

export interface AgentRuntime {
  status: MarketStatus; // ACTIVE | FROZEN
  prevProb: number | null; // last tick's home win probability
  frozenAtProb: number | null; // home prob captured when the market froze
  lastEventProb: number | null; // home prob just before the last match event
  lastEventTs: number | null; // ms timestamp of the last match event
  lastEventSeq: number | null; // TxLINE sequence of the last match event
}

export function initialRuntime(): AgentRuntime {
  return {
    status: "ACTIVE",
    prevProb: null,
    frozenAtProb: null,
    lastEventProb: null,
    lastEventTs: null,
    lastEventSeq: null,
  };
}

export interface StepResult {
  action: AgentAction;
  signal: Signal | null;
  runtime: AgentRuntime;
  marketStatus: MarketStatus;
  reason: string;
  /** True when this step changed the market status (freeze/reopen). */
  statusChanged: boolean;
  /** True when a NEW action row should be persisted (suppresses the
   *  re-freeze-while-frozen churn so the audit trail stays clean). */
  emitAction: boolean;
}

/**
 * Fold one incoming odds tick (with an optional coincident score event) into
 * the agent's runtime state and produce the autonomous decision.
 */
export function stepAgent(
  rt: AgentRuntime,
  tick: Tick,
  event: ScoreEvent | null,
  thresholds: AgentThresholds = DEFAULT_THRESHOLDS,
): StepResult {
  const { prevProb } = rt;
  let { status, frozenAtProb, lastEventProb, lastEventTs, lastEventSeq } = rt;
  const home = tick.probs.home;

  // A new verifiable event resets the divergence reference to the pre-event
  // probability (the last tick we saw before the event landed).
  if (event) {
    lastEventProb = prevProb ?? home;
    lastEventTs = event.timestamp;
    lastEventSeq = event.sequence;
  }

  const secondsSinceEvent =
    lastEventTs != null ? (tick.timestamp - lastEventTs) / 1000 : Number.POSITIVE_INFINITY;
  const eventActive = lastEventTs != null && secondsSinceEvent <= thresholds.eventWindowSec;

  // Which reference the "move" is measured against depends on the mode:
  //   frozen        -> distance from the freeze level (drives REOPEN)
  //   recent event  -> distance from the pre-event level (drives FREEZE)
  //   otherwise     -> distance from the previous tick
  const probabilityMove =
    status === "FROZEN" && frozenAtProb != null
      ? home - frozenAtProb
      : eventActive && lastEventProb != null
        ? home - lastEventProb
        : prevProb != null
          ? home - prevProb
          : 0;

  const unexplainedVolatility = prevProb != null ? home - prevProb : 0;

  const marketState: MarketState = {
    verifiedEventOccurred: eventActive,
    secondsSinceEvent: Number.isFinite(secondsSinceEvent) ? secondsSinceEvent : 1e9,
    probabilityMove,
    marketFrozen: status === "FROZEN",
    unexplainedVolatility,
  };

  const wasFrozen = status === "FROZEN";
  const action = evaluateMarket(marketState, thresholds);

  let signal: Signal | null = null;
  let statusChanged = false;
  let emitAction = false;

  if (action === "FREEZE_MARKET") {
    if (wasFrozen) {
      // Already frozen — the rule keeps returning FREEZE while the stale event
      // is still inside the window. Maintain the freeze without re-signalling.
      emitAction = false;
    } else {
      const before = lastEventProb ?? prevProb ?? home;
      signal =
        detectEventDivergence(
          makeRefTick(tick, before),
          tick,
          { secondsSinceEvent: marketState.secondsSinceEvent, sequence: lastEventSeq ?? undefined },
          thresholds,
        ) ?? divergenceFallback(tick, before, home, lastEventSeq, thresholds);
      status = "FROZEN";
      frozenAtProb = home;
      statusChanged = true;
      emitAction = true;
    }
  } else if (action === "PAPER_HEDGE") {
    const before = prevProb ?? home;
    signal =
      detectPriceShock(makeRefTick(tick, before), tick, thresholds) ??
      shockFallback(tick, before, home, thresholds);
    emitAction = true;
  } else if (action === "REOPEN_MARKET") {
    status = "ACTIVE";
    frozenAtProb = null;
    // Clear the spent event so the reopened market can't immediately re-freeze.
    lastEventTs = null;
    lastEventProb = null;
    lastEventSeq = null;
    statusChanged = true;
    emitAction = true;
  }

  const reason = explainDecision(action, signal, {
    secondsSinceEvent: eventActive ? Math.round(marketState.secondsSinceEvent) : undefined,
  });

  const runtime: AgentRuntime = {
    status,
    prevProb: home,
    frozenAtProb,
    lastEventProb,
    lastEventTs,
    lastEventSeq,
  };

  return { action, signal, runtime, marketStatus: status, reason, statusChanged, emitAction };
}

function makeRefTick(tick: Tick, homeProb: number): Tick {
  return { ...tick, probs: { ...tick.probs, home: homeProb } };
}

// If evaluateMarket fired an action but the detector returned null (edge of the
// window), still emit a well-formed signal so the audit trail is never blank.
function divergenceFallback(
  tick: Tick,
  before: number,
  after: number,
  seq: number | null,
  thresholds: AgentThresholds,
): Signal {
  const move = after - before;
  return {
    type: "EVENT_MARKET_DIVERGENCE",
    fixtureId: tick.fixtureId,
    severity: riskScore("EVENT_MARKET_DIVERGENCE", move, thresholds.minReprice),
    probabilityBefore: before,
    probabilityAfter: after,
    triggerValue: move,
    threshold: thresholds.minReprice,
    sequence: seq ?? tick.sequence,
    reason: "Verified event with sub-threshold repricing.",
  };
}

function shockFallback(
  tick: Tick,
  before: number,
  after: number,
  thresholds: AgentThresholds,
): Signal {
  const move = after - before;
  return {
    type: "UNEXPLAINED_PRICE_SHOCK",
    fixtureId: tick.fixtureId,
    severity: riskScore("UNEXPLAINED_PRICE_SHOCK", move, thresholds.volatilityThreshold),
    probabilityBefore: before,
    probabilityAfter: after,
    triggerValue: move,
    threshold: thresholds.volatilityThreshold,
    sequence: tick.sequence,
    reason: "Unexplained price move exceeding the volatility threshold.",
  };
}
