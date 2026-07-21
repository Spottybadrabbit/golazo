// Map the Convex `feed.live` payload into the LiveWorld shape the whole UI
// already consumes, so live data flows through the same components as the sim.
// The free World Cup feed gives scores + 1X2 odds (→ win prob) but not
// possession/shots/pressure, so those are marked absent (source: "live") and
// components render "—" rather than fabricating them.

import type { HiLoRound, LiveWorld, MatchPhase, MatchState, SideStats, Team } from "@/lib/engine";

const ROUND_MS = 12_000;

/** A pure 12-second wall-clock Hi-Lo round for the featured match — the real
 * replacement for the deleted simulator's `currentRound()`. Deterministic from
 * the clock alone, so it never drifts or sticks. */
function wallClockRound(featured: MatchState, now: number): HiLoRound {
  const idx = Math.floor(now / ROUND_MS);
  const startedAt = idx * ROUND_MS;
  return {
    id: `w-${featured.fixtureId}-${idx}`,
    fixtureId: featured.fixtureId,
    stat: "WIN",
    statLabel: "win probability",
    question: `${featured.home.name} win probability — higher or lower by the next tick?`,
    lockValue: Math.round(featured.probs.home * 10) / 10,
    unit: "%",
    startedAt,
    endsAt: startedAt + ROUND_MS,
    team: featured.home.code,
  };
}

export interface LiveTeam {
  code: string;
  name: string;
  flag: string;
}
export interface LiveStatLine {
  goals: number;
  corners: number;
  shots: number;
  shotsOnTarget: number;
  yellow: number;
  red: number;
  fouls: number;
}
export interface LiveEvent {
  seq: number;
  minute: number;
  action: string;
  side: "home" | "away" | "";
  detail: string;
}
export interface LiveMatch {
  fixtureId: number;
  home: LiveTeam;
  away: LiveTeam;
  score: [number, number];
  minute: number;
  phase: string;
  competition: string;
  odds: { home: number; draw: number; away: number } | null;
  probs: { home: number; draw: number; away: number } | null;
  /** Cumulative in-game stats, oriented home/away (null until the feed has them). */
  stats?: { home: LiveStatLine; away: LiveStatLine } | null;
  /** Recent notable events (oldest→newest by seq) — PunditBot streams these. */
  events?: LiveEvent[];
  /** Kickoff time (unix ms) — drives day-aware Live/Upcoming/Past bucketing. */
  startTime?: number;
  updatedAt: number;
}
export interface LiveFeed {
  mode: "sim" | "live";
  updatedAt: number;
  featured: LiveMatch | null;
  matches: LiveMatch[];
}

function toTeam(t: LiveTeam): Team {
  return { code: t.code, name: t.name || t.code, flag: t.flag || "🏳️", strength: 0.75 };
}

function sparseStats(): SideStats {
  // absent on the free feed; components read source==="live" to show "—"
  return { shots: 0, onTarget: 0, corners: 0, xg: 0, yellows: 0, reds: 0, possession: 50 };
}

function toPhase(p: string): MatchPhase {
  if (p === "LIVE" || p === "HT" || p === "FT") return p;
  return "BREAK";
}

function toMatchState(m: LiveMatch): MatchState {
  const odds = m.odds ?? { home: 0, draw: 0, away: 0 };
  const probs = m.probs ?? { home: 0, draw: 0, away: 0 };
  return {
    fixtureId: m.fixtureId,
    cycle: 0,
    slot: -1,
    home: toTeam(m.home),
    away: toTeam(m.away),
    minute: m.minute,
    phase: toPhase(m.phase),
    score: m.score,
    stats: [sparseStats(), sparseStats()],
    probs,
    odds,
    pressure: -1, // sentinel: unavailable on live feed
    events: [],
    sequence: 900 + (m.minute || 0),
  };
}

/** Build a LiveWorld from the reactive Convex live feed. This is the ONLY
 * producer of the game world now — the deterministic simulator is gone. */
export function buildLiveWorld(feed: LiveFeed, now: number): LiveWorld {
  const matches = feed.matches.map(toMatchState);
  const featured = feed.featured ? toMatchState(feed.featured) : matches[0];
  const idx = Math.floor(now / ROUND_MS);
  return {
    now,
    matches: matches.length ? matches : featured ? [featured] : [],
    featured,
    nextTickAt: (idx + 1) * ROUND_MS,
    round: featured ? wallClockRound(featured, now) : undefined,
    source: "live",
  };
}

/** True when the live feed is fresh enough to prefer over the simulator.
 *
 * The Convex poller idles at ~45s between writes when nothing is in-play (and a
 * missed poll can stretch a gap toward ~90s), so the staleness cutoff must sit
 * comfortably above that — otherwise the featured pre-match odds would be judged
 * "stale" mid-cycle and the UI would flicker back to the simulator. 3 minutes
 * keeps real data on screen across idle cadence while still yielding if the
 * poller truly dies. */
export function liveIsFresh(feed: LiveFeed | null, now: number): feed is LiveFeed {
  return Boolean(
    feed && feed.mode === "live" && feed.featured && now - feed.updatedAt < 180_000,
  );
}
