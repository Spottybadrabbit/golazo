// GOLAZO TxLINE Data-Adapter — public API named per the build guide.
//
// GOLAZO_TXLINE_DATA_ADAPTER_BUILD_GUIDE.md §7/§15 specifies a `DataAdapter`
// interface (`getLiveWorld(): Promise<LiveWorld>`) and a `getDataAdapter()`
// selector keyed on TXLINE_MODE. This repo's working seam is `Feed` / `getFeed`
// in ./adapter — the same concept with a richer contract (honest ready/detail
// state, optional replay clock). This module exposes the guide's exact names as
// a thin, documented bridge over that seam, so code written against the guide
// resolves without re-plumbing the live feed. §16's /api/live continues to use
// lib/txline.server (equivalent behaviour; see GOL-35 for the DoD verification).

import { getFeed, feedMode, type Feed } from "./adapter";
import type { LiveWorld } from "@/lib/engine";

/** Build-guide §7 boundary: the seam Golazo switches sources across. */
export interface DataAdapter {
  getLiveWorld(): Promise<LiveWorld>;
}

/** Build-guide §15 selector: SIMULATOR when TXLINE_MODE!=="live", else TxLINE. */
export function getDataAdapter(): DataAdapter {
  const feed = getFeed();
  return { getLiveWorld: () => feed.getWorld() };
}

export { getFeed, feedMode };
export type { Feed };
