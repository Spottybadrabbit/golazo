// Feed adapter boundary.
//
// Everything downstream — the Hi-Lo game, the Squad table, PunditBot, and the
// /api/live endpoint — consumes a `LiveWorld`. This module is the single seam
// that decides where that world comes from, keyed on TXLINE_MODE:
//
//   TXLINE_MODE unset / "sim"  -> deterministic simulator (lib/engine)
//   TXLINE_MODE = "live"        -> real TxODDS TxLINE devnet feed (lib/feed/txline)
//
// This is the line the whole "swap the simulator for TxLINE" plan pivots on.

import { liveWorld, type LiveWorld } from "@/lib/engine";
import { txlineFeed } from "@/lib/feed/txline";

export type FeedMode = "sim" | "live";

export interface Feed {
  mode: FeedMode;
  /** True when this adapter can actually serve a world right now. */
  ready: boolean;
  /** Human-readable reason when `ready` is false (surfaced by /api/live). */
  detail?: string;
  getWorld(now?: number): Promise<LiveWorld>;
}

export function feedMode(): FeedMode {
  return process.env.TXLINE_MODE === "live" ? "live" : "sim";
}

const simulator: Feed = {
  mode: "sim",
  ready: true,
  async getWorld(now?: number) {
    return liveWorld(now);
  },
};

/** The active feed for this process, chosen by TXLINE_MODE. */
export function getFeed(): Feed {
  return feedMode() === "live" ? txlineFeed : simulator;
}
