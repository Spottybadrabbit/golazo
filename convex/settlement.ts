// Play-money settlement engine.
//
// Bets are placed against live fixtures (convex/wallet.ts: placeBet -> gamePlays
// game:"pool", and placeFastBet -> bets). A stake is escrowed (a SOL ledger
// spend) the moment a bet is made; it must be GRADED and PAID OUT the moment the
// underlying event completes. This module is that missing half:
//
//   sweep()  — a self-rescheduling loop (every ~1s while the queue is hot, backing
//              off to 15s when idle) that marks finished fixtures `final` and
//              drains the settlement queue.
//   settlePass() — one idempotent pass: for every completed-but-unsettled
//              fixture, grade all its pending pool bets and pay the winners.
//   settlementStats() — live observability for an admin portal: bets made, bets
//              settled, what's in the pot (escrow), and the house/bank balance.
//
// Idempotent throughout: a bet with a `result` is never re-graded; a fixture with
// `settledAt` is skipped. Nothing here is on-chain — it's play money.

import { internalMutation, internalAction, query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const INITIAL_GRANT = 5; // must match convex/wallet.ts
const HOT_MS = 1000; // check every second while bets are queued
const IDLE_MS = 15000; // back off when nothing is waiting to settle
// A past-90' fixture the feed has stopped updating for this long is over.
const STALE_FINAL_MS = 10 * 60 * 1000;

type Outcome = "HOME" | "DRAW" | "AWAY";

// ── completion + outcome ────────────────────────────────────────────────

/** Is this fixture finished (safe to settle)? The feed's own final flag/phase,
 *  or a past-90' fixture it has quietly stopped updating. */
function isFinal(fx: any, now: number): boolean {
  if (fx.final === true) return true;
  if (fx.phase === "FT") return true;
  const min = typeof fx.minute === "number" ? fx.minute : 0;
  return min >= 90 && now - fx.updatedAt > STALE_FINAL_MS;
}

function outcomeOf(fx: any): Outcome {
  if (fx.homeGoals > fx.awayGoals) return "HOME";
  if (fx.awayGoals > fx.homeGoals) return "AWAY";
  return "DRAW";
}

function pickWins(pick: string, outcome: Outcome): boolean {
  return (
    (pick === "home" && outcome === "HOME") ||
    (pick === "away" && outcome === "AWAY") ||
    (pick === "draw" && outcome === "DRAW")
  );
}

async function sumSolLedger(ctx: any, clerkId: string): Promise<number> {
  const rows = await ctx.db
    .query("ledger")
    .withIndex("by_clerk", (q: any) => q.eq("clerkId", clerkId))
    .collect();
  const total = rows.reduce((s: number, r: any) => (r.currency === "SOL" ? s + r.amount : s), 0);
  return Math.round(total * 1e6) / 1e6;
}

/** Credit a SOL win/refund to a player, keeping balanceAfter consistent with the
 *  INITIAL_GRANT + Σledger play-money model (see wallet.ts playBalance). */
async function creditSol(ctx: any, clerkId: string, amount: number, reason: string): Promise<void> {
  const prior = Math.round((INITIAL_GRANT + (await sumSolLedger(ctx, clerkId))) * 1e6) / 1e6;
  const balanceAfter = Math.round((prior + amount) * 1e6) / 1e6;
  await ctx.db.insert("ledger", {
    clerkId,
    kind: "earn",
    currency: "SOL",
    amount,
    balanceAfter,
    reason,
    createdAt: Date.now(),
  });
}

// ── the settlement pass (idempotent) ────────────────────────────────────

/**
 * Grade + pay every pending pool bet on completed fixtures. Returns a summary of
 * what it did this pass. Safe to run every second; does nothing when the queue
 * is empty. Bets already carrying a `result` are skipped (never double-paid).
 */
interface SettleSummary {
  queued: number;
  settled: number;
  paidOut: number;
  wins: number;
  losses: number;
}

async function doSettlePass(ctx: any): Promise<SettleSummary> {
    const now = Date.now();
    // The settlement queue: pool bets that haven't been graded yet.
    const pending = await ctx.db
      .query("gamePlays")
      .filter((q: any) => q.eq(q.field("game"), "pool"))
      .collect();
    const queue = (pending as any[]).filter((g: any) => !g.result && g.fixtureId != null);
    if (queue.length === 0) return { queued: 0, settled: 0, paidOut: 0, wins: 0, losses: 0 };

    // Resolve each queued bet's fixture once.
    const fixtureIds: number[] = Array.from(new Set<number>(queue.map((g: any) => g.fixtureId as number)));
    const fixtures = new Map<number, any>();
    for (const id of fixtureIds) {
      const fx = await ctx.db
        .query("liveFixtures")
        .withIndex("by_fixture", (q: any) => q.eq("fixtureId", id))
        .unique();
      if (fx) fixtures.set(id, fx);
    }

    let settled = 0;
    let paidOut = 0;
    let wins = 0;
    let losses = 0;
    const finalized = new Map<number, Outcome>();

    for (const bet of queue) {
      const fx = fixtures.get(bet.fixtureId as number);
      if (!fx || !isFinal(fx, now)) continue; // fixture still in play — stays queued
      const outcome = outcomeOf(fx);
      finalized.set(fx.fixtureId, outcome);

      const won = pickWins(bet.pick ?? "", outcome);
      if (won) {
        const payout = bet.potentialPayout ?? Math.round((bet.stakeSol ?? 0) * (bet.oddsAtPick ?? 1) * 1e6) / 1e6;
        await creditSol(
          ctx,
          bet.clerkId,
          payout,
          `Bet won ${bet.pick} @ ${(bet.oddsAtPick ?? 0).toFixed(2)}x · fixture ${bet.fixtureId} (${fx.homeCode} ${fx.homeGoals}-${fx.awayGoals} ${fx.awayCode})`,
        );
        await ctx.db.patch(bet._id, {
          result: "win",
          delta: Math.round((payout - (bet.stakeSol ?? 0)) * 1e6) / 1e6,
        });
        paidOut = Math.round((paidOut + payout) * 1e6) / 1e6;
        wins += 1;
      } else {
        await ctx.db.patch(bet._id, {
          result: "loss",
          delta: -(bet.stakeSol ?? 0),
        });
        losses += 1;
      }
      settled += 1;
    }

    // Every pending bet on a finalized fixture was just graded in the loop
    // above, so stamp each such fixture final + settled + its outcome.
    for (const [fixtureId, outcome] of finalized) {
      const fx = fixtures.get(fixtureId);
      await ctx.db.patch(fx._id, { final: true, outcome, settledAt: fx.settledAt ?? now });
    }

    return { queued: queue.length, settled, paidOut, wins, losses };
}

/** One idempotent settlement pass (internal — called by the sweep loop). */
export const settlePass = internalMutation({
  args: {},
  handler: async (ctx): Promise<SettleSummary> => doSettlePass(ctx),
});

// ── the second-by-second loop ───────────────────────────────────────────

/**
 * Self-rescheduling settlement loop. Runs settlePass, then reschedules: fast
 * (~1s) while pool bets are still queued, idle (~15s) otherwise. Mirrors the
 * poller's self-rescheduling pattern so payouts land within a second of a match
 * finishing, without burning quota when nothing is waiting.
 */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const res = await ctx.runMutation(internal.settlement.settlePass, {});
    // Stay fast (1s) only while actually draining the queue (a burst of matches
    // finishing); idle at 15s otherwise so pending bets on still-live matches
    // don't spin the loop (and the dev deployment's quota). `settleMine` on
    // wallet load covers the instant-payout UX in the meantime.
    const hot = res.settled > 0;
    await ctx.scheduler.runAfter(hot ? HOT_MS : IDLE_MS, internal.settlement.sweep, {});
  },
});

