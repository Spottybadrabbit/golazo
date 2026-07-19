"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useCelebrate } from "@/components/celebrate/Celebration";
import {
  loadPlayer,
  placeFastBetLocal,
  savePlayer,
  settleFastBetLocal,
  type PlayerState,
} from "@/lib/game";
import type { LiveMatch } from "@/lib/live-map";

// Fast Hi-Lo: a 12-second micro-prediction loop on the live featured match's
// REAL win-probability. Tap HIGHER or LOWER, the stake escrows immediately,
// and 12 seconds later the round settles instantly against the market's
// current live value — win, lose, or void (exact tie, stake refunded).
// PLAY MONEY · DEVNET ONLY. Signed-in it escrows/settles through Convex
// (convex/wallet.ts placeFastBet/settleFastBet); signed-out it mirrors the
// same semantics locally (lib/game.ts placeFastBetLocal/settleFastBetLocal).
// Only win-probabilities are real here — no fouls/cards/corners/shots
// markets exist on the free feed, so none are fabricated.

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const ROUND_MS = 12_000;
const STAKE_PRESETS = [0.01, 0.1];
type Market = "home" | "draw" | "away";
type Direction = "higher" | "lower";
type Phase = "ready" | "running" | "result";
type Outcome = "won" | "lost" | "void";

const MARKET_LABELS: Record<Market, string> = { home: "HOME", draw: "DRAW", away: "AWAY" };
const OUTCOME_CHIP: Record<Outcome, string> = { won: "✓", lost: "✗", void: "•" };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** ~1.9x base, boosted by the current win-streak, capped at 5x. */
function fastMultiplier(streak: number): number {
  return Math.min(5, 1.9 + 0.15 * streak);
}

interface PlaceArgs {
  fixtureId: number;
  market: Market;
  direction: Direction;
  stakeSol: number;
  lockedValue: number;
  multiplier: number;
}

/** Escrow + settle abstraction: the cloud (Convex) and local (signed-out)
 * implementations below both satisfy this, so the game loop UI is written
 * once against a single interface. */
interface FastHiLoEngine {
  balance: number;
  balanceReady: boolean;
  /** Shown next to an insufficient-balance message when there's a concrete
   * next step (the local/signed-out path can top up by connecting a demo
   * wallet; the signed-in play-money grant has no top-up, so it's absent). */
  topUpHint?: string;
  place: (args: PlaceArgs) => Promise<void>;
  settle: (currentValue: number) => Promise<{ status: Outcome; payoutSol: number }>;
}

export default function FastHiLo() {
  const feed = useLiveFeed();
  const featured = feed?.featured ?? null;

  if (!featured || !featured.probs) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <p className="text-sm text-muted">
          Fast Hi-Lo lights up once the feed prices a live win-probability.
        </p>
      </div>
    );
  }

  return convexOn && clerkOn ? (
    <FastHiLoAuthGate featured={featured} />
  ) : (
    <FastHiLoLocal featured={featured} />
  );
}

function FastHiLoAuthGate({ featured }: { featured: LiveMatch }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) {
    return (
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-line bg-surface">
        <div className="animate-pulse font-mono text-sm text-muted">Loading Fast Hi-Lo…</div>
      </div>
    );
  }
  return isSignedIn ? <FastHiLoCloud featured={featured} /> : <FastHiLoLocal featured={featured} />;
}

/** Signed-in: escrow + instant settlement through Convex. The active bet's
 * id lives in a ref inside this hook only — never crosses into the shared
 * engine view as a plain string, since exactly one round is ever pending. */
function useFastHiLoCloudEngine(): FastHiLoEngine {
  const playBalance = useQuery(api.wallet.playBalance);
  const placeFastBet = useMutation(api.wallet.placeFastBet);
  const settleFastBet = useMutation(api.wallet.settleFastBet);
  const pendingBetId = useRef<Id<"bets"> | null>(null);

  return {
    balance: playBalance ?? 0,
    balanceReady: playBalance !== undefined,
    place: async (args) => {
      const res = await placeFastBet({ ...args, roundMs: ROUND_MS });
      pendingBetId.current = res.betId;
    },
    settle: async (currentValue) => {
      const betId = pendingBetId.current;
      pendingBetId.current = null;
      if (!betId) return { status: "void", payoutSol: 0 };
      return await settleFastBet({ betId, currentValue });
    },
  };
}

