"use client";

import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useUser } from "@clerk/nextjs";
import {
  loadPlayer,
  registerPlayerSync,
  registerTxSync,
  savePlayer,
  type PlayerState,
} from "@/lib/game";

// Write-through bridge between lib/game.ts (localStorage, framework-free) and
// Convex (calm-parrot-940). Signed-out or Convex-down: everything degrades to
// the existing localStorage-only behaviour, no crashes, no thrown errors.
// Signed-in: on mount we hydrate the local player from Convex `players:me`,
// then every subsequent savePlayer/pushTx call in lib/game.ts mirrors up via
// the callbacks registered below, and screens can call usePersist() to log
// actions directly.
//
// convex/players.ts and convex/activity.ts are new modules that won't be in
// convex/_generated/api until the next `npx convex dev`/deploy, so —
// following the same pattern as components/LiveDataProvider.tsx's `feed:live`
// ref — we address them by string ref and type the call sites (below) rather
// than the reference itself: `DefaultFunctionArgs` requires an index
// signature that a plain interface can't satisfy.
const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

interface ConvexPlayerRow {
  handle: string;
  wallet?: string;
  xp: number;
  bestStreak: number;
  goalPoints: number;
  cards?: Record<string, number>;
}

const upsertPlayerRef = makeFunctionReference<"mutation">("players:upsert");
const meRef = makeFunctionReference<"query">("players:me");
const logActivityRef = makeFunctionReference<"mutation">("activity:log");
const recordGamePlayRef = makeFunctionReference<"mutation">("activity:recordGamePlay");
const recordPackOpenRef = makeFunctionReference<"mutation">("activity:recordPackOpen");
const startSessionRef = makeFunctionReference<"mutation">("activity:startSession");
const recordOnboardingRef = makeFunctionReference<"mutation">("activity:recordOnboarding");

type ActivityKind =
  | "screen_view"
  | "action"
  | "onboarding"
  | "game"
  | "reward"
  | "wallet"
  | "celebration";

interface RecordGamePlayArgs {
  game: "hilo" | "pool" | "cards";
  fixtureId?: number;
  roundRef?: string;
  pick?: string;
  lockedProb?: number;
  result?: "win" | "loss" | "void";
  delta?: number;
  streakAfter?: number;
}

interface RecordPackOpenArgs {
  cost: number;
  bestTier: string;
  cardCodes: string[];
}

interface RecordOnboardingArgs {
  step: number;
  goalId?: string;
  handle?: string;
  completedAt?: number;
  skipped?: boolean;
}

export interface PersistApi {
  logActivity: (kind: ActivityKind, name: string, screen?: string, meta?: unknown) => void;
  recordGamePlay: (args: RecordGamePlayArgs) => void;
  recordPackOpen: (args: RecordPackOpenArgs) => void;
  recordOnboarding: (args: RecordOnboardingArgs) => void;
  syncPlayer: (p: PlayerState) => void;
}

const NOOP_API: PersistApi = {
  logActivity: () => {},
  recordGamePlay: () => {},
  recordPackOpen: () => {},
  recordOnboarding: () => {},
  syncPlayer: () => {},
};

const PersistContext = createContext<PersistApi>(NOOP_API);

/** Actions to mirror to Convex; safely no-ops when signed out / Convex down. */
export const usePersist = () => useContext(PersistContext);

/** Catches any error from the Convex sync engine so a missing/failing backend
 * function never takes the rest of the app down with it — it just falls back
 * to localStorage-only behaviour for the session. */
class SyncErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[PlayerSync] Convex sync disabled after an error:", error);
    }
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function PlayerSync({ children }: { children: ReactNode }) {
  if (!clerkOn || !convexOn) return <>{children}</>;
  return <PersistProvider>{children}</PersistProvider>;
}

function PersistProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<PersistApi>(NOOP_API);
  return (
    <PersistContext.Provider value={api}>
      {/* Isolated from `children` on purpose: if the sync engine throws (e.g.
          these Convex functions aren't deployed yet), the boundary below
          swallows it and the real app content next to it keeps working. */}
      <SyncErrorBoundary>
        <SyncEngine onApi={setApi} />
      </SyncErrorBoundary>
      {children}
    </PersistContext.Provider>
  );
}

