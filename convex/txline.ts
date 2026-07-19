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
  // Named home/away but carry participant1/participant2 values — the poller
  // orients them to display home/away via fixture.homeIsFirst.
  homeGoals: number;
  awayGoals: number;
  minute: number | null;
  statusId: number | null;
  final: boolean;
  running: boolean;
  // Cumulative in-game stats (p1/p2) + the recent notable-event stream.
  stats: { p1: StatLine; p2: StatLine };
  events: TxEvent[];
}

// ---- in-game stats accumulator + event stream (confirmed via live probe) ----
// The scores snapshot carries, per record, a cumulative `Score` accumulator
// ({ Participant1: { Total: { Goals, Corners, YellowCards, RedCards, Shots,
// ShotsOnTarget, Fouls } }, Participant2: {...} }) and an `Action` event
// (goal / yellow_card / corner / shot / free_kick / substitution / injury …)
// with a Clock and a Participant (1|2). Keys are optional (absent → 0). Both
// are p1/p2 — the poller orients to home/away.

export interface StatLine {
  goals: number;
  corners: number;
  shots: number;
  shotsOnTarget: number;
  yellow: number;
  red: number;
  fouls: number;
}

const ZERO_STATS: StatLine = {
  goals: 0,
  corners: 0,
  shots: 0,
  shotsOnTarget: 0,
  yellow: 0,
  red: 0,
  fouls: 0,
};

function statLineFrom(total: any): StatLine {
  const n = (...keys: string[]): number => {
    for (const k of keys) {
      const val = total?.[k];
      if (typeof val === "number") return val;
      if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) return Number(val);
    }
    return 0;
  };
  return {
    goals: n("Goals", "goals"),
    corners: n("Corners", "corners"),
    shots: n("Shots", "shots"),
    shotsOnTarget: n("ShotsOnTarget", "shots_on_target"),
    yellow: n("YellowCards", "yellow_cards"),
    red: n("RedCards", "red_cards"),
    fouls: n("Fouls", "fouls"),
  };
}

/** Cumulative stats: read the richest `Score` accumulator (highest Seq that
 * carries one), ParticipantN.Total. Returns zeros when no accumulator present. */
export function extractStats(records: any[]): { p1: StatLine; p2: StatLine } {
  let best: any = null;
  let bestSeq = -Infinity;
  for (const r of records) {
    const sc = pick(r, "Score", "score");
    if (sc && (sc.Participant1 || sc.Participant2 || sc.participant1 || sc.participant2)) {
      const seq = Number(pick(r, "Seq", "seq") ?? 0);
      if (seq >= bestSeq) {
        bestSeq = seq;
        best = sc;
      }
    }
  }
  if (!best) return { p1: { ...ZERO_STATS }, p2: { ...ZERO_STATS } };
  const p1 = pick(best, "Participant1", "participant1") ?? {};
  const p2 = pick(best, "Participant2", "participant2") ?? {};
  return {
    p1: statLineFrom(pick(p1, "Total", "total") ?? {}),
    p2: statLineFrom(pick(p2, "Total", "total") ?? {}),
  };
}

export interface TxEvent {
  seq: number;
  minute: number;
  action: string;
  participant: 0 | 1 | 2; // 0 = unattributed
  detail: string;
}

const NOTABLE_ACTIONS = new Set([
  "goal",
  "yellow_card",
  "red_card",
  "penalty",
  "corner",
  "shot",
  "free_kick",
  "substitution",
  "injury",
]);

