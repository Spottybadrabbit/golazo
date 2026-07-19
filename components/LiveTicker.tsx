"use client";

import { useLiveWorld } from "@/lib/useLiveWorld";

/** Marquee strip of live fixtures, odds, and the latest feed events. */
export default function LiveTicker() {
  const world = useLiveWorld();

  const live = world?.source === "live";
  const phaseLabel = (p: string, minute: number) =>
    p === "LIVE" ? `${minute}'` : p === "HT" ? "HT" : p === "FT" ? "FT" : "SCHEDULED";

  const items: string[] = [];
  if (world) {
    for (const m of world.matches) {
      items.push(
        `${m.home.flag} ${m.home.code} ${m.score[0]}-${m.score[1]} ${m.away.code} ${m.away.flag} · ${phaseLabel(
          m.phase,
          m.minute,
        )}`,
      );
      const hasOdds = m.odds.home > 0 || m.odds.draw > 0 || m.odds.away > 0;
      if (hasOdds) {
        items.push(
          `1X2 ${m.odds.home.toFixed(2)} / ${m.odds.draw.toFixed(2)} / ${m.odds.away.toFixed(2)}`,
        );
      } else if (live) {
        items.push("odds pending");
      }
      const last = m.events[m.events.length - 1];
      if (last) items.push(`${last.minute}' ${last.detail}`);
      // Feed access is gated by a real on-chain subscription (devnet); per-stat
      // Merkle proof validation is a separate step, so we don't claim it yet.
      items.push(`fixture ${m.fixtureId} · ${live ? "TxODDS devnet" : `seq ${m.sequence}`}`);
    }
  } else {
    items.push("Connecting to the TxLINE feed");
  }

  const row = items.join("   •   ");

  return (
    <div className="relative overflow-hidden border-y border-line bg-surface/70 py-2.5">
      <div className="marquee-track flex w-max items-center gap-12 whitespace-nowrap font-mono text-xs tracking-wide text-muted">
        <span className="flex items-center gap-3">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
          <span className="text-chalk">TxLINE</span>
          {row}
        </span>
        <span aria-hidden="true" className="flex items-center gap-3">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
          <span className="text-chalk">TxLINE</span>
          {row}
        </span>
      </div>
    </div>
  );
}
