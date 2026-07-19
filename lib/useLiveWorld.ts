"use client";

import { useEffect, useState } from "react";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { buildLiveWorld } from "@/lib/live-map";
import type { HiLoRound, LiveWorld } from "@/lib/engine";

// The live world driving the game UI. There is NO simulator any more: this is
// built entirely from the REAL TxODDS feed (Convex `feed:live` via
// LiveDataProvider, with the /api/feed serverless poll as a same-source safety
// net). Returns null until the first real featured match arrives — the UI shows
// an "awaiting the live feed" state rather than ever fabricating a match.

export function useLiveWorld(): LiveWorld | null {
  const feed = useLiveFeed();
  // A once-per-second clock so the countdown ring + round roll over smoothly
  // between feed pushes. Null until mount keeps SSR markup time-independent.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;
  if (!feed || feed.mode !== "live" || !feed.featured) return null;
  return buildLiveWorld(feed, now);
}

export interface RoundClock {
  round: HiLoRound;
  /** 0..1 progress through the round */
  progress: number;
  secondsLeft: number;
}

/**
 * Count down the supplied real Hi-Lo round (from useLiveWorld → buildLiveWorld,
 * a pure 12s wall-clock round). rAF-driven for a smooth ring; no simulator math.
 */
export function useRoundClock(liveRound?: HiLoRound | null): RoundClock | null {
  const [clock, setClock] = useState<RoundClock | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (liveRound) {
        const now = Date.now();
        const total = liveRound.endsAt - liveRound.startedAt;
        const progress = Math.min(1, Math.max(0, (now - liveRound.startedAt) / total));
        setClock({
          round: liveRound,
          progress,
          secondsLeft: Math.max(0, Math.ceil((liveRound.endsAt - now) / 1000)),
        });
      } else {
        setClock(null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [liveRound]);

  return clock;
}
