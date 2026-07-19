"use client";

import { useEffect, useRef, useState } from "react";
import {
  currentRound,
  liveWorld,
  type HiLoRound,
  type LiveWorld,
} from "@/lib/engine";
import { buildLiveWorld, liveIsFresh } from "@/lib/live-map";
import { useLiveFeed } from "@/components/LiveDataProvider";

/**
 * Client heartbeat. Prefers the reactive Convex live feed (real TxODDS data)
 * when it is present and fresh; otherwise recomputes the deterministic
 * simulator every second so the UI still moves. Returns null until mounted
 * (server markup stays time-independent, avoiding hydration drift).
 */
export function useLiveWorld(): LiveWorld | null {
  const feed = useLiveFeed();
  const [sim, setSim] = useState<LiveWorld | null>(null);
  useEffect(() => {
    const update = () => setSim(liveWorld());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (liveIsFresh(feed, Date.now())) return buildLiveWorld(feed, Date.now());
  return sim;
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
