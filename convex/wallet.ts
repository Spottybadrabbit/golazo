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

/** Starting play-money SOL grant every signed-in player gets, before any
 * ledger history. THE balance the UI shows for betting (see `playBalance`
 * below) — entirely separate from any real on-chain devnet wallet balance. */
const INITIAL_GRANT = 5;

/** Sum of every SOL ledger row's raw `amount` for one clerkId (bets are
 * negative spends, wins/refunds positive earns) — reflects full history
 * regardless of any individual row's `balanceAfter` snapshot. */
async function sumSolLedger(ctx: QueryCtx | MutationCtx, clerkId: string): Promise<number> {
  const rows = await ctx.db
    .query("ledger")
    .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
    .collect();
  const total = rows.reduce((sum, r) => (r.currency === "SOL" ? sum + r.amount : sum), 0);
  return Math.round(total * 1e6) / 1e6;
}

/**
 * The play-money SOL balance the whole UI shows for betting: a fixed initial
 * grant plus every SOL ledger movement ever recorded for the caller. Reactive
 * and independent of any real devnet wallet — nothing here is on-chain.
 */
export const playBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const total = await sumSolLedger(ctx, identity.subject);
    return Math.round((INITIAL_GRANT + total) * 1e6) / 1e6;
  },
});

/** Fixed set of play-money GOAL amounts the top-up screen offers. */
const TOP_UP_AMOUNTS = [50, 100, 250, 500];

/**
 * Credit play-money GOAL to the signed-in player: writes a "promo" ledger
 * row (so it shows up in the bank-balance history) and updates
 * `players.goalPoints` — the balance every other screen reads. Honest
 * play-money only; never touches SOL or anything on-chain.
 */
export const topUp = mutation({
  args: { amount: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!TOP_UP_AMOUNTS.includes(args.amount)) throw new Error("Invalid top-up amount");
    const clerkId = identity.subject;

    const player = await ctx.db
      .query("players")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .unique();
    const prior = player?.goalPoints ?? 0;
    const balanceAfter = prior + args.amount;

    await ctx.db.insert("ledger", {
      clerkId,
      kind: "promo",
      currency: "GOAL",
      amount: args.amount,
      balanceAfter,
      reason: `Play-money top-up · +${args.amount} GOAL`,
      createdAt: Date.now(),
    });

    if (player) {
      await ctx.db.patch(player._id, { goalPoints: balanceAfter, updatedAt: Date.now() });
    }

    return balanceAfter;
  },
});

/**
 * Place a fast (12s) Hi-Lo micro-prediction bet on the live featured match's
 * real win-probability (components/play/FastHiLo.tsx). The stake is the
 * escrow: it's deducted from the play-money balance immediately via a SOL
 * ledger spend, and a `bets` row is opened "pending" until `settleFastBet`
 * resolves it. No real Solana transaction is ever created or signed.
 */
export const placeFastBet = mutation({
  args: {
    fixtureId: v.number(),
    // "home" | "draw" | "away" for win-prob Hi-Lo, or an event-stream stat
    // market for Stat Hi-Lo ("corner_next", "shot_target_next", "card_next",
    // "corners_ou", …). The bets table already stores market as a free string.
    market: v.string(),
    direction: v.union(v.literal("higher"), v.literal("lower")),
    stakeSol: v.number(),
    lockedValue: v.number(),
    multiplier: v.number(),
    roundMs: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!(args.stakeSol > 0)) throw new Error("Stake must be greater than zero");
    const clerkId = identity.subject;

    const balance = Math.round((INITIAL_GRANT + (await sumSolLedger(ctx, clerkId))) * 1e6) / 1e6;
    if (args.stakeSol > balance) throw new Error("Stake exceeds your play-money balance");

    const balanceAfter = Math.round((balance - args.stakeSol) * 1e6) / 1e6;
    await ctx.db.insert("ledger", {
      clerkId,
      kind: "spend",
      currency: "SOL",
      amount: -args.stakeSol,
      balanceAfter,
      reason: `Fast Hi-Lo ${args.direction} ${args.market} · fixture ${args.fixtureId}`,
      createdAt: Date.now(),
    });

    const roundEndsAt = Date.now() + args.roundMs;
    const betId = await ctx.db.insert("bets", {
      clerkId,
      fixtureId: args.fixtureId,
      market: args.market,
      direction: args.direction,
      stakeSol: args.stakeSol,
      lockedValue: args.lockedValue,
      multiplier: args.multiplier,
      status: "pending",
      placedAt: Date.now(),
      roundEndsAt,
    });

    return { betId, roundEndsAt };
  },
});

/**
 * Settle a fast Hi-Lo bet against the market's current live value. Idempotent:
 * a non-pending bet just returns its stored result rather than re-settling.
 * Win credits `stakeSol * multiplier` as a SOL ledger earn; loss forfeits the
 * stake already spent at placement; an exact tie voids the round and refunds
 * the stake via a ledger `refund` earn.
 */
export const settleFastBet = mutation({
  args: {
    betId: v.id("bets"),
    currentValue: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const bet = await ctx.db.get(args.betId);
    if (!bet) throw new Error("Bet not found");
    if (bet.clerkId !== identity.subject) throw new Error("Not your bet");

    if (bet.status !== "pending") {
      return { status: bet.status, payoutSol: bet.payoutSol ?? 0 };
    }

    const clerkId = bet.clerkId;
    const settledAt = Date.now();
    const isVoid = args.currentValue === bet.lockedValue;
    const won =
      !isVoid && (bet.direction === "higher"
        ? args.currentValue > bet.lockedValue
        : args.currentValue < bet.lockedValue);

    if (isVoid) {
      const balance = Math.round((INITIAL_GRANT + (await sumSolLedger(ctx, clerkId))) * 1e6) / 1e6;
      const balanceAfter = Math.round((balance + bet.stakeSol) * 1e6) / 1e6;
      await ctx.db.insert("ledger", {
        clerkId,
        kind: "refund",
        currency: "SOL",
        amount: bet.stakeSol,
        balanceAfter,
        reason: `Fast Hi-Lo void refund · fixture ${bet.fixtureId}`,
        createdAt: settledAt,
      });
      await ctx.db.patch(args.betId, { status: "void", settledAt, payoutSol: 0 });
      return { status: "void" as const, payoutSol: 0 };
    }

    if (won) {
      const payoutSol = Math.round(bet.stakeSol * bet.multiplier * 1e6) / 1e6;
      const balance = Math.round((INITIAL_GRANT + (await sumSolLedger(ctx, clerkId))) * 1e6) / 1e6;
      const balanceAfter = Math.round((balance + payoutSol) * 1e6) / 1e6;
      await ctx.db.insert("ledger", {
        clerkId,
        kind: "earn",
        currency: "SOL",
        amount: payoutSol,
        balanceAfter,
        reason: `Fast Hi-Lo win ${bet.direction} ${bet.market} · fixture ${bet.fixtureId}`,
        createdAt: settledAt,
      });
      await ctx.db.patch(args.betId, { status: "won", settledAt, payoutSol });
      return { status: "won" as const, payoutSol };
    }

    await ctx.db.patch(args.betId, { status: "lost", settledAt, payoutSol: 0 });
    return { status: "lost" as const, payoutSol: 0 };
  },
});

/** The signed-in player's recent fast Hi-Lo bets, newest first. */
export const myBets = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("bets")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .order("desc")
      .take(20);
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
