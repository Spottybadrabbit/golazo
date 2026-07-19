"use client";

// Touchline "Proof" page (TOUCHLINE_PRD §26) — the page that visually
// connects DATA → DECISION → PROOF for a single verification record, so the
// autonomous loop can be inspected end-to-end from one link.

import { use, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TL } from "@/components/touchline/theme";
import { Panel, Label, KeyVal } from "@/components/touchline/ui";
import { SignalCard, ActionCard, ProofCard } from "@/components/touchline/cards";

export default function TouchlineProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const data = useQuery(api.touchline.proofDetail, { id: id as Id<"touchlineProofs"> });

  if (data === undefined) {
    return (
      <div className="py-20 text-center">
        <Label>Loading proof…</Label>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel>
          <div className="py-10 text-center">
            <Label>Proof not found.</Label>
          </div>
        </Panel>
      </div>
    );
  }

  const { proof, signal, action } = data;
  const proofColor = proof.verified ? TL.green : proof.validationMethod === "pending" ? TL.amber : TL.faint;
  const proofResult = proof.verified ? "VERIFIED" : proof.validationMethod === "pending" ? "PENDING" : "UNAVAILABLE";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Label>Touchline / Proof</Label>
        <h1 className="mt-1 font-mono tracking-tight" style={{ fontSize: 20, color: TL.text }}>
          Verification detail
        </h1>
      </div>

      {/* HERO — the verification itself */}
      <Panel title="Solana verification">
        <ProofCard proof={proof} />
      </Panel>

      {/* DATA → DECISION → PROOF flow */}
      <Panel title="Data → decision → proof">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
          <FlowBlock label="DATA" color={TL.cyan}>
            <KeyVal k="Fixture" v={proof.fixtureId} />
            <KeyVal k="Sequence" v={proof.sequence} />
          </FlowBlock>
          <FlowArrow />
          <FlowBlock label="DECISION" color={TL.amber}>
            {signal ? (
              <KeyVal k="Signal" v={signal.type.replace(/_/g, " ")} />
            ) : (
              <Label>No signal linked</Label>
            )}
            {action ? <KeyVal k="Action" v={action.action.replace(/_/g, " ")} /> : null}
          </FlowBlock>
          <FlowArrow />
          <FlowBlock label="PROOF" color={proofColor}>
            <KeyVal k="Result" v={proofResult} color={proofColor} />
          </FlowBlock>
        </div>
      </Panel>

      {/* Associated decision */}
      <Panel title="Associated decision">
        <SignalCard signal={signal} action={action} />
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--tl-line)" }}>
          <ActionCard action={action} />
        </div>
      </Panel>
    </div>
  );
}

function FlowBlock({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div
      className="flex-1 rounded-lg border px-3 py-2.5"
      style={{ background: "var(--tl-raised)", borderColor: "var(--tl-line)" }}
    >
      <span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10.5, color }}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center px-1 font-mono sm:rotate-0" style={{ fontSize: 16, color: TL.faint }}>
      <span className="sm:hidden">↓</span>
      <span className="hidden sm:inline">→</span>
    </div>
  );
}
