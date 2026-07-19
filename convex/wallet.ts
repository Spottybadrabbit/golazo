import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

// SOL wallet + GOAL ledger + play-money bet placement, all auth'd via Clerk
// (ctx.auth.getUserIdentity().subject === clerkId). Every balance is derived
// from the append-only `ledger` table (schema.ts): the current balance for a
// currency is the `balanceAfter` on that currency's most recent row for the
// signed-in clerkId. `placeBet` is PLAY-MONEY only — it appends a ledger
// "spend" row and a `gamePlays` position record; nothing ever signs or sends
// a real Solana transaction.

/** Latest ledger balance for one currency, or 0 if the player has no rows yet. */
async function latestBalance(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
  currency: "GOAL" | "SOL",
): Promise<number> {
  const rows = await ctx.db
    .query("ledger")
    .withIndex("by_clerk_created", (q) => q.eq("clerkId", clerkId))
    .order("desc")
    .take(500);
  return rows.find((r) => r.currency === currency)?.balanceAfter ?? 0;
}

/** Append a ledger row for the signed-in player; returns the new balance. */
export const recordLedger = mutation({
  args: {
    kind: v.union(
      v.literal("earn"),
      v.literal("spend"),
      v.literal("reward"),
      v.literal("promo"),
      v.literal("bonus"),
      v.literal("refund"),
    ),
    currency: v.union(v.literal("GOAL"), v.literal("SOL")),
    amount: v.number(),
    reason: v.string(),
    ref: v.optional(v.string()),
    solanaTx: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkId = identity.subject;
    const prior = await latestBalance(ctx, clerkId, args.currency);
    const balanceAfter = Math.round((prior + args.amount) * 1e6) / 1e6;
    await ctx.db.insert("ledger", {
      clerkId,
      kind: args.kind,
      currency: args.currency,
      amount: args.amount,
      balanceAfter,
      reason: args.reason,
      ref: args.ref,
      solanaTx: args.solanaTx,
      createdAt: Date.now(),
    });
    return balanceAfter;
  },
});

/** The signed-in player's ledger rows, newest first (for history screens). */
export const myLedger = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("ledger")
      .withIndex("by_clerk_created", (q) => q.eq("clerkId", identity.subject))
      .order("desc")
      .take(100);
  },
});

/** Latest GOAL and SOL ledger balances for the signed-in player (0 default). */
export const myBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { goal: 0, sol: 0 };
    const clerkId = identity.subject;
    const [goal, sol] = await Promise.all([
      latestBalance(ctx, clerkId, "GOAL"),
      latestBalance(ctx, clerkId, "SOL"),
    ]);
    return { goal, sol };
  },
});

/**
 * Place a play-money bet on the live featured match. Records a SOL ledger
 * spend for the stake and a `gamePlays` position (game:"pool") — no real
 * Solana transaction is ever created or signed. Returns the potential payout
 * (stake * odds) for the confirmation UI.
 */
export const placeBet = mutation({
  args: {
    fixtureId: v.number(),
    pick: v.union(v.literal("home"), v.literal("draw"), v.literal("away")),
    stakeSol: v.number(),
    odds: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!(args.stakeSol > 0)) throw new Error("Stake must be greater than zero");
    if (!(args.odds > 0)) throw new Error("Invalid odds");
    const clerkId = identity.subject;
    const potentialPayout = Math.round(args.stakeSol * args.odds * 1e6) / 1e6;

    const prior = await latestBalance(ctx, clerkId, "SOL");
    const balanceAfter = Math.round((prior - args.stakeSol) * 1e6) / 1e6;
    await ctx.db.insert("ledger", {
      clerkId,
      kind: "spend",
      currency: "SOL",
      amount: -args.stakeSol,
      balanceAfter,
      reason: `Bet ${args.pick} @ ${args.odds.toFixed(2)}x · fixture ${args.fixtureId}`,
      createdAt: Date.now(),
    });

    const gamePlayId = await ctx.db.insert("gamePlays", {
      clerkId,
      game: "pool",
      fixtureId: args.fixtureId,
      pick: args.pick,
      stakeSol: args.stakeSol,
      oddsAtPick: args.odds,
      potentialPayout,
      createdAt: Date.now(),
    });

    return { potentialPayout, balanceAfter, gamePlayId };
  },
});
