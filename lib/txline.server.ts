// TxLINE / TxODDS live adapter (server-only).
//
// The public game runs on the deterministic engine. The moment a TxLINE API
// token is present, this adapter fetches the real World Cup devnet feed and
// maps it into the LiveFeed shape the whole UI already consumes. Getting the
// token is a one-time on-chain step (see scripts/txline-activate.mts):
//
//   TXLINE_MODE=live
//   TXLINE_API_TOKEN=<activated api token>            (X-Api-Token header)
//   TXLINE_API_ORIGIN=https://txline-dev.txodds.com   (devnet)
//
// Auth is a guest-JWT handshake: POST /auth/guest/start -> { token }, then send
// that JWT as `Authorization: Bearer` alongside `X-Api-Token` on every call.
// Docs: TxODDS "Fetching Snapshots" / "Streaming Data".

import type { LiveFeed, LiveMatch, LiveTeam } from "@/lib/live-map";
import { teamFromName } from "@/lib/teams-map";

export function liveConfigured(): boolean {
  return (
    process.env.TXLINE_MODE === "live" &&
    Boolean(process.env.TXLINE_API_TOKEN) &&
    Boolean(process.env.TXLINE_API_ORIGIN)
  );
}

// ---- Raw feed shapes (from the devnet payload probe) ---------------------

interface TxFixture {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  Participant1: string;
  Participant1Id: number;
  Participant2: string;
  Participant2Id: number;
  FixtureId: number;
  Participant1IsHome: boolean;
  GameState?: number | string | null;
}

interface TxOddsRecord {
  FixtureId: number;
  Ts: number;
  Bookmaker: string;
  SuperOddsType: string;
  InRunning: boolean;
  PriceNames: string[];
  Prices: number[];
  Pct?: string[];
}

interface TxScoreRecord {
  FixtureId: number;
  GameState: string | null;
  Action: string;
  Ts: number;
  Seq: number;
  Data?: Record<string, unknown>;
  Stats?: Record<string, unknown>;
}

// ---- Auth: cached guest JWT ----------------------------------------------

let jwtCache: { token: string; exp: number } | null = null;

function decodeExp(jwt: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
    ) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : Date.now() + 10 * 60_000;
  } catch {
    return Date.now() + 10 * 60_000;
  }
}

const TXLINE_TIMEOUT_MS = 3000;

