"use client";

import { useCallback, useEffect, useState } from "react";
import { SignInButton, useClerk, useUser } from "@clerk/nextjs";
import {
  level,
  loadPlayer,
  multiplier,
  savePlayer,
  shortAddress,
  type PlayerState,
} from "@/lib/game";

type View = "balance" | "history" | "settings";
type Net = "devnet" | "mainnet";

// Mirror AuthButton: Clerk hooks/components may only render when a key is set,
// otherwise there is no provider and they throw. Gate the whole Clerk subtree.
const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const SETTINGS_KEY = "golazo.settings";

function loadNetwork(): Net {
  if (typeof window === "undefined") return "devnet";
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return "devnet";
    const parsed = JSON.parse(raw) as { network?: string };
    return parsed.network === "mainnet" ? "mainnet" : "devnet";
  } catch {
    return "devnet";
  }
}

function saveNetwork(network: Net) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ network }));
}

// Solana base58 addresses are 32-44 chars from this alphabet. Used to decide
// whether an address is worth hitting the RPC for.
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function looksBase58(a: string | null | undefined): a is string {
  return typeof a === "string" && B58_RE.test(a);
}

export default function WalletCenter() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("balance");
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [network, setNetworkState] = useState<Net>("devnet");

  useEffect(() => {
    setPlayer(loadPlayer());
    setNetworkState(loadNetwork());
    setMounted(true);
  }, []);

  // Shared setter: keeps the Balance fetch and the Settings preference in sync,
  // and persists the choice.
  const setNetwork = useCallback((n: Net) => {
    setNetworkState(n);
    saveNetwork(n);
  }, []);

  const refreshPlayer = useCallback(() => setPlayer(loadPlayer()), []);

  return (
    <div>
      <header className="mb-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">GOLAZO</p>
        <h2 className="text-2xl font-extrabold uppercase tracking-tight">Wallet Center</h2>
      </header>

      {/* segmented control */}
      <div className="mb-5 flex gap-2 rounded-full border border-line bg-surface p-1">
        <Segment active={view === "balance"} onClick={() => setView("balance")}>
          Balance
        </Segment>
        <Segment active={view === "history"} onClick={() => setView("history")}>
          History
        </Segment>
        <Segment active={view === "settings"} onClick={() => setView("settings")}>
          Settings
        </Segment>
      </div>

      {!mounted || !player ? (
        <div className="flex h-72 items-center justify-center">
          <div className="animate-pulse font-mono text-sm text-muted">Opening the wallet...</div>
        </div>
      ) : view === "balance" ? (
        <BalanceView player={player} network={network} setNetwork={setNetwork} />
      ) : view === "history" ? (
        <HistoryView player={player} />
      ) : (
        <SettingsView
          player={player}
          network={network}
          setNetwork={setNetwork}
          onSaved={refreshPlayer}
        />
      )}
    </div>
  );
}

/* ----------------------------- balance view ----------------------------- */

interface Identity {
  address: string | null; // base58 chain address, when present
  label: string | null; // human label when signed in without a chain address
  signedIn: boolean;
  onSignOut?: () => void;
  // What to render when there is no usable chain address.
  noAddressSlot: React.ReactNode;
}

function BalanceView({
  player,
  network,
  setNetwork,
}: {
  player: PlayerState;
  network: Net;
  setNetwork: (n: Net) => void;
}) {
  if (clerkOn) {
    return <ClerkBalance player={player} network={network} setNetwork={setNetwork} />;
  }
  return <MockBalance player={player} network={network} setNetwork={setNetwork} />;
}

function ClerkBalance({
  player,
  network,
  setNetwork,
}: {
  player: PlayerState;
  network: Net;
  setNetwork: (n: Net) => void;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();

  if (!isLoaded) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">Checking your session...</div>
      </div>
    );
  }

  const address = user?.web3Wallets?.[0]?.web3Wallet ?? null;
  const label =
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "player";

  const identity: Identity = {
    address,
    label: isSignedIn ? label : null,
    signedIn: Boolean(isSignedIn),
    onSignOut: () => clerk.signOut(),
    noAddressSlot: isSignedIn ? (
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-up" />
          <span className="font-mono text-sm text-chalk">{label}</span>
        </div>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
          No Solana wallet linked to this account yet. Link one in sign-in to pull a live SOL
          balance.
        </p>
      </div>
    ) : (
      <div className="mt-4">
        <p className="font-mono text-[11px] leading-relaxed text-muted">
          Connect a wallet to see your live SOL balance.
        </p>
        <SignInButton mode="modal">
          <button className="mt-3 inline-flex items-center gap-2 rounded-full bg-volt px-4 py-2 text-sm font-bold text-night transition-transform hover:scale-[1.03] active:translate-y-px">
            Connect wallet
          </button>
        </SignInButton>
      </div>
    ),
  };

  return <BalanceBody identity={identity} player={player} network={network} setNetwork={setNetwork} />;
}

function MockBalance({
  player,
  network,
  setNetwork,
}: {
  player: PlayerState;
  network: Net;
  setNetwork: (n: Net) => void;
}) {
  const address = player.wallet;
  const identity: Identity = {
    address,
    label: null,
    signedIn: false,
    noAddressSlot: (
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
        No demo wallet connected. Use “Connect wallet” in the top bar to spin up a session address.
        Sign-in is disabled in this build.
      </p>
    ),
  };
  return <BalanceBody identity={identity} player={player} network={network} setNetwork={setNetwork} />;
}

