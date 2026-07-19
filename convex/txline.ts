// TxODDS / TxLINE devnet fetch client (Convex-side, plain fetch, no anchor).
//
// Auth per the docs: a short-lived guest JWT from POST /auth/guest/start plus
// the activated X-Api-Token. The JWT is cached to its own `exp` and renewed
// only near expiry (not per request), so a 1-2s poll does not mint a token
// every tick.
//
// PROBE NOTES — confirm with `npm run txline:probe` against a live fixture,
// then tighten the constants below (structure is correct; encodings are the
// only guesses):
//   • ODDS_MARKET_HINT — which `super_odds_type` is the 1X2 / match-odds market.
//   • PRICE_SCALE      — integer encoding of `prices` (assumed decimal odds x1000).
//   • GOAL_STAT_KEYS   — the ScoreStat `key`s for home/away goals and minute
//                        (see /documentation/scores/soccer-feed).
//   • IN_PLAY          — `in_running` on odds is the primary signal; GameState
//                        1=scheduled, 6=cancelled.

const ORIGIN = () => process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
const TOKEN = () => process.env.TXLINE_API_TOKEN ?? "";

// ---- guest JWT cache ----
let cachedJwt: { token: string; exp: number } | null = null;

function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function guestJwt(): Promise<string> {
  const now = Date.now();
  if (cachedJwt && cachedJwt.exp - now > 30_000) return cachedJwt.token;
  const r = await fetch(`${ORIGIN()}/auth/guest/start`, { method: "POST" });
  if (!r.ok) throw new Error(`guest/start -> ${r.status}`);
  const j = (await r.json()) as { token: string };
  const exp = jwtExp(j.token) || now + 5 * 60_000; // fall back to 5 min
  cachedJwt = { token: j.token, exp };
  return j.token;
}

