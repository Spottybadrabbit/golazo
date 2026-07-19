"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { LiveFeed } from "@/lib/live-map";

// The live feed can come from one of two sources, in priority order:
//   1. Convex reactive query `feed:live` — when NEXT_PUBLIC_CONVEX_URL is set
//      (the integrated poller pushes updates in real time).
//   2. The `/api/feed` serverless function — polled on an interval. This is the
//      default live path: it fetches the real TxODDS devnet feed server-side
//      (the API token never reaches the browser) and returns a LiveFeed.
// When neither yields live data the context is a `mode:"sim"` feed (or null),
// and the app runs on the deterministic engine.

const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const liveRef = makeFunctionReference<"query">("feed:live");

const LiveDataContext = createContext<LiveFeed | null>(null);
export const useLiveFeed = () => useContext(LiveDataContext);

function WithConvexLive({ children }: { children: ReactNode }) {
  const data = useQuery(liveRef) as LiveFeed | undefined;
  return <LiveDataContext.Provider value={data ?? null}>{children}</LiveDataContext.Provider>;
}

const POLL_MS = 4000;

function WithPolledLive({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<LiveFeed | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as LiveFeed;
          if (alive) setFeed(data);
        }
      } catch {
        /* keep last value; the UI falls back to sim when stale */
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

  return <LiveDataContext.Provider value={feed}>{children}</LiveDataContext.Provider>;
}

export default function LiveDataProvider({ children }: { children: ReactNode }) {
  if (convexOn) return <WithConvexLive>{children}</WithConvexLive>;
  return <WithPolledLive>{children}</WithPolledLive>;
}
