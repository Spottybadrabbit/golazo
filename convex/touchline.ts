// Touchline autonomous runtime + read API (TOUCHLINE_PRD §18/§19).
//
// The whole product loop lives here, on top of the pure engine in
// lib/touchline/*: ingest a tick -> normalise -> stepAgent (detect + decide)
// -> persist signal/action -> request Solana verification -> UI reads it back
// reactively. `agentTick` self-reschedules (like convex/poller.ts) so no human
// button drives the core loop; `startReplay` seeds the deterministic demo.
//
// This is a V8 (non-"use node") module: queries/mutations use ctx.db, the
// action uses fetch (live) or the bundled timeline (replay). The heavier
// Solana verification runs in the separate "use node" convex/touchlineVerify.ts.

import { query, mutation, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

import { DEFAULT_THRESHOLDS } from "../lib/touchline/types";
import { stepAgent, initialRuntime, type AgentRuntime } from "../lib/touchline/runtime";
import { tickFromOdds, replayEventsBetween, replayDuration } from "../lib/touchline/source";
import { DEMO_TIMELINE } from "../lib/touchline/demo-timeline";
import { fetchFixtures, fetchOdds, fetchScore, isInPlay } from "./txline";

const AGENT_KEY = "agent";
const REPLAY_TICK_MS = 1000;
const LIVE_TICK_MS = 3000;

// ── agent singleton ────────────────────────────────────────────────────

function agentDefaults(now: number) {
  return {
    key: AGENT_KEY,
    status: "STOPPED" as const,
    mode: "replay" as const,
    replaySpeed: 5,
    eventWindowSec: DEFAULT_THRESHOLDS.eventWindowSec,
    minReprice: DEFAULT_THRESHOLDS.minReprice,
    volatilityThreshold: DEFAULT_THRESHOLDS.volatilityThreshold,
    autoFreeze: true,
    autoHedge: true,
    solanaVerification: true,
    marketStatus: "ACTIVE",
    updatedAt: now,
  };
}

async function loadAgent(ctx: any) {
  return await ctx.db.query("touchlineAgent").withIndex("by_key", (q: any) => q.eq("key", AGENT_KEY)).unique();
}

function runtimeFromAgent(a: any): AgentRuntime {
  if (!a) return initialRuntime();
  return {
    status: a.marketStatus === "FROZEN" ? "FROZEN" : "ACTIVE",
    prevProb: a.prevProb ?? null,
    frozenAtProb: a.frozenAtProb ?? null,
    lastEventProb: a.lastEventProb ?? null,
    lastEventTs: a.lastEventTs ?? null,
    lastEventSeq: a.lastEventSeq ?? null,
  };
}

export const ensureAgent = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await loadAgent(ctx);
    if (existing) return existing._id;
    return await ctx.db.insert("touchlineAgent", agentDefaults(Date.now()));
  },
});

// Internal snapshot of the agent used by agentTick (actions can't touch db).
export const state = internalQuery({
  args: {},
  handler: async (ctx) => {
    const a = await loadAgent(ctx);
    if (!a) return null;
    return {
      status: a.status,
      mode: a.mode,
      replaySpeed: a.replaySpeed ?? 5,
      replayStartedAt: a.replayStartedAt ?? null,
      replayCursor: a.replayCursor ?? 0,
      featuredFixtureId: a.featuredFixtureId ?? null,
      eventWindowSec: a.eventWindowSec,
      minReprice: a.minReprice,
      volatilityThreshold: a.volatilityThreshold,
      autoFreeze: a.autoFreeze,
      autoHedge: a.autoHedge,
      solanaVerification: a.solanaVerification,
      runtime: runtimeFromAgent(a),
    };
  },
});

// ── commit one tick's outcome atomically ───────────────────────────────

const runtimeValidator = v.object({
  prevProb: v.union(v.number(), v.null()),
  frozenAtProb: v.union(v.number(), v.null()),
  lastEventProb: v.union(v.number(), v.null()),
  lastEventTs: v.union(v.number(), v.null()),
  lastEventSeq: v.union(v.number(), v.null()),
});

