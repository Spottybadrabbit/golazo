import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Behavioural + per-round/per-pack event logging, all keyed off the signed-in
// Clerk identity (ctx.auth.getUserIdentity().subject === clerkId). Every
// mutation here is defensive: no identity -> silent no-op (returns null
// instead of throwing), so client call sites in components/PlayerSync.tsx can
// fire-and-forget without checking sign-in state first.

/** Append one row to the catch-all activity log. */
export const log = mutation({
  args: {
    kind: v.union(
      v.literal("screen_view"),
      v.literal("action"),
      v.literal("onboarding"),
      v.literal("game"),
      v.literal("reward"),
      v.literal("wallet"),
      v.literal("celebration"),
    ),
    name: v.string(),
    screen: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.insert("activity", {
      ...args,
      clerkId: identity.subject,
      createdAt: Date.now(),
    });
  },
});

/** Record one resolved (or in-flight) round of a game, per-round detail. */
export const recordGamePlay = mutation({
  args: {
    game: v.union(v.literal("hilo"), v.literal("pool"), v.literal("cards")),
    fixtureId: v.optional(v.number()),
    roundRef: v.optional(v.string()),
    pick: v.optional(v.string()),
    lockedProb: v.optional(v.number()),
    result: v.optional(v.union(v.literal("win"), v.literal("loss"), v.literal("void"))),
    delta: v.optional(v.number()),
    streakAfter: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.insert("gamePlays", {
      ...args,
      clerkId: identity.subject,
      createdAt: Date.now(),
    });
  },
});

/** Record a card pack pull. */
export const recordPackOpen = mutation({
  args: {
    cost: v.number(),
    bestTier: v.string(),
    cardCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.insert("packOpens", {
      ...args,
      clerkId: identity.subject,
      createdAt: Date.now(),
    });
  },
});

/** Open a new session row for the signed-in player. */
export const startSession = mutation({
  args: { userAgent: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const now = Date.now();
    return await ctx.db.insert("sessions", {
      clerkId: identity.subject,
      userAgent: args.userAgent,
      startedAt: now,
      lastSeenAt: now,
    });
  },
});

/** Bump lastSeenAt on the signed-in player's most recent session. */
export const touchSession = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const latest = await ctx.db
      .query("sessions")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .order("desc")
      .first();
    if (!latest) return null;
    await ctx.db.patch(latest._id, { lastSeenAt: Date.now() });
    return null;
  },
});

/** Upsert the signed-in player's onboarding funnel row. */
export const recordOnboarding = mutation({
  args: {
    step: v.number(),
    goalId: v.optional(v.string()),
    handle: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    skipped: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkId = identity.subject;
    const existing = await ctx.db
      .query("onboarding")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("onboarding", {
      ...args,
      clerkId,
      startedAt: Date.now(),
    });
  },
});
