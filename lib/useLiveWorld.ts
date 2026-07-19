"use client";

import { useEffect, useRef, useState } from "react";
import {
  currentRound,
  liveWorld,
  type HiLoRound,
  type LiveWorld,
  type MatchState,
} from "@/lib/engine";

// Mirrors the server's TXLINE_MODE (see .env.local.example). The browser
// bundle can only read NEXT_PUBLIC_-prefixed vars at build time, so this has
// to be set separately and kept in sync for the client to actually switch
// from the local simulator heartbeat to polling the server feed.
const LIVE_MODE = process.env.NEXT_PUBLIC_FEED_MODE === "live";

const MIN_POLL_MS = 2000;

// Shape of each entry in GET /api/live's `matches` array: everything in
// MatchState except the simulator-only `cycle`/`slot` bookkeeping fields
// (see app/api/live/route.ts).
type ApiMatch = Omit<MatchState, "cycle" | "slot">;

interface ApiLiveResponse {
  mode: "sim" | "live";
  ready: boolean;
  now: number;
  nextTickAt: number;
  round: HiLoRound;
  matches: ApiMatch[];
}

function pickFeatured(matches: MatchState[]): MatchState | undefined {
  const live = matches.filter((m) => m.phase === "LIVE");
  return (live.length ? live : matches).sort((a, b) => b.minute - a.minute)[0];
}

/**
 * The live world driving the UI. In sim mode (default) this recomputes the
 * deterministic world every second so everything moves fluidly between feed
 * ticks. In live mode (NEXT_PUBLIC_FEED_MODE=live) it instead polls the
 * server's GET /api/live, re-fetching shortly after each `nextTickAt` (at
 * least every MIN_POLL_MS), and returns null until the first ready response.
 * Either way, server markup stays time-independent (null until mount) to
 * avoid hydration drift.
 */
export function useLiveWorld(): LiveWorld | null {
  const [world, setWorld] = useState<LiveWorld | null>(null);

  useEffect(() => {
    if (!LIVE_MODE) {
      const update = () => setWorld(liveWorld());
      update();
      const id = setInterval(update, 1000);
      return () => clearInterval(id);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = (nextTickAt: number) => {
      if (cancelled) return;
      const delay = Math.max(MIN_POLL_MS, nextTickAt - Date.now() + 500);
      timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as ApiLiveResponse;
          if (data.ready) {
            const matches: MatchState[] = data.matches.map((m, idx) => ({
              ...m,
              cycle: 0,
              slot: idx,
            }));
            const featured = pickFeatured(matches);
            if (!cancelled && featured) {
              setWorld({
                now: data.now,
                nextTickAt: data.nextTickAt,
                matches,
                featured,
                round: data.round,
              });
            }
            scheduleNext(data.nextTickAt);
            return;
          }
        }
      } catch {
        // network hiccup — keep showing the last known world, retry shortly
      }
      scheduleNext(Date.now() + MIN_POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return world;
}

export interface RoundClock {
  round: HiLoRound;
  /** 0..1 progress through the round */
  progress: number;
  secondsLeft: number;
}

/**
 * The active Hi-Lo round plus a smooth rAF-driven countdown. In sim mode
 * this computes the round locally (unchanged). In live mode it is driven by
 * the `round` supplied by the caller (from GET /api/live via useLiveWorld,
 * since Hi-Lo round timing stays simulator-driven either way — see
 * app/api/live/route.ts) rather than recomputed client-side.
 */
export function useRoundClock(liveRound?: HiLoRound | null): RoundClock | null {
  const [clock, setClock] = useState<RoundClock | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      let round: HiLoRound | null;
      if (LIVE_MODE) {
        round = liveRound ?? null;
      } else {
        let r = roundRef.current;
        if (!r || now >= r.endsAt) {
          r = currentRound(now);
          roundRef.current = r;
        }
        round = r;
      }
      if (round) {
        const total = round.endsAt - round.startedAt;
        const progress = Math.min(1, Math.max(0, (now - round.startedAt) / total));
        setClock({
          round,
          progress,
          secondsLeft: Math.max(0, Math.ceil((round.endsAt - now) / 1000)),
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [liveRound]);

  return clock;
}
