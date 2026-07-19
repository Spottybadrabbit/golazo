"use client";

import Link from "next/link";
import { use } from "react";
import AppShell from "@/components/AppShell";
import MatchCard from "@/components/MatchCard";
import { findMatchBySlug } from "@/lib/match";
import { useLiveWorld, useRoundClock } from "@/lib/useLiveWorld";

/** Per-match detail page: /match/arg-vs-esp, /match/eng-vs-fr, etc. */
export default function MatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const world = useLiveWorld();
  const clock = useRoundClock(world?.round ?? null);
  const match = findMatchBySlug(world, slug);

  if (!world) {
    return (
      <AppShell>
        <div className="flex h-72 items-center justify-center">
          <div className="animate-pulse font-mono text-sm text-muted">
            Syncing the TxLINE feed...
          </div>
        </div>
      </AppShell>
    );
  }

  if (!match) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-surface px-6 py-24 text-center">
          <p className="text-lg font-bold">Match not found</p>
          <p className="max-w-sm text-sm text-muted">
            &ldquo;{slug}&rdquo; isn&apos;t live right now. It may have finished, not started yet,
            or the URL is off.
          </p>
          <Link
            href="/play"
            className="rounded-full border border-line px-5 py-2 font-mono text-xs uppercase tracking-widest text-muted transition-colors hover:border-volt hover:text-chalk"
          >
            Back to Play
          </Link>
        </div>
      </AppShell>
    );
  }

  const roundHere = clock && clock.round.fixtureId === match.fixtureId ? clock : null;

  return (
    <AppShell>
      <Link
        href="/play"
        className="font-mono text-xs uppercase tracking-widest text-muted transition-colors hover:text-chalk"
      >
        ← back
      </Link>
      <div className="mt-3">
        <MatchCard match={match} detailed />
      </div>

      {roundHere && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted">
            <span>Hi-Lo round</span>
            <span>next tick in {roundHere.secondsLeft}s</span>
          </div>
          <p className="mt-2 text-sm text-muted">{roundHere.round.question}</p>
          <div className="mt-1 font-mono text-3xl font-semibold tracking-tight">
            {roundHere.round.lockValue}
            <span className="text-lg text-muted">{roundHere.round.unit}</span>
          </div>
          <Link
            href="/play"
            className="mt-3 inline-block font-mono text-xs text-muted underline-offset-4 hover:text-chalk hover:underline"
          >
            call it on the Play tab →
          </Link>
        </div>
      )}
    </AppShell>
  );
}
