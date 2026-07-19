"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useCelebrate } from "@/components/celebrate/Celebration";
import { formatSol, loadPlayer, placeBetLocal, savePlayer, type PlayerState } from "@/lib/game";
import type { LiveTeam } from "@/lib/live-map";

// Play-money bet slip for the live featured match: pick a side, stake a
// decimal SOL amount, see the live odds and the potential payout converted to
// USD/GBP (indicative only). Placing a bet never signs or sends anything —
// signed-in it records a Convex ledger spend + gamePlays position
// (convex/wallet.ts placeBet); otherwise it falls back to the local demo
// ledger (lib/game.ts placeBetLocal). PLAY MONEY · DEVNET ONLY.

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const STAKE_PRESETS = [0.1, 0.2, 0.3];
type Pick = "home" | "draw" | "away";
type SubmitResult = { potentialPayout: number };

interface BetContext {
  fixtureId: number;
  home: LiveTeam;
  away: LiveTeam;
  odds: { home: number; draw: number; away: number };
}

interface Price {
  usd: number;
  gbp: number;
}
const FALLBACK_PRICE: Price = { usd: 150, gbp: 118 };

function useSolPrice(): Price {
  const [price, setPrice] = useState<Price>(FALLBACK_PRICE);
  useEffect(() => {
    let alive = true;
    fetch("/api/sol-price")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sol-price"))))
      .then((d: { usd?: number; gbp?: number }) => {
        if (alive && typeof d.usd === "number" && typeof d.gbp === "number") {
          setPrice({ usd: d.usd, gbp: d.gbp });
        }
      })
      .catch(() => {
        /* keep fallback constant */
      });
    return () => {
      alive = false;
    };
  }, []);
  return price;
}

export default function BetSlip() {
  const feed = useLiveFeed();
  const featured = feed?.featured ?? null;

  if (!featured || !featured.odds) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <p className="text-sm text-muted">
          No live match odds yet — the bet slip lights up once the feed prices a match.
        </p>
      </div>
    );
  }

  const ctx: BetContext = {
    fixtureId: featured.fixtureId,
    home: featured.home,
    away: featured.away,
    odds: featured.odds,
  };

  return convexOn && clerkOn ? <BetSlipCloud ctx={ctx} /> : <BetSlipLocal ctx={ctx} />;
}

/** Signed-in path: the reactive play-money `playBalance` (escrow +
 * instant-settlement ledger) for the stake cap, and a Convex `placeBet`
 * mutation that records the wager as a play-money ledger spend + gamePlays
 * position. No wallet is ever signed or transferred. */
function BetSlipCloud({ ctx }: { ctx: BetContext }) {
  const { user } = useUser();
  const address = user?.web3Wallets?.[0]?.web3Wallet ?? null;
  const playBalance = useQuery(api.wallet.playBalance);
  const placeBet = useMutation(api.wallet.placeBet);
  const celebrate = useCelebrate();

  if (!address) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <p className="text-sm text-muted">
          Connect your Solana wallet on the Wallet tab to place a play-money bet.
        </p>
      </div>
    );
  }

  const submit = async (pick: Pick, stake: number): Promise<SubmitResult> => {
    const odds = ctx.odds[pick];
    const result = await placeBet({ fixtureId: ctx.fixtureId, pick, stakeSol: stake, odds });
    celebrateBet(celebrate, pick, stake, odds, result.potentialPayout);
    return { potentialPayout: result.potentialPayout };
  };

  return (
    <BetForm
      ctx={ctx}
      balance={playBalance ?? 0}
      balanceUnknown={playBalance === undefined}
      onSubmit={submit}
    />
  );
}

/** Signed-out (or Convex not configured) path: the local demo SOL float from
 * lib/game.ts, mirrored via placeBetLocal — same play-money semantics, no
 * network round trip. */
function BetSlipLocal({ ctx }: { ctx: BetContext }) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const celebrate = useCelebrate();

  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);

  if (!player) {
    return (
      <div className="mt-4 flex h-32 items-center justify-center rounded-2xl border border-line bg-surface">
        <div className="animate-pulse font-mono text-sm text-muted">Loading bet slip…</div>
      </div>
    );
  }

  const submit = async (pick: Pick, stake: number): Promise<SubmitResult> => {
    const odds = ctx.odds[pick];
    const { next, potentialPayout } = placeBetLocal(player, { pick, stakeSol: stake, odds });
    savePlayer(next);
    setPlayer(next);
    celebrateBet(celebrate, pick, stake, odds, potentialPayout);
    return { potentialPayout };
  };

  return <BetForm ctx={ctx} balance={player.sol} balanceUnknown={false} onSubmit={submit} />;
}