export const commitStep = internalMutation({
  args: {
    fixtureId: v.number(),
    timestamp: v.number(),
    minute: v.number(),
    homeTeam: v.string(),
    awayTeam: v.string(),
    competition: v.string(),
    odds: v.object({ home: v.number(), draw: v.number(), away: v.number() }),
    probs: v.object({ home: v.number(), draw: v.number(), away: v.number() }),
    homeScore: v.number(),
    awayScore: v.number(),
    marketStatus: v.string(),
    scoreEvent: v.optional(
      v.object({
        sequence: v.number(),
        action: v.string(),
        homeScore: v.number(),
        awayScore: v.number(),
      }),
    ),
    emit: v.optional(
      v.object({
        actionType: v.string(),
        reason: v.string(),
        notional: v.optional(v.number()),
        executionPrice: v.optional(v.number()),
        signal: v.optional(
          v.object({
            type: v.union(
              v.literal("EVENT_MARKET_DIVERGENCE"),
              v.literal("UNEXPLAINED_PRICE_SHOCK"),
            ),
            severity: v.number(),
            probabilityBefore: v.number(),
            probabilityAfter: v.number(),
            triggerValue: v.number(),
            threshold: v.number(),
            sequence: v.optional(v.number()),
            reason: v.string(),
          }),
        ),
      }),
    ),
    runtime: runtimeValidator,
    replayCursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Persist wall-clock times so the audit trail + activity feed sort
    // consistently. (The engine's own relative timing — args.timestamp /
    // secondsSinceEvent — is separate and already folded into `runtime`.)
    const now = Date.now();

    // 1. Raw odds tick (always).
    await ctx.db.insert("touchlineOddsTicks", {
      fixtureId: args.fixtureId,
      homeOdds: args.odds.home,
      drawOdds: args.odds.draw,
      awayOdds: args.odds.away,
      homeProbability: args.probs.home,
      drawProbability: args.probs.draw,
      awayProbability: args.probs.away,
      timestamp: now,
    });

    // 2. Score event (when one landed this tick).
    if (args.scoreEvent) {
      await ctx.db.insert("touchlineScoreEvents", {
        fixtureId: args.fixtureId,
        sequence: args.scoreEvent.sequence,
        action: args.scoreEvent.action,
        homeScore: args.scoreEvent.homeScore,
        awayScore: args.scoreEvent.awayScore,
        timestamp: now,
      });
    }

    // 3. Upsert the match's latest state.
    const existingMatch = await ctx.db
      .query("touchlineMatches")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .unique();
    const matchDoc = {
      fixtureId: args.fixtureId,
      homeTeam: args.homeTeam,
      awayTeam: args.awayTeam,
      homeScore: args.homeScore,
      awayScore: args.awayScore,
      status: args.marketStatus,
      minute: args.minute,
      phase: "LIVE",
      competition: args.competition,
      updatedAt: now,
    };
    if (existingMatch) await ctx.db.patch(existingMatch._id, matchDoc);
    else await ctx.db.insert("touchlineMatches", matchDoc);

    // 4. Signal + action + proof-request (when a decision was emitted).
    let signalId: any = undefined;
    let verifiable = false;
    if (args.emit) {
      if (args.emit.signal) {
        signalId = await ctx.db.insert("touchlineSignals", {
          fixtureId: args.fixtureId,
          type: args.emit.signal.type,
          severity: args.emit.signal.severity,
          probabilityBefore: args.emit.signal.probabilityBefore,
          probabilityAfter: args.emit.signal.probabilityAfter,
          triggerValue: args.emit.signal.triggerValue,
          threshold: args.emit.signal.threshold,
          sequence: args.emit.signal.sequence,
          reason: args.emit.signal.reason,
          createdAt: now,
        });
      }
      await ctx.db.insert("touchlineActions", {
        signalId,
        fixtureId: args.fixtureId,
        action: args.emit.actionType as any,
        status: "EXECUTED",
        reason: args.emit.reason,
        notional: args.emit.notional,
        executionPrice: args.emit.executionPrice,
        createdAt: now,
      });
      // Only signals anchored to a real score sequence are verifiable on-chain.
      verifiable = Boolean(args.emit.signal && args.emit.signal.sequence);
    }

    // 5. Persist agent runtime + cursor.
    const agent = await loadAgent(ctx);
    const patch: any = {
      marketStatus: args.marketStatus,
      prevProb: args.runtime.prevProb ?? undefined,
      frozenAtProb: args.runtime.frozenAtProb ?? undefined,
      lastEventProb: args.runtime.lastEventProb ?? undefined,
      lastEventTs: args.runtime.lastEventTs ?? undefined,
      lastEventSeq: args.runtime.lastEventSeq ?? undefined,
      lastTickAt: now,
      updatedAt: now,
    };
    if (args.replayCursor !== undefined) patch.replayCursor = args.replayCursor;
    if (agent) await ctx.db.patch(agent._id, patch);

    return {
      signalId: signalId ? String(signalId) : null,
      verifiable,
      sequence: args.emit?.signal?.sequence ?? null,
    };
  },
});

