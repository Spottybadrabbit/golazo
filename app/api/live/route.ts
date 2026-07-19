import { NextResponse } from "next/server";
import { currentRound, liveWorld } from "@/lib/engine";
import { fetchLiveMarquee } from "@/lib/txline.server";

// Server truth endpoint — LIVE ONLY. The simulator is no longer a fallback for
// the featured match: the marquee comes from the real TxODDS TxLINE feed, and
// if that feed is unavailable (no TXLINE_API_TOKEN / TXLINE_API_ORIGIN, or an
// upstream outage) we return 503 rather than quietly serving simulated data.
// Round timing and the surrounding slate still come from the deterministic
// engine, which is the game clock — not a feed source.
export async function GET() {
  const world = liveWorld();
  const live = await fetchLiveMarquee();

  if (!live) {
    return NextResponse.json(
      {
        mode: "live",
        ready: false,
        detail:
          "TxLINE live feed unavailable. Set TXLINE_MODE=live, TXLINE_API_TOKEN and TXLINE_API_ORIGIN in the environment.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const matches = [live, ...world.matches.slice(1)];
  return NextResponse.json(
    {
      mode: "live",
      ready: true,
      source: "TxODDS TxLINE World Cup feed",
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
