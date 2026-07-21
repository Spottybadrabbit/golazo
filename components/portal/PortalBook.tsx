"use client";

// Book / Settlement portal body (seed for the admin portal).
//
// A live, reactive view of the settlement engine: bets being made, bets being
// settled, what's escrowed in the pot, and the house/bank balance — all driven
// by convex/settlement.ts's settlementStats query, which updates second-by-second
// as the sweep loop grades finished fixtures. Play-money only.
//
// Rendered from a force-dynamic server page (app/portal/page.tsx) so the Convex
// provider is always present at render time — a static prerender would have no
// NEXT_PUBLIC_CONVEX_URL and therefore no ConvexProvider.

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-3xl font-bold tabular-nums" style={{ color: accent ?? "var(--chalk, #f7f7f4)" }}>
        {value}
      </div>
      {sub ? <div className="mt-1 font-mono text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

export default function PortalBook() {
  const s = useQuery(api.settlement.settlementStats, {});

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Book · Settlement Portal</h1>
        <p className="mt-1 font-mono text-xs text-muted">
          Live play-money book. Bets settle within ~1s of a match finishing. No real funds move.
        </p>
      </header>

      {s === undefined ? (
        <p className="font-mono text-sm text-muted">Loading book…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Bets made" value={String(s.betsMade)} accent="#afff00" />
            <Stat label="Settled" value={String(s.betsSettled)} sub={`${s.wins}W · ${s.losses}L`} />
            <Stat label="Pending" value={String(s.betsPending)} sub="in the queue" accent="#00d4ff" />
            <Stat label="In the pot" value={`${s.potSol} SOL`} sub="escrowed stakes" accent="#ff6b35" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total staked" value={`${s.totalStaked} SOL`} sub="all time (play money)" />
            <Stat label="Total paid out" value={`${s.totalPaidOut} SOL`} sub="to winners" />
            <Stat
              label="House / bank"
              value={`${s.houseBalanceSol >= 0 ? "+" : ""}${s.houseBalanceSol} SOL`}
              sub="staked − paid out"
              accent={s.houseBalanceSol >= 0 ? "#afff00" : "#ff6b35"}
            />
          </div>
          <p className="mt-6 font-mono text-[11px] leading-relaxed text-muted">
            The settlement engine (convex/settlement.ts) marks a fixture <span className="text-chalk">final</span> when the
            feed reports full-time (or a past-90&apos; match it has stopped updating), then grades every pending pool bet
            against the result and pays winners <span className="text-chalk">stake × odds</span> instantly. Idempotent —
            each bet is graded once, never double-paid.
          </p>
        </>
      )}
    </main>
  );
}
