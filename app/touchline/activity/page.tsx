"use client";

// Touchline Activity audit-log page (TOUCHLINE_PRD §25) — filterable terminal
// feed over every data/signal/action/proof event, driven by a reactive Convex
// query so new rows appear without a manual refresh.

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TL } from "@/components/touchline/theme";
import { Panel, Label } from "@/components/touchline/ui";
import { ActivityFeed } from "@/components/touchline/ActivityFeed";

type Filter = "all" | "data" | "signals" | "actions" | "proofs";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "data", label: "Data" },
  { value: "signals", label: "Signals" },
  { value: "actions", label: "Actions" },
  { value: "proofs", label: "Proofs" },
];

export default function TouchlineActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useQuery(api.touchline.activity, { filter });

  return (
    <div className="space-y-4">
      <Panel
        title="Audit log"
        right={
          <div className="flex flex-wrap items-center gap-1">
            {TABS.map((tab) => {
              const active = tab.value === filter;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setFilter(tab.value)}
                  className="rounded px-2.5 py-1 font-mono uppercase tracking-wider transition-colors"
                  style={{
                    fontSize: 10.5,
                    background: active ? TL.green : "transparent",
                    color: active ? TL.bg : "var(--tl-muted)",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        }
      >
        {rows === undefined ? (
          <div className="py-6 text-center">
            <Label>Loading activity…</Label>
          </div>
        ) : (
          <ActivityFeed rows={rows} />
        )}
      </Panel>
    </div>
  );
}
