// Market data sources (TOUCHLINE_PRD §20).
//
// The agent must run identically off LIVE TxLINE and off a deterministic
// REPLAY. In a serverless (Convex-scheduled) world a long-running `start()`
// loop doesn't fit, so we model both sources as *pure readers*: given "now",
// return the events that should have been emitted by then. The agentTick loop
// (convex/touchline.ts) drives the clock. The `MarketDataSource` interface is
// kept for parity with the PRD and future SSE-worker upgrade.

import { normalizeOdds } from "./normalize";
import type { OddsQuote, ScoreEvent, Tick } from "./types";

/** PRD §20 interface — a start/stop stream. Implemented conceptually here;
 *  the Convex tick loop is the concrete driver for the MVP. */
export interface MarketDataSource {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type ReplayEvent =
  | { t: number; type: "ODDS"; minute: number; odds: OddsQuote }
  | {
      t: number;
      type: "SCORE_EVENT";
      minute: number;
      action: string;
      side: "home" | "away";
      sequence: number;
      homeScore: number;
      awayScore: number;
    };

export interface ReplayTimeline {
  fixtureId: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  competition: string;
  startScore: [number, number];
  startMinute: number;
  events: ReplayEvent[];
}

/** Total wall-clock duration of a replay timeline (ms). */
export function replayDuration(timeline: ReplayTimeline): number {
  return timeline.events.reduce((max, e) => Math.max(max, e.t), 0);
}

/**
 * The replay events whose timeline position falls in the half-open window
 * (fromMs, toMs]. `fromMs` is the cursor already processed; `toMs` is the
 * scaled position now. This is what the agentTick loop consumes each tick, so
 * replays advance smoothly regardless of how often the tick fires.
 */
export function replayEventsBetween(
  timeline: ReplayTimeline,
  fromMs: number,
  toMs: number,
): ReplayEvent[] {
  return timeline.events.filter((e) => e.t > fromMs && e.t <= toMs);
}

/** Scaled timeline position: how far into the replay we are, given real
 *  elapsed wall-clock and a speed multiplier (1× / 5× / 20×). */
export function replayPosition(elapsedMs: number, speed: number): number {
  return elapsedMs * (speed > 0 ? speed : 1);
}

/** Convert a replay ODDS event into an engine Tick (odds → normalized probs). */
export function tickFromOdds(
  fixtureId: number,
  odds: OddsQuote,
  timestamp: number,
  sequence?: number,
): Tick {
  return { fixtureId, odds, probs: normalizeOdds(odds), timestamp, sequence };
}

/** Convert a replay SCORE_EVENT into an engine ScoreEvent. */
export function scoreEventFrom(fixtureId: number, e: ReplayEvent & { type: "SCORE_EVENT" }, timestamp: number): ScoreEvent {
  return {
    fixtureId,
    sequence: e.sequence,
    action: e.action,
    homeScore: e.homeScore,
    awayScore: e.awayScore,
    timestamp,
  };
}
