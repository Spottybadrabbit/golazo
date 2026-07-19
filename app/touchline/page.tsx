"use client";

// Touchline dashboard (TOUCHLINE_PRD §22) — the page that proves the whole
// autonomous loop end-to-end, driven entirely by Convex reactive queries:
// the agent writes, Convex updates, this UI re-renders. No manual refresh.

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TL, pct } from "@/components/touchline/theme";
import { Panel, MetricTile, StatusDot, Label } from "@/components/touchline/ui";
import { MatchHeader, MarketChart } from "@/components/touchline/market";
import { SignalCard, ActionCard, ProofCard, AgentStatus } from "@/components/touchline/cards";
import { ReplayControls } from "@/components/touchline/ReplayControls";
import { track } from "@/components/touchline/analytics";

export default function TouchlineDashboard() {
  const data = useQuery(api.touchline.dashboard, {});

  useEffect(() => {
    track("dashboard_viewed");
  }, []);

  // Fire the agentic PostHog events as the reactive feed changes. Primed on the
  // first snapshot so pre-existing rows don't emit on mount — only genuinely
  // new signals/actions/proofs during the session are tracked.
  const seen = useRef({ signal: "", action: "", proof: "", primed: false });
  useEffect(() => {
    if (!data) return;
    const s = data.latestSignal?._id ?? "";
    const a = data.latestAction?._id ?? "";
    const p = data.latestProof?.verified ? data.latestProof._id : "";
    if (!seen.current.primed) {
      seen.current = { signal: s, action: a, proof: p, primed: true };
      return;
    }
    if (data.latestSignal && s !== seen.current.signal) {
      seen.current.signal = s;
      track("agent_signal_detected", { type: data.latestSignal.type, severity: data.latestSignal.severity });
    }
    if (data.latestAction && a !== seen.current.action) {
      seen.current.action = a;
      track("agent_action_executed", { action: data.latestAction.action });
      if (data.latestAction.action === "PAPER_HEDGE") {
        track("paper_hedge_executed", { notional: data.latestAction.notional });
      }
    }
    if (data.latestProof?.verified && p !== seen.current.proof) {
      seen.current.proof = p;
      track("solana_proof_verified", { sequence: data.latestProof.sequence });
    }
  }, [data]);

  if (data === undefined) {
    return <div className="py-20 text-center"><Label>Connecting to Touchline…</Label></div>;
  }

  const { agent, match, metrics, latestSignal, latestAction, latestProof, ticks } = data;
  const active = agent?.status === "ACTIVE";
  const frozen = match?.status === "FROZEN";
  const last = ticks[ticks.length - 1];

  const solanaState = latestProof
    ? latestProof.verified
      ? "VERIFIED"
      : latestProof.validationMethod === "pending"
        ? "VERIFYING"
        : "PENDING"
    : agent?.solanaVerification
      ? "READY"
      : "OFF";
  const solanaColor = latestProof?.verified ? TL.green : latestProof ? TL.amber : TL.muted;

  const risk = frozen ? "HIGH" : (latestSignal?.severity ?? 0) >= 50 ? "MED" : "LOW";

  return (
    <div className="space-y-4">
      {/* status strip + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
        style={{ borderColor: "var(--tl-line)", background: "var(--tl-panel)" }}>
        <div className="flex flex-wrap items-center gap-5">
          <StatusDot label="AGENT" state={active ? "LIVE" : "STOPPED"} color={active ? TL.green : TL.faint} />
          <StatusDot label="SOLANA" state={solanaState} color={solanaColor} />
          <StatusDot label="TXLINE" state={active ? (agent?.mode === "replay" ? "REPLAY" : "STREAMING") : "IDLE"} color={active ? TL.cyan : TL.faint} />
        </div>
        <ReplayControls status={agent?.status} mode={agent?.mode} />
      </div>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Matches" value={metrics.matches} />
        <MetricTile label="Signals" value={metrics.signals} accent={TL.amber} />
        <MetricTile label="Actions" value={metrics.actions} accent={TL.red} />
        <MetricTile label="Proofs" value={`${metrics.proofsVerified}/${metrics.proofsTotal}`} accent={TL.green} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* left: live market + chart */}
        <div className="space-y-4">
          <Panel>
            {match ? (
              <MatchHeader
                match={match}
                homeProb={last?.homeProbability}
                drawProb={last?.drawProbability}
                awayProb={last?.awayProbability}
              />
            ) : (
              <div className="py-10 text-center"><Label>No match monitored — start a replay</Label></div>
            )}
          </Panel>
          <Panel title="Win probability" right={<Label>{last ? pct(last.homeProbability) + " home" : ""}</Label>}>
            <MarketChart ticks={ticks} />
          </Panel>
        </div>

        {/* right: agent + signal + proof */}
        <div className="space-y-4">
          <Panel title="Agent">
            <AgentStatus agent={agent} risk={risk} />
          </Panel>
          <Panel title="Latest signal">
            <SignalCard signal={latestSignal} action={latestAction} />
          </Panel>
          <Panel title="Latest action">
            <ActionCard action={latestAction} />
          </Panel>
          <Panel title="Data provenance">
            <ProofCard proof={latestProof} href={latestProof ? `/touchline/proof/${latestProof._id}` : undefined} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
