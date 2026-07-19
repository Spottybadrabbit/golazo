"use client";

import { useEffect, useMemo, useState } from "react";
import GlossyIcon from "@/components/icons/GlossyIcons";
import {
  connectWallet,
  disconnectWallet,
  formatSol,
  loadPlayer,
  resetDemo,
  savePlayer,
  shortAddress,
  type PlayerState,
  type Tx,
} from "@/lib/game";

type Tab = "overview" | "history" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export default function WalletHub() {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);

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
        <div className="animate-pulse font-mono text-sm text-muted">Opening your wallet…</div>
      </div>
    );
  }

  const connected = Boolean(player.wallet);

  const copy = async () => {
    if (!player.wallet) return;
    try {
      await navigator.clipboard.writeText(player.wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <div className="relative">
      {/* header */}
      <header className="floodlight relative overflow-hidden rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-center gap-3">
          <GlossyIcon name="bolt" tint="volt" size={40} />
          <div>
            <h1 className="text-2xl font-extrabold uppercase tracking-tight">Wallet</h1>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              {connected ? "Solana · connected" : "Solana · not connected"}
            </p>
          </div>
        </div>

        {connected ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <BalanceCard
              label="SOL balance"
              value={formatSol(player.sol)}
              tint="cyan"
              icon="star"
            />
            <BalanceCard
              label="GOAL points"
              value={`${player.goalPoints}`}
              tint="volt"
              icon="bolt"
            />
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-night/50 px-4 py-3">
              <button
                onClick={copy}
                className="font-mono text-sm text-chalk transition-colors hover:text-volt"
                title="Copy address"
              >
                {shortAddress(player.wallet!)} {copied ? "· copied ✓" : "· copy"}
              </button>
              <button
                onClick={() => update(disconnectWallet(player))}
                className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-chalk transition-colors hover:border-down/60 hover:text-down"
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-night/40 p-6 text-center">
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
              Connect a Solana wallet to hold your SOL float, enter money pools, and mint your
              pulled cards. Simulated for the demo — no real signing.
            </p>
            <button
              onClick={() => update(connectWallet(player))}
              className="mt-4 rounded-xl bg-volt px-6 py-3 font-extrabold uppercase tracking-wide text-night shadow-[0_0_28px_rgba(175,255,0,0.35)] transition-transform hover:scale-[1.03] active:translate-y-px"
            >
              Connect wallet
            </button>
          </div>
        )}
      </header>

      {/* tabs */}
      <div className="mt-5 flex gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-volt text-night" : "text-muted hover:text-chalk"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && <Overview player={player} />}
        {tab === "history" && <History player={player} />}
        {tab === "settings" && <Settings player={player} update={update} />}
      </div>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  tint,
  icon,
}: {
  label: string;
  value: string;
  tint: "volt" | "cyan";
  icon: "bolt" | "star";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-night/50 px-4 py-4">
      <GlossyIcon name={icon} tint={tint} size={34} />
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
        <div className="text-xl font-extrabold text-chalk">{value}</div>
      </div>
    </div>
  );
}

