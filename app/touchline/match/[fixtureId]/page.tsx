"use client";

// Touchline "Match Intelligence" page (TOUCHLINE_PRD §23) — the single-match
// deep dive: probability chart, unified chronological timeline (score events,
// signals, actions, proofs), and the agent's latest decision + provenance.
// Driven entirely by one reactive Convex query, same pattern as the dashboard.

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TL, pct, signedPct, clock, actionColor } from "@/components/touchline/theme";
import { Panel, Label, Pill, KeyVal } from "@/components/touchline/ui";
import { MatchHeader, MarketChart } from "@/components/touchline/market";
import { SignalCard, ProofCard } from "@/components/touchline/cards";

interface TimelineRow {
  key: string;
  ts: number;
  label: string;
  color: string;
  detail: string;
}

export default function MatchIntelligencePage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = use(params);
  const data = useQuery(api.touchline.matchDetail, { fixtureId: Number(fixtureId) });

  if (data === undefined) {
    return (
      <div className="py-20 text-center">
        <Label>Loading match…</Label>
      </div>
    );
  }

  const { match, ticks, signals, actions, scoreEvents, proofs } = data;

  if (!match) {
    return (
      <Panel>
        <div className="py-10 text-center">
          <Label>No data for this fixture yet — start a replay from the dashboard.</Label>
        </div>
      </Panel>
    );
  }

  const topSignal = signals[0] ? { ...signals[0], reason: signals[0].reason ?? "" } : null;

  const lastTick = ticks[ticks.length - 1];
  const firstTick = ticks[0];
  const delta = lastTick && firstTick ? lastTick.homeProbability - firstTick.homeProbability : 0;
  const deltaColor = delta > 0 ? TL.green : delta < 0 ? TL.red : TL.muted;

  const rows: TimelineRow[] = [
    ...scoreEvents.map((se) => ({
      key: `score-${se._id}`,
      ts: se.timestamp,
      label: "SCORE EVENT",
      color: TL.amber,
      detail: `${se.action} — ${se.homeScore}-${se.awayScore}`,
    })),
    ...signals.map((s) => ({
      key: `signal-${s._id}`,
      ts: s.createdAt,
      label: "SIGNAL",
      color: TL.amber,
      detail: s.reason ?? "Signal detected",
    })),
    ...actions.map((a) => ({
      key: `action-${a._id}`,
      ts: a.createdAt,
      label:
        a.action === "FREEZE_MARKET"
          ? "MARKET FROZEN"
          : a.action === "REOPEN_MARKET"
            ? "MARKET REOPENED"
            : a.action.replace("_", " "),
      color: actionColor(a.action),
      detail: a.reason,
    })),
    ...proofs.map((p) => ({
      key: `proof-${p._id}`,
      ts: p.verifiedAt ?? p.requestedAt,
      label: p.verified ? "PROOF VERIFIED" : "PROOF REQUESTED",
      color: TL.green,
      detail: p.detail ?? `${p.network} · ${p.validationMethod}`,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-4">
      <Panel>
        <MatchHeader
          match={match}
          homeProb={lastTick?.homeProbability}
          drawProb={lastTick?.drawProbability}
          awayProb={lastTick?.awayProbability}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1.2fr_1fr]">
        {/* LEFT: win probability chart + market movement */}
        <div className="space-y-4">
          <Panel title="Win probability">
            <MarketChart ticks={ticks} />
            <div className="mt-3 border-t pt-1" style={{ borderColor: "var(--tl-line)" }}>
              <KeyVal k="Home win probability" v={lastTick ? pct(lastTick.homeProbability) : "—"} />
              <KeyVal
                k="Change since open"
                v={ticks.length > 1 ? signedPct(delta) : "—"}
                color={deltaColor}
              />
            </div>
          </Panel>
        </div>

        {/* MIDDLE: unified chronological timeline */}
        <div className="space-y-4">
          <Panel title="Timeline">
            <div className="overflow-x-auto">
              <div className="min-w-[320px]">
                {rows.length === 0 ? (
                  <div className="py-6 text-center">
                    <Label>No activity yet</Label>
                  </div>
                ) : (
                  rows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center gap-3 py-2 border-b last:border-0"
                      style={{ borderColor: "var(--tl-line)" }}
                    >
                      <span
                        className="shrink-0 font-mono tabular-nums"
                        style={{ fontSize: 11, color: TL.muted, width: 64 }}
                      >
                        {clock(row.ts)}
                      </span>
                      <span className="shrink-0">
                        <Pill color={row.color}>{row.label}</Pill>
                      </span>
                      <span className="truncate font-mono" style={{ fontSize: 12, color: TL.text }}>
                        {row.detail}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </div>

        {/* RIGHT: agent decision + data provenance */}
        <div className="space-y-4">
          <Panel title="Agent decision">
            <SignalCard signal={topSignal} action={actions[0] ?? null} />
          </Panel>
          <Panel title="Data provenance">
            <ProofCard
              proof={proofs[0] ?? null}
              href={proofs[0] ? `/touchline/proof/${proofs[0]._id}` : undefined}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
