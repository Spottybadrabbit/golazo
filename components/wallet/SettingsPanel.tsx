"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, useClerk, useUser } from "@clerk/nextjs";
import { BalanceCard, Toggle, TransactionHistory } from "@/components/wallet/WalletHub";
import {
  disconnectWallet,
  formatSol,
  loadPlayer,
  savePlayer,
  shortAddress,
  type PlayerState,
} from "@/lib/game";

// Dedicated settings screen: account/wallet info, current balances, the full
// transaction history, a devnet faucet link, and sound/motion preferences.
// Balance display is READ-ONLY — nothing here signs or transfers anything.
const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const FAUCET_URL = "https://faucet.solana.com";

export default function SettingsPanel() {
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
        <div className="animate-pulse font-mono text-sm text-muted">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">Settings</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
            Account · balances · history · preferences
          </p>
        </div>
        <Link
          href="/wallet"
          className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-chalk"
        >
          ← Wallet
        </Link>
      </div>

      {clerkOn ? (
        <RealAccount player={player} update={update} />
      ) : (
        <DemoAccount player={player} update={update} />
      )}

      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Transaction history
        </h2>
        <div className="mt-2">
          <TransactionHistory player={player} />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">Preferences</h2>
        <div className="mt-3 space-y-1">
          <Toggle
            label="Sound effects"
            on={player.sound}
            onChange={(v) => update({ ...player, sound: v })}
          />
          <Toggle
            label="Reduced motion"
            on={player.reducedMotion}
            onChange={(v) => update({ ...player, reducedMotion: v })}
          />
        </div>
      </section>
    </div>
  );
}

/** Signed-in account panel: real (read-only) devnet SOL balance + sign-out. */
function RealAccount({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const address = user?.web3Wallets?.[0]?.web3Wallet ?? null;
  const [sol, setSol] = useState<number | null>(null);
  const [balErr, setBalErr] = useState(false);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    fetch(`/api/balance?address=${encodeURIComponent(address)}&network=devnet`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("balance"))))
      .then((d: { sol?: number }) => {
        if (!alive) return;
        if (typeof d.sol === "number") setSol(d.sol);
        else setBalErr(true);
      })
      .catch(() => alive && setBalErr(true));
    return () => {
      alive = false;
    };
  }, [address]);

  if (!isLoaded) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">
        Loading account…
      </div>
    );
  }

  if (!address) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <p className="mx-auto max-w-sm text-sm text-muted">
          Connect a Solana wallet to see your devnet balance and history here.
        </p>
        <SignInButton mode="modal">
          <button className="mt-4 rounded-xl bg-volt px-6 py-3 font-extrabold uppercase tracking-wide text-night transition-transform hover:scale-[1.03] active:translate-y-px">
            Connect wallet
          </button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Wallet</div>
          <div className="mt-0.5 font-mono text-sm text-chalk">{shortAddress(address)}</div>
        </div>
        <button
          onClick={() => {
            update(disconnectWallet(loadPlayer()));
            void signOut();
          }}
          className="shrink-0 rounded-full border border-line bg-night px-4 py-1.5 text-xs font-semibold text-chalk transition-colors hover:border-down/60 hover:text-down"
        >
          Sign out
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BalanceCard
          label="SOL balance (devnet)"
          value={balErr ? "— SOL" : formatSol(sol ?? 0)}
          tint="cyan"
          icon="star"
        />
        <BalanceCard label="GOAL points" value={`${player.goalPoints}`} tint="volt" icon="bolt" />
      </div>
      {balErr && (
        <p className="mt-2 font-mono text-[11px] text-down">
          Couldn’t reach the Solana RPC for a live balance.
        </p>
      )}

      <TopUp />
    </div>
  );
}

/** Fallback account panel (no Clerk keys): local demo wallet. */
function DemoAccount({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
  if (!player.wallet) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <p className="mx-auto max-w-sm text-sm text-muted">
          Connect a Solana wallet from the Wallet tab to see your balance and history here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
            Wallet (demo)
          </div>
          <div className="mt-0.5 font-mono text-sm text-chalk">{shortAddress(player.wallet)}</div>
        </div>
        <button
          onClick={() => update(disconnectWallet(player))}
          className="shrink-0 rounded-full border border-line bg-night px-4 py-1.5 text-xs font-semibold text-chalk transition-colors hover:border-down/60 hover:text-down"
        >
          Disconnect
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BalanceCard label="SOL balance" value={formatSol(player.sol)} tint="cyan" icon="star" />
        <BalanceCard label="GOAL points" value={`${player.goalPoints}`} tint="volt" icon="bolt" />
      </div>

      <TopUp />
    </div>
  );
}

function TopUp() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-night/30 px-4 py-3">
      <p className="font-mono text-[11px] leading-relaxed text-muted">
        Need devnet SOL? It&apos;s free test currency — not real money.
      </p>
      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-volt px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-night transition-transform hover:scale-[1.03] active:translate-y-px"
      >
        Top up (devnet faucet) ↗
      </a>
    </div>
  );
}
