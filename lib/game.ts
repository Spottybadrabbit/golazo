"use client";

// Client-side player profile: streaks, XP, boosts, badges, mock wallet.
// Persisted in localStorage for the demo; swap for a real backend when
// real money enters the picture.

export interface PlayerState {
  handle: string | null;
  xp: number;
  streak: number;
  bestStreak: number;
  picks: number;
  wins: number;
  goalPoints: number; // in-app currency earned by banking streaks
  badges: string[];
  wallet: string | null;
  lastRoundId: string | null;
  cards: Record<string, number>; // card id -> copies owned
}

const KEY = "golazo.player.v1";

export const FRESH: PlayerState = {
  handle: null,
  xp: 0,
  streak: 0,
  bestStreak: 0,
  picks: 0,
  wins: 0,
  goalPoints: 120,
  badges: [],
  wallet: null,
  lastRoundId: null,
  cards: {},
};

export function loadPlayer(): PlayerState {
  if (typeof window === "undefined") return FRESH;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return FRESH;
    return { ...FRESH, ...(JSON.parse(raw) as Partial<PlayerState>) };
  } catch {
    return FRESH;
  }
}

export function savePlayer(p: PlayerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function multiplier(streak: number): number {
  if (streak >= 8) return 5;
  if (streak >= 5) return 3;
  if (streak >= 3) return 2;
  return 1;
}

export function level(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

export function levelProgress(xp: number): number {
  const lvl = level(xp);
  const floor = 50 * (lvl - 1) ** 2;
  const ceil = 50 * lvl ** 2;
  return Math.min(1, (xp - floor) / (ceil - floor));
}

export interface Badge {
  id: string;
  name: string;
  desc: string;
  earned: (p: PlayerState) => boolean;
}

export const BADGES: Badge[] = [
  { id: "first", name: "Off the Mark", desc: "First correct call", earned: (p) => p.wins >= 1 },
  { id: "run3", name: "Cracking Run", desc: "3 streak, 2x boost", earned: (p) => p.bestStreak >= 3 },
  { id: "run5", name: "On Fire", desc: "5 streak, 3x boost", earned: (p) => p.bestStreak >= 5 },
  { id: "run8", name: "Golazo God", desc: "8 streak, 5x boost", earned: (p) => p.bestStreak >= 8 },
  { id: "vol20", name: "Regular", desc: "20 calls made", earned: (p) => p.picks >= 20 },
  { id: "bank", name: "Banker", desc: "Banked a boosted streak", earned: (p) => p.goalPoints > 120 },
  {
    id: "collector",
    name: "Collector",
    desc: "First card pulled",
    earned: (p) => Object.keys(p.cards ?? {}).length >= 1,
  },
  {
    id: "fullhouse",
    name: "Full House",
    desc: "Whole collection owned",
    earned: (p) => Object.keys(p.cards ?? {}).length >= 5,
  },
];

/** Apply a resolved pick; returns the updated state plus what happened. */
export function applyResult(
  p: PlayerState,
  correct: boolean,
  push: boolean,
): { next: PlayerState; gained: number; newBadges: Badge[] } {
  if (push) return { next: p, gained: 0, newBadges: [] };
  const streak = correct ? p.streak + 1 : 0;
  const gained = correct ? 10 * multiplier(streak) : 0;
  const next: PlayerState = {
    ...p,
    xp: p.xp + gained,
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    picks: p.picks + 1,
    wins: p.wins + (correct ? 1 : 0),
  };
  const newBadges = BADGES.filter((b) => !p.badges.includes(b.id) && b.earned(next));
  next.badges = [...p.badges, ...newBadges.map((b) => b.id)];
  return { next, gained, newBadges };
}

export const BANK_FEE = 0.02;

/** Bank the current streak: converts streak into GOAL points minus the 2% fee. */
export function bankStreak(p: PlayerState): { next: PlayerState; banked: number; fee: number } {
  const gross = p.streak * 25 * multiplier(p.streak);
  const fee = Math.ceil(gross * BANK_FEE);
  const banked = gross - fee;
  return { next: { ...p, goalPoints: p.goalPoints + banked, streak: 0 }, banked, fee };
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function mockWalletAddress(): string {
  let out = "";
  for (let i = 0; i < 44; i++) out += B58[Math.floor(Math.random() * B58.length)];
  return out;
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 4)}..${a.slice(-4)}`;
}