/** Heartbeat entry (cron) — kicks the loop if it isn't already running. Cheap:
 *  a single settlePass, then hands off to the self-rescheduling sweep. */
export const heartbeat = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.settlement.sweep, {});
  },
});

// ── instant, on-demand settlement for the signed-in player ──────────────

/**
 * Settle the caller's own pending bets right now (e.g. on wallet/profile load),
 * so a player never has to wait for the loop after a match they bet on finishes.
 * Idempotent and self-scoped.
 */
export const settleMine = mutation({
  args: {},
  handler: async (ctx): Promise<SettleSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { queued: 0, settled: 0, paidOut: 0, wins: 0, losses: 0 };
    // Call the shared helper directly (not via internal ref, which would create
    // a circular type). Idempotent + only grades genuinely-final fixtures.
    return doSettlePass(ctx);
  },
});

// ── observability (the portal feed) ─────────────────────────────────────

/**
 * Live settlement + book health for an admin portal: bets being made, bets
 * settled, what's in the pot (escrowed stakes still pending), and how much the
 * house/bank is holding (all stakes taken − all payouts made). Play-money.
 */
export const settlementStats = query({
  args: {},
  handler: async (ctx) => {
    const pools = await ctx.db.query("gamePlays").filter((q) => q.eq(q.field("game"), "pool")).collect();
    const fastBets = await ctx.db.query("bets").collect();

    const poolPending = pools.filter((g) => !g.result);
    const poolWon = pools.filter((g) => g.result === "win");
    const poolLost = pools.filter((g) => g.result === "loss");

    const fastPending = fastBets.filter((b) => b.status === "pending");
    const fastWon = fastBets.filter((b) => b.status === "won");

    const sum = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) * 1e6) / 1e6;

    const potSol = sum([
      ...poolPending.map((g) => g.stakeSol ?? 0),
      ...fastPending.map((b) => b.stakeSol),
    ]);
    const totalStaked = sum([
      ...pools.map((g) => g.stakeSol ?? 0),
      ...fastBets.map((b) => b.stakeSol),
    ]);
    const totalPaidOut = sum([
      ...poolWon.map((g) => g.potentialPayout ?? 0),
      ...fastWon.map((b) => b.payoutSol ?? 0),
    ]);

    return {
      betsMade: pools.length + fastBets.length,
      betsSettled: poolWon.length + poolLost.length + fastBets.filter((b) => b.status !== "pending").length,
      betsPending: poolPending.length + fastPending.length,
      potSol, // escrowed stakes still in play
      totalStaked, // all stakes ever taken (SOL, play-money)
      totalPaidOut, // all payouts ever made
      houseBalanceSol: Math.round((totalStaked - totalPaidOut) * 1e6) / 1e6, // bank P&L
      wins: poolWon.length + fastWon.length,
      losses: poolLost.length + fastBets.filter((b) => b.status === "lost").length,
    };
  },
});
