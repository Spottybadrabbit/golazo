"use client";

import { useEffect, useState } from "react";
import { type HiLoRound, type LiveWorld } from "@/lib/engine";
import { buildLiveWorld, liveIsFresh } from "@/lib/live-map";
import { useLiveFeed } from "@/components/LiveDataProvider";

/**
 * Client heartbeat — LIVE ONLY. Builds the world from the reactive Convex feed
 * (real TxODDS data) when present and fresh. There is no simulator fallback:
 * when no live data is flowing we return null so consumers render an honest
 * "awaiting the feed" state rather than fabricated numbers. The 1s tick keeps
 * freshness re-checked and the clock moving between reactive pushes.
 */
export function useLiveWorld(): LiveWorld | null {
  const feed = useLiveFeed();
  const [, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null; // avoid hydration drift (time-dependent)
  const now = Date.now();
  if (liveIsFresh(feed, now)) return buildLiveWorld(feed, now);
  return null;
}

export interface RoundClock {
  round: HiLoRound;
  /** 0..1 progress through the round */
  progress: number;
  secondsLeft: number;
}

// Hi-Lo rounds are fixed 12-second windows on the wall clock, aligned to epoch
// so every client shares the same round boundaries. This is a pure timer — it
// always advances and can never get "stuck" (the old clock derived timing from
// the simulator's cycle/slot math, which could return an already-ended round
// and freeze the countdown at 0s). The value being called comes from the live
// feed in the component; this only drives the tick/lock timing.
const ROUND_MS = 12_000;

/** The active Hi-Lo round plus a smooth rAF-driven countdown. */
export function useRoundClock(): RoundClock | null {
  const [clock, setClock] = useState<RoundClock | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const idx = Math.floor(now / ROUND_MS);
      const startedAt = idx * ROUND_MS;
      const endsAt = startedAt + ROUND_MS;
      const round: HiLoRound = {
        id: `w-0-${idx}`,
        fixtureId: 0,
        stat: "WIN",
        statLabel: "win probability",
        question: "Higher or lower by the next tick?",
        lockValue: 0,
        unit: "%",
        startedAt,
        endsAt,
        team: "",
      };
      setClock({
        round,
        progress: Math.min(1, Math.max(0, (now - startedAt) / ROUND_MS)),
        secondsLeft: Math.max(0, Math.ceil((endsAt - now) / 1000)),
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return clock;
}