async function txGet<T>(path: string): Promise<T> {
  const jwt = await guestJwt();
  const r = await fetch(`${ORIGIN()}/api${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": TOKEN(),
      Accept: "application/json",
    },
  });
  if (r.status === 401 || r.status === 403) {
    cachedJwt = null; // force JWT renewal next call
    throw new Error(`TxLINE ${path} -> ${r.status} (auth)`);
  }
  if (!r.ok) throw new Error(`TxLINE ${path} -> ${r.status}`);
  return (await r.json()) as T;
}

// tolerant field access (feed mixes PascalCase and snake_case)
/* eslint-disable @typescript-eslint/no-explicit-any */
const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null) return o[k];
  return undefined;
};

// ---- fixtures ----
export interface TxFixture {
  fixtureId: number;
  home: string;
  away: string;
  homeIsFirst: boolean;
  startTime: number;
  gameState: number | null;
  competition: string;
}

export function mapFixture(f: any): TxFixture {
  const p1IsHome = Boolean(pick(f, "Participant1IsHome", "participant1_is_home") ?? true);
  return {
    fixtureId: Number(pick(f, "FixtureId", "fixture_id", "fixtureId", "id")),
    home: String(pick(f, "Participant1", "participant1") ?? "HOME"),
    away: String(pick(f, "Participant2", "participant2") ?? "AWAY"),
    homeIsFirst: p1IsHome,
    startTime: Number(pick(f, "StartTime", "start_time") ?? Date.now()),
    gameState: (() => {
      const g = pick(f, "GameState", "game_state");
      return g === undefined || g === null ? null : Number(g);
    })(),
    competition: String(pick(f, "Competition", "competition") ?? ""),
  };
}

export async function fetchFixtures(): Promise<TxFixture[]> {
  const raw = await txGet<any>("/fixtures/snapshot");
  const list = Array.isArray(raw) ? raw : (pick(raw, "fixtures", "Fixtures", "data") ?? []);
  return (list as any[]).map(mapFixture).filter((f) => Number.isFinite(f.fixtureId));
}

// ---- odds ----
const ODDS_MARKET_HINT = /match|1x2|full.?time|winner/i; // confirm via probe
const PRICE_SCALE = 1000; // assume decimal odds x1000; confirm via probe

export interface TxOdds {
  home: number;
  draw: number;
  away: number;
  inRunning: boolean;
}

function decodePrice(raw: number): number {
  const v = raw / PRICE_SCALE;
  return v >= 1.01 ? Math.round(v * 100) / 100 : raw; // guard if encoding differs
}

export function mapOdds(entries: any): TxOdds | null {
  const arr: any[] = Array.isArray(entries)
    ? entries
    : (pick(entries, "odds", "Odds", "data") ?? [entries]);
  // prefer an in-running match-odds market, else any 3-way market
  const three = arr.filter((o) => {
    const names: string[] = pick(o, "price_names", "PriceNames", "priceNames") ?? [];
    return names.length === 3;
  });
  const match =
    three.find((o) => ODDS_MARKET_HINT.test(String(pick(o, "super_odds_type", "SuperOddsType") ?? ""))) ??
    three.find((o) => Boolean(pick(o, "in_running", "InRunning"))) ??
    three[0];
  if (!match) return null;
  const names: string[] = (pick(match, "price_names", "PriceNames", "priceNames") ?? []).map((s: any) =>
    String(s).toLowerCase(),
  );
  const prices: number[] = (pick(match, "prices", "Prices") ?? []).map((n: any) => Number(n));
  const idx = (want: string[], pos: number) => {
    const i = names.findIndex((n) => want.some((w) => n.includes(w)));
    return i >= 0 ? i : pos;
  };
  return {
    home: decodePrice(prices[idx(["home", "1"], 0)]),
    draw: decodePrice(prices[idx(["draw", "x"], 1)]),
    away: decodePrice(prices[idx(["away", "2"], 2)]),
    inRunning: Boolean(pick(match, "in_running", "InRunning")),
  };
}

export async function fetchOdds(fixtureId: number): Promise<TxOdds | null> {
  try {
    const raw = await txGet<any>(`/odds/snapshot/${fixtureId}`);
    return mapOdds(raw);
  } catch {
    return null;
  }
}

// ---- scores ----
// Confirm the exact goal/minute stat keys via probe + the Soccer Feed doc.
const GOAL_STAT_KEYS = { home: [1001, 1], away: [1002, 2], minute: [1000, 3] };
const STATUS_FINAL = 100;

export interface TxScore {
  homeGoals: number;
  awayGoals: number;
  minute: number | null;
  statusId: number | null;
  final: boolean;
}

function statByKey(stats: any[], keys: number[]): number | undefined {
  for (const k of keys) {
    const s = stats.find((x) => Number(pick(x, "key", "Key", "statKey")) === k);
    if (s) return Number(pick(s, "value", "Value"));
  }
  return undefined;
}

export function mapScore(raw: any): TxScore {
  // score snapshot may be an array of records or a summary object
  const rec = Array.isArray(raw) ? raw[raw.length - 1] ?? {} : raw ?? {};
  const stats: any[] = pick(rec, "stats", "Stats", "scoreStats", "ScoreStats") ?? [];
  const directHome = pick(rec, "HomeScore", "homeScore", "scoreHome");
  const directAway = pick(rec, "AwayScore", "awayScore", "scoreAway");
  const statusId = pick(rec, "StatusId", "statusId", "status");
  const action = String(pick(rec, "action", "Action") ?? "");
  return {
    homeGoals: Number(directHome ?? statByKey(stats, GOAL_STAT_KEYS.home) ?? 0),
    awayGoals: Number(directAway ?? statByKey(stats, GOAL_STAT_KEYS.away) ?? 0),
    minute: (() => {
      const m = pick(rec, "Minute", "minute") ?? statByKey(stats, GOAL_STAT_KEYS.minute);
      return m === undefined ? null : Number(m);
    })(),
    statusId: statusId === undefined ? null : Number(statusId),
    final: action === "game_finalised" || Number(statusId) === STATUS_FINAL,
  };
}

export async function fetchScore(fixtureId: number): Promise<TxScore | null> {
  try {
    const raw = await txGet<any>(`/scores/snapshot/${fixtureId}?asOf=${Date.now()}`);
    return mapScore(raw);
  } catch {
    return null;
  }
}

// ---- in-play detection ----
export function isInPlay(fx: TxFixture, odds: TxOdds | null, score: TxScore | null): boolean {
  if (score?.final) return false;
  if (odds?.inRunning) return true;
  if (fx.gameState === 1 || fx.gameState === 6) return false; // scheduled / cancelled
  if (score && (score.minute ?? 0) > 0 && !score.final) return true;
  return false;
}

// de-vig 1X2 decimal odds into normalized win probabilities (percent)
export function impliedProbs(o: TxOdds) {
  const raw = { h: 1 / o.home, d: 1 / o.draw, a: 1 / o.away };
  const sum = raw.h + raw.d + raw.a || 1;
  return {
    home: Math.round((raw.h / sum) * 1000) / 10,
    draw: Math.round((raw.d / sum) * 1000) / 10,
    away: Math.round((raw.a / sum) * 1000) / 10,
  };
}