/** Signed-out (or Convex/Clerk not configured): the local demo SOL float,
 * mirroring the same escrow + settlement semantics with no network round
 * trip. Reads/writes go through `loadPlayer()` at call time (not React
 * state) so a mutation never operates on a stale snapshot. */
function useFastHiLoLocalEngine(): FastHiLoEngine {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);
  const pending = useRef<{ stakeSol: number; lockedValue: number; multiplier: number; direction: Direction } | null>(
    null,
  );

  return {
    balance: player?.sol ?? 0,
    balanceReady: player !== null,
    topUpHint: "Connect a wallet on the Wallet tab to get play-money SOL.",
    place: async (args) => {
      const next = placeFastBetLocal(loadPlayer(), {
        market: args.market,
        direction: args.direction,
        stakeSol: args.stakeSol,
      });
      savePlayer(next);
      setPlayer(next);
      pending.current = {
        stakeSol: args.stakeSol,
        lockedValue: args.lockedValue,
        multiplier: args.multiplier,
        direction: args.direction,
      };
    },
    settle: async (currentValue) => {
      const bet = pending.current;
      pending.current = null;
      if (!bet) return { status: "void", payoutSol: 0 };
      const isVoid = currentValue === bet.lockedValue;
      const won =
        !isVoid &&
        (bet.direction === "higher" ? currentValue > bet.lockedValue : currentValue < bet.lockedValue);
      const status: Outcome = isVoid ? "void" : won ? "won" : "lost";
      const payoutSol = status === "won" ? Math.round(bet.stakeSol * bet.multiplier * 1e6) / 1e6 : 0;
      const next = settleFastBetLocal(loadPlayer(), { stakeSol: bet.stakeSol, payoutSol, result: status });
      savePlayer(next);
      setPlayer(next);
      return { status, payoutSol };
    },
  };
}

function FastHiLoCloud({ featured }: { featured: LiveMatch }) {
  const engine = useFastHiLoCloudEngine();
  return <FastHiLoView featured={featured} engine={engine} />;
}

function FastHiLoLocal({ featured }: { featured: LiveMatch }) {
  const engine = useFastHiLoLocalEngine();
  return <FastHiLoView featured={featured} engine={engine} />;
}

interface Round {
  market: Market;
  direction: Direction;
  stakeSol: number;
  lockedValue: number;
  multiplier: number;
  startedAt: number;
  endsAt: number;
}

/** The shared game-loop UI: pick a market + stake, call HIGHER/LOWER, watch
 * the 12s ring, settle instantly, then re-arm for the next call. */
