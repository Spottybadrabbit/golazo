// TxODDS / TxLINE devnet fetch client (Convex-side, plain fetch, no anchor).
//
// Auth per the docs: a short-lived guest JWT from POST /auth/guest/start plus
// the activated X-Api-Token. The JWT is cached to its own `exp` and renewed
// only near expiry (not per request), so a 1-2s poll does not mint a token
// every tick.
//
// PROBE NOTES — confirmed via live devnet probe:
//   • 1X2 market   — SuperOddsType === "1X2_PARTICIPANT_RESULT", Prices.length
//                    === 3, PriceNames ["part1","draw","part2"]; prefer
//                    bookmaker "TXLineStablePriceDemargined", latest by Ts.
//   • PRICE_SCALE  — Prices are decimal odds x1000 (2374 => 2.374).
//   • GOAL_STAT_KEYS / STATUS_FINAL — still unconfirmed guesses for the score
//                    snapshot's in-play stat encoding (see
//                    /documentation/scores/soccer-feed); mapScore falls back
//                    to 0 / null defensively.
//   • IN_PLAY      — `in_running` on odds is the primary signal; GameState
//                    1=scheduled, 6=cancelled.

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
// Confirmed via live probe: the 1X2 market is SuperOddsType ===
// "1X2_PARTICIPANT_RESULT" with Prices.length === 3, PriceNames
// ["part1","draw","part2"], Prices = decimal odds x1000, Pct = already
// de-vigged implied win% (strings, sum ~100). Prefer the demargined
// bookmaker; take the latest by Ts.
const PRICE_SCALE = 1000; // feed sends decimal odds x1000 (2374 => 2.374)
const PREFERRED_BOOKMAKER = "TXLineStablePriceDemargined";

export interface TxOdds {
  home: number;
  draw: number;
  away: number;
  inRunning: boolean;
  // de-vigged implied win% (percent), oriented the SAME way as home/draw/away
  // (i.e. still raw part1/draw/part2 here — the poller orients both together)
  pct: { home: number; draw: number; away: number } | null;
}

function decodePrice(raw: number): number {
  const v = raw / PRICE_SCALE;
  return v >= 1.01 ? Math.round(v * 100) / 100 : raw; // guard if encoding differs
}

export function mapOdds(entries: any): TxOdds | null {
  const arr: any[] = Array.isArray(entries)
    ? entries
    : (pick(entries, "odds", "Odds", "data") ?? [entries]);
  // only the 1X2 market; latest by Ts; prefer the demargined bookmaker
  const oneX2 = arr
    .filter((o) => {
      const type = String(pick(o, "super_odds_type", "SuperOddsType") ?? "");
      const prices: any[] = pick(o, "prices", "Prices") ?? [];
      return type === "1X2_PARTICIPANT_RESULT" && prices.length === 3;
    })
    .sort(
      (a, b) => Number(pick(b, "ts", "Ts") ?? 0) - Number(pick(a, "ts", "Ts") ?? 0),
    );
  const match =
    oneX2.find((o) => String(pick(o, "bookmaker", "Bookmaker") ?? "") === PREFERRED_BOOKMAKER) ??
    oneX2[0];
  if (!match) return null;

  const prices: number[] = (pick(match, "prices", "Prices") ?? []).map((n: any) => Number(n));
  const pctRaw: string[] | undefined = pick(match, "pct", "Pct");
  const pct = pctRaw
    ? {
        home: Math.round(parseFloat(pctRaw[0]) * 10) / 10,
        draw: Math.round(parseFloat(pctRaw[1]) * 10) / 10,
        away: Math.round(parseFloat(pctRaw[2]) * 10) / 10,
      }
    : null;

  return {
    home: decodePrice(prices[0]),
    draw: decodePrice(prices[1]),
    away: decodePrice(prices[2]),
    inRunning: Boolean(pick(match, "in_running", "InRunning")),
    pct,
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
// Confirmed via live probe: an array of records, latest by Seq then Ts. The
// pre-match record looks like { GameState:"scheduled", Action:"coverage_update",
// Seq:0, Data:{}, Stats:{} }. In-play goal/minute fields are unconfirmed until
// kickoff, so read defensively from `Data` (tolerant key names) and default to
// 0 / null rather than throwing. final = Action==="game_finalised" or
// GameState is "finished"/"ft".

export interface TxScore {
  homeGoals: number;
  awayGoals: number;
  minute: number | null;
  statusId: number | null;
  final: boolean;
}

// Tolerant numeric read from the score record's `Data` object; returns
// undefined (not 0) when none of the keys are present, so callers can pick
// their own default (0 for goals, null for minute).
function numFromData(data: any, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const val = data?.[k];
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) return Number(val);
  }
  return undefined;
}

export function mapScore(raw: any): TxScore {
  // score snapshot is an array of records; take the latest by Seq, then Ts.
  const records: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rec =
    records
      .slice()
      .sort(
        (a, b) =>
          Number(pick(b, "Seq", "seq") ?? 0) - Number(pick(a, "Seq", "seq") ?? 0) ||
          Number(pick(b, "Ts", "ts") ?? 0) - Number(pick(a, "Ts", "ts") ?? 0),
      )[0] ?? {};

  const data = pick(rec, "Data", "data") ?? {};
  const homeGoals = numFromData(data, "Participant1Score", "HomeScore", "Score1", "score1", "part1") ?? 0;
  const awayGoals = numFromData(data, "Participant2Score", "AwayScore", "Score2", "score2", "part2") ?? 0;
  const minuteRaw = numFromData(data, "Minute", "minute", "GameMinute", "clock");
  const minute = minuteRaw === undefined ? null : minuteRaw;

  const statusId = pick(rec, "StatusId", "statusId", "status");
  const action = String(pick(rec, "Action", "action") ?? "");
  const gs = String(pick(rec, "GameState", "game_state") ?? "").toLowerCase();
  const final = action === "game_finalised" || gs === "finished" || gs === "ft";

  return {
    homeGoals,
    awayGoals,
    minute,
    statusId: statusId === undefined ? null : Number(statusId),
    final,
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
