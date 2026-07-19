"use client";

// Replay + agent run controls (TOUCHLINE_PRD §20/§31). The demo is driven from
// here: Start Replay at 1× / 5× / 20× seeds the deterministic timeline; the
// agent then runs autonomously with no further interaction.

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TL } from "./theme";
import { Label } from "./ui";
import { track } from "./analytics";

const SPEEDS = [1, 5, 20];

export function ReplayControls({ status, mode }: { status?: string; mode?: string }) {
  const startReplay = useMutation(api.touchline.startReplay);
  const startLive = useMutation(api.touchline.startLive);
  const stopAgent = useMutation(api.touchline.stopAgent);
  const [busy, setBusy] = useState(false);
  const running = status === "ACTIVE";

  async function onReplay(speed: number) {
    setBusy(true);
    try {
      await startReplay({ speed });
      track("replay_started", { speed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label>{running ? `RUNNING · ${mode ?? ""}` : "IDLE"}</Label>
      <div className="flex items-center gap-1.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => onReplay(s)}
            className="rounded px-2.5 py-1 font-mono transition-colors disabled:opacity-50"
            style={{ fontSize: 11, color: TL.bg, background: TL.green }}
          >
            REPLAY {s}×
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => startLive({})}
          className="rounded px-2.5 py-1 font-mono transition-colors disabled:opacity-50"
          style={{ fontSize: 11, color: TL.cyan, background: "transparent", border: `1px solid ${TL.cyan}66` }}
        >
          LIVE
        </button>
        <button
          disabled={busy || !running}
          onClick={() => stopAgent({})}
          className="rounded px-2.5 py-1 font-mono transition-colors disabled:opacity-40"
          style={{ fontSize: 11, color: TL.red, background: "transparent", border: `1px solid ${TL.red}66` }}
        >
          STOP
        </button>
      </div>
    </div>
  );
}