function FastHiLoView({ featured, engine }: { featured: LiveMatch; engine: FastHiLoEngine }) {
  const celebrate = useCelebrate();
  // Real team labels, never generic HOME/AWAY.
  const teamLabel = (mk: Market) =>
    mk === "home" ? featured.home.code : mk === "away" ? featured.away.code : "DRAW";
  const teamName = (mk: Market) =>
    mk === "home" ? featured.home.name : mk === "away" ? featured.away.name : "the draw";
  const [market, setMarket] = useState<Market>("home");
  const [stake, setStake] = useState<number>(STAKE_PRESETS[0]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [streak, setStreak] = useState(0);
  const [results, setResults] = useState<Outcome[]>([]);
  const [lastResult, setLastResult] = useState<{ outcome: Outcome; payoutSol: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always-fresh read of the live feed for the settle-time value, without
  // making the countdown effect depend on (and re-run for) every feed tick.
  const featuredRef = useRef(featured);
  useEffect(() => {
    featuredRef.current = featured;
  }, [featured]);
  const settling = useRef(false);

  // Tick the countdown while a round is running.
  useEffect(() => {
    if (phase !== "running" || !round) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [phase, round]);

  function applyOutcome(status: Outcome, payoutSol: number, activeRound: Round) {
    setResults((r) => [status, ...r].slice(0, 10));
    setLastResult({ outcome: status, payoutSol });
    setPhase("result");

    if (status === "won") {
      const newStreak = streak + 1;
      setStreak(newStreak);
      celebrate({
        kind: "goal",
        title: newStreak >= 5 ? "ON FIRE!" : "GOLAZO!",
        subtitle: `${activeRound.direction.toUpperCase()} called right on ${MARKET_LABELS[activeRound.market]} win-%`,
        tiles: [
          { label: "Payout", value: `${payoutSol.toFixed(3)} SOL`, icon: "💰" },
          { label: "Streak", value: String(newStreak), icon: "🔥" },
          { label: "Boost", value: `${activeRound.multiplier.toFixed(2)}x` },
        ],
        tone: newStreak >= 5 ? "legend" : "volt",
        cta: "Next round",
      });
    } else if (status === "lost") {
      setStreak(0);
    }
    // void: streak untouched, stake already refunded by the engine.

    window.setTimeout(
      () => {
        setPhase("ready");
        setRound(null);
      },
      status === "won" ? 1400 : 1100,
    );
  }

  // The instant the 12s window elapses, settle against the market's current
  // live value. A dropped feed mid-round (no probs) settles as a void refund
  // rather than throwing — same honesty rule as the round never fabricating
  // a value it doesn't have.
  useEffect(() => {
    if (phase !== "running" || !round || settling.current) return;
    if (Date.now() < round.endsAt) return;
    settling.current = true;
    const liveProbs = featuredRef.current.probs;
    const currentValue = liveProbs ? round1(liveProbs[round.market]) : round.lockedValue;
    const activeRound = round;
    (async () => {
      try {
        const { status, payoutSol } = await engine.settle(currentValue);
        applyOutcome(status, payoutSol, activeRound);
      } catch {
        applyOutcome("void", 0, activeRound);
      } finally {
        settling.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, now]);

  const call = async (direction: Direction) => {
    if (phase !== "ready" || !engine.balanceReady) return;
    const probs = featured.probs;
    if (!probs) return;
    if (!(stake > 0) || stake > engine.balance) {
      setError("Not enough play-money balance for that stake.");
      return;
    }
    setError(null);
    const lockedValue = round1(probs[market]);
    const multiplier = fastMultiplier(streak);
    const startedAt = Date.now();
    const endsAt = startedAt + ROUND_MS;
    try {
      await engine.place({
        fixtureId: featured.fixtureId,
        market,
        direction,
        stakeSol: stake,
        lockedValue,
        multiplier,
      });
      setLastResult(null);
      setRound({ market, direction, stakeSol: stake, lockedValue, multiplier, startedAt, endsAt });
      setPhase("running");
      setNow(startedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't place that call — try again.");
    }
  };

  const locked = phase !== "ready";
  const probs = featured.probs;
  const liveValue = probs ? round1(probs[market]) : null;
  const displayValue = round?.market === market ? round.lockedValue : liveValue;
  const roundMs = round ? round.endsAt - round.startedAt : ROUND_MS;
  const progress = round ? Math.min(1, Math.max(0, (now - round.startedAt) / roundMs)) : 0;
  const secondsLeft = round ? Math.max(0, Math.ceil((round.endsAt - now) / 1000)) : 0;
  const ring = 2 * Math.PI * 44;
  const nextBoost = fastMultiplier(streak);
  const insufficientStake = engine.balanceReady && stake > engine.balance;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Fast Hi-Lo · 12s calls · play money · devnet
        </h3>
        <span className="shrink-0 font-mono text-xs text-muted">
          {engine.balanceReady ? `${engine.balance.toFixed(2)} SOL available` : "loading…"}
        </span>
      </div>

      {/* market pills */}
      <div className="mt-3 flex gap-2">
        {(["home", "draw", "away"] as Market[]).map((mk) => (
          <button
            key={mk}
            type="button"
            onClick={() => !locked && setMarket(mk)}
            disabled={locked}
            className={`flex-1 rounded-full border py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              market === mk
                ? "border-volt bg-volt text-night"
                : locked
                  ? "border-line text-muted opacity-50"
                  : "border-line text-muted hover:border-volt/50 hover:text-chalk"
            }`}
          >
            {teamLabel(mk)}
            {probs && <span className="ml-1 opacity-70">{round1(probs[mk])}%</span>}
          </button>
        ))}
      </div>

      {/* big number + countdown ring */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-5">
        <div>
          <p className="text-sm text-muted">
            {teamName(market)} win probability — higher or lower in 12s?
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-mono text-5xl font-semibold tracking-tight">
              {displayValue ?? "—"}
              <span className="text-2xl text-muted">%</span>
            </span>
            {phase === "running" && round && liveValue !== null && (
              <span
                className={`mb-1.5 font-mono text-sm ${
                  liveValue > round.lockedValue
                    ? "text-up"
                    : liveValue < round.lockedValue
                      ? "text-down"
                      : "text-muted"
                }`}
              >
                now {liveValue}%
              </span>
            )}
          </div>
        </div>
        <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
          <circle cx="52" cy="52" r="44" stroke="var(--line)" strokeWidth="7" fill="none" />
          <circle
            cx="52"
            cy="52"
            r="44"
            stroke="var(--volt)"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={ring * (phase === "running" ? progress : 0)}
          />
          {phase === "running" && (
            <text
              x="52"
              y="58"
              textAnchor="middle"
              fill="var(--chalk)"
              fontSize="22"
              fontWeight="700"
              transform="rotate(90 52 52)"
            >
              {secondsLeft}s
            </text>
          )}
        </svg>
      </div>

      {/* stake presets */}
      <div>
        <label className="font-mono text-[11px] uppercase tracking-widest text-muted">Stake</label>
        <div className="mt-2 flex gap-2">
          {STAKE_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => !locked && setStake(v)}
              disabled={locked}
              className={`flex-1 rounded-full border py-1.5 text-xs font-semibold transition-colors ${
                stake === v
                  ? "border-volt bg-volt/15 text-volt"
                  : locked
                    ? "border-line text-muted opacity-50"
                    : "border-line text-muted hover:text-chalk"
              } ${engine.balanceReady && v > engine.balance ? "opacity-40" : ""}`}
            >
              {v} SOL
            </button>
          ))}
        </div>
        {insufficientStake && (
          <p className="mt-1.5 font-mono text-[11px] text-down">
            Exceeds your play-money balance.{engine.topUpHint ? ` ${engine.topUpHint}` : ""}
          </p>
        )}
      </div>

      {error && <p className="mt-3 font-mono text-xs text-down">{error}</p>}

      {/* HI / LO calls */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => call("higher")}
          disabled={locked || !engine.balanceReady || !probs || insufficientStake}
          className={`rounded-xl border-2 py-4 text-lg font-extrabold tracking-wide transition-all active:translate-y-px ${
            round?.direction === "higher" && phase === "running"
              ? "border-volt bg-volt text-night"
              : locked
                ? "border-line text-muted opacity-50"
                : "border-volt bg-volt/10 text-chalk hover:bg-volt hover:text-night hover:shadow-[0_6px_24px_rgba(175,255,0,0.35)] disabled:opacity-40"
          }`}
        >
          HIGHER ↑
        </button>
        <button
          onClick={() => call("lower")}
          disabled={locked || !engine.balanceReady || !probs || insufficientStake}
          className={`rounded-xl border-2 py-4 text-lg font-extrabold tracking-wide transition-all active:translate-y-px ${
            round?.direction === "lower" && phase === "running"
              ? "border-cyan bg-cyan text-night"
              : locked
                ? "border-line text-muted opacity-50"
                : "border-cyan/70 bg-cyan/10 text-chalk hover:bg-cyan hover:text-night hover:shadow-[0_6px_24px_rgba(0,212,255,0.3)] disabled:opacity-40"
          }`}
        >
          LOWER ↓
        </button>
      </div>

      {/* inline result strip (loss/void only — win gets the big celebration) */}
      {phase === "result" && lastResult && lastResult.outcome !== "won" && (
        <p
          className={`mt-3 rounded-xl border p-3 text-center text-sm ${
            lastResult.outcome === "lost"
              ? "border-down/40 bg-down/10 text-chalk"
              : "border-line bg-night/50 text-chalk"
          }`}
        >
          {lastResult.outcome === "lost"
            ? "So close — go again!"
            : "Dead level — stake refunded. Go again!"}
        </p>
      )}

      {/* streak + combo row */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-night/50 px-4 py-3">
        <div className="font-mono text-xs text-muted">
          {streak > 0 && <span className="flame">🔥</span>} streak {streak} · next call {nextBoost.toFixed(2)}x
        </div>
        <div className="flex gap-1">
          {results.length === 0 ? (
            <span className="font-mono text-[11px] text-muted">no calls yet</span>
          ) : (
            results.map((r, i) => (
              <span
                key={i}
                className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold ${
                  r === "won"
                    ? "bg-up/20 text-up"
                    : r === "lost"
                      ? "bg-down/20 text-down"
                      : "bg-line/60 text-muted"
                }`}
              >
                {OUTCOME_CHIP[r]}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
