import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import HiLoGame from "@/components/play/HiLoGame";
import FastHiLo from "@/components/play/FastHiLo";
import BetSlip from "@/components/play/BetSlip";

export const metadata: Metadata = {
  title: "Play Hi-Lo. GOLAZO",
  description: "Call the next TxLINE tick higher or lower. Build a streak, earn boosts.",
};

export default function PlayPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Hi-Lo streak game</h1>
      <HiLoGame />
      <FastHiLo />
      <BetSlip />
    </AppShell>
  );
}
