import { query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Shared validators for the in-game stats accumulator + notable-event stream.
const STAT_LINE = v.object({
  goals: v.number(),
  corners: v.number(),
  shots: v.number(),
  shotsOnTarget: v.number(),
  yellow: v.number(),
  red: v.number(),
  fouls: v.number(),
});
const EVENT_ITEM = v.object({
  seq: v.number(),
  minute: v.number(),
  action: v.string(),
  side: v.string(),
  detail: v.string(),
});
type StatLineDoc = {
  goals: number;
  corners: number;
  shots: number;
  shotsOnTarget: number;
  yellow: number;
  red: number;
  fouls: number;
};
type EventItemDoc = {
  seq: number;
  minute: number;
  action: string;
  side: string;
  detail: string;
};

// ── internal mutations (called by the poller) ──

export const upsertFixture = internalMutation({
  args: {
    fixtureId: v.number(),
    homeCode: v.string(),
    homeName: v.string(),
    homeFlag: v.string(),
    awayCode: v.string(),
    awayName: v.string(),
    awayFlag: v.string(),
    homeGoals: v.number(),
    awayGoals: v.number(),
    minute: v.optional(v.number()),
    statusId: v.optional(v.number()),
    phase: v.string(),
    inPlay: v.boolean(),
    competition: v.string(),
    // pre-match / live 1X2, oriented to display home/away (set once odds exist)
    oddsHome: v.optional(v.number()),
    oddsDraw: v.optional(v.number()),
    oddsAway: v.optional(v.number()),
    pHome: v.optional(v.number()),
    pDraw: v.optional(v.number()),
    pAway: v.optional(v.number()),
    startTime: v.optional(v.number()),
    // in-game stats + notable-event stream (oriented to display home/away)
    statsHome: v.optional(STAT_LINE),
    statsAway: v.optional(STAT_LINE),
    recentEvents: v.optional(v.array(EVENT_ITEM)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("liveFixtures")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .unique();
    const doc = { ...args, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("liveFixtures", doc);
  },
});

export const appendTick = internalMutation({
  args: {
    fixtureId: v.number(),
    ts: v.number(),
    oddsHome: v.number(),
    oddsDraw: v.number(),
    oddsAway: v.number(),
    pHome: v.number(),
    pDraw: v.number(),
    pAway: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("liveTicks", args);
    // bound growth: drop this fixture's ticks older than 2 hours
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("liveTicks")
      .withIndex("by_fixture_ts", (q) => q.eq("fixtureId", args.fixtureId).lt("ts", cutoff))
      .take(50);
    for (const t of old) await ctx.db.delete(t._id);
  },
});

export const setPollState = internalMutation({
  args: {
    mode: v.string(),
    featuredFixtureId: v.optional(v.number()),
    note: v.optional(v.string()),
    loopId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pollState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    const doc = { key: "global", lastPollAt: Date.now(), ...args };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("pollState", doc);
  },
});

// The active poll loop id — the poll loop reads this to know if it's still the
// leaseholder (else it stops, killing stray/duplicate loops).
export const getLoopId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("pollState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    return state?.loopId ?? null;
  },
});

// Heartbeat (cron, every 60s): ensure exactly ONE leased poll loop is alive.
// Kicks a fresh loop (with a new lease id) when the loop is stale OR when the
// state has no lease id yet (legacy/unmanaged loops) — the new lease then makes
// any older, un-leased loops self-terminate on their next iteration.
export const heartbeat = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("pollState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    const stale = !state || Date.now() - state.lastPollAt > 90_000;
    const unmanaged = state != null && !state.loopId;
    if (stale || unmanaged) {
      const loopId = `loop_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      if (state) {
        await ctx.db.patch(state._id, { loopId, lastPollAt: Date.now() });
      } else {
        await ctx.db.insert("pollState", {
          key: "global",
          mode: "live",
          lastPollAt: Date.now(),
          loopId,
        });
      }
      await ctx.scheduler.runAfter(0, internal.poller.poll, { loopId });
    }
  },
});

// ── public queries (auth-free — anonymous visitors read live scores) ──

const isWorldCup = (competition: string) => /world cup/i.test(competition);

function toLiveMatch(f: {
  fixtureId: number;
  homeCode: string;
  homeName: string;
  homeFlag: string;
  awayCode: string;
  awayName: string;
  awayFlag: string;
  homeGoals: number;
  awayGoals: number;
  minute?: number;
  phase: string;
  competition: string;
  oddsHome?: number;
  oddsDraw?: number;
  oddsAway?: number;
  pHome?: number;
  pDraw?: number;
  pAway?: number;
  startTime?: number;
  statsHome?: StatLineDoc;
  statsAway?: StatLineDoc;
  recentEvents?: EventItemDoc[];
  updatedAt: number;
}) {
  const phase = f.phase === "SCHED" ? "BREAK" : f.phase;
  return {
    fixtureId: f.fixtureId,
    home: { code: f.homeCode, name: f.homeName, flag: f.homeFlag },
    away: { code: f.awayCode, name: f.awayName, flag: f.awayFlag },
    score: [f.homeGoals, f.awayGoals] as [number, number],
    minute: f.minute ?? 0,
    phase,
    competition: f.competition,
    odds:
      f.oddsHome != null
        ? { home: f.oddsHome, draw: f.oddsDraw ?? 0, away: f.oddsAway ?? 0 }
        : null,
    probs: f.pHome != null ? { home: f.pHome, draw: f.pDraw ?? 0, away: f.pAway ?? 0 } : null,
    stats:
      f.statsHome && f.statsAway ? { home: f.statsHome, away: f.statsAway } : null,
    events: f.recentEvents ?? [],
    startTime: f.startTime,
    updatedAt: f.updatedAt,
  };
}

export const live = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("pollState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    const mode: "live" | "sim" = state?.mode === "live" ? "live" : "sim";
    if (mode !== "live") {
      return { mode: "sim" as const, updatedAt: Date.now(), featured: null, matches: [] };
    }

    const fixtures = await ctx.db
      .query("liveFixtures")
      .withIndex("by_updated")
      .order("desc")
      .take(20);
    const matches = fixtures.map(toLiveMatch);

    const inPlay = (m: (typeof matches)[number]) => m.phase === "LIVE" || m.phase === "HT";
    const maxProb = (m: (typeof matches)[number]) =>
      m.probs ? Math.max(m.probs.home, m.probs.draw, m.probs.away) : 0;
    // A "competitive" match is in-play, priced, and NOT a dead rubber — one
    // outcome pinned ≥ 95% (e.g. a team 1-3 down late) makes a frozen, pointless
    // Hi-Lo, so it must never be the marquee while a real contest is live.
    const competitive = (m: (typeof matches)[number]) =>
      Boolean(m.odds) && inPlay(m) && maxProb(m) < 95;
    // matches come newest-updated first, so `find` also prefers the freshest.
    const featured =
      matches.find((m) => isWorldCup(m.competition) && competitive(m)) ??
      matches.find((m) => isWorldCup(m.competition) && m.odds && inPlay(m)) ??
      matches.find((m) => isWorldCup(m.competition) && m.odds) ??
      // A World Cup match stays the marquee even if odds momentarily drop.
      matches.find((m) => isWorldCup(m.competition)) ??
      matches.find((m) => competitive(m)) ??
      matches.find((m) => m.fixtureId === state?.featuredFixtureId && (m.odds || inPlay(m))) ??
      matches.find((m) => m.odds && inPlay(m)) ??
      matches.find((m) => m.odds) ??
      matches[0] ??
      null;

    const updatedAt = matches.length ? Math.max(...matches.map((m) => m.updatedAt)) : Date.now();
    return { mode, updatedAt, featured, matches };
  },
});

/**
 * Full-match recap for Golo · PunditBot: a favorited fixture's whole story from
 * kickoff — its recorded notable events (goals/cards/corners/…, oldest→newest)
 * plus the current score/minute/phase/probs — so the pundit feed can load out
 * the entire match, not just react to what happens after you open it.
 */
export const recap = query({
  args: { fixtureId: v.number() },
  handler: async (ctx, { fixtureId }) => {
    const fx = await ctx.db
      .query("liveFixtures")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .unique();
    if (!fx) return null;
    return {
      fixtureId: fx.fixtureId,
      homeCode: fx.homeCode,
      awayCode: fx.awayCode,
      homeName: fx.homeName,
      awayName: fx.awayName,
      score: [fx.homeGoals, fx.awayGoals] as [number, number],
      minute: fx.minute ?? 0,
      phase: fx.phase,
      competition: fx.competition,
      probs:
        fx.pHome != null ? { home: fx.pHome, draw: fx.pDraw ?? 0, away: fx.pAway ?? 0 } : null,
      events: (fx.recentEvents ?? [])
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((e) => ({ seq: e.seq, minute: e.minute, action: e.action, side: e.side, detail: e.detail })),
    };
  },
});

// The tick at/just-before a timestamp — used to resolve live Hi-Lo rounds.
export const tickAt = query({
  args: { fixtureId: v.number(), ts: v.number() },
  handler: async (ctx, { fixtureId, ts }) => {
    return await ctx.db
      .query("liveTicks")
      .withIndex("by_fixture_ts", (q) => q.eq("fixtureId", fixtureId).lte("ts", ts))
      .order("desc")
      .first();
  },
});
