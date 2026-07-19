"use client";

import { useEffect, useState } from "react";
import { connectWallet, disconnectWallet, loadPlayer, savePlayer, shortAddress } from "@/lib/game";

/** Demo Solana wallet connect: generates a session address, no real signing. */
export default function WalletButton() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setWallet(loadPlayer().wallet);
  }, []);

  const connect = () => {
    if (wallet) {
      const next = disconnectWallet(loadPlayer());
      savePlayer(next);
      setWallet(null);
      return;
    }
    setConnecting(true);
    setTimeout(() => {
      const next = connectWallet(loadPlayer());
      savePlayer(next);
      setWallet(next.wallet);
      setConnecting(false);
    }, 650);
  };

  return (
    <button
      onClick={connect}
      className="group flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-mono text-xs text-chalk transition-colors hover:border-volt/60 active:translate-y-px"
      title="Demo wallet, no real transactions"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${wallet ? "bg-up" : "bg-muted"}`}
      />
      {connecting ? "Connecting..." : wallet ? shortAddress(wallet) : "Connect wallet"}
    </button>
  );
}