function celebrateBet(
  celebrate: ReturnType<typeof useCelebrate>,
  pick: Pick,
  stake: number,
  odds: number,
  potentialPayout: number,
) {
  celebrate({
    kind: "activation",
    title: "BET PLACED!",
    subtitle: `${stake.toFixed(2)} SOL on ${pick.toUpperCase()} @ ${odds.toFixed(2)}x · play money, devnet`,
    tiles: [
      { label: "Stake", value: `${stake.toFixed(2)} SOL` },
      { label: "Payout", value: `${potentialPayout.toFixed(3)} SOL` },
    ],
    cta: "Nice",
  });
}

function BetForm({
  ctx,
  balance,
  balanceUnknown,
  onSubmit,
}: {
  ctx: BetContext;
  balance: number;
  balanceUnknown: boolean;
  onSubmit: (pick: Pick, stake: number) => Promise<SubmitResult>;
}) {
  const price = useSolPrice();
  const [pick, setPick] = useState<Pick | null>(null);
  const [stakeInput, setStakeInput] = useState("0.1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ pick: Pick; stake: number; payout: number } | null>(
    null,
  );

  const stake = Number(stakeInput);
  const validStake = Number.isFinite(stake) && stake > 0;
  const withinBalance = balanceUnknown || stake <= balance;
  const odds = pick ? ctx.odds[pick] : null;
  const payoutSol = pick && validStake ? stake * ctx.odds[pick] : 0;
  const payoutUsd = payoutSol * price.usd;
  const payoutGbp = payoutSol * price.gbp;
  const canSubmit = Boolean(pick) && validStake && withinBalance && !busy;

  const submit = async () => {
    if (!pick || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { potentialPayout } = await onSubmit(pick, stake);
      setConfirmed({ pick, stake, payout: potentialPayout });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't place that bet — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Bet slip · play money · devnet
        </h3>
        {!balanceUnknown && (
          <span className="shrink-0 font-mono text-xs text-muted">
            {formatSol(balance)} available
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <PickButton
          label={ctx.home.code}
          sub="Home"
          odds={ctx.odds.home}
          active={pick === "home"}
          onClick={() => setPick("home")}
        />
        <PickButton
          label="Draw"
          sub="Draw"
          odds={ctx.odds.draw}
          active={pick === "draw"}
          onClick={() => setPick("draw")}
        />
        <PickButton
          label={ctx.away.code}
          sub="Away"
          odds={ctx.odds.away}
          active={pick === "away"}
          onClick={() => setPick("away")}
        />
      </div>

      <div className="mt-4">
        <label className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Stake (SOL)
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {STAKE_PRESETS.map((v) => (
            <button
              key={v}
              onClick={() => setStakeInput(v.toString())}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                stakeInput === v.toString()
                  ? "border-volt bg-volt/15 text-volt"
                  : "border-line text-muted hover:text-chalk"
              }`}
            >
              {v} SOL
            </button>
          ))}
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-night px-3 py-1.5 text-sm text-chalk outline-none focus:border-volt/60"
          />
        </div>
        {!withinBalance && validStake && (
          <p className="mt-1.5 font-mono text-[11px] text-down">
            Exceeds your available SOL balance.
          </p>
        )}
      </div>

      {pick && (
        <div className="mt-4 rounded-xl border border-line bg-night/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Potential payout @ {odds?.toFixed(2)}x
          </div>
          <div className="mt-1 text-2xl font-extrabold text-chalk">{payoutSol.toFixed(3)} SOL</div>
          <div className="mt-1 font-mono text-xs text-muted">
            ≈ ${payoutUsd.toFixed(2)} · £{payoutGbp.toFixed(2)}{" "}
            <span className="opacity-70">(indicative)</span>
          </div>
        </div>
      )}

      {error && <p className="mt-3 font-mono text-xs text-down">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-4 w-full rounded-xl py-3.5 text-sm font-extrabold uppercase tracking-wide transition-transform active:translate-y-px ${
          canSubmit ? "bg-volt text-night hover:scale-[1.01]" : "cursor-not-allowed bg-line text-muted"
        }`}
      >
        {busy ? "Placing…" : "Place bet"}
      </button>

      {confirmed && (
        <p className="mt-3 rounded-xl border border-volt/40 bg-volt/10 p-3 text-center font-mono text-xs text-chalk">
          Placed {confirmed.stake.toFixed(2)} SOL on {confirmed.pick.toUpperCase()} — potential
          payout {confirmed.payout.toFixed(3)} SOL. Play money · devnet, nothing real moved.
        </p>
      )}
    </div>
  );
}

function PickButton({
  label,
  sub,
  odds,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  odds: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 py-3 text-center transition-all active:translate-y-px ${
        active ? "border-volt bg-volt/15" : "border-line bg-night/40 hover:border-volt/40"
      }`}
    >
      <div className="text-sm font-extrabold text-chalk">{label}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{sub}</div>
      <div className="mt-1 font-mono text-sm font-bold text-volt">{odds.toFixed(2)}x</div>
    </button>
  );
}