function SyncEngine({ onApi }: { onApi: (api: PersistApi) => void }) {
  const { isSignedIn, isLoaded } = useUser();
  const upsertPlayer = useMutation(upsertPlayerRef);
  const logActivityMut = useMutation(logActivityRef);
  const recordGamePlayMut = useMutation(recordGamePlayRef);
  const recordPackOpenMut = useMutation(recordPackOpenRef);
  const recordOnboardingMut = useMutation(recordOnboardingRef);
  const startSession = useMutation(startSessionRef);
  const me = useQuery(meRef, isSignedIn ? {} : "skip") as ConvexPlayerRow | null | undefined;

  const hydrated = useRef(false);
  const sessionStarted = useRef(false);

  const toRow = (p: PlayerState) => ({
    handle: p.handle ?? "Player",
    wallet: p.wallet ?? undefined,
    xp: p.xp,
    bestStreak: p.bestStreak,
    goalPoints: p.goalPoints,
    cards: p.cards,
  });

  // Register the write-through callbacks lib/game.ts's savePlayer/pushTx
  // fire on every state change. Cleared on sign-out so a subsequent
  // signed-out session never calls a Convex mutation.
  useEffect(() => {
    if (!isSignedIn) {
      registerPlayerSync(null);
      registerTxSync(null);
      return;
    }
    registerPlayerSync((p) => {
      upsertPlayer(toRow(p)).catch(() => {});
    });
    registerTxSync((_p, tx) => {
      logActivityMut({
        kind: "action",
        name: tx.kind,
        meta: { label: tx.label, goal: tx.goal, sol: tx.sol },
      }).catch(() => {});
    });
    return () => {
      registerPlayerSync(null);
      registerTxSync(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  // Login + session bookkeeping, once per sign-in.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || sessionStarted.current) return;
    sessionStarted.current = true;
    startSession({ userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined }).catch(
      () => {},
    );
    logActivityMut({ kind: "action", name: "login" }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) {
      hydrated.current = false;
      sessionStarted.current = false;
    }
  }, [isSignedIn]);

  // Hydrate localStorage from Convex once per sign-in: an existing account
  // adopts its Convex balances (Convex is the source of truth signed-in);
  // a brand-new account just seeds Convex from whatever's local so far.
  useEffect(() => {
    if (!isSignedIn || hydrated.current || me === undefined) return;
    hydrated.current = true;
    const local = loadPlayer();
    if (me) {
      const merged: PlayerState = {
        ...local,
        handle: me.handle || local.handle,
        xp: me.xp,
        bestStreak: Math.max(local.bestStreak, me.bestStreak),
        goalPoints: me.goalPoints,
        wallet: me.wallet ?? local.wallet,
        cards: { ...(local.cards ?? {}), ...(me.cards ?? {}) },
      };
      savePlayer(merged);
    } else {
      upsertPlayer(toRow(local)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, me]);

  const api = useMemo<PersistApi>(
    () => ({
      logActivity: (kind, name, screen, meta) => {
        if (!isSignedIn) return;
        logActivityMut({ kind, name, screen, meta }).catch(() => {});
      },
      recordGamePlay: (args) => {
        if (!isSignedIn) return;
        recordGamePlayMut(args).catch(() => {});
      },
      recordPackOpen: (args) => {
        if (!isSignedIn) return;
        recordPackOpenMut(args).catch(() => {});
      },
      recordOnboarding: (args) => {
        if (!isSignedIn) return;
        recordOnboardingMut(args).catch(() => {});
      },
      syncPlayer: (p) => {
        if (!isSignedIn) return;
        upsertPlayer(toRow(p)).catch(() => {});
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isSignedIn,
      logActivityMut,
      recordGamePlayMut,
      recordPackOpenMut,
      recordOnboardingMut,
      upsertPlayer,
    ],
  );

  useEffect(() => {
    onApi(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return null;
}