// Record a Solana verification result (written by convex/touchlineVerify.ts,
// or as an honest "pending"/"unavailable" placeholder by agentTick).
export const recordProof = internalMutation({
  args: {
    signalId: v.optional(v.id("touchlineSignals")),
    fixtureId: v.number(),
    sequence: v.number(),
    network: v.string(),
    validationMethod: v.string(),
    verified: v.boolean(),
    detail: v.optional(v.string()),
    txRef: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("touchlineProofs", {
      signalId: args.signalId,
      fixtureId: args.fixtureId,
      sequence: args.sequence,
      network: args.network,
      validationMethod: args.validationMethod,
      verified: args.verified,
      detail: args.detail,
      txRef: args.txRef,
      requestedAt: Date.now(),
      verifiedAt: args.verifiedAt,
    });
  },
});

export const resolveProof = internalMutation({
  args: {
    proofId: v.id("touchlineProofs"),
    verified: v.boolean(),
    validationMethod: v.string(),
    detail: v.optional(v.string()),
    txRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.proofId, {
      verified: args.verified,
      validationMethod: args.validationMethod,
      detail: args.detail,
      txRef: args.txRef,
      verifiedAt: Date.now(),
    });
  },
});

// ── public controls ────────────────────────────────────────────────────

export const startReplay = mutation({
  args: { speed: v.optional(v.number()) },
  handler: async (ctx, { speed }) => {
    await clearDemoData(ctx);
    const now = Date.now();
    const a = await loadAgent(ctx);
    const patch = {
      status: "ACTIVE" as const,
      mode: "replay" as const,
      replaySpeed: speed ?? 5,
      replayStartedAt: now,
      // -1 so the t=0 baseline tick is included (replayEventsBetween is
      // exclusive on the lower bound).
      replayCursor: -1,
      featuredFixtureId: DEMO_TIMELINE.fixtureId,
      marketStatus: "ACTIVE",
      prevProb: undefined,
      frozenAtProb: undefined,
      lastEventProb: undefined,
      lastEventTs: undefined,
      lastEventSeq: undefined,
      lastTickAt: now,
      updatedAt: now,
    };
    if (a) await ctx.db.patch(a._id, patch);
    else await ctx.db.insert("touchlineAgent", { ...agentDefaults(now), ...patch });

    // Seed the featured match so the dashboard has a card immediately.
    const existing = await ctx.db
      .query("touchlineMatches")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", DEMO_TIMELINE.fixtureId))
      .unique();
    const seed = {
      fixtureId: DEMO_TIMELINE.fixtureId,
      homeTeam: DEMO_TIMELINE.home,
      awayTeam: DEMO_TIMELINE.away,
      homeScore: DEMO_TIMELINE.startScore[0],
      awayScore: DEMO_TIMELINE.startScore[1],
      status: "ACTIVE",
      minute: DEMO_TIMELINE.startMinute,
      phase: "LIVE",
      competition: DEMO_TIMELINE.competition,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, seed);
    else await ctx.db.insert("touchlineMatches", seed);

    await ctx.scheduler.runAfter(0, internal.touchline.agentTick, {});
    return { started: true, speed: speed ?? 5 };
  },
});

