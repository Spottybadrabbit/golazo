// Golo · PunditBot — odds-edge Hi-Lo recommender.
//
// The old feed shouted HIGHER on any prob rise and LOWER on any dip, firing on
// every 1.5% wiggle with no cooldown — so it oscillated and spammed. This makes
// the call VALUE-aware: a Hi-Lo shout only earns its place when the market move
// is both meaningful AND has room to keep running the same way (a move that's
// already pinned near 0/100% has little edge left). Pure + deterministic so it's
// easy to reason about and test.
//
// All probabilities are in percent (0–100), matching the live feed.

export type HiLoCall = "HIGHER" | "LOWER";
export type HiLoConfidence = "strong" | "lean" | "slight";

export interface HiLoRec {
  call: HiLoCall;
  /** 0–100 strength of the edge. */
  edge: number;
  confidence: HiLoConfidence;
  /** Signed move in the reference (home win) probability, percentage points. */
  move: number;
  /** Room left for the move to keep running (percentage points). */
  room: number;
}

export interface HiLoInput {
  /** Previous reference (home win) probability, percent. */
  prevProb: number;
  /** Current reference probability, percent. */
  currProb: number;
  /** Minimum move (pp) before we say anything — de-spams small wiggles. */
  minMove?: number;
  /** Minimum edge (0–100) before a call is worth surfacing. */
  minEdge?: number;
}

const DEFAULT_MIN_MOVE = 2.0;
const DEFAULT_MIN_EDGE = 35;

/**
 * Recommend a Hi-Lo call only when the market move carries genuine edge.
 * Returns null when the move is too small or the value is too thin to bother a
 * player with (this is what stops the oscillating / duplicate shouts).
 */
export function recommendHiLo(input: HiLoInput): HiLoRec | null {
  const minMove = input.minMove ?? DEFAULT_MIN_MOVE;
  const minEdge = input.minEdge ?? DEFAULT_MIN_EDGE;

  const move = round1(input.currProb - input.prevProb);
  if (Math.abs(move) < minMove) return null;

  const call: HiLoCall = move > 0 ? "HIGHER" : "LOWER";
  // Room to keep running the same direction: a climb has room up to 100%, a
  // drift has room down to 0%.
  const room = call === "HIGHER" ? clamp(100 - input.currProb, 0, 100) : clamp(input.currProb, 0, 100);

  // Edge blends how hard the market moved with how much room is left to profit.
  const magnitudeScore = clamp(Math.abs(move) * 12, 0, 100); // ~8pp move ⇒ ~100
  const roomScore = clamp(room * 2, 0, 100); // 50pp room ⇒ 100
  const edge = Math.round(magnitudeScore * 0.6 + roomScore * 0.4);
  if (edge < minEdge) return null;

  const confidence: HiLoConfidence = edge >= 70 ? "strong" : edge >= 50 ? "lean" : "slight";
  return { call, edge, confidence, move, room: round1(room) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "+6.4%" / "-3.1%" for a percentage-point move. */
export function fmtMove(move: number): string {
  return `${move > 0 ? "+" : ""}${move.toFixed(1)}%`;
}
