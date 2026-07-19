import { NextResponse } from "next/server";
import { currentRound } from "@/lib/engine";
import { getFeed } from "@/lib/feed/adapter";

// Server truth endpoint: the same deterministic engine the client runs,
// exposed as JSON. The active feed is chosen by TXLINE_MODE (see
// lib/feed/adapter.ts): the deterministic simulator by default, or the real
// TxODDS TxLINE feed when TXLINE_MODE=live. When the live feed isn't ready
// yet we return 503 with `ready: false` so clients keep showing their last
// known world instead of switching to a half-loaded one.
export const dynamic = "force-dynamic";

export async function GET() {
  const feed = getFeed();
  const headers = { "Cache-Control": "no-store" };

  if (feed.mode === "live" && !feed.ready) {
    return NextResponse.json(
      { mode: feed.mode, ready: false, detail: feed.detail },
      { status: 503, headers },
    );
  }

  const world = await feed.getWorld();
  return NextResponse.json(
    {
      mode: feed.mode,
      ready: true,
      source:
        feed.mode === "live"
          ? "TxODDS TxLINE World Cup feed"
          : "deterministic simulation",
      now: world.now,
      nextTickAt: world.nextTickAt,
      marquee: "ENG v FRA",
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
    { headers },
  );
}
