// Stat Hi-Lo question engine — turns the REAL TxODDS event stream + running
// stat accumulator (LiveMatch.stats / LiveMatch.events) into fast, fun,
// bettable questions. Two flavours:
//   • next-event  — "Corner in the next 12s?" — YES the moment a matching event
//                   fires in the window, NO if the window closes empty.
//   • over/under  — "Over 9.5 total corners at full time?" — a line locked
//                   against the running accumulator, settled at FT.
// Everything is real feed data; nothing is fabricated. PLAY MONEY · DEVNET.

import type { LiveEvent, LiveMatch, LiveStatLine } from "@/lib/live-map";

export interface StatQuestion {
  /** bets-table market string, e.g. "corner_next" */
  key: string;
  emoji: string;
  /** the yes/no prompt shown in the game */
  text: string;
  /** short live context, e.g. "8 so far · last at 79'" */
  hint: string;
}

const NEXT_EVENT_QUESTIONS: Omit<StatQuestion, "hint">[] = [
  { key: "corner_next", emoji: "🚩", text: "Corner in the next 12s?" },
  { key: "shot_next", emoji: "👟", text: "A shot in the next 12s?" },
  { key: "shot_target_next", emoji: "🎯", text: "Shot on target next 12s?" },
  { key: "card_next", emoji: "🟨", text: "A booking in the next 12s?" },
  { key: "freekick_next", emoji: "➰", text: "Free kick in the next 12s?" },
];

/** Does a real feed event satisfy this next-event question? */
export function eventHits(key: string, e: LiveEvent): boolean {
  switch (key) {
    case "corner_next":
      return e.action === "corner";
    case "shot_next":
      return e.action === "shot";
    case "shot_target_next":
      return e.action === "shot" && e.detail.toLowerCase().includes("target");
    case "card_next":
      return e.action === "yellow_card" || e.action === "red_card";
    case "freekick_next":
      return e.action === "free_kick";
    default:
      return false;
  }
}

/** How many of this question's events have already happened (live context). */
function soFar(key: string, s: { home: LiveStatLine; away: LiveStatLine } | null | undefined): number {
  if (!s) return 0;
  const both = (f: (l: LiveStatLine) => number) => f(s.home) + f(s.away);
  switch (key) {
    case "corner_next":
      return both((l) => l.corners);
    case "shot_next":
    case "shot_target_next":
      return both((l) => l.shots + l.shotsOnTarget);
    case "card_next":
      return both((l) => l.yellow + l.red);
    default:
      return 0;
  }
}

/** The question for a given wall-clock round index, stable within the round. */
export function pickStatQuestion(roundIndex: number, match: LiveMatch): StatQuestion {
  const base = NEXT_EVENT_QUESTIONS[((roundIndex % NEXT_EVENT_QUESTIONS.length) + NEXT_EVENT_QUESTIONS.length) % NEXT_EVENT_QUESTIONS.length];
  const n = soFar(base.key, match.stats);
  const hint = n > 0 ? `${n} so far this match` : "none yet this match";
  return { ...base, hint };
}

export interface OverUnderLine {
  /** bets-table market string, e.g. "corners_ou" */
  key: string;
  emoji: string;
  label: string;
  /** the .5 line locked for the bet */
  line: number;
  /** running total right now */
  current: number;
}

/** Over/under lines against the running accumulator, settled at full time.
 * Only stats the feed actually populates (corners, bookings) get a line. */
export function overUnderLines(match: LiveMatch): OverUnderLine[] {
  const s = match.stats;
  if (!s) return [];
  const corners = s.home.corners + s.away.corners;
  const cards = s.home.yellow + s.away.yellow + s.home.red + s.away.red;
  const out: OverUnderLine[] = [];
  out.push({ key: "corners_ou", emoji: "🚩", label: "Total corners", line: corners + 1.5, current: corners });
  out.push({ key: "cards_ou", emoji: "🟨", label: "Total bookings", line: cards + 1.5, current: cards });
  return out;
}

/** Readable per-side stat rows for the live stats strip. */
export interface StatRow {
  label: string;
  emoji: string;
  home: number;
  away: number;
}
export function statRows(match: LiveMatch): StatRow[] {
  const s = match.stats;
  if (!s) return [];
  return [
    { label: "Corners", emoji: "🚩", home: s.home.corners, away: s.away.corners },
    { label: "Shots", emoji: "👟", home: s.home.shots, away: s.away.shots },
    { label: "On target", emoji: "🎯", home: s.home.shotsOnTarget, away: s.away.shotsOnTarget },
    { label: "Yellow", emoji: "🟨", home: s.home.yellow, away: s.away.yellow },
    { label: "Red", emoji: "🟥", home: s.home.red, away: s.away.red },
  ];
}
