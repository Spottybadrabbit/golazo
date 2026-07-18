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
  return NextResponse.json(
    {
      mode: feed.mode,
      ready: true,
import { currentRound, liveWorld } from "@/lib/engine";
import { fetchLiveMarquee, liveConfigured } from "@/lib/txline.server";

// Server truth endpoint: the same deterministic engine the client runs,
// exposed as JSON. When a TxLINE token is configured (TXLINE_MODE=live), the
// featured England v France marquee is replaced with the real TxODDS feed;
// everything else stays on the simulated engine. See lib/txline.server.ts.
export async function GET() {
  const world = liveWorld();
  let mode: "sim" | "live" = "sim";
  let matches = world.matches;

  if (liveConfigured()) {
    const live = await fetchLiveMarquee();
    if (live) {
      mode = "live";
      matches = [live, ...world.matches.slice(1)];
    }
  }

  return NextResponse.json(
    {
      mode,
      source: mode === "live" ? "TxODDS TxLINE World Cup feed" : "deterministic simulation",
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
