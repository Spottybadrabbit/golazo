"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { LiveFeed } from "@/lib/live-map";

// Live feed for the whole UI, from real TxODDS data. Two sources, both real and
// consistent (same upstream):
//   1. Convex reactive query `feed:live` (push updates) — when configured.
//   2. `/api/feed` serverless function (polled) — token stays server-side. The
//      source when Convex isn't configured, and a safety net if the reactive
//      query hasn't delivered fresh data yet.
// Whichever is live-and-fresher wins. No simulator.

const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const liveRef = makeFunctionReference<"query">("feed:live");
const POLL_MS = 5000;
const FRESH_MS = 30_000;

const LiveDataContext = createContext<LiveFeed | null>(null);
export const useLiveFeed = () => useContext(LiveDataContext);

function usePolledFeed(): LiveFeed | null {
  const [feed, setFeed] = useState<LiveFeed | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (res.ok && alive) setFeed((await res.json()) as LiveFeed);
      } catch {
        /* keep last value */
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return feed;
}

const isFresh = (f: LiveFeed | null, now: number): f is LiveFeed =>
  Boolean(f && f.mode === "live" && f.featured && now - f.updatedAt < FRESH_MS);

function ConvexPlusPolled({ children }: { children: ReactNode }) {
  const convex = useQuery(liveRef) as LiveFeed | undefined;
  const polled = usePolledFeed();
  const now = Date.now();
  const value = isFresh(convex ?? null, now) ? (convex as LiveFeed) : (polled ?? convex ?? null);
  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

function PolledOnly({ children }: { children: ReactNode }) {
  const polled = usePolledFeed();
  return <LiveDataContext.Provider value={polled}>{children}</LiveDataContext.Provider>;
}

export default function LiveDataProvider({ children }: { children: ReactNode }) {
  return convexOn ? (
    <ConvexPlusPolled>{children}</ConvexPlusPolled>
  ) : (
    <PolledOnly>{children}</PolledOnly>
  );
}
