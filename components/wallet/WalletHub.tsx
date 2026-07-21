"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SignInButton, useClerk, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import GlossyIcon from "@/components/icons/GlossyIcons";
import TopUpPanel from "@/components/wallet/TopUpPanel";
import {
  connectWallet,
  disconnectWallet,
  formatSol,
  loadPlayer,
  pushTx,
  resetDemo,
  savePlayer,
  shortAddress,
  type PlayerState,
  type Tx,
} from "@/lib/game";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const FAUCET_URL = "https://faucet.solana.com";

type Tab = "overview" | "history" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export default function WalletHub() {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

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

  return (
    <div className="relative">
      {clerkOn ? (
        <RealPanel player={player} update={update} />
      ) : (
        <DemoPanel player={player} update={update} />
      )}

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
        {tab === "overview" && <Overview player={player} update={update} />}
        {tab === "history" && <TransactionHistory player={player} />}
        {tab === "settings" && <Settings player={player} update={update} realWallet={clerkOn} />}
      </div>
    </div>
  );
}

function HeaderShell({
  status,
  children,
}: {
  status: string;
  children: React.ReactNode;
}) {
  return (
    <header className="floodlight relative overflow-hidden rounded-3xl border border-line bg-surface p-6">
      <div className="flex items-center gap-3">
        <GlossyIcon name="bolt" tint="volt" size={40} />
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">Wallet</h1>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">{status}</p>
        </div>
      </div>
      {children}
    </header>
  );
}

function BalanceGrid({
  sol,
  goal,
  address,
  onLogout,
  copy,
  copied,
}: {
  sol: React.ReactNode;
  goal: number;
  address: string;
  onLogout: () => void;
  copy: () => void;
  copied: boolean;
}) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <BalanceCard label="SOL balance" value={sol} tint="cyan" icon="star" />
      <BalanceCard label="GOAL points" value={`${goal}`} tint="volt" icon="bolt" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-night/50 px-4 py-3 sm:col-span-2">
        <button
          onClick={copy}
          className="font-mono text-sm text-chalk transition-colors hover:text-volt"
          title="Copy address"
        >
          {shortAddress(address)} {copied ? "· copied ✓" : "· copy"}
        </button>
        <button
          onClick={onLogout}
          className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-chalk transition-colors hover:border-down/60 hover:text-down"
        >
          Log out
        </button>
      </div>
      <TopUpLink className="sm:col-span-2" />
    </div>
  );
}

/** Devnet faucet link — the user opens it themselves; this app never signs or
 * sends anything. Free test SOL only, no real value. */
