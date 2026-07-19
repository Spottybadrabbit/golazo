"use client";

// Touchline "Agent Control" page (TOUCHLINE_PRD §24) — the operator surface
// for the autonomous rule engine: tune the deterministic thresholds, flip the
// safety toggles, and start/stop the run. Every change is a Convex mutation;
// the reactive query is the only source of truth.

import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TL } from "@/components/touchline/theme";
import { Panel, Label } from "@/components/touchline/ui";
import { track } from "@/components/touchline/analytics";

const inputStyle = {
  width: 64,
  textAlign: "right" as const,
  background: "var(--tl-raised)",
  border: "1px solid var(--tl-line)",
  color: "var(--tl-text)",
  borderRadius: 4,
  padding: "4px 6px",
  fontFamily: "monospace",
  fontSize: 13,
};

function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0"
      style={{ borderColor: "var(--tl-line)" }}
    >
      <Label>{label}</Label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function ToggleButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded px-2.5 py-1 font-mono transition-colors"
      style={{
        fontSize: 11,
        color: on ? TL.bg : TL.faint,
        background: on ? TL.green : "transparent",
        border: `1px solid ${on ? TL.green : TL.line}`,
      }}
    >
      {on ? "ON" : "OFF"}
    </button>
  );
}

export default function TouchlineAgentPage() {
  const agent = useQuery(api.touchline.agent, {});
  const updateConfig = useMutation(api.touchline.updateConfig);
  const stopAgent = useMutation(api.touchline.stopAgent);
  const startReplay = useMutation(api.touchline.startReplay);
  const startLive = useMutation(api.touchline.startLive);

  const [eventWindowSec, setEventWindowSec] = useState(0);
  const [minRepricePct, setMinRepricePct] = useState(0);
  const [volatilityThresholdPct, setVolatilityThresholdPct] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setEventWindowSec(agent.eventWindowSec);
    setMinRepricePct(agent.minReprice * 100);
    setVolatilityThresholdPct(agent.volatilityThreshold * 100);
  }, [agent?.eventWindowSec, agent?.minReprice, agent?.volatilityThreshold]);

  if (agent === undefined) {
    return (
      <div className="py-20 text-center">
        <Label>Loading agent…</Label>
      </div>
    );
  }

  const active = agent.status === "ACTIVE";

  async function onStop() {
    setBusy(true);
    try {
      await stopAgent({});
    } finally {
      setBusy(false);
    }
  }

  async function onStartLive() {
    setBusy(true);
    try {
      await startLive({});
    } finally {
      setBusy(false);
    }
  }

  async function onStartReplay() {
    setBusy(true);
    try {
      await startReplay({ speed: 5 });
      track("replay_started", { speed: 5 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ fontSize: 16, color: TL.text }}
          >
            Touchline Agent
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-flex" style={{ width: 8, height: 8 }}>
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-60 tl-ping"
                style={{ background: active ? TL.green : TL.faint }}
              />
              <span
                className="relative inline-flex rounded-full"
                style={{ width: 8, height: 8, background: active ? TL.green : TL.faint }}
              />
            </span>
            <Label>
              STATUS
              <span style={{ color: active ? TL.green : TL.faint, marginLeft: 6 }}>
                {agent.status}
              </span>
            </Label>
          </span>
        </div>
      </Panel>

      <Panel title="Configuration">
        <ConfigRow label="EVENT RESPONSE WINDOW">
          <input
            type="number"
            value={eventWindowSec}
            onChange={(e) => {
              const v = Number(e.target.value);
              setEventWindowSec(v);
              updateConfig({ eventWindowSec: v });
            }}
            style={inputStyle}
          />
          <span className="font-mono" style={{ fontSize: 11, color: "var(--tl-muted)" }}>
            seconds
          </span>
        </ConfigRow>

        <ConfigRow label="MINIMUM REPRICE">
          <input
            type="number"
            value={minRepricePct}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinRepricePct(v);
              updateConfig({ minReprice: v / 100 });
            }}
            style={inputStyle}
          />
          <span className="font-mono" style={{ fontSize: 11, color: "var(--tl-muted)" }}>
            %
          </span>
        </ConfigRow>

        <ConfigRow label="VOLATILITY THRESHOLD">
          <input
            type="number"
            value={volatilityThresholdPct}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolatilityThresholdPct(v);
              updateConfig({ volatilityThreshold: v / 100 });
            }}
            style={inputStyle}
          />
          <span className="font-mono" style={{ fontSize: 11, color: "var(--tl-muted)" }}>
            %
          </span>
        </ConfigRow>

        <ConfigRow label="AUTO FREEZE">
          <ToggleButton
            on={!!agent.autoFreeze}
            onClick={() => updateConfig({ autoFreeze: !agent.autoFreeze })}
          />
        </ConfigRow>

        <ConfigRow label="AUTO HEDGE">
          <ToggleButton
            on={!!agent.autoHedge}
            onClick={() => updateConfig({ autoHedge: !agent.autoHedge })}
          />
        </ConfigRow>

        <ConfigRow label="SOLANA VERIFICATION">
          <ToggleButton
            on={!!agent.solanaVerification}
            onClick={() => updateConfig({ solanaVerification: !agent.solanaVerification })}
          />
        </ConfigRow>
      </Panel>

      <Panel>
        <div className="flex flex-col items-center gap-4">
          {active ? (
            <button
              disabled={busy}
              onClick={onStop}
              className="w-full rounded-lg py-3 font-mono uppercase tracking-wider transition-colors disabled:opacity-50"
              style={{ fontSize: 14, color: TL.bg, background: TL.red }}
            >
              Stop Agent
            </button>
          ) : (
            <div className="flex w-full gap-2">
              <button
                disabled={busy}
                onClick={onStartLive}
                className="flex-1 rounded-lg py-3 font-mono uppercase tracking-wider transition-colors disabled:opacity-50"
                style={{ fontSize: 13, color: TL.bg, background: TL.green }}
              >
                Start (Live)
              </button>
              <button
                disabled={busy}
                onClick={onStartReplay}
                className="flex-1 rounded-lg py-3 font-mono uppercase tracking-wider transition-colors disabled:opacity-50"
                style={{ fontSize: 13, color: TL.cyan, background: "transparent", border: `1px solid ${TL.cyan}66` }}
              >
                Start Replay
              </button>
            </div>
          )}
          <p
            className="font-mono leading-relaxed text-center"
            style={{ fontSize: 11, color: "var(--tl-muted)" }}
          >
            Deterministic rule engine · every action is simulated (paper) · Solana-anchored
            verification · full audit trail.
          </p>
        </div>
      </Panel>
    </div>
  );
}