export const startLive = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const a = await loadAgent(ctx);
    const patch = {
      status: "ACTIVE" as const,
      mode: "live" as const,
      marketStatus: "ACTIVE",
      prevProb: undefined,
      frozenAtProb: undefined,
      lastEventProb: undefined,
      lastEventTs: undefined,
      lastEventSeq: undefined,
      lastTickAt: now,
      updatedAt: now,
    };
    if (a) await ctx.db.patch(a._id, patch);
    else await ctx.db.insert("touchlineAgent", { ...agentDefaults(now), ...patch });
    await ctx.scheduler.runAfter(0, internal.touchline.agentTick, {});
    return { started: true };
  },
});

export const stopAgent = mutation({
  args: {},
  handler: async (ctx) => {
    const a = await loadAgent(ctx);
    if (a) await ctx.db.patch(a._id, { status: "STOPPED", updatedAt: Date.now() });
    return { stopped: true };
  },
});

export const updateConfig = mutation({
  args: {
    eventWindowSec: v.optional(v.number()),
    minReprice: v.optional(v.number()),
    volatilityThreshold: v.optional(v.number()),
    autoFreeze: v.optional(v.boolean()),
    autoHedge: v.optional(v.boolean()),
    solanaVerification: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const id = await ensureAgentRow(ctx);
    const patch: any = { updatedAt: Date.now() };
    for (const k of [
      "eventWindowSec",
      "minReprice",
      "volatilityThreshold",
      "autoFreeze",
      "autoHedge",
      "solanaVerification",
    ] as const) {
      if (args[k] !== undefined) patch[k] = args[k];
    }
    await ctx.db.patch(id, patch);
    return { updated: true };
  },
});

async function ensureAgentRow(ctx: any) {
  const a = await loadAgent(ctx);
  if (a) return a._id;
  return await ctx.db.insert("touchlineAgent", agentDefaults(Date.now()));
}

async function clearDemoData(ctx: any) {
  for (const table of [
    "touchlineMatches",
    "touchlineOddsTicks",
    "touchlineScoreEvents",
    "touchlineSignals",
    "touchlineActions",
    "touchlineProofs",
  ] as const) {
    const rows = await ctx.db.query(table).collect();
    for (const r of rows) await ctx.db.delete(r._id);
  }
}

// ── the autonomous tick ────────────────────────────────────────────────

export const agentTick = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const st = await ctx.runQuery(internal.touchline.state, {});
    if (!st || st.status !== "ACTIVE") return; // stopped -> loop ends

    const thresholds = {
      eventWindowSec: st.eventWindowSec,
      minReprice: st.minReprice,
      volatilityThreshold: st.volatilityThreshold,
    };

    if (st.mode === "replay") {
      const done = await tickReplay(ctx, st, thresholds);
      if (!done) await ctx.scheduler.runAfter(REPLAY_TICK_MS, internal.touchline.agentTick, {});
      return;
    }

    await tickLive(ctx, st, thresholds);
    // Re-check status before rescheduling (a stop may have landed mid-tick).
    const after = await ctx.runQuery(internal.touchline.state, {});
    if (after && after.status === "ACTIVE" && after.mode === "live") {
      await ctx.scheduler.runAfter(LIVE_TICK_MS, internal.touchline.agentTick, {});
    }
  },
});

