"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { LiveFeed } from "@/lib/live-map";

// Reactive live feed from Convex. We reference the query by string
// (`feed:live`) via makeFunctionReference so this compiles before
// `npx convex dev` has generated the typed api. When Convex isn't configured
// the context is simply null and the app runs on the simulator.
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const liveRef = makeFunctionReference<"query">("feed:live");

const LiveDataContext = createContext<LiveFeed | null>(null);
export const useLiveFeed = () => useContext(LiveDataContext);

function WithConvexLive({ children }: { children: ReactNode }) {
  const data = useQuery(liveRef) as LiveFeed | undefined;
  return <LiveDataContext.Provider value={data ?? null}>{children}</LiveDataContext.Provider>;
}

export default function LiveDataProvider({ children }: { children: ReactNode }) {
  if (!convexOn) {
    return <LiveDataContext.Provider value={null}>{children}</LiveDataContext.Provider>;
  }
  return <WithConvexLive>{children}</WithConvexLive>;
}
