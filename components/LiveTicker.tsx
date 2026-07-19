"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { matchSlug } from "@/lib/match";
import { useLiveWorld } from "@/lib/useLiveWorld";

interface TickerItem {
  key: string;
  content: ReactNode;
}

/** Marquee strip of live fixtures, odds, and the latest feed events. */
export default function LiveTicker() {
  const world = useLiveWorld();

  const items: TickerItem[] = [];
  if (world) {
    for (const m of world.matches) {
      items.push({
        key: `${m.fixtureId}-summary`,
        content: (
          <Link
            href={`/match/${matchSlug(m)}`}
            className="underline-offset-4 hover:text-chalk hover:underline"
          >
            {m.home.flag} {m.home.code} {m.score[0]}-{m.score[1]} {m.away.code} {m.away.flag} ·{" "}
            {m.phase === "LIVE" ? `${m.minute}'` : m.phase}
          </Link>
        ),
      });
      items.push({
        key: `${m.fixtureId}-odds`,
        content: `1X2 ${m.odds.home.toFixed(2)} / ${m.odds.draw.toFixed(2)} / ${m.odds.away.toFixed(2)}`,
      });
      const last = m.events[m.events.length - 1];
      if (last) items.push({ key: `${m.fixtureId}-event`, content: `${last.minute}' ${last.detail}` });
      items.push({
        key: `${m.fixtureId}-meta`,
        content: `fixture ${m.fixtureId} · seq ${m.sequence} · verified on Solana`,
      });
    }
  } else {
    items.push({ key: "connecting", content: "Connecting to the TxLINE feed" });
  }

  return (
    <div className="relative overflow-hidden border-y border-line bg-surface/70 py-2.5">
      <div className="marquee-track flex w-max items-center gap-12 whitespace-nowrap font-mono text-xs tracking-wide text-muted">
        <TickerRow items={items} idPrefix="a" />
        <TickerRow items={items} idPrefix="b" />
      </div>
    </div>
  );
}

function TickerRow({ items, idPrefix }: { items: TickerItem[]; idPrefix: string }) {
  return (
    <span aria-hidden={idPrefix !== "a"} className="flex items-center gap-3">
      <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
      <span className="text-chalk">TxLINE</span>
      {items.map((item, i) => (
        <span key={`${idPrefix}-${item.key}`} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden="true">•</span>}
          {item.content}
        </span>
      ))}
    </span>
  );
}