function Overview({ player }: { player: PlayerState }) {
  const earned = useMemo(
    () =>
      (player.ledger ?? [])
        .filter((t) => (t.goal ?? 0) > 0)
        .reduce((a, t) => a + (t.goal ?? 0), 0),
    [player.ledger],
  );
  const cardsOwned = Object.values(player.cards ?? {}).filter((n) => n > 0).length;
  const stats = [
    { label: "GOAL earned", value: `${earned}`, icon: "bolt" as const, tint: "volt" as const },
    { label: "Best streak", value: `${player.bestStreak}`, icon: "flame" as const, tint: "ember" as const },
    { label: "Correct calls", value: `${player.wins}`, icon: "ball" as const, tint: "volt" as const },
    { label: "Cards owned", value: `${cardsOwned}`, icon: "trophy" as const, tint: "gold" as const },
    { label: "Badges", value: `${player.badges.length}`, icon: "crown" as const, tint: "gold" as const },
    { label: "Picks made", value: `${player.picks}`, icon: "star" as const, tint: "cyan" as const },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
          <GlossyIcon name={s.icon} tint={s.tint} size={30} />
          <div className="mt-2 text-2xl font-extrabold text-chalk">{s.value}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function History({ player }: { player: PlayerState }) {
  const ledger = player.ledger ?? [];
  const made = ledger.filter((t) => (t.goal ?? 0) > 0).reduce((a, t) => a + (t.goal ?? 0), 0);
  const spent = ledger.filter((t) => (t.goal ?? 0) < 0).reduce((a, t) => a + (t.goal ?? 0), 0);

  if (!ledger.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
        <GlossyIcon name="trophy" tint="gold" size={44} className="mx-auto opacity-60" />
        <p className="mt-3 text-sm text-muted">
          No transactions yet. Bank a Hi-Lo streak or rip a pack and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Made</div>
          <div className="text-lg font-extrabold text-up">+{made} GOAL</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Spent</div>
          <div className="text-lg font-extrabold text-down">{spent} GOAL</div>
        </div>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {ledger.map((t) => (
          <LedgerRow key={t.id} tx={t} />
        ))}
      </ul>
    </div>
  );
}

const KIND_ICON: Record<Tx["kind"], "bolt" | "trophy" | "star" | "flame" | "crown" | "ball"> = {
  connect: "star",
  disconnect: "star",
  bank: "bolt",
  pack: "trophy",
  win: "ball",
  reset: "flame",
};

function LedgerRow({ tx }: { tx: Tx }) {
  const goal = tx.goal ?? 0;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <GlossyIcon name={KIND_ICON[tx.kind]} tint={goal >= 0 ? "volt" : "ember"} size={28} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-chalk">{tx.label}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {relTime(tx.ts)}
        </div>
      </div>
      {goal !== 0 && (
        <div className={`font-mono text-sm font-bold ${goal > 0 ? "text-up" : "text-down"}`}>
          {goal > 0 ? "+" : ""}
          {goal} GOAL
        </div>
      )}
      {tx.sol != null && goal === 0 && (
        <div className="font-mono text-sm font-bold text-cyan">{formatSol(tx.sol)}</div>
      )}
    </li>
  );
}

function Settings({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
  const [handle, setHandle] = useState(player.handle ?? "");
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <label className="font-mono text-[11px] uppercase tracking-widest text-muted">Handle</label>
        <div className="mt-2 flex gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.slice(0, 20))}
            placeholder="YourHandle"
            className="min-w-0 flex-1 rounded-xl border border-line bg-night px-4 py-2.5 text-sm text-chalk outline-none focus:border-volt/60"
          />
          <button
            onClick={() => update({ ...player, handle: handle.trim() || null })}
            className="rounded-xl bg-volt px-5 py-2.5 text-sm font-bold text-night transition-transform hover:scale-[1.03] active:translate-y-px"
          >
            Save
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">Preferences</h3>
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

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">Wallet</h3>
        <p className="mt-2 text-sm text-muted">
          {player.wallet ? shortAddress(player.wallet) : "No wallet connected."}
        </p>
        {player.wallet && (
          <button
            onClick={() => update(disconnectWallet(player))}
            className="mt-3 rounded-xl border border-line bg-night px-5 py-2.5 text-sm font-semibold text-chalk transition-colors hover:border-down/60 hover:text-down"
          >
            Log out of wallet
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-down/30 bg-down/5 p-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-down">Danger zone</h3>
        <p className="mt-2 text-sm text-muted">
          Reset the demo — clears balances, cards, streaks, and history.
        </p>
        <button
          onClick={() => {
            if (confirm("Reset all demo progress? This can’t be undone.")) update(resetDemo());
          }}
          className="mt-3 rounded-xl border border-down/50 bg-down/10 px-5 py-2.5 text-sm font-bold text-down transition-colors hover:bg-down/20"
        >
          Reset demo
        </button>
      </section>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between py-2 text-left"
      role="switch"
      aria-checked={on}
    >
      <span className="text-sm text-chalk">{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-volt" : "bg-night border border-line"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-chalk transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
          style={{ background: on ? "#0a0a0a" : "#9a9a92" }}
        />
      </span>
    </button>
  );
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
