import { NextResponse } from "next/server";
import { currentRound } from "@/lib/engine";
import { getFeed } from "@/lib/feed/adapter";

// Server truth endpoint. The feed adapter (lib/feed/adapter) decides whether
// this world comes from the deterministic simulator or the real TxODDS TxLINE
// devnet feed, keyed on TXLINE_MODE=live. The ENG v FRA marquee (engine.ts) and
// the Hi-Lo round timing stay simulator-driven either way; only the underlying
// MatchState data source swaps. See lib/feed/* for the adapter layer.
export const dynamic = "force-dynamic";

export async function GET() {
  const feed = getFeed();
  const headers = { "Cache-Control": "no-store" };

  if (feed.mode === "live" && !feed.ready) {
    // Live requested but the TxLINE pipeline isn't serving yet: say so honestly
    // (503 + reason) rather than faking it. The client keeps polling.
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
