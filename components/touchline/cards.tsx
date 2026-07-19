// Touchline decision + proof + agent-status cards (TOUCHLINE_PRD §22–§26).

import type { ReactNode } from "react";
import { TL, actionColor, pct, signedPct, clock } from "./theme";
import { Label, Pill, KeyVal } from "./ui";

export interface SignalLike {
  type: "EVENT_MARKET_DIVERGENCE" | "UNEXPLAINED_PRICE_SHOCK";
  severity: number;
  probabilityBefore: number;
  probabilityAfter: number;
  triggerValue: number;
  threshold: number;
  sequence?: number;
  reason?: string;
  createdAt: number;
}

export interface ActionLike {
  action: string;
  reason: string;
  notional?: number;
  executionPrice?: number;
  createdAt: number;
}

const SIGNAL_LABEL: Record<string, string> = {
  EVENT_MARKET_DIVERGENCE: "EVENT–MARKET DIVERGENCE",
  UNEXPLAINED_PRICE_SHOCK: "UNEXPLAINED PRICE SHOCK",
};

/** The right-rail agent decision card. */
export function SignalCard({ signal, action }: { signal: SignalLike | null; action?: ActionLike | null }) {
  if (!signal) {
    return (
      <div className="text-center py-6">
        <Label>No signal yet — monitoring</Label>
      </div>
    );
  }
  const riskColor = signal.severity >= 75 ? TL.red : signal.severity >= 50 ? TL.amber : TL.green;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-semibold tracking-tight" style={{ fontSize: 14 }}>
          {SIGNAL_LABEL[signal.type] ?? signal.type}
        </span>
        {action ? <Pill color={actionColor(action.action)}>{action.action.replace("_", " ")}</Pill> : null}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <span className="font-mono tabular-nums leading-none" style={{ fontSize: 44, color: riskColor }}>
          {signal.severity}
        </span>
        <span className="font-mono mb-1" style={{ fontSize: 13, color: TL.muted }}>/ 100 risk</span>
      </div>

      <div className="mt-4 border-t pt-2" style={{ borderColor: "var(--tl-line)" }}>
        <KeyVal k="Observed move" v={signedPct(signal.triggerValue)} color={riskColor} />
        <KeyVal k="Threshold" v={signedPct(signal.threshold)} />
        <KeyVal k="Prob before → after" v={`${pct(signal.probabilityBefore)} → ${pct(signal.probabilityAfter)}`} />
        {signal.sequence ? <KeyVal k="TxLINE sequence" v={signal.sequence} /> : null}
      </div>

      <p className="mt-3 font-mono leading-relaxed" style={{ fontSize: 11.5, color: TL.muted }}>
        {signal.reason ?? ""}
      </p>
    </div>
  );
}

/** Latest autonomous action summary (with simulated-execution label). */
export function ActionCard({ action }: { action: ActionLike | null }) {
  if (!action) {
    return <div className="text-center py-4"><Label>No action taken yet</Label></div>;
  }
  const color = actionColor(action.action);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono tracking-wide" style={{ fontSize: 16, color }}>
          {action.action.replace("_", " ")}
        </span>
        <Label>{clock(action.createdAt)}</Label>
      </div>
      {action.action === "PAPER_HEDGE" && action.notional != null && (
        <div className="mt-2 flex items-center gap-2">
          <Pill color={TL.violet}>SIMULATED EXECUTION</Pill>
          <span className="font-mono tabular-nums" style={{ fontSize: 12, color: TL.text }}>
            ${action.notional.toLocaleString()} @ {action.executionPrice}
          </span>
        </div>
      )}
      <p className="mt-2 font-mono leading-relaxed" style={{ fontSize: 11.5, color: TL.muted }}>
        {action.reason}
      </p>
    </div>
  );
}

export interface ProofLike {
  verified: boolean;
  network: string;
  validationMethod: string;
  sequence: number;
  fixtureId: number;
  detail?: string;
  verifiedAt?: number;
  requestedAt?: number;
}

/** Solana verification state — honest: pending / verified / unavailable. */
export function ProofCard({ proof, href }: { proof: ProofLike | null; href?: string }) {
  if (!proof) {
    return <div className="text-center py-4"><Label>No verification requested yet</Label></div>;
  }
  const pending = proof.validationMethod === "pending";
  const color = proof.verified ? TL.green : pending ? TL.amber : TL.faint;
  const headline = proof.verified ? "✓ VERIFIED ON SOLANA" : pending ? "◷ VERIFYING…" : "○ VERIFICATION UNAVAILABLE";

  const inner = (
    <div>
      <div className="font-mono tracking-wide" style={{ fontSize: 15, color }}>{headline}</div>
      <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--tl-line)" }}>
        <KeyVal k="Network" v={proof.network === "devnet" ? "Solana Devnet" : proof.network} />
        <KeyVal k="Fixture" v={proof.fixtureId} />
        <KeyVal k="Sequence" v={proof.sequence} />
        <KeyVal k="Method" v={proof.validationMethod} />
        <KeyVal k="Result" v={proof.verified ? "VALID" : "—"} color={proof.verified ? TL.green : TL.muted} />
      </div>
      {!proof.verified && proof.detail ? (
        <p className="mt-2 font-mono leading-relaxed" style={{ fontSize: 11, color: TL.muted }}>{proof.detail}</p>
      ) : null}
    </div>
  );
  return href ? <a href={href} className="block hover:opacity-90 transition-opacity">{inner}</a> : inner;
}

export interface AgentLike {
  status: string;
  mode: string;
  marketStatus?: string;
  lastTickAt?: number;
  replaySpeed?: number;
}

/** Agent status panel (STATUS / last tick / current risk). */
export function AgentStatus({ agent, risk }: { agent: AgentLike; risk?: string }) {
  const active = agent.status === "ACTIVE";
  const ago = agent.lastTickAt ? secondsAgo(agent.lastTickAt) : null;
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatBlock label="Status" value={active ? "MONITORING" : "STOPPED"} color={active ? TL.green : TL.faint} />
      <StatBlock label="Last tick" value={ago != null ? `${ago}s ago` : "—"} color={TL.text} />
      <StatBlock label="Risk" value={risk ?? "LOW"} color={risk === "HIGH" ? TL.red : risk === "MED" ? TL.amber : TL.green} />
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 font-mono" style={{ fontSize: 15, color }}>{value}</div>
    </div>
  );
}

function secondsAgo(ts: number): number {
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}