// Returns true when the replay has played through (no reschedule).
async function tickReplay(ctx: any, st: any, thresholds: any): Promise<boolean> {
  const now = Date.now();
  const speed = st.replaySpeed ?? 5;
  const elapsed = now - (st.replayStartedAt ?? now);
  const pos = elapsed * speed;
  const from = st.replayCursor ?? 0;
  const duration = replayDuration(DEMO_TIMELINE);

  const events = replayEventsBetween(DEMO_TIMELINE, from, Math.min(pos, duration));
  let runtime: AgentRuntime = st.runtime;
  let pendingScore: any = null;
  let cursor = from;
  let homeScore = DEMO_TIMELINE.startScore[0];
  let awayScore = DEMO_TIMELINE.startScore[1];
  let lastMinute = DEMO_TIMELINE.startMinute;

  for (const e of events) {
    if (e.type === "SCORE_EVENT") {
      pendingScore = e;
      homeScore = e.homeScore;
      awayScore = e.awayScore;
      continue;
    }
    lastMinute = e.minute;
    const tick = tickFromOdds(DEMO_TIMELINE.fixtureId, e.odds, e.t, pendingScore?.sequence);
    const scoreEvent = pendingScore
      ? {
          fixtureId: DEMO_TIMELINE.fixtureId,
          sequence: pendingScore.sequence,
          action: pendingScore.action,
          homeScore: pendingScore.homeScore,
          awayScore: pendingScore.awayScore,
          timestamp: e.t,
        }
      : null;
    const res = stepAgent(runtime, tick, scoreEvent, thresholds);
    runtime = res.runtime;

    await commitAndMaybeVerify(ctx, st, {
      fixtureId: DEMO_TIMELINE.fixtureId,
      timestamp: e.t,
      minute: e.minute,
      homeTeam: DEMO_TIMELINE.home,
      awayTeam: DEMO_TIMELINE.away,
      competition: DEMO_TIMELINE.competition,
      odds: e.odds,
      probs: tick.probs,
      homeScore,
      awayScore,
      marketStatus: res.marketStatus,
      scoreEvent: scoreEvent
        ? {
            sequence: scoreEvent.sequence,
            action: scoreEvent.action,
            homeScore: scoreEvent.homeScore,
            awayScore: scoreEvent.awayScore,
          }
        : undefined,
      emit: res.emitAction
        ? {
            actionType: res.action,
            reason: res.reason,
            notional: res.action === "PAPER_HEDGE" ? 10000 : undefined,
            executionPrice:
              res.action === "PAPER_HEDGE" ? round2(tick.probs.home) : undefined,
            signal: res.signal
              ? {
                  type: res.signal.type,
                  severity: res.signal.severity,
                  probabilityBefore: res.signal.probabilityBefore,
                  probabilityAfter: res.signal.probabilityAfter,
                  triggerValue: res.signal.triggerValue,
                  threshold: res.signal.threshold,
                  sequence: res.signal.sequence,
                  reason: res.signal.reason,
                }
              : undefined,
          }
        : undefined,
      runtime: pruneRuntime(runtime),
      replayCursor: undefined, // set below once, after the batch
    });
    pendingScore = null;
    cursor = e.t;
  }

  // Hold the cursor just before an unconsumed score event so it pairs with its
  // next odds tick; otherwise advance to the scaled position.
  const newCursor = pendingScore ? Math.max(cursor, pendingScore.t - 1) : Math.min(pos, duration);
  await ctx.runMutation(internal.touchline.setCursor, { cursor: newCursor });

  return pos >= duration && !pendingScore;
}

export const setCursor = internalMutation({
  args: { cursor: v.number() },
  handler: async (ctx, { cursor }) => {
    const a = await loadAgent(ctx);
    if (a) await ctx.db.patch(a._id, { replayCursor: cursor, updatedAt: Date.now() });
  },
});

