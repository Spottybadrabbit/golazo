"use client";

import { useState } from "react";
import StreakScreen from "@/components/gamify/StreakScreen";
import ProfileView from "@/components/gamify/ProfileView";

// Streak | Profile segmented switcher for /profile — same rounded-pill tab
// pattern as components/wallet/WalletHub.tsx's Overview/History/Settings.

type Tab = "streak" | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "streak", label: "Streak" },
  { id: "profile", label: "Profile" },
];

export default function ProfileTabs() {
  const [tab, setTab] = useState<Tab>("streak");

  return (
    <div>
      <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-volt text-night" : "text-muted hover:text-chalk"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">{tab === "streak" ? <StreakScreen /> : <ProfileView />}</div>
    </div>
  );
}
