import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Player profile write-through for lib/game.ts (client sync layer:
// components/PlayerSync.tsx). Extends the identity/profile concept already
// started in convex/game.ts (getProfile/saveProfile) with the fuller field
// set the sync layer needs (streak goal/days, lastActiveAt, createdAt-on-
// first). Auth'd via Clerk (ctx.auth.getUserIdentity().subject === clerkId);
// every function here no-ops (rather than throws) when signed out, so
// fire-and-forget client calls never need to check auth state first.

/** Create or update the signed-in player's profile row. No-op if signed out. */
export const upsert = mutation({
  args: {
    handle: v.string(),
    wallet: v.optional(v.string()),
    xp: v.number(),
    bestStreak: v.number(),
    goalPoints: v.number(),
    cards: v.optional(v.record(v.string(), v.number())),
    streakDays: v.optional(v.number()),
    streakGoal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkId = identity.subject;
    const existing = await ctx.db
      .query("players")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, lastActiveAt: now, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("players", {
      ...args,
      clerkId,
      createdAt: now,
      lastActiveAt: now,
      updatedAt: now,
    });
  },
});

/** The signed-in player's profile row, or null if signed out / not created yet. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("players")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});