async function tickLive(ctx: any, st: any, thresholds: any): Promise<void> {
  const fixtures = await fetchFixtures().catch(() => [] as any[]);
  if (!fixtures.length) return;

  // Prefer the featured fixture, else an in-play match with odds, else first.
  let chosen = st.featuredFixtureId
    ? fixtures.find((f: any) => f.fixtureId === st.featuredFixtureId)
    : null;
  if (!chosen) {
    for (const f of fixtures) {
      const odds = await fetchOdds(f.fixtureId).catch(() => null);
      const score = await fetchScore(f.fixtureId).catch(() => null);
      if (odds && isInPlay(f, odds, score)) {
        chosen = f;
        break;
      }
    }
    chosen = chosen ?? fixtures[0];
  }

  const odds = await fetchOdds(chosen.fixtureId).catch(() => null);
  if (!odds) return;
  const score = await fetchScore(chosen.fixtureId).catch(() => null);
  const now = Date.now();
  const oddsQuote = { home: odds.home, draw: odds.draw, away: odds.away };
  // Use the engine's own normalisation (0-1 units) so live and replay ticks
  // are stored identically. (convex/txline's impliedProbs returns percentages.)
  const tick = tickFromOdds(chosen.fixtureId, oddsQuote, now);
  const probs = tick.probs;

  // Detect a new goal by comparing to the stored match score.
  const prevMatch = await ctx.runQuery(internal.touchline.matchState, {
    fixtureId: chosen.fixtureId,
  });
  const homeScore = score?.homeGoals ?? prevMatch?.homeScore ?? 0;
  const awayScore = score?.awayGoals ?? prevMatch?.awayScore ?? 0;
  const scored =
    prevMatch && (homeScore > prevMatch.homeScore || awayScore > prevMatch.awayScore);
  const scoreEvent = scored
    ? {
        fixtureId: chosen.fixtureId,
        // The devnet Scores snapshot exposes no TxLINE sequence; use a
        // timestamp so the audit row is stable. On-chain verification for
        // live goals stays honest (unverified) absent a real sequence.
        sequence: now,
        action: "GOAL",
        homeScore,
        awayScore,
        timestamp: now,
      }
    : null;

  const res = stepAgent(st.runtime, tick, scoreEvent, thresholds);

  await commitAndMaybeVerify(ctx, st, {
    fixtureId: chosen.fixtureId,
    timestamp: now,
    minute: score?.minute ?? prevMatch?.minute ?? 0,
    homeTeam: chosen.homeName ?? chosen.homeCode ?? "Home",
    awayTeam: chosen.awayName ?? chosen.awayCode ?? "Away",
    competition: chosen.competition ?? "",
    odds: oddsQuote,
    probs,
    homeScore,
    awayScore,
    marketStatus: res.marketStatus,
    scoreEvent: scoreEvent
      ? {
          sequence: scoreEvent.sequence,
          action: scoreEvent.action,
          homeScore,
          awayScore,
        }
      : undefined,
    emit: res.emitAction
      ? {
          actionType: res.action,
          reason: res.reason,
          notional: res.action === "PAPER_HEDGE" ? 10000 : undefined,
          executionPrice: res.action === "PAPER_HEDGE" ? round2(tick.probs.home) : undefined,
          signal: res.signal
            ? {
                type: res.signal.type,
                severity: res.signal.severity,
                probabilityBefore: res.signal.probabilityBefore,
                probabilityAfter: res.signal.probabilityAfter,
                triggerValue: res.signal.triggerValue,
                threshold: res.signal.threshold,
                sequence: res.signal.sequence,
                reason: res.signal.reason,
              }
            : undefined,
        }
      : undefined,
    runtime: pruneRuntime(res.runtime),
  });
}

