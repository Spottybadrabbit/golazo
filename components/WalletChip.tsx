"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatSol, loadPlayer, type PlayerState } from "@/lib/game";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

/**
 * Compact balance pill in the top bar — the entry point to the wallet hub.
 * Shows GOAL always, and SOL when there's a balance to show: the reactive
 * play-money `playBalance` once signed in via Clerk (independent of whether a
 * devnet wallet is linked), or the local demo float when signed out.
 */
export default function WalletChip() {
  const [p, setP] = useState<PlayerState | null>(null);

  useEffect(() => {
    setP(loadPlayer());
    const sync = () => setP(loadPlayer());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!p) {
    return <span className="h-9 w-24 animate-pulse rounded-full border border-line bg-surface" />;
  }

  return clerkOn ? <ClerkChip player={p} /> : <LocalChip player={p} />;
}

/** Signed-out (or Clerk not configured): the local demo float, shown once a
 * demo wallet is connected — same gating as the pre-existing behavior. */
function LocalChip({ player }: { player: PlayerState }) {
  const connected = Boolean(player.wallet);
  return (
    <ChipShell
      connected={connected}
      goal={player.goalPoints}
      sol={connected ? formatSol(player.sol) : null}
    />
  );
}

/** Clerk configured: once actually signed in, show the reactive play-money
 * balance regardless of whether a devnet wallet is linked yet. Not signed in
 * (or still loading) falls back to the local demo float. */
function ClerkChip({ player }: { player: PlayerState }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const address = user?.web3Wallets?.[0]?.web3Wallet ?? null;

  if (!isLoaded || !isSignedIn) {
    return <LocalChip player={player} />;
  }

  const connected = Boolean(address);
  return convexOn ? (
    <ConvexChip player={player} connected={connected} />
  ) : (
    <ChipShell connected={connected} goal={player.goalPoints} sol={formatSol(player.sol)} />
  );
}

function ConvexChip({ player, connected }: { player: PlayerState; connected: boolean }) {
  const balance = useQuery(api.wallet.playBalance);
  return (
    <ChipShell connected={connected} goal={player.goalPoints} sol={formatSol(balance ?? player.sol)} />
  );
}

function ChipShell({
  connected,
  goal,
  sol,
}: {
  connected: boolean;
  goal: number;
  sol: string | null;
}) {
  return (
    <Link
      href="/wallet"
      aria-label="Open wallet"
      className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 transition-colors hover:border-volt/50"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-volt" : "bg-muted"}`}
        title={connected ? "Wallet connected" : "Wallet not connected"}
      />
      <span className="flex items-baseline gap-1 font-mono text-xs">
        <span className="font-bold text-volt">{goal}</span>
        <span className="text-muted">GOAL</span>
      </span>
      {sol && <span className="border-l border-line pl-2 font-mono text-xs text-chalk">{sol}</span>}
    </Link>
  );
}
