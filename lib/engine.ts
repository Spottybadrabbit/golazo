// GOLAZO deterministic match engine.
// Simulates a TxLINE-style World Cup feed: seeded PRNG keyed on wall-clock
// windows, so server and every client independently compute the identical
// "live" world. Swap `TXLINE_MODE=live` + a real feed adapter to go live.

export const TICK_MS = 12_000; // one feed snapshot every 12s
export const MATCH_TICKS = 90; // 1 tick = 1 match minute
export const BREAK_TICKS = 10; // full-time interlude between fixtures
export const CYCLE_TICKS = MATCH_TICKS + BREAK_TICKS;
export const CYCLE_MS = CYCLE_TICKS * TICK_MS;
export const ROUND_TICKS = 2; // one Hi-Lo round = 2 ticks (24s)
const EPOCH = 1_750_000_000_000;

export interface Team {
  code: string;
  name: string;
  flag: string;
  strength: number;
}

export const TEAMS: Team[] = [
  { code: "ARG", name: "Argentina", flag: "🇦🇷", strength: 0.92 },
  { code: "FRA", name: "France", flag: "🇫🇷", strength: 0.9 },
  { code: "BRA", name: "Brazil", flag: "🇧🇷", strength: 0.88 },
  { code: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", strength: 0.86 },
  { code: "ESP", name: "Spain", flag: "🇪🇸", strength: 0.87 },
  { code: "GER", name: "Germany", flag: "🇩🇪", strength: 0.82 },
  { code: "POR", name: "Portugal", flag: "🇵🇹", strength: 0.83 },
  { code: "NED", name: "Netherlands", flag: "🇳🇱", strength: 0.8 },
  { code: "USA", name: "United States", flag: "🇺🇸", strength: 0.72 },
  { code: "MEX", name: "Mexico", flag: "🇲🇽", strength: 0.7 },
  { code: "JPN", name: "Japan", flag: "🇯🇵", strength: 0.74 },
  { code: "MAR", name: "Morocco", flag: "🇲🇦", strength: 0.78 },
  { code: "CRO", name: "Croatia", flag: "🇭🇷", strength: 0.79 },
  { code: "URU", name: "Uruguay", flag: "🇺🇾", strength: 0.76 },
  { code: "COL", name: "Colombia", flag: "🇨🇴", strength: 0.75 },
  { code: "SEN", name: "Senegal", flag: "🇸🇳", strength: 0.71 },
];

// ---------- seeded PRNG ----------

function hash(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ Math.floor(p), 0x85ebca6b);
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- types ----------

export type MatchPhase = "LIVE" | "HT" | "FT" | "BREAK";

export interface SideStats {
  shots: number;
  onTarget: number;
  corners: number;
  xg: number;
  yellows: number;
  reds: number;
  possession: number;
}

export interface MatchEvent {
  minute: number;
  type: "GOAL" | "YELLOW" | "RED" | "STEAM" | "KICKOFF" | "HT" | "FT";
  side: 0 | 1 | -1;
  detail: string;
}

export interface MatchState {
  fixtureId: number;
  cycle: number;
  slot: number;
  home: Team;
  away: Team;
  minute: number;
  phase: MatchPhase;
  score: [number, number];
  stats: [SideStats, SideStats];
  probs: { home: number; draw: number; away: number };
  odds: { home: number; draw: number; away: number };
  pressure: number; // 0-100 attack pressure index
  events: MatchEvent[];
  sequence: number; // TxLINE-style sequence number for the latest snapshot
}

// ---------- fixture selection ----------

// The marquee slot is always England v France, so it anchors the live demo
// card, the Hi-Lo game, PunditBot, and the Match Centre. Every function that
// simulates this slot resolves the same fixture, keeping the game consistent.
export const MARQUEE_SLOT = 2;
export const MARQUEE = ["ENG", "FRA"] as const;

function fixtureTeams(cycle: number, slot: number): [Team, Team] {
  if (slot === MARQUEE_SLOT) return [team(MARQUEE[0]), team(MARQUEE[1])];
  const r = mulberry32(hash(cycle, slot, 7));
  const a = Math.floor(r() * TEAMS.length);
  let b = Math.floor(r() * (TEAMS.length - 1));
  if (b >= a) b += 1;
  return [TEAMS[a], TEAMS[b]];
}

export function team(code: string): Team {
  return TEAMS.find((t) => t.code === code) ?? TEAMS[0];
}

// ---------- core simulation ----------

function emptyStats(): SideStats {
  return { shots: 0, onTarget: 0, corners: 0, xg: 0, yellows: 0, reds: 0, possession: 50 };
}

/** Pure simulation of one fixture up to a given tick (0..CYCLE_TICKS). */
export function simulate(
  cycle: number,
  slot: number,
  upToTick: number,
  forced?: [Team, Team],
): MatchState {
  const [home, away] = forced ?? fixtureTeams(cycle, slot);
  const diff = home.strength - away.strength;
  const score: [number, number] = [0, 0];
  const stats: [SideStats, SideStats] = [emptyStats(), emptyStats()];
  const events: MatchEvent[] = [];
  let possession = 50 + diff * 24;
  let probNoise = 0;

  const matchTick = Math.min(upToTick, MATCH_TICKS);
  events.push({ minute: 0, type: "KICKOFF", side: -1, detail: "Kickoff" });
  const recentShots: number[] = [];
  let recentXg = 0;

  for (let t = 1; t <= matchTick; t++) {
    const r = mulberry32(hash(cycle, slot, t, 11));
    // possession random walk
    possession = Math.max(28, Math.min(72, possession + (r() - 0.5) * 4 + diff * 0.35));
    stats[0].possession = Math.round(possession);
    stats[1].possession = 100 - stats[0].possession;

    for (const side of [0, 1] as const) {
      const st = home.strength * (side === 0 ? 1 : 0);
      const s = side === 0 ? home.strength : away.strength;
      const attack = s * (side === 0 ? possession : 100 - possession) * 0.011;
      if (r() < attack * 0.38) {
        stats[side].shots += 1;
        recentShots.push(t);
        const q = 0.04 + r() * 0.34;
        stats[side].xg += q;
        recentXg += q;
        if (r() < 0.42) stats[side].onTarget += 1;
        // goal chance proportional to shot quality
        if (r() < q * 0.32) {
          score[side] += 1;
          events.push({
            minute: t,
            type: "GOAL",
            side,
            detail: `${side === 0 ? home.code : away.code} score, ${score[0]}-${score[1]}`,
          });
        }
      }
      if (r() < 0.075) stats[side].corners += 1;
      if (r() < 0.011) {
        stats[side].yellows += 1;
        events.push({ minute: t, type: "YELLOW", side, detail: "Booking" });
      }
      if (r() < 0.0012) {
        stats[side].reds += 1;
        events.push({ minute: t, type: "RED", side, detail: "Sent off" });
      }
      void st;
    }
    // occasional unexplained steam move in the market
    if (r() < 0.012) {
      const dir = r() < 0.5 ? 1 : -1;
      probNoise += dir * (5 + r() * 5);
      events.push({
        minute: t,
        type: "STEAM",
        side: dir > 0 ? 0 : 1,
        detail: "Sharp market move",
      });
    }
    probNoise *= 0.92; // decay back toward model price
    if (t === 45) events.push({ minute: 45, type: "HT", side: -1, detail: "Halftime" });
  }
  if (upToTick >= MATCH_TICKS) {
    events.push({ minute: 90, type: "FT", side: -1, detail: "Full time" });
  }

  // win probabilities: logistic on strength diff + score diff + time remaining
  const minutesLeft = Math.max(0, MATCH_TICKS - matchTick);
  const scoreDiff = score[0] - score[1];
  const x = diff * 2.1 + scoreDiff * (1.4 + (1 - minutesLeft / 90) * 2.6) + probNoise / 28;
  const pHomeRaw = 1 / (1 + Math.exp(-x));
  const drawWeight = Math.max(0.1, 0.3 - Math.abs(scoreDiff) * 0.08) * (0.55 + minutesLeft / 180);
  let pHome = pHomeRaw * (1 - drawWeight);
  let pAway = (1 - pHomeRaw) * (1 - drawWeight);
  let pDraw = drawWeight;
  if (upToTick >= MATCH_TICKS) {
    pHome = scoreDiff > 0 ? 1 : 0;
    pAway = scoreDiff < 0 ? 1 : 0;
    pDraw = scoreDiff === 0 ? 1 : 0;
  }
  const margin = 1.06; // bookmaker overround
  const odds = {
    home: Math.max(1.01, Math.round((1 / Math.max(0.01, pHome)) * (1 / margin) * 100) / 100),
    draw: Math.max(1.01, Math.round((1 / Math.max(0.01, pDraw)) * (1 / margin) * 100) / 100),
    away: Math.max(1.01, Math.round((1 / Math.max(0.01, pAway)) * (1 / margin) * 100) / 100),
  };

  // pressure index from the last ~8 minutes of attacking output
  const rp = mulberry32(hash(cycle, slot, matchTick, 23));
  const windowShots = recentShots.filter((t) => t > matchTick - 8).length;
  const pressure = Math.max(
    4,
    Math.min(
      97,
      Math.round(12 + windowShots * 14 + Math.min(1, recentXg / 4) * 12 + rp() * 22),
    ),
  );

  const phase: MatchPhase =
    upToTick >= MATCH_TICKS ? (upToTick >= MATCH_TICKS + 2 ? "BREAK" : "FT") : "LIVE";

  return {
    fixtureId: 18_170_000 + cycle * 10 + slot,
    cycle,
    slot,
    home,
    away,
    minute: matchTick,
    phase,
    score,
    stats,
    probs: {
      home: Math.round(pHome * 1000) / 10,
      draw: Math.round(pDraw * 1000) / 10,
      away: Math.round(pAway * 1000) / 10,
    },
    odds,
    pressure,
    events,
    sequence: 900 + upToTick,
  };
}

// ---------- live world ----------

export interface LiveWorld {
  now: number;
  matches: MatchState[];
  featured: MatchState;
  nextTickAt: number;
  /** Which feed produced this world: the deterministic sim (`liveWorld()`) or
   * the real TxLINE live feed (lib/feed/txline-client). Optional so consumers
   * that reconstruct a LiveWorld from JSON don't have to set it. */
  source?: "sim" | "live";
  /** Only set when this world came from GET /api/live (live feed mode); see
   * lib/useLiveWorld.ts. The sim's own `liveWorld()` leaves it undefined and
   * callers compute the Hi-Lo round locally instead. */
  round?: HiLoRound;
}

const SLOTS = 2; // supporting fixtures alongside the marquee

function slotPosition(now: number, slot: number) {
  const offset = slot * 9 * TICK_MS; // stagger fixtures so they run out of phase
  const elapsed = now - EPOCH + offset;
  const cycle = Math.floor(elapsed / CYCLE_MS);
  const tick = Math.floor((elapsed % CYCLE_MS) / TICK_MS);
  return { cycle, tick };
}

/** The always-on England v France marquee, live via the deterministic engine. */
export function marqueeMatch(now: number = Date.now()): MatchState {
  const { cycle, tick } = slotPosition(now, MARQUEE_SLOT);
  return simulate(cycle, MARQUEE_SLOT, tick);
}

export function liveWorld(now: number = Date.now()): LiveWorld {
  const marquee = marqueeMatch(now);
  const others = Array.from({ length: SLOTS }, (_, slot) => {
    const { cycle, tick } = slotPosition(now, slot);
    return simulate(cycle, slot, tick);
  });
  // The England v France marquee is always the featured game.
  const matches = [marquee, ...others];
  const sincePeriod = (now - EPOCH) % TICK_MS;
  return {
    now,
    matches,
    featured: marquee,
    nextTickAt: now + (TICK_MS - sincePeriod),
    source: "sim",
  };
}

// ---------- match centre ----------

/** Alias kept for the Match Centre: the marquee is the England game. */
export function englandMatch(now: number = Date.now()): MatchState {
  return marqueeMatch(now);
}

export interface Fixture {
  fixtureId: number;
  home: Team;
  away: Team;
  time: string; // clean HH:00 kickoff label
  group: string;
  featured?: boolean; // the England v France headliner
}

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const PRIME_INDEX = 4; // 20:00 evening headliner slot

/**
 * Deterministic slate of tomorrow's fixtures. England v France is the pinned
 * headliner in the prime evening slot; the rest are drawn from the other
 * nations, each appearing once.
 */
export function tomorrowFixtures(now: number = Date.now(), count = 6): Fixture[] {
  const dayIndex = Math.floor((now - EPOCH) / DAY_MS) + 1; // tomorrow
  // shuffle the non-marquee nations, seeded on the day
  const pool = TEAMS.filter((t) => !MARQUEE.includes(t.code as (typeof MARQUEE)[number]));
  const r = mulberry32(hash(dayIndex, 71));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const fixtures: Fixture[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    const hour = 12 + i * 2; // 12:00, 14:00, 16:00 ...
    const isPrime = i === PRIME_INDEX;
    const home = isPrime ? team(MARQUEE[0]) : pool[p++];
    const away = isPrime ? team(MARQUEE[1]) : pool[p++];
    if (!home || !away) break;
    fixtures.push({
      fixtureId: isPrime ? 18_180_099 : 18_180_000 + dayIndex * 100 + i,
      home,
      away,
      time: `${String(hour).padStart(2, "0")}:00`,
      group: isPrime ? "D" : GROUPS[i % GROUPS.length],
      featured: isPrime,
    });
  }
  return fixtures;
}

// ---------- Hi-Lo rounds ----------

export type HiLoStat = "WIN" | "POSSESSION" | "PRESSURE";

export interface HiLoRound {
  id: string;
  fixtureId: number;
  stat: HiLoStat;
  statLabel: string;
  question: string;
  lockValue: number;
  unit: string;
  startedAt: number;
  endsAt: number;
  team: string;
}

export function statValue(m: MatchState, stat: HiLoStat): number {
  if (stat === "WIN") return m.probs.home;
  if (stat === "POSSESSION") return m.stats[0].possession;
  return m.pressure;
}

const STAT_META: Record<HiLoStat, { label: string; unit: string }> = {
  WIN: { label: "win probability", unit: "%" },
  POSSESSION: { label: "possession", unit: "%" },
  PRESSURE: { label: "attack pressure", unit: "" },
};

/** The Hi-Lo round active at `now`, played on the featured match. */
export function currentRound(now: number = Date.now()): HiLoRound {
  const world = liveWorld(now);
  const m = world.featured;
  const { cycle, tick } = slotPosition(now, m.slot);
  const round = Math.floor(tick / ROUND_TICKS);
  const startTick = round * ROUND_TICKS;
  const r = mulberry32(hash(cycle, m.slot, round, 31));
  const stats: HiLoStat[] = ["WIN", "POSSESSION", "PRESSURE"];
  const stat = stats[Math.floor(r() * stats.length)];
  const lockState = simulate(cycle, m.slot, Math.min(startTick, MATCH_TICKS));
  const lockValue = statValue(lockState, stat);
  const offset = m.slot * (CYCLE_MS / SLOTS);
  const cycleStart = EPOCH + cycle * CYCLE_MS - offset;
  const startedAt = cycleStart + startTick * TICK_MS;
  const endsAt = startedAt + ROUND_TICKS * TICK_MS;
  const meta = STAT_META[stat];
  return {
    id: `${cycle}-${m.slot}-${round}`,
    fixtureId: m.fixtureId,
    stat,
    statLabel: meta.label,
    unit: meta.unit,
    question: `${m.home.code} ${meta.label} after the next TxLINE tick`,
    lockValue: Math.round(lockValue * 10) / 10,
    startedAt,
    endsAt,
    team: m.home.code,
  };
}

/** Resolve a round by id: 1 = ended higher, -1 = lower, 0 = push. */
export function resolveRound(id: string): { result: 1 | -1 | 0; endValue: number } | null {
  const [cycle, slot, round] = id.split("-").map(Number);
  if ([cycle, slot, round].some(Number.isNaN)) return null;
  const startTick = round * ROUND_TICKS;
  const endTick = startTick + ROUND_TICKS;
  const r = mulberry32(hash(cycle, slot, round, 31));
  const stats: HiLoStat[] = ["WIN", "POSSESSION", "PRESSURE"];
  const stat = stats[Math.floor(r() * stats.length)];
  const a = statValue(simulate(cycle, slot, Math.min(startTick, MATCH_TICKS)), stat);
  const b = statValue(simulate(cycle, slot, Math.min(endTick, MATCH_TICKS)), stat);
  const av = Math.round(a * 10) / 10;
  const bv = Math.round(b * 10) / 10;
  return { result: bv > av ? 1 : bv < av ? -1 : 0, endValue: bv };
}

// ---------- PunditBot feed ----------

export interface PunditMessage {
  id: string;
  at: number;
  kind: "event" | "odds" | "hype" | "sticker";
  text: string;
}

const GOAL_LINES = [
  "GOOOOOL! {team} strike! It's {score}. The market just snapped {prob}% on the win line.",
  "{team} SCORE! {score} now. Feed tick confirms it, odds repricing as we speak.",
  "It's in! {team} make it {score}. Win probability jumps to {prob}%.",
];
const STEAM_LINES = [
  "Sharp money alert: {team} odds just moved hard with no goal behind it. Someone knows something.",
  "Steam move on {team}. The line shifted before the stadium noise settled. Spicy.",
];
const CARD_LINES = [
  "Booking for {team}. Tempers rising, pressure index says {pressure}.",
  "Yellow out for {team}. The next tackle is a coin flip.",
];
const RED_LINES = ["RED CARD! {team} down to ten. This market is about to get wild."];
const HYPE_LINES = [
  "Pressure index reads {pressure}. Something is coming, I can feel it in my feathers.",
  "Possession split {poss}-{opp}. {team} are strangling this half.",
  "Quiet minute on the feed. Perfect time to bank that streak, just saying.",
];

function fill(t: string, m: MatchState): string {
  return t
    .replace("{team}", m.home.code)
    .replace("{score}", `${m.score[0]}-${m.score[1]}`)
    .replace("{prob}", String(m.probs.home))
    .replace("{pressure}", String(m.pressure))
    .replace("{poss}", String(m.stats[0].possession))
    .replace("{opp}", String(m.stats[1].possession));
}

/** Rolling pundit feed built from featured-match events near `now`. */
export function punditFeed(now: number = Date.now(), count = 14): PunditMessage[] {
  const world = liveWorld(now);
  const m = world.featured;
  const { cycle, tick } = slotPosition(now, m.slot);
  const offset = m.slot * (CYCLE_MS / SLOTS);
  const cycleStart = EPOCH + cycle * CYCLE_MS - offset;
  const msgs: PunditMessage[] = [];

  for (const ev of m.events) {
    const at = cycleStart + ev.minute * TICK_MS;
    if (at > now) continue;
    const side = ev.side === 1 ? m.away : m.home;
    const state = simulate(cycle, m.slot, ev.minute);
    const r = mulberry32(hash(cycle, m.slot, ev.minute, 41));
    let text = "";
    if (ev.type === "GOAL") text = fill(GOAL_LINES[Math.floor(r() * GOAL_LINES.length)], state).replace(m.home.code, side.code);
    else if (ev.type === "STEAM") text = fill(STEAM_LINES[Math.floor(r() * STEAM_LINES.length)], state).replace(m.home.code, side.code);
    else if (ev.type === "YELLOW") text = fill(CARD_LINES[Math.floor(r() * CARD_LINES.length)], state).replace(m.home.code, side.code);
    else if (ev.type === "RED") text = fill(RED_LINES[0], state).replace(m.home.code, side.code);
    else if (ev.type === "KICKOFF") text = `We are LIVE. ${m.home.name} v ${m.away.name}, fixture ${m.fixtureId}. Feed is streaming, streaks are open.`;
    else if (ev.type === "HT") text = `Halftime. ${m.score[0]}-${m.score[1]}. Grab water, check the squad table, back for the second half.`;
    else if (ev.type === "FT") text = `Full time! ${m.home.code} ${m.score[0]}-${m.score[1]} ${m.away.code}. Squad points settling now.`;
    if (text) msgs.push({ id: `${m.fixtureId}-${ev.minute}-${ev.type}`, at, kind: "event", text });
  }
  // ambient hype every 6 minutes of match time
  for (let t = 4; t <= Math.min(tick, MATCH_TICKS); t += 6) {
    const state = simulate(cycle, m.slot, t);
    const r = mulberry32(hash(cycle, m.slot, t, 43));
    const at = cycleStart + t * TICK_MS;
    if (at > now) continue;
    msgs.push({
      id: `${m.fixtureId}-${t}-hype`,
      at,
      kind: "hype",
      text: fill(HYPE_LINES[Math.floor(r() * HYPE_LINES.length)], state),
    });
  }
  return msgs.sort((a, b) => a.at - b.at).slice(-count);
}

// ---------- Squad sweepstakes ----------

export interface SquadMember {
  handle: string;
  teams: Team[];
  points: number;
  goals: number;
  isUser?: boolean;
}

const SQUAD_HANDLES = [
  "DeskoTheGaffer",
  "xGandalf",
  "NoVARplease",
  "TikiTakaTina",
  "RowZUltra",
  "MinuteNinety",
  "FalseNineFelix",
  "CleanSheetCleo",
  "OffsideOracle",
  "SweeperKeeperSam",
  "LastManStanding",
  "OverlapOscar",
  "PenaltyPaula",
  "GoldenBootGio",
  "InjuryTimeIvy",
  "CornerFlagChad",
];

/** Deterministic sweepstakes standings for the demo squad, evolving per cycle.
 * Backs the GLOBAL leaderboard on the squad/sweepstakes page — 16+ members
 * even before the signed-in user (`userHandle`) is appended. */
export function squadStandings(now: number = Date.now(), userHandle?: string): SquadMember[] {
  const { cycle } = slotPosition(now, 0);
  const handles = [...SQUAD_HANDLES];
  if (userHandle) handles.push(userHandle);
  const members: SquadMember[] = handles.map((handle, i) => {
    const seed = hash(i === handles.length - 1 && userHandle ? 999 : i, 53);
    const r = mulberry32(seed);
    const teams = [TEAMS[Math.floor(r() * TEAMS.length)], TEAMS[Math.floor(r() * TEAMS.length)]];
    // accumulate points from finished cycles
    let points = 0;
    let goals = 0;
    const lookback = Math.min(24, Math.max(4, cycle % 40));
    for (let c = cycle - lookback; c < cycle; c++) {
      for (let slot = 0; slot < SLOTS; slot++) {
        const final = simulate(c, slot, MATCH_TICKS);
        for (const [ti, team] of teams.entries()) {
          const isHome = final.home.code === team.code;
          const isAway = final.away.code === team.code;
          if (!isHome && !isAway) continue;
          const [hs, as] = final.score;
          const mine = isHome ? hs : as;
          const theirs = isHome ? as : hs;
          points += mine > theirs ? 3 : mine === theirs ? 1 : 0;
          goals += mine;
          void ti;
        }
      }
    }
    return {
      handle,
      teams,
      points,
      goals,
      isUser: Boolean(userHandle) && handle === userHandle,
    };
  });
  return members.sort((a, b) => b.points - a.points || b.goals - a.goals);
}

export const POOL_ENTRY_USDC = 10;
export const PLATFORM_FEE = 0.02;
