"use client";

import Image from "next/image";
import { useLiveWorld } from "@/lib/useLiveWorld";

// The sim's "Sunday League" sweepstake ranked fabricated member handles
// against invented picks. There is no real backend for multi-member squads,
// so rather than fabricate members/points we show the real TxLINE fixtures
// directly — every team, score, and phase below is live feed data.
export default function SquadBoard() {
  const world = useLiveWorld();
  const matches = world?.matches ?? [];

  return (
    <div>
      {/* header */}
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <Image
          src="/assets/trophy.jpg"
          alt="Sweepstake trophy"
          width={1200}
          height={800}
          priority
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">The Sunday League</h1>
            <p className="font-mono text-xs text-muted">real fixtures, straight off the feed</p>
          </div>
          {world && (
            <div className="sm:text-right">
              <div className="font-mono text-2xl font-semibold">{matches.length}</div>
              <div className="font-mono text-[11px] text-muted">fixtures on the feed</div>
            </div>
          )}
        </div>
      </div>

      {/* live fixtures */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          Live fixtures
        </div>
        {!world ? (
          <div className="animate-pulse px-4 py-8 text-center font-mono text-sm text-muted">
            Awaiting the live feed...
          </div>
        ) : matches.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-sm text-muted">
            No fixtures live from the feed right now.
          </div>
        ) : (
          matches.map((m) => (
            <div
              key={m.fixtureId}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-lg" aria-hidden>
                  {m.home.flag}
                </span>
                <span className="truncate font-bold">{m.home.code}</span>
              </span>
              <span className="text-center font-mono text-sm">
                <span className="font-semibold">
                  {m.score[0]}–{m.score[1]}
                </span>
                <span className="ml-2 text-[10px] uppercase tracking-widest text-muted">
                  {m.phase === "LIVE" ? `${m.minute}'` : m.phase}
                </span>
              </span>
              <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                <span className="truncate font-bold">{m.away.code}</span>
                <span className="text-lg" aria-hidden>
                  {m.away.flag}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 px-1 font-mono text-[11px] leading-relaxed text-muted">
        Squad sweepstakes (member handles, pooled prize) need real multi-player data this build
        doesn&apos;t have yet — until then, this board shows the real TxLINE fixtures directly, no
        invented members or points.
      </p>
    </div>
  );
}
