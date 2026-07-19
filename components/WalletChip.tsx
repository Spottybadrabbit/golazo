"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatSol, loadPlayer, type PlayerState } from "@/lib/game";

/**
 * Compact balance pill in the top bar — the entry point to the wallet hub.
 * Shows GOAL always and SOL when a wallet is connected; tapping opens /wallet
 * where you connect / disconnect, view history, and change settings.
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

  const connected = Boolean(p.wallet);

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
        <span className="font-bold text-volt">{p.goalPoints}</span>
        <span className="text-muted">GOAL</span>
      </span>
      {connected && (
        <span className="hidden border-l border-line pl-2 font-mono text-xs text-chalk sm:inline">
          {formatSol(p.sol)}
        </span>
      )}
    </Link>
  );
}