// Commit the step, then request Solana verification for verifiable signals.
async function commitAndMaybeVerify(ctx: any, st: any, payload: any): Promise<void> {
  const result = await ctx.runMutation(internal.touchline.commitStep, payload);
  if (result.verifiable && result.sequence != null) {
    if (st.solanaVerification) {
      // Insert an honest "pending" proof immediately, then resolve it.
      const proofId = await ctx.runMutation(internal.touchline.recordProof, {
        signalId: result.signalId ? (result.signalId as any) : undefined,
        fixtureId: payload.fixtureId,
        sequence: result.sequence,
        network: "devnet",
        validationMethod: "pending",
        verified: false,
        detail: "Requesting Solana validation…",
      });
      await ctx.scheduler.runAfter(0, internal.touchlineVerify.verify, {
        proofId,
        fixtureId: payload.fixtureId,
        sequence: result.sequence,
      });
    } else {
      await ctx.runMutation(internal.touchline.recordProof, {
        signalId: result.signalId ? (result.signalId as any) : undefined,
        fixtureId: payload.fixtureId,
        sequence: result.sequence,
        network: "devnet",
        validationMethod: "disabled",
        verified: false,
        detail: "Solana verification is turned off in agent config.",
      });
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// commitStep's runtime validator holds only the persisted numeric fields; the
// AgentRuntime also carries `status`, which is passed separately as marketStatus.
function pruneRuntime(rt: AgentRuntime) {
  return {
    prevProb: rt.prevProb,
    frozenAtProb: rt.frozenAtProb,
    lastEventProb: rt.lastEventProb,
    lastEventTs: rt.lastEventTs,
    lastEventSeq: rt.lastEventSeq,
  };
}

// ── read API (reactive queries for the UI) ─────────────────────────────

export const matchState = internalQuery({
  args: { fixtureId: v.number() },
  handler: async (ctx, { fixtureId }) => {
    return await ctx.db
      .query("touchlineMatches")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .unique();
  },
});

export const agent = query({
  args: {},
  handler: async (ctx) => {
    const a = await loadAgent(ctx);
    if (!a) return { ...agentDefaults(Date.now()), exists: false };
    return { ...a, exists: true };
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const a = await loadAgent(ctx);
    const fixtureId = a?.featuredFixtureId ?? DEMO_TIMELINE.fixtureId;
    const match = await ctx.db
      .query("touchlineMatches")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .unique();

    const signals = await ctx.db.query("touchlineSignals").withIndex("by_created").order("desc").take(50);
    const actions = await ctx.db.query("touchlineActions").withIndex("by_created").order("desc").take(50);
    const proofs = await ctx.db.query("touchlineProofs").withIndex("by_created").order("desc").take(50);
    const matches = await ctx.db.query("touchlineMatches").collect();
    const ticks = await ctx.db
      .query("touchlineOddsTicks")
      .withIndex("by_fixture_ts", (q) => q.eq("fixtureId", fixtureId))
      .order("desc")
      .take(60);

    return {
      agent: a ? { ...a } : { ...agentDefaults(Date.now()), exists: false },
      match: match ?? null,
      metrics: {
        matches: matches.length,
        signals: signals.length,
        actions: actions.length,
        proofsVerified: proofs.filter((p) => p.verified).length,
        proofsTotal: proofs.length,
      },
      latestSignal: signals[0] ?? null,
      latestAction: actions[0] ?? null,
      latestProof: proofs[0] ?? null,
      ticks: ticks.reverse(),
    };
  },
});

export const oddsHistory = query({
  args: { fixtureId: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { fixtureId, limit }) => {
    const fid = fixtureId ?? DEMO_TIMELINE.fixtureId;
    const rows = await ctx.db
      .query("touchlineOddsTicks")
      .withIndex("by_fixture_ts", (q) => q.eq("fixtureId", fid))
      .order("desc")
      .take(limit ?? 120);
    return rows.reverse();
  },
});

export const signalsList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    await ctx.db.query("touchlineSignals").withIndex("by_created").order("desc").take(limit ?? 50),
});

export const actionsList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    await ctx.db.query("touchlineActions").withIndex("by_created").order("desc").take(limit ?? 50),
});

export const proofsList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    await ctx.db.query("touchlineProofs").withIndex("by_created").order("desc").take(limit ?? 50),
});

