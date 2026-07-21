"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BalanceCard, TransactionHistory } from "@/components/wallet/WalletHub";
import TopUpPanel from "@/components/wallet/TopUpPanel";
import { formatSol, loadPlayer, savePlayer, shortAddress, type PlayerState } from "@/lib/game";

// Wallet tab for /profile: an at-a-glance GOAL + Solana wallet summary, a
// play-money top-up, and the bank-balance history — reusing BalanceCard and
// TransactionHistory already exported from components/wallet/WalletHub.tsx
// (same pattern as components/wallet/SettingsPanel.tsx). The full
// connect/disconnect/settings flow still lives at /wallet.

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export default function ProfileWallet() {
  const [player, setPlayer] = useState<PlayerState | null>(null);

  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);

  const update = (next: PlayerState) => {
    savePlayer(next);
    setPlayer(next);
  };

  if (!player) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">Loading wallet…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">Balances</h2>
        <Link href="/wallet" className="text-xs font-semibold text-volt hover:underline">
          Full wallet →
        </Link>
      </div>

      {clerkOn && convexOn ? (
        <ConvexBalances player={player} />
      ) : (
        <LocalBalances player={player} />
      )}

      <TopUpPanel player={player} update={update} />

      <div>
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Bank history
        </h2>
        <div className="mt-2">
          <TransactionHistory player={player} />
        </div>
      </div>
    </div>
  );
}

function LocalBalances({ player }: { player: PlayerState }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <BalanceCard label="GOAL points" value={`${player.goalPoints}`} tint="volt" icon="bolt" />
      <BalanceCard
        label={player.wallet ? "SOL balance" : "Wallet"}
        value={player.wallet ? formatSol(player.sol) : "Not connected"}
        tint="cyan"
        icon="star"
      />
      {player.wallet && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-night/50 px-4 py-3 sm:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Address
          </span>
          <span className="font-mono text-sm text-chalk">{shortAddress(player.wallet)}</span>
        </div>
      )}
    </div>
  );
}

/** Signed-in: GOAL + reactive play-money SOL balance from the primary
 * BalanceCard grid, plus a small read-only line for the true on-chain devnet
 * balance when a Solana wallet is connected — same split as WalletHub's
 * RealPanel (the on-chain figure is informational only, never used for
 * betting or stake caps). */
function ConvexBalances({ player }: { player: PlayerState }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const address = user?.web3Wallets?.[0]?.web3Wallet ?? null;
  const balance = useQuery(api.wallet.playBalance);
  const [chainSol, setChainSol] = useState<number | null>(null);
  const [balErr, setBalErr] = useState(false);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    fetch(`/api/balance?address=${encodeURIComponent(address)}&network=devnet`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("balance"))))
      .then((d: { sol?: number }) => {
        if (!alive) return;
        if (typeof d.sol === "number") setChainSol(d.sol);
        else setBalErr(true);
      })
      .catch(() => alive && setBalErr(true));
    return () => {
      alive = false;
    };
  }, [address]);

  if (!isLoaded || !isSignedIn) return <LocalBalances player={player} />;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceCard label="GOAL points" value={`${player.goalPoints}`} tint="volt" icon="bolt" />
        <BalanceCard
          label={address ? "SOL balance" : "Wallet"}
          value={address ? formatSol(balance ?? player.sol) : "Not connected"}
          tint="cyan"
          icon="star"
        />
      </div>
      {address && (
        <div className="mt-3 rounded-2xl border border-line bg-night/50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Address
            </span>
            <span className="font-mono text-sm text-chalk">{shortAddress(address)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Devnet (on-chain, read-only)
            </span>
            <span className="font-mono text-xs text-muted">
              {balErr ? "— SOL" : chainSol === null ? "loading…" : formatSol(chainSol)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
