import { NextResponse } from "next/server";
import { liveWorld } from "@/lib/engine";

// Idempotent PAYOUT RECONCILIATION pass (play-money).
//
// Vercel Cron hits this route every minute (see vercel.json). It is the
// idempotent reconciliation entry point: it settles finished fixtures against
// the deterministic engine and returns the computed settlement. Because it
// derives everything from the finished fixture state, recomputing the same
// finished fixtures always yields the same result — there is no incrementing
// and no fund movement, so it is safe to run repeatedly.
//
// SEAM — real per-user payouts (not wired here): once the live feed + user
// store are provisioned in Convex, this route is where finished fixtures get
// settled into real balances — award GOAL points to the users who called the
// outcome correctly, marking each fixture settled so it is only paid once.
// That step needs the Convex user store (per-user positions/balances) which is
// not available in this environment yet, so this pass stays play-money: it
// computes the deterministic settlement and reports it without touching funds.

export const maxDuration = 60;
export const runtime = "nodejs";

// Demo play-money stake used only to illustrate the payout math. Nothing here
// moves real funds; this is a reconciliation report, not a ledger write.
const DEMO_STAKE = 100; // play-money GOAL points per correct call

// Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
// If it is set we require a matching header (else 401). If it is not set
// (local/dev) we allow the request so it stays testable, but flag secured:false.
function authorize(request: Request): { ok: boolean; secured: boolean } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true, secured: false };
  const header = request.headers.get("authorization");
  return { ok: header === `Bearer ${secret}`, secured: true };
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const world = liveWorld();

  // Settle every finished (full-time) fixture. Pure recompute — deterministic
  // and idempotent, so the same FT fixtures always settle to the same values.
  const settled = world.matches
    .filter((m) => m.phase === "FT")
    .map((m) => {
      const [home, away] = m.score;
      const result: "HOME" | "AWAY" | "DRAW" =
        home > away ? "HOME" : home < away ? "AWAY" : "DRAW";
      // Demo payout rate: winners of the featured 1X2 market receive
      // `odds * stake`. Play-money only — no real balances are touched.
      const payoutRate =
        result === "HOME" ? m.odds.home : result === "AWAY" ? m.odds.away : m.odds.draw;
      return {
        fixtureId: m.fixtureId,
        result,
        score: m.score,
        market: "featured 1X2",
        payoutRate,
        demoStake: DEMO_STAKE,
        demoPayout: Math.round(payoutRate * DEMO_STAKE),
      };
    });

  return NextResponse.json(
    {
      ok: true,
      secured: auth.secured,
      ranAt: new Date(world.now).toISOString(),
      settled,
      note: "play-money reconciliation; real payouts require live settlement + user store",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
