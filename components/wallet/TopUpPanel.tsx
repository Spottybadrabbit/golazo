"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import GlossyIcon from "@/components/icons/GlossyIcons";
import { topUpLocal, type PlayerState } from "@/lib/game";

// Honest, clearly-labelled play-money top-up: credits GOAL points only —
// never SOL, never anything on-chain, never withdrawable. Signed-in players
// get a durable Convex ledger entry (api.wallet.topUp, kind "promo") that
// shows up in the bank-balance history; everyone else gets the same flow
// against the local demo ledger (lib/game.ts's topUpLocal). Same gating
// pattern as WalletHub/ProfileView: Clerk hooks only mount when clerkOn.

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const TOP_UP_AMOUNTS = [50, 100, 250, 500];

export default function TopUpPanel({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <GlossyIcon name="bolt" tint="volt" size={30} />
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">
            Top up GOAL
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Play money only — not real currency, never withdrawable.
          </p>
        </div>
      </div>
      {clerkOn && convexOn ? (
        <ConvexTopUp player={player} update={update} />
      ) : (
        <LocalTopUp player={player} update={update} />
      )}
    </section>
  );
}

function LocalTopUp({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
  return <AmountGrid onPick={(amount) => update(topUpLocal(player, amount))} pending={null} error={null} />;
}

function ConvexTopUp({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const topUp = useMutation(api.wallet.topUp);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded || !isSignedIn) {
    return <LocalTopUp player={player} update={update} />;
  }

  const pick = async (amount: number) => {
    setPending(amount);
    setError(null);
    try {
      const balanceAfter = await topUp({ amount });
      update({ ...player, goalPoints: balanceAfter });
    } catch {
      setError("Couldn’t top up right now. Try again.");
    } finally {
      setPending(null);
    }
  };

  return <AmountGrid onPick={pick} pending={pending} error={error} />;
}

function AmountGrid({
  onPick,
  pending,
  error,
}: {
  onPick: (amount: number) => void;
  pending: number | null;
  error: string | null;
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOP_UP_AMOUNTS.map((amount) => (
          <button
            key={amount}
            onClick={() => onPick(amount)}
            disabled={pending !== null}
            className="rounded-xl bg-volt px-4 py-3 text-sm font-extrabold text-night transition-transform hover:scale-[1.03] active:translate-y-px disabled:opacity-60"
          >
            {pending === amount ? "…" : `+${amount}`}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 font-mono text-[11px] text-down">{error}</p>}
    </div>
  );
}
