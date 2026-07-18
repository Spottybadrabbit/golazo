"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { PLATFORM_FEE, POOL_ENTRY_USDC, squadStandings } from "@/lib/engine";
import { loadPlayer, savePlayer } from "@/lib/game";
import { useLiveWorld } from "@/lib/useLiveWorld";

export default function SquadBoard() {
  const world = useLiveWorld();
  const [handle, setHandle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setHandle(loadPlayer().handle);
  }, []);

  const standings = useMemo(
    () => (world ? squadStandings(world.now, handle ?? undefined) : []),
    [world, handle],
  );

  const join = () => {
    const clean = draft.trim().slice(0, 18);
    if (!clean) return;
    const p = loadPlayer();
    savePlayer({ ...p, handle: clean });
    setHandle(clean);
  };

  const members = standings.length || 8;
  const pool = members * POOL_ENTRY_USDC;
  const fee = pool * PLATFORM_FEE;

  return (
    <div>
      {/* pool header */}
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
            <p className="font-mono text-xs text-muted">
              {members} members · 2 nations each · live from the feed
            </p>
          </div>
          <div className="sm:text-right">
            <div className="font-mono text-2xl font-semibold">{pool} USDC</div>
            <div className="font-mono text-[11px] text-muted">
              prize pool · {fee.toFixed(1)} USDC rake (2%)
            </div>
          </div>
        </div>
      </div>

      {/* join */}
      {!handle && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">
            Claim a handle to enter. You get two nations, drawn fair from the hat.
          </p>
          <div className="mt-3 flex gap-2">
            <label htmlFor="handle" className="sr-only">
              Your handle
            </label>
            <input
              id="handle"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="YourHandle"
              className="min-w-0 flex-1 rounded-xl border border-line bg-night px-4 py-3 font-mono text-sm text-chalk placeholder:text-muted/60 focus:border-scarlet focus:outline-none"
            />
            <button
              onClick={join}
              className="rounded-xl bg-scarlet px-5 py-3 font-bold text-chalk transition-transform hover:scale-[1.02] active:translate-y-px"
            >
              Join the squad
            </button>
          </div>
        </div>
      )}

      {/* standings */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span>#</span>
          <span>Member</span>
          <span className="text-right">Goals</span>
          <span className="text-right">Pts</span>
        </div>
        {!world ? (
          <div className="animate-pulse px-4 py-8 text-center font-mono text-sm text-muted">
            Loading standings...
          </div>
        ) : (
          standings.map((s, i) => (
            <div
              key={s.handle}
              className={`grid grid-cols-[2rem_1fr_auto_auto] items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 ${
                s.isUser ? "bg-scarlet/10" : ""
              }`}
            >
              <span
                className={`font-mono text-sm ${i === 0 ? "text-scarlet" : "text-muted"}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">
                  {s.handle}
                  {s.isUser && <span className="ml-2 font-mono text-[11px] text-scarlet">you</span>}
                </span>
                <span className="font-mono text-xs text-muted">
                  {s.teams.map((t) => `${t.flag} ${t.code}`).join("  ")}
                </span>
              </span>
              <span className="text-right font-mono text-sm text-muted">{s.goals}</span>
              <span className="text-right font-mono text-lg font-semibold">{s.points}</span>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 px-1 font-mono text-[11px] leading-relaxed text-muted">
        Points settle automatically as fixtures finish on the TxLINE feed: 3 for a win, 1 for a
        draw, plus goal difference as the tiebreak. No spreadsheets, no arguments.
      </p>
    </div>
  );
}