function TopUpLink({ className }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-line bg-night/30 px-4 py-3 ${className ?? ""}`}
    >
      <p className="font-mono text-[11px] leading-relaxed text-muted">
        Need devnet SOL? It&apos;s free test currency — not real money.
      </p>
      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-volt px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-night transition-transform hover:scale-[1.03] active:translate-y-px"
      >
        Top up ↗
      </a>
    </div>
  );
}

function useCopy(address: string | null) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return { copy, copied };
}

/** Real wallet via Clerk's Solana sign-in. The primary SOL figure is the
 * reactive play-money `playBalance` (escrow + instant-settlement ledger) —
 * the real on-chain devnet balance is fetched only for the small read-only
 * secondary line below, and never overwrites the play-money figure. */
function RealPanel({ player, update }: { player: PlayerState; update: (p: PlayerState) => void }) {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const address = user?.web3Wallets?.[0]?.web3Wallet ?? null;
  const { copy, copied } = useCopy(address);
  const [chainSol, setChainSol] = useState<number | null>(null);
  const [balErr, setBalErr] = useState(false);

  // Sync the real address in and pull the on-chain SOL balance for display
  // only — it never feeds the play-money balance shown for betting.
  useEffect(() => {
    if (!address) return;
    let alive = true;
    const base = loadPlayer();
    if (base.wallet !== address) {
      update(pushTx({ ...base, wallet: address }, { kind: "connect", label: "Wallet connected" }));
    }
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
    // address is the only trigger; update/player intentionally excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (!isLoaded) {
    return <HeaderShell status="Solana · connecting…">{null}</HeaderShell>;
  }

  if (address) {
    return (
      <HeaderShell status="Solana · connected (live)">
        <BalanceGrid
          sol={<PlayBalanceValue fallback={player.sol} />}
          goal={player.goalPoints}
          address={address}
          onLogout={() => {
            update(disconnectWallet(loadPlayer()));
            void signOut();
          }}
          copy={copy}
          copied={copied}
        />
        <DevnetBalanceLine chainSol={chainSol} balErr={balErr} />
      </HeaderShell>
    );
  }

  return (
    <HeaderShell status="Solana · not connected">
      <div className="mt-5 rounded-2xl border border-dashed border-line bg-night/40 p-6 text-center">
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
          Sign in with your Solana wallet to hold your SOL, enter money pools, and mint your pulled
          cards. Your real on-chain balance shows once connected.
        </p>
        <SignInButton mode="modal">
          <button className="mt-4 rounded-xl bg-volt px-6 py-3 font-extrabold uppercase tracking-wide text-night shadow-[0_0_28px_rgba(175,255,0,0.35)] transition-transform hover:scale-[1.03] active:translate-y-px">
            Connect wallet
          </button>
        </SignInButton>
      </div>
    </HeaderShell>
  );
}

/** The primary SOL figure once signed in: the reactive Convex `playBalance`
 * when Convex is configured (falling back to the local float while the query
 * is loading), else the local demo float. Only calls `useQuery` when Convex
 * is actually configured — same gating pattern as `TransactionHistory` below. */
function PlayBalanceValue({ fallback }: { fallback: number }) {
  if (!convexOn) return <>{formatSol(fallback)}</>;
  return <ConvexPlayBalanceValue fallback={fallback} />;
}

function ConvexPlayBalanceValue({ fallback }: { fallback: number }) {
  const balance = useQuery(api.wallet.playBalance);
  return <>{formatSol(balance ?? fallback)}</>;
}

/** Small, clearly-separate read-only line for the real on-chain devnet
 * balance — informational only, never used for betting or stake caps. */
function DevnetBalanceLine({ chainSol, balErr }: { chainSol: number | null; balErr: boolean }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-line bg-night/30 px-4 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        Devnet wallet (on-chain, read-only)
      </span>
      <span className="font-mono text-xs text-muted">
        {balErr ? "— SOL" : chainSol === null ? "loading…" : formatSol(chainSol)}
      </span>
    </div>
  );
}

/** Fallback wallet (no Clerk keys): simulated connect for local/demo runs. */
function DemoPanel({ player, update }: { player: PlayerState; update: (p: PlayerState) => void }) {
  const { copy, copied } = useCopy(player.wallet);
  const connected = Boolean(player.wallet);

  if (connected) {
    return (
      <HeaderShell status="Solana · connected (demo)">
        <BalanceGrid
          sol={formatSol(player.sol)}
          goal={player.goalPoints}
          address={player.wallet!}
          onLogout={() => update(disconnectWallet(player))}
          copy={copy}
          copied={copied}
        />
      </HeaderShell>
    );
  }

  return (
    <HeaderShell status="Solana · not connected">
      <div className="mt-5 rounded-2xl border border-dashed border-line bg-night/40 p-6 text-center">
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
          Connect a Solana wallet to hold your SOL float, enter money pools, and mint your pulled
          cards. Simulated for the demo — no real signing.
        </p>
        <button
          onClick={() => update(connectWallet(player))}
          className="mt-4 rounded-xl bg-volt px-6 py-3 font-extrabold uppercase tracking-wide text-night shadow-[0_0_28px_rgba(175,255,0,0.35)] transition-transform hover:scale-[1.03] active:translate-y-px"
        >
          Connect wallet
        </button>
      </div>
    </HeaderShell>
  );
}

export function BalanceCard({
  label,
  value,
  tint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
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

function Overview({
  player,
  update,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
}) {
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
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
            <GlossyIcon name={s.icon} tint={s.tint} size={30} />
            <div className="mt-2 text-2xl font-extrabold text-chalk">{s.value}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <TopUpPanel player={player} update={update} />
    </div>
  );
}

/** History tab: Convex `myLedger` (durable, cross-device) for signed-in
 * players when Convex is configured; the local demo ledger otherwise. Gates
 * on the *runtime* sign-in state (not just whether Clerk is configured) so a
 * signed-out visitor still sees their local ledger instead of an always-empty
 * Convex query. */
export function TransactionHistory({ player }: { player: PlayerState }) {
  if (!convexOn) return <History player={player} />;
  return clerkOn ? (
    <TransactionHistoryAuthGate player={player} />
  ) : (
    <History player={player} />
  );
}

function TransactionHistoryAuthGate({ player }: { player: PlayerState }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <History player={player} />;
  return isSignedIn ? <ConvexHistory /> : <History player={player} />;
}

const LEDGER_KIND_ICON: Record<
  "earn" | "spend" | "reward" | "promo" | "bonus" | "refund",
  "bolt" | "trophy" | "star" | "flame" | "crown" | "ball"
> = {
  earn: "bolt",
  spend: "ball",
  reward: "trophy",
  promo: "crown",
  bonus: "star",
  refund: "flame",
};

function ConvexHistory() {
  const rows = useQuery(api.wallet.myLedger, {});

  if (rows === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">Loading history…</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
        <GlossyIcon name="trophy" tint="gold" size={44} className="mx-auto opacity-60" />
        <p className="mt-3 text-sm text-muted">
          No transactions yet. Place a play-money bet and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r._id} className="flex items-center gap-3 px-4 py-3">
          <GlossyIcon
            name={LEDGER_KIND_ICON[r.kind]}
            tint={r.amount >= 0 ? "volt" : "ember"}
            size={28}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-chalk">{r.reason}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {relTime(r.createdAt)}
            </div>
          </div>
          <div className="text-right">
            <div
              className={`font-mono text-sm font-bold ${r.amount >= 0 ? "text-up" : "text-down"}`}
            >
              {r.amount > 0 ? "+" : ""}
              {r.amount} {r.currency}
            </div>
            {/* balanceAfter is only shown for GOAL: pool bets' SOL rows
                (convex/wallet.ts placeBet) compute balanceAfter without the
                SOL play-money INITIAL_GRANT, so it doesn't reconcile with
                the SOL balance shown elsewhere — a pre-existing quirk out
                of scope here, left un-displayed rather than shown wrong. */}
            {r.currency === "GOAL" && (
              <div className="font-mono text-[10px] text-muted">bal {r.balanceAfter} GOAL</div>
            )}
          </div>
        </li>
      ))}
    </ul>
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
  bet: "ball",
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
  realWallet,
}: {
  player: PlayerState;
  update: (p: PlayerState) => void;
  realWallet: boolean;
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
          {realWallet && player.wallet ? " · live devnet balance" : ""}
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-block text-sm font-semibold text-volt hover:underline"
        >
          Open full settings →
        </Link>
      </section>

      {realWallet && <DangerZone update={update} />}
    </div>
  );
}

/** Signed-in-only: permanently deletes the player's own Clerk account. Only
 * mounted when `realWallet` (clerkOn) is true, so `useUser()` always has a
 * `ClerkProvider` ancestor — same gating pattern as `RealPanel` above. */
function DangerZone({ update }: { update: (p: PlayerState) => void }) {
  const { isSignedIn, user } = useUser();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) return null;

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await user?.delete();
      update(resetDemo());
    } catch {
      setError("Couldn’t delete your account. Please try again.");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-down/30 bg-down/5 p-5">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-down">Danger zone</h3>
      <p className="mt-2 text-sm text-muted">
        Permanently delete your account and all your data. This cannot be undone.
      </p>
      {error && <p className="mt-2 text-sm text-down">{error}</p>}
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-chalk">Are you sure?</span>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="rounded-xl bg-down px-4 py-2 text-sm font-bold text-night transition-colors hover:bg-down/80 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-chalk transition-colors hover:text-volt"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-xl border border-down/50 bg-down/10 px-5 py-2.5 text-sm font-bold text-down transition-colors hover:bg-down/20"
        >
          Delete account
        </button>
      )}
    </section>
  );
}

export function Toggle({
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
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-volt" : "border border-line bg-night"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
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
