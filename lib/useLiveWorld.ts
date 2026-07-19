"use client";

import { useEffect, useRef, useState } from "react";
import { currentRound, type HiLoRound, type LiveWorld } from "@/lib/engine";
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

/** The active Hi-Lo round plus a smooth rAF-driven countdown. */
export function useRoundClock(): RoundClock | null {
  const [clock, setClock] = useState<RoundClock | null>(null);
  const roundRef = useRef<HiLoRound | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      let round = roundRef.current;
      if (!round || now >= round.endsAt) {
        round = currentRound(now);
        roundRef.current = round;
      }
      const total = round.endsAt - round.startedAt;
      const progress = Math.min(1, Math.max(0, (now - round.startedAt) / total));
      setClock({
        round,
        progress,
        secondsLeft: Math.max(0, Math.ceil((round.endsAt - now) / 1000)),
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return clock;
}
