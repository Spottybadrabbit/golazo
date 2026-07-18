import { NextResponse } from "next/server";
import { currentRound, liveWorld } from "@/lib/engine";

// Server truth endpoint: the same deterministic engine the client runs,
// exposed as JSON. A native app, the Telegram bot, or judges can hit this
// directly. Swap in the real TxLINE adapter here for live mode.
export function GET() {
  const world = liveWorld();
  return NextResponse.json(
    {
      mode: process.env.TXLINE_MODE ?? "sim",
      now: world.now,
      nextTickAt: world.nextTickAt,
      round: currentRound(world.now),
      matches: world.matches.map((m) => ({
        fixtureId: m.fixtureId,
        home: m.home,
        away: m.away,
        minute: m.minute,
        phase: m.phase,
        score: m.score,
        stats: m.stats,
        probs: m.probs,
        odds: m.odds,
        pressure: m.pressure,
        sequence: m.sequence,
        events: m.events.slice(-6),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
