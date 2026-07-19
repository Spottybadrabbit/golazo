import { mutation, query } from "./_generated/server";

// Rollup profile screen data + the stats derivation behind it. Both
// functions are auth'd via Clerk (ctx.auth.getUserIdentity().subject ===
// clerkId) and no-op (return null) when signed out.

/** The signed-in player's profile row + rollup stats + recent activity. */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkId = identity.subject;
    const [player, stats, activity] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
        .unique(),
      ctx.db
        .query("profileStats")
        .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
        .unique(),
      ctx.db
        .query("activity")
        .withIndex("by_clerk_created", (q) => q.eq("clerkId", clerkId))
        .order("desc")
        .take(20),
    ]);
    return { player, stats, activity };
  },
});

/** Derive profileStats from the caller's gamePlays/packOpens/ledger rows. */
export const recomputeStats = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkId = identity.subject;
    const [plays, packs, ledgerRows] = await Promise.all([
      ctx.db
        .query("gamePlays")
        .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
        .collect(),
      ctx.db
        .query("packOpens")
        .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
        .collect(),
      ctx.db
        .query("ledger")
        .withIndex("by_clerk_created", (q) => q.eq("clerkId", clerkId))
        .collect(),
    ]);

    const hiloPlays = plays.filter((p) => p.game === "hilo" && p.result !== undefined);
    const totalPicks = hiloPlays.length;
    const correctPicks = hiloPlays.filter((p) => p.result === "win").length;
    const accuracy = totalPicks > 0 ? correctPicks / totalPicks : 0;
    const longestStreak = plays.reduce((max, p) => Math.max(max, p.streakAfter ?? 0), 0);
    const roundsPlayed = plays.length;
    const packsOpened = packs.length;
    const cardsOwned = new Set(packs.flatMap((p) => p.cardCodes)).size;
    const goalEarned = ledgerRows
      .filter((r) => r.currency === "GOAL" && r.amount > 0)
      .reduce((sum, r) => sum + r.amount, 0);
    const goalSpent = ledgerRows
      .filter((r) => r.currency === "GOAL" && r.amount < 0)
      .reduce((sum, r) => sum + Math.abs(r.amount), 0);
    const daysActive = new Set(
      [...plays.map((p) => p.createdAt), ...packs.map((p) => p.createdAt)].map((ts) =>
        new Date(ts).toDateString(),
      ),
    ).size;

    const now = Date.now();
    const patch = {
      totalPicks,
      correctPicks,
      accuracy,
      longestStreak,
      roundsPlayed,
      packsOpened,
      cardsOwned,
      goalEarned,
      goalSpent,
      daysActive,
      lastActiveAt: now,
      updatedAt: now,
    };

    const existing = await ctx.db
      .query("profileStats")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("profileStats", { ...patch, clerkId });
  },
});
