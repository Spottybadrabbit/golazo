"use client";

// Client-side player profile: streaks, XP, boosts, badges, mock wallet.
// Persisted in localStorage for the demo; swap for a real backend when
// real money enters the picture.

export type TxKind = "connect" | "disconnect" | "bank" | "pack" | "win" | "reset" | "bet";

/** A single ledger entry — the history of money moving in and out. */
export interface Tx {
  id: string;
  ts: number;
  kind: TxKind;
  label: string;
  goal?: number; // signed change in GOAL points
  sol?: number; // signed change in SOL
}

export interface PlayerState {
  handle: string | null;
  xp: number;
  streak: number;
  bestStreak: number;
  picks: number;
  wins: number;
  goalPoints: number; // in-app currency earned by banking streaks
  sol: number; // Solana balance in the connected wallet (simulated for the demo)
  badges: string[];
  wallet: string | null;
  lastRoundId: string | null;
  cards: Record<string, number>; // card id -> copies owned
  ledger: Tx[]; // transaction history, newest first
  sound: boolean; // settings: sound effects
  reducedMotion: boolean; // settings: prefer reduced motion
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
  sol: 0,
  badges: [],
  wallet: null,
  lastRoundId: null,
  cards: {},
  ledger: [],
  sound: true,
  reducedMotion: false,
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
  const settled: PlayerState = { ...p, goalPoints: p.goalPoints + banked, streak: 0 };
  const next = pushTx(settled, {
    kind: "bank",
    label: `Banked a ${p.streak}-streak`,
    goal: banked,
  });
  return { next, banked, fee };
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

// ---------- wallet + ledger ----------

function txId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Prepend a transaction to the ledger (capped so localStorage stays small). */
export function pushTx(p: PlayerState, entry: Omit<Tx, "id" | "ts">): PlayerState {
  const tx: Tx = { id: txId(), ts: Date.now(), ...entry };
  return { ...p, ledger: [tx, ...(p.ledger ?? [])].slice(0, 60) };
}

/** Connect the (simulated) Solana wallet: mint an address + starter SOL float. */
export function connectWallet(p: PlayerState): PlayerState {
  const wallet = mockWalletAddress();
  const sol = p.sol > 0 ? p.sol : Math.round((2 + Math.random() * 3) * 100) / 100;
  return pushTx({ ...p, wallet, sol }, { kind: "connect", label: "Wallet connected", sol });
}

/** Disconnect the wallet but keep balances + history for when they return. */
export function disconnectWallet(p: PlayerState): PlayerState {
  return pushTx({ ...p, wallet: null }, { kind: "disconnect", label: "Wallet disconnected" });
}

/** Wipe demo progress back to a clean slate. */
export function resetDemo(): PlayerState {
  return { ...FRESH };
}

export function formatSol(n: number): string {
  return `${n.toFixed(2)} SOL`;
}

/**
 * Local (signed-out / Convex-unreachable) fallback for BetSlip: deducts the
 * stake from the simulated SOL float and logs it. Play-money only — no real
 * transfer, mirrors what `convex/wallet.ts`'s `placeBet` records server-side.
 */
export function placeBetLocal(
  p: PlayerState,
  opts: { pick: "home" | "draw" | "away"; stakeSol: number; odds: number },
): { next: PlayerState; potentialPayout: number } {
  const potentialPayout = Math.round(opts.stakeSol * opts.odds * 1e4) / 1e4;
  const next = pushTx(
    { ...p, sol: Math.round((p.sol - opts.stakeSol) * 1e4) / 1e4 },
    {
      kind: "bet",
      label: `Bet ${opts.pick} @ ${opts.odds.toFixed(2)}x`,
      sol: -opts.stakeSol,
    },
  );
  return { next, potentialPayout };
}
