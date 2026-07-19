import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

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

// Heartbeat (cron, every 60s): restart the self-rescheduling poll loop if it
// has stalled (deploy, crash). Only kicks when stale to avoid parallel loops.
export const heartbeat = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("pollState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    const stale = !state || Date.now() - state.lastPollAt > 90_000;
    if (stale) await ctx.scheduler.runAfter(0, internal.poller.poll, {});
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
    // Always feature the best REAL match: a World Cup game with odds wins over a
    // stale poll pointer (which can drift to a no-odds friendly on a transient
    // odds-fetch miss). Only honor the pointer if it actually has odds/in-play.
    const featured =
      matches.find((m) => isWorldCup(m.competition) && m.odds && inPlay(m)) ??
      matches.find((m) => isWorldCup(m.competition) && m.odds) ??
      matches.find((m) => m.fixtureId === state?.featuredFixtureId && (m.odds || inPlay(m))) ??
      matches.find((m) => m.odds && inPlay(m)) ??
      matches.find((m) => m.odds) ??
      matches[0] ??
      null;

    const updatedAt = matches.length ? Math.max(...matches.map((m) => m.updatedAt)) : Date.now();
    return { mode, updatedAt, featured, matches };
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
