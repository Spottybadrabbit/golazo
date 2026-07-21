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

// ---------- Convex write-through (registered by components/PlayerSync.tsx) ----------
// game.ts stays framework-free — it never imports Convex/React. Instead,
// PlayerSync registers these callbacks once the user is signed in (and clears
// them again on sign-out), and savePlayer/pushTx fire them best-effort below.
// localStorage remains the source of truth offline: a Convex hiccup here is
// swallowed and never surfaces to the player.
type PlayerSyncFn = (p: PlayerState) => void;
type TxSyncFn = (p: PlayerState, tx: Tx) => void;

let onPlayerSync: PlayerSyncFn | null = null;
let onTxSync: TxSyncFn | null = null;

/** Registered by PlayerSync once signed in; call with null to clear on sign-out. */
export function registerPlayerSync(fn: PlayerSyncFn | null) {
  onPlayerSync = fn;
}

/** Registered by PlayerSync once signed in; call with null to clear on sign-out. */
export function registerTxSync(fn: TxSyncFn | null) {
  onTxSync = fn;
}

export function savePlayer(p: PlayerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
  try {
    onPlayerSync?.(p);
  } catch {
    /* Convex mirror is best-effort — localStorage already has the write */
  }
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

/**
 * Local (signed-out / Convex-unreachable) play-money GOAL top-up: credits
 * GOAL points and logs it to the local ledger. Mirrors what Convex `topUp`
 * (convex/wallet.ts) records server-side for signed-in players.
 */
export function topUpLocal(p: PlayerState, amount: number): PlayerState {
  return pushTx(
    { ...p, goalPoints: p.goalPoints + amount },
    { kind: "bank", label: `Play money top-up +${amount} GOAL`, goal: amount },
  );
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
  const next = { ...p, ledger: [tx, ...(p.ledger ?? [])].slice(0, 60) };
  try {
    onTxSync?.(next, tx);
  } catch {
    /* Convex mirror is best-effort — the local ledger already has the entry */
  }
  return next;
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

/**
 * Local (signed-out / Convex-unreachable) equivalent of Convex `placeFastBet`
 * for the Fast Hi-Lo micro-prediction loop (components/play/FastHiLo.tsx):
 * escrows the stake immediately by deducting it from the simulated SOL float.
 * Play-money only, mirrors placeBetLocal's shape.
 */
export function placeFastBetLocal(
  p: PlayerState,
  opts: { market: "home" | "draw" | "away"; direction: "higher" | "lower"; stakeSol: number },
): PlayerState {
  return pushTx(
    { ...p, sol: Math.round((p.sol - opts.stakeSol) * 1e4) / 1e4 },
    {
      kind: "bet",
      label: `Fast Hi-Lo ${opts.direction} ${opts.market}`,
      sol: -opts.stakeSol,
    },
  );
}

/**
 * Local (signed-out / Convex-unreachable) equivalent of Convex `settleFastBet`:
 * credits a win payout or a void refund back into the simulated SOL float. A
 * loss needs no ledger entry — the stake was already forfeited at placement.
 */
export function settleFastBetLocal(
  p: PlayerState,
  opts: { stakeSol: number; payoutSol: number; result: "won" | "lost" | "void" },
): PlayerState {
  if (opts.result === "lost") return p;
  const credit = opts.result === "void" ? opts.stakeSol : opts.payoutSol;
  return pushTx(
    { ...p, sol: Math.round((p.sol + credit) * 1e4) / 1e4 },
    {
      kind: "win",
      label: opts.result === "void" ? "Fast Hi-Lo void — stake refunded" : "Fast Hi-Lo win",
      sol: credit,
    },
  );
}
