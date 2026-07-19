// Touchline section layout — its own dark trading-terminal chrome, isolated
// from the Golazo fan app (TOUCHLINE_PRD §21). Nests under the root providers
// (Convex + Clerk) but takes over the viewport with the Touchline palette.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TL, TL_CSS_VARS } from "@/components/touchline/theme";
import { TouchlineNav } from "@/components/touchline/TouchlineNav";

export const metadata: Metadata = {
  title: "Touchline — Autonomous Market Intelligence",
  description:
    "Autonomous World Cup market-monitoring agent. Ingests TxLINE odds and scores, detects anomalies, executes risk actions, and verifies data on Solana.",
};

const STYLES = `
@keyframes tl-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
.tl-ping { animation: tl-ping 1.6s cubic-bezier(0,0,0.2,1) infinite; }
.tl-bar { transition: width 0.6s cubic-bezier(0.2,0.7,0.2,1); }
.tl-root ::selection { background: ${TL.green}; color: ${TL.bg}; }
`;

export default function TouchlineLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="tl-root min-h-screen"
      style={{ ...TL_CSS_VARS, background: TL.bg, color: TL.text }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <TouchlineNav />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto w-full max-w-7xl px-4 py-8">
        <p className="font-mono" style={{ fontSize: 10.5, color: TL.faint }}>
          Touchline · autonomous decisions, verifiable data · actions are simulated (paper) · TxLINE + Solana devnet
        </p>
      </footer>
    </div>
  );
}