/** The most recent notable match events, oldest→newest by Seq. */
export function extractEvents(records: any[], limit = 14): TxEvent[] {
  const out: TxEvent[] = [];
  for (const r of records) {
    const action = String(pick(r, "Action", "action") ?? "").toLowerCase();
    if (!NOTABLE_ACTIONS.has(action)) continue;
    const c = pick(r, "Clock", "clock");
    const secs =
      typeof c?.Seconds === "number" ? c.Seconds : typeof c?.seconds === "number" ? c.seconds : 0;
    const p = Number(pick(r, "Participant", "participant") ?? 0);
    const data = pick(r, "Data", "data") ?? {};
    const detail = String(pick(data, "Outcome", "outcome", "FreeKickType", "free_kick_type") ?? "");
    out.push({
      seq: Number(pick(r, "Seq", "seq") ?? 0),
      minute: Math.floor(secs / 60),
      action,
      participant: p === 1 || p === 2 ? (p as 1 | 2) : 0,
      detail,
    });
  }
  out.sort((a, b) => a.seq - b.seq);
  return out.slice(-limit);
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

// Best-effort goal extraction. The in-play shape is unconfirmed until kickoff,
// so we cast a wide net: known key names on Data + Stats, then a
// case-insensitive contains scan, then a "1-0"/"1:0" Score/Result string.
function extractGoals(rec: any): { home?: number; away?: number } {
  const data = pick(rec, "Data", "data") ?? {};
  const stats = pick(rec, "Stats", "stats") ?? {};
  const bag: any = { ...stats, ...data };
  let home = numFromData(bag, "Participant1Score", "HomeScore", "Home", "Score1", "score1", "part1", "p1");
  let away = numFromData(bag, "Participant2Score", "AwayScore", "Away", "Score2", "score2", "part2", "p2");
  if (home === undefined && away === undefined) {
    for (const [k, v] of Object.entries(bag)) {
      const key = k.toLowerCase();
      const n =
        typeof v === "number"
          ? v
          : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))
            ? Number(v)
            : undefined;
      if (n === undefined) continue;
      const scoreish = key.includes("score") || key.includes("goal");
      if (scoreish && (key.includes("1") || key.includes("home") || key.includes("part1"))) home = n;
      if (scoreish && (key.includes("2") || key.includes("away") || key.includes("part2"))) away = n;
    }
  }
  if (home === undefined && away === undefined) {
    const s = String(pick(rec, "Score", "score", "Result", "result") ?? "");
    const m = s.match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) return { home: Number(m[1]), away: Number(m[2]) };
  }
  return { home, away };
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
  const stats = pick(rec, "Stats", "stats") ?? {};

  // Goals come from the cumulative `Score` accumulator when the feed provides
  // one (authoritative — a real 0-0 reads as 0-0); otherwise fall back to the
  // wide-net guess. Stats + the notable-event stream ride along.
  const acc = extractStats(records);
  const events = extractEvents(records);
  const hasScoreObj = records.some((r) => pick(r, "Score", "score"));
  const fallback = hasScoreObj ? { home: undefined, away: undefined } : extractGoals(rec);
  const homeGoals = hasScoreObj ? acc.p1.goals : (fallback.home ?? 0);
  const awayGoals = hasScoreObj ? acc.p2.goals : (fallback.away ?? 0);

  // Match minute comes from the feed's Clock: { Running, Seconds } (elapsed match
  // time). Trailing heartbeat/coverage records can carry Seconds:0 with the
  // highest Seq, so take the MAX Seconds across all records. GameState stays
  // "scheduled" mid-match, so the Clock is the authoritative in-play signal.
  let maxSeconds = 0;
  let running = false;
  for (const rr of records) {
    const c = pick(rr, "Clock", "clock");
    const secs = typeof c?.Seconds === "number" ? c.Seconds : typeof c?.seconds === "number" ? c.seconds : 0;
    if (secs > maxSeconds) maxSeconds = secs;
    if (c?.Running ?? c?.running) running = true;
  }
  const minuteFromData = numFromData({ ...stats, ...data }, "Minute", "minute", "GameMinute");
  const minute =
    maxSeconds > 0
      ? Math.floor(maxSeconds / 60)
      : minuteFromData === undefined
        ? null
        : minuteFromData;

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
    running,
    stats: acc,
    events,
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
  // The match Clock is authoritative — GameState can read "scheduled" even while
  // the clock is running, so trust the clock/minute before anything else.
  if (score?.running || (score?.minute ?? 0) > 0) return true;
  if (odds?.inRunning) return true;
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