function BalanceBody({
  identity,
  player,
  network,
  setNetwork,
}: {
  identity: Identity;
  player: PlayerState;
  network: Net;
  setNetwork: (n: Net) => void;
}) {
  const { address } = identity;
  const canFetch = looksBase58(address);

  const [sol, setSol] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!looksBase58(address)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/balance?address=${encodeURIComponent(address)}&network=${network}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { sol: number | null };
      setSol(data.sol);
    } catch {
      setSol(null);
      setError("Couldn't reach the network. Try again.");
    } finally {
      setLoading(false);
    }
  }, [address, network]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return (
    <div className="space-y-4">
      {/* wallet + live balance */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Wallet</span>
          {identity.signedIn && identity.onSignOut && (
            <button
              onClick={identity.onSignOut}
              className="rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-ember/60 hover:text-ember"
            >
              Log out
            </button>
          )}
        </div>

        {canFetch ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-up" />
              <span className="font-mono text-sm text-chalk">{shortAddress(address)}</span>
              <span className="truncate font-mono text-[11px] text-muted">{address}</span>
            </div>

            {/* network toggle */}
            <div className="mt-4 flex gap-1.5">
              <NetPill active={network === "devnet"} onClick={() => setNetwork("devnet")}>
                devnet
              </NetPill>
              <NetPill active={network === "mainnet"} onClick={() => setNetwork("mainnet")}>
                mainnet
              </NetPill>
            </div>

            {/* balance */}
            <div className="mt-4 flex items-end justify-between">
              <div>
                {loading ? (
                  <span className="animate-pulse font-mono text-5xl font-semibold tracking-tight text-muted">
                    ···
                  </span>
                ) : (
                  <span className="font-mono text-5xl font-semibold tracking-tight">
                    {sol ?? "—"}
                    <span className="ml-2 text-2xl text-muted">SOL</span>
                  </span>
                )}
                <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
                  {network} balance
                </div>
              </div>
              <button
                onClick={fetchBalance}
                disabled={loading}
                aria-label="Refresh balance"
                className="rounded-full border border-line px-3 py-2 font-mono text-xs text-chalk transition-colors hover:border-volt/60 disabled:opacity-50"
              >
                ↻ Refresh
              </button>
            </div>
            {error && <p className="mt-2 font-mono text-[11px] text-ember">{error}</p>}
            {!loading && !error && sol === null && (
              <p className="mt-2 font-mono text-[11px] text-muted">
                No balance to show for this address on {network}.
              </p>
            )}
          </>
        ) : (
          identity.noAddressSlot
        )}
      </div>

      {/* in-app economy */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          In-app economy
        </span>
        <div className="mt-3">
          <span className="font-mono text-5xl font-semibold tracking-tight">
            {player.goalPoints}
            <span className="ml-2 text-2xl text-muted">GOAL</span>
          </span>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
            play-money balance
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatTile label="XP" value={String(player.xp)} />
          <StatTile label="Level" value={String(level(player.xp))} accent />
          <StatTile label="Best streak" value={String(player.bestStreak)} />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- history view ----------------------------- */

function HistoryView({ player }: { player: PlayerState }) {
  const cardsOwned = Object.keys(player.cards ?? {}).length;
  const rows: { label: string; value: string }[] = [
    { label: "GOAL balance", value: `${player.goalPoints}` },
    {
      label: "Best streak",
      value: `${player.bestStreak} · ${multiplier(player.bestStreak)}x boost`,
    },
    { label: "Correct calls / total picks", value: `${player.wins} / ${player.picks}` },
    { label: "Cards collected", value: `${cardsOwned}` },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Earnings ledger
        </span>
        <div className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-3">
              <span className="text-sm text-muted">{r.label}</span>
              <span className="font-mono text-sm text-chalk">{r.value}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
          Full on-chain payout history activates with live TxODDS settlement.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- settings view ---------------------------- */

function SettingsView({
  player,
  network,
  setNetwork,
  onSaved,
}: {
  player: PlayerState;
  network: Net;
  setNetwork: (n: Net) => void;
  onSaved: () => void;
}) {
  const [handle, setHandle] = useState(player.handle ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    const trimmed = handle.trim();
    savePlayer({ ...loadPlayer(), handle: trimmed === "" ? null : trimmed });
    setSaved(true);
    onSaved();
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-4">
      {/* handle */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <label
          htmlFor="wallet-handle"
          className="font-mono text-[11px] uppercase tracking-widest text-muted"
        >
          Handle
        </label>
        <div className="mt-3 flex gap-2">
          <input
            id="wallet-handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="pick a handle"
            maxLength={24}
            className="min-w-0 flex-1 rounded-xl border border-line bg-night px-4 py-2.5 font-mono text-sm text-chalk outline-none transition-colors placeholder:text-muted focus:border-volt/60"
          />
          <button
            onClick={save}
            className="shrink-0 rounded-xl bg-volt px-5 py-2.5 text-sm font-bold text-night transition-transform hover:scale-[1.02] active:translate-y-px"
          >
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* preferred network */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Preferred network
        </span>
        <div className="mt-3 flex gap-1.5">
          <NetPill active={network === "devnet"} onClick={() => setNetwork("devnet")}>
            devnet
          </NetPill>
          <NetPill active={network === "mainnet"} onClick={() => setNetwork("mainnet")}>
            mainnet
          </NetPill>
        </div>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
          Used for the balance lookup. Saved to this device.
        </p>
      </div>

      {/* read-only info */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Info</span>
        <div className="mt-3 divide-y divide-line">
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-muted">Reduced motion</span>
            <span className="font-mono text-xs text-chalk">respects your OS setting</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-muted">Demo mode</span>
            <span className="font-mono text-xs text-chalk">play money (GOAL points)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ primitives ------------------------------ */

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
        active ? "bg-volt text-night" : "text-muted hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}

function NetPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
        active ? "border-volt bg-volt/10 text-volt" : "border-line text-muted hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-center">
      <div className={`font-mono text-2xl font-semibold ${accent ? "text-volt" : ""}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}
