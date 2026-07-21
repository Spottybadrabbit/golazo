"use client";

import { useState } from "react";
import GlobalLeaderboard from "@/components/squad/GlobalLeaderboard";
import SquadBoard from "@/components/squad/SquadBoard";

// GLOBAL | GROUP switcher for /squad. GLOBAL is the worldwide leaderboard
// (GlobalLeaderboard, backed by lib/engine's squadStandings — no Convex
// needed). GROUP is the existing invite-only sweepstakes flow, unchanged
// (SquadBoard). Uppercase/mono underline-tab styling to match the app's
// tab bars (e.g. components/wallet/WalletHub.tsx's Overview/History/Settings).

type Tab = "global" | "group";

const TABS: { id: Tab; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "group", label: "Group" },
];

export default function SweepstakesTabs() {
  const [tab, setTab] = useState<Tab>("global");

  return (
    <div>
      <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex-1 rounded-full py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
              tab === t.id ? "bg-volt text-night" : "text-muted hover:text-chalk"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "global" ? <GlobalLeaderboard /> : <SquadBoard />}
    </div>
  );
}
