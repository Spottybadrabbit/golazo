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

async function latestTick(ctx: any, fixtureId: number) {
  return await ctx.db
    .query("liveTicks")
    .withIndex("by_fixture_ts", (q: any) => q.eq("fixtureId", fixtureId))
    .order("desc")
    .first();
}

export const live = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("pollState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    const mode = state?.mode ?? "sim";
    if (mode !== "live") return { mode, updatedAt: 0, featured: null, matches: [] };

    const fixtures = await ctx.db
      .query("liveFixtures")
      .withIndex("by_updated")
      .order("desc")
      .take(20);
    const inPlay = fixtures.filter((f) => f.inPlay);

    const withTicks = await Promise.all(
      inPlay.map(async (f) => {
        const t = await latestTick(ctx, f.fixtureId);
        return {
          fixtureId: f.fixtureId,
          home: { code: f.homeCode, name: f.homeName, flag: f.homeFlag },
          away: { code: f.awayCode, name: f.awayName, flag: f.awayFlag },
          score: [f.homeGoals, f.awayGoals] as [number, number],
          minute: f.minute ?? 0,
          phase: f.phase,
          competition: f.competition,
          odds: t ? { home: t.oddsHome, draw: t.oddsDraw, away: t.oddsAway } : null,
          probs: t ? { home: t.pHome, draw: t.pDraw, away: t.pAway } : null,
          updatedAt: f.updatedAt,
        };
      }),
    );

    const featured =
      withTicks.find((m) => m.fixtureId === state?.featuredFixtureId) ?? withTicks[0] ?? null;
    const updatedAt = Math.max(0, ...withTicks.map((m) => m.updatedAt));
    return { mode, updatedAt, featured, matches: withTicks };
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
