import { NextResponse } from "next/server";
import { currentRound, liveWorld } from "@/lib/engine";
import { fetchLiveFeed } from "@/lib/txline.server";

// Server truth endpoint. The featured match comes from the real TxODDS TxLINE
// devnet feed; if that feed is unavailable (no token/origin, or upstream is
// down) we report mode:"sim" and let the surrounding deterministic slate carry
// the demo — the app never freezes. Round timing comes from the engine (it's
// the game clock, not a feed source).
export async function GET() {
  const world = liveWorld();
  const feed = await fetchLiveFeed();
  const live = feed?.featured ?? null;

  if (!live) {
    return NextResponse.json(
      {
        mode: "sim",
        ready: false,
        detail:
          "TxLINE live feed unavailable — running on the deterministic engine. Set TXLINE_MODE=live, TXLINE_API_TOKEN and TXLINE_API_ORIGIN to go live.",
        now: world.now,
        marquee: `${world.featured.home.code} v ${world.featured.away.code}`,
        round: currentRound(world.now),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      mode: "live",
      ready: true,
      source: "TxODDS TxLINE World Cup feed (devnet)",
      now: world.now,
      nextTickAt: world.nextTickAt,
      marquee: `${live.home.code} v ${live.away.code}`,
      competition: live.competition,
      round: currentRound(world.now),
      featured: live,
      matches: feed?.matches ?? [live],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