async function guestJwt(origin: string, apiToken: string): Promise<string> {
  const now = Date.now();
  if (jwtCache && now < jwtCache.exp - 60_000) return jwtCache.token;
  const res = await fetch(`${origin}/auth/guest/start`, {
    method: "POST",
    headers: { "X-Api-Token": apiToken, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TXLINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`guest/start -> ${res.status}`);
  const body = (await res.json()) as { token: string };
  jwtCache = { token: body.token, exp: decodeExp(body.token) };
  return body.token;
}

async function txGet<T>(origin: string, jwt: string, apiToken: string, path: string): Promise<T> {
  const res = await fetch(`${origin}${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TXLINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

// ---- Mapping --------------------------------------------------------------

const PRICE_SCALE = 1000; // feed sends decimal odds × 1000 (2374 => 2.374)

/** Pick the 1X2 market from an odds snapshot and orient it to home/away. */
function map1x2(
  records: TxOddsRecord[],
  p1IsHome: boolean,
): { odds: LiveMatch["odds"]; probs: LiveMatch["probs"] } {
  const oneX2 = records
    .filter((r) => r.SuperOddsType === "1X2_PARTICIPANT_RESULT" && r.Prices?.length === 3)
    .sort((a, b) => b.Ts - a.Ts);
  const rec = oneX2.find((r) => r.Bookmaker === "TXLineStablePriceDemargined") ?? oneX2[0];
  if (!rec) return { odds: null, probs: null };

  const [p1, draw, p2] = rec.Prices.map((p) => Math.round((p / PRICE_SCALE) * 100) / 100);
  const pct = rec.Pct?.map((s) => Math.round(parseFloat(s) * 10) / 10);
  const odds = p1IsHome
    ? { home: p1, draw, away: p2 }
    : { home: p2, draw, away: p1 };
  const probs = pct
    ? p1IsHome
      ? { home: pct[0], draw: pct[1], away: pct[2] }
      : { home: pct[2], draw: pct[1], away: pct[0] }
    : null;
  return { odds, probs };
}

/** Latest score record → goals / minute / phase. Tolerant of unknown fields. */
function mapScore(records: TxScoreRecord[]): {
  score: [number, number];
  minute: number;
  phase: string;
  final: boolean;
} {
  const latest = records.slice().sort((a, b) => b.Seq - a.Seq || b.Ts - a.Ts)[0];
  if (!latest) return { score: [0, 0], minute: 0, phase: "BREAK", final: false };
  const d = (latest.Data ?? {}) as Record<string, unknown>;
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
    }
    return 0;
  };
  const home = num("Participant1Score", "HomeScore", "Score1", "score1", "part1");
  const away = num("Participant2Score", "AwayScore", "Score2", "score2", "part2");
  // Minute comes from the feed's match Clock { Running, Seconds }. Trailing
  // heartbeat/coverage records can carry Seconds:0 with the highest Seq, so take
  // the MAX Seconds across all records (the furthest match time) rather than
  // just the newest record. GameState stays "scheduled" mid-match, so the Clock
  // is the authoritative in-play signal.
  let maxSeconds = 0;
  let anyRunning = false;
  for (const r of records) {
    const c = (r as unknown as { Clock?: { Running?: boolean; Seconds?: number } }).Clock;
    if (c && typeof c.Seconds === "number" && c.Seconds > maxSeconds) maxSeconds = c.Seconds;
    if (c?.Running) anyRunning = true;
  }
  const minute = maxSeconds > 0 ? Math.floor(maxSeconds / 60) : num("Minute", "minute", "GameMinute");
  const running = anyRunning;
  const gs = String(latest.GameState ?? "").toLowerCase();
  const final = latest.Action === "game_finalised" || gs === "finished" || gs === "ft";
  const phase = final
    ? "FT"
    : gs === "halftime" || gs === "ht"
      ? "HT"
      : running || minute > 0
        ? "LIVE"
        : "BREAK";
  return { score: [home, away], minute, phase, final };
}

function toLiveTeam(name: string): LiveTeam {
  const t = teamFromName(name);
  return { code: t.code, name: t.name, flag: t.flag };
}

// ---- Warm-instance cache --------------------------------------------------

const FEED_TTL_MS = 4000;
let feedCache: { at: number; value: LiveFeed | null } | null = null;

async function buildFeed(): Promise<LiveFeed | null> {
  if (!liveConfigured()) return null;
  const origin = process.env.TXLINE_API_ORIGIN as string;
  const apiToken = process.env.TXLINE_API_TOKEN as string;

  const jwt = await guestJwt(origin, apiToken);
  const fixtures = await txGet<TxFixture[]>(origin, jwt, apiToken, "/api/fixtures/snapshot");
  if (!Array.isArray(fixtures) || !fixtures.length) return null;

  // Fetch odds + scores for each fixture (bounded, small N on the free tier).
  const matches: LiveMatch[] = [];
  let newestTs = 0;
  for (const fx of fixtures) {
    let odds: LiveMatch["odds"] = null;
    let probs: LiveMatch["probs"] = null;
    let score: [number, number] = [0, 0];
    let minute = 0;
    let phase = "BREAK";
    try {
      const oddsRecs = await txGet<TxOddsRecord[]>(
        origin,
        jwt,
        apiToken,
        `/api/odds/snapshot/${fx.FixtureId}`,
      );
      const mapped = map1x2(oddsRecs ?? [], fx.Participant1IsHome);
      odds = mapped.odds;
      probs = mapped.probs;
    } catch {
      /* no odds for this fixture */
    }
    try {
      const scoreRecs = await txGet<TxScoreRecord[]>(
        origin,
        jwt,
        apiToken,
        `/api/scores/snapshot/${fx.FixtureId}`,
      );
      const s = mapScore(scoreRecs ?? []);
      score = s.score;
      minute = s.minute;
      phase = s.phase;
    } catch {
      /* no scores for this fixture */
    }

    const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
    const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
    newestTs = Math.max(newestTs, fx.Ts || 0);
    matches.push({
      fixtureId: fx.FixtureId,
      home: toLiveTeam(home),
      away: toLiveTeam(away),
      score,
      minute,
      phase,
      competition: fx.Competition,
      odds,
      probs,
      startTime: fx.StartTime,
      updatedAt: Date.now(),
    });
  }

  // Featured = the most compelling REAL match: prefer an in-play World Cup game
  // with odds, then any World Cup game with odds, then any match with odds,
  // then the soonest kickoff. Never fabricate one.
  const withOdds = matches.filter((m) => m.odds);
  const isWC = (m: LiveMatch) => /world cup/i.test(m.competition);
  const inPlay = (m: LiveMatch) => m.phase === "LIVE" || m.phase === "HT";
  const featured =
    withOdds.find((m) => isWC(m) && inPlay(m)) ??
    withOdds.find((m) => isWC(m)) ??
    // A World Cup match stays the marquee even if its odds are momentarily
    // absent this fetch — never drift to a no-odds friendly.
    matches.find((m) => isWC(m)) ??
    withOdds.find((m) => inPlay(m)) ??
    withOdds[0] ??
    matches[0] ??
    null;

  return {
    mode: "live",
    updatedAt: Date.now(),
    featured,
    matches,
  };
}

/** Real live feed for the whole UI. Returns null when unconfigured / upstream down. */
export async function fetchLiveFeed(): Promise<LiveFeed | null> {
  const now = Date.now();
  if (feedCache && now - feedCache.at < FEED_TTL_MS) return feedCache.value;
  try {
    const value = await buildFeed();
    feedCache = { at: now, value };
    return value;
  } catch {
    feedCache = { at: now, value: null };
    return null;
  }
}
