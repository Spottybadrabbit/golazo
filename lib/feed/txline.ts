// TxLINE (TxODDS) live feed adapter — Solana devnet.
//
// Implements the `Feed` contract (lib/feed/adapter.ts) on top of the
// singleton client in lib/feed/txline-client.ts, which owns the actual
// subscribe -> JWT -> activate -> SSE pipeline. This module just exposes
// that client's state through the honest ready/detail pattern the rest of
// the app expects — never throwing to the caller, never serving fake data
// when the feed isn't actually connected.

import type { Feed } from "@/lib/feed/adapter";
import type { LiveWorld } from "@/lib/engine";
import { getClient } from "@/lib/feed/txline-client";

export const txlineFeed: Feed = {
  mode: "live",
  get ready(): boolean {
    return getClient().isReady();
  },
  get detail(): string {
    return getClient().statusDetail();
  },
  async getWorld(now?: number): Promise<LiveWorld> {
    void now; // live data reflects real time; the sim-only replay param doesn't apply.
    const client = getClient();
    if (!client.isReady()) {
      throw new Error(client.statusDetail());
    }
    return client.getLiveWorld();
  },
};
