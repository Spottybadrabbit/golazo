import { NextResponse } from "next/server";
import { currentRound } from "@/lib/engine";
import { getFeed } from "@/lib/feed/adapter";

// Server truth endpoint: the same deterministic engine the client runs,
// exposed as JSON. A native app, the Telegram bot, or judges can hit this
// directly. TXLINE_MODE=live swaps the simulator for the real TxLINE feed
// via lib/feed/adapter.ts; Hi-Lo round timing stays simulator-driven either way.
export async function GET() {
  const feed = getFeed();
  if (feed.mode === "live" && !feed.ready) {
    return NextResponse.json(
      { mode: feed.mode, ready: false, detail: feed.detail },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const world = await feed.getWorld();
  const matches = world.matches;
  return NextResponse.json(
    {
      mode: feed.mode,
      ready: true,
      source: feed.mode === "live" ? "TxODDS TxLINE World Cup feed" : "deterministic simulation",
      now: world.now,
      nextTickAt: world.nextTickAt,
      marquee: "ENG v FRA",
      round: currentRound(world.now),
      matches: matches.map((m) => ({
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