// Unified terminal-style audit feed (TOUCHLINE_PRD §25).
export const activity = query({
  args: { filter: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { filter, limit }) => {
    const cap = limit ?? 120;
    const rows: Array<{ ts: number; group: string; kind: string; label: string; value: string; refId?: string }> = [];

    if (!filter || filter === "all" || filter === "data") {
      const ticks = await ctx.db.query("touchlineOddsTicks").order("desc").take(cap);
      for (const t of ticks) {
        rows.push({
          ts: t.timestamp,
          group: "data",
          kind: "ODDS_TICK",
          label: "ODDS_TICK",
          value: `${(t.homeProbability * 100).toFixed(1)}% / ${(t.drawProbability * 100).toFixed(1)}% / ${(t.awayProbability * 100).toFixed(1)}%`,
        });
      }
      const scores = await ctx.db.query("touchlineScoreEvents").order("desc").take(cap);
      for (const s of scores) {
        rows.push({
          ts: s.timestamp,
          group: "data",
          kind: "SCORE_EVENT",
          label: "SCORE_EVENT",
          value: `${s.action} ${s.homeScore}-${s.awayScore} (seq ${s.sequence})`,
        });
      }
    }
    if (!filter || filter === "all" || filter === "signals") {
      const signals = await ctx.db.query("touchlineSignals").order("desc").take(cap);
      for (const s of signals) {
        rows.push({
          ts: s.createdAt,
          group: "signals",
          kind: "SIGNAL",
          label: "SIGNAL",
          value: `${s.type} · risk ${s.severity}`,
        });
      }
    }
    if (!filter || filter === "all" || filter === "actions") {
      const actions = await ctx.db.query("touchlineActions").order("desc").take(cap);
      for (const a of actions) {
        rows.push({
          ts: a.createdAt,
          group: "actions",
          kind: "AGENT_ACTION",
          label: "AGENT_ACTION",
          value: a.action,
        });
      }
    }
    if (!filter || filter === "all" || filter === "proofs") {
      const proofs = await ctx.db.query("touchlineProofs").order("desc").take(cap);
      for (const p of proofs) {
        rows.push({
          ts: p.verifiedAt ?? p.requestedAt,
          group: "proofs",
          kind: p.verified ? "PROOF_VERIFIED" : "PROOF_REQUESTED",
          label: p.verified ? "PROOF_VERIFIED" : "PROOF_PENDING",
          value: p.verified ? `VALID · seq ${p.sequence}` : (p.detail ?? "pending"),
          refId: String(p._id),
        });
      }
    }

    rows.sort((a, b) => b.ts - a.ts);
    return rows.slice(0, cap);
  },
});

export const matchDetail = query({
  args: { fixtureId: v.number() },
  handler: async (ctx, { fixtureId }) => {
    const match = await ctx.db
      .query("touchlineMatches")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .unique();
    const ticks = await ctx.db
      .query("touchlineOddsTicks")
      .withIndex("by_fixture_ts", (q) => q.eq("fixtureId", fixtureId))
      .order("asc")
      .take(200);
    const signals = await ctx.db
      .query("touchlineSignals")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .order("desc")
      .take(50);
    const actions = await ctx.db
      .query("touchlineActions")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .order("desc")
      .take(50);
    const scoreEvents = await ctx.db
      .query("touchlineScoreEvents")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .order("desc")
      .take(50);
    const proofs = await ctx.db
      .query("touchlineProofs")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .order("desc")
      .take(50);
    return { match: match ?? null, ticks, signals, actions, scoreEvents, proofs };
  },
});

export const proofDetail = query({
  args: { id: v.id("touchlineProofs") },
  handler: async (ctx, { id }) => {
    const proof = await ctx.db.get(id);
    if (!proof) return null;
    const signal = proof.signalId ? await ctx.db.get(proof.signalId) : null;
    let action = null;
    if (proof.signalId) {
      action = await ctx.db
        .query("touchlineActions")
        .withIndex("by_signal", (q) => q.eq("signalId", proof.signalId))
        .first();
    }
    return { proof, signal, action };
  },
});
