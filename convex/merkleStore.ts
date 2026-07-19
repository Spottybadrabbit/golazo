import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Store + read layer for the "Miracle Tree" — a Merkle root computed over a
// fixture's real live odds-tick history (convex/merkle.ts does the hashing;
// this file only touches the database, per the "use node" action/query split).

const MAX_TICKS = 2000;

// ── internal queries (read by the compute action) ──

/** A fixture's liveTicks, oldest first, capped at MAX_TICKS. */
export const ticksForFixture = internalQuery({
  args: { fixtureId: v.number() },
  handler: async (ctx, { fixtureId }) => {
    return await ctx.db
      .query("liveTicks")
      .withIndex("by_fixture_ts", (q) => q.eq("fixtureId", fixtureId))
      .order("asc")
      .take(MAX_TICKS);
  },
});

/** Every fixtureId currently tracked in liveFixtures (one row per fixture). */
export const fixturesWithTicks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const fixtures = await ctx.db.query("liveFixtures").collect();
    return fixtures.map((f) => f.fixtureId);
  },
});

// ── internal mutation (written by the compute action) ──

/** Upsert the newest Merkle root row for a fixture. */
export const upsertRoot = internalMutation({
  args: {
    fixtureId: v.number(),
    root: v.string(),
    leafCount: v.number(),
    fromTs: v.number(),
    toTs: v.number(),
    algo: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("merkleRoots")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .order("desc")
      .first();
    const doc = { ...args, computedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("merkleRoots", doc);
  },
});

// ── public queries (auth-free — for display) ──

/** The current Merkle root for a fixture, or null if none has been computed. */
export const getRoot = query({
  args: { fixtureId: v.number() },
  handler: async (ctx, { fixtureId }) => {
    return await ctx.db
      .query("merkleRoots")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
      .order("desc")
      .first();
  },
});

/** All Merkle roots, newest first. */
export const allRoots = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("merkleRoots").withIndex("by_computed").order("desc").collect();
  },
});
