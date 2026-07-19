import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import MatchCentre from "@/components/matches/MatchCentre";

export const metadata: Metadata = {
  title: "Match Centre. GOLAZO",
  description: "The live World Cup marquee match and upcoming fixtures on the TxLINE feed.",
};

export default function MatchesPage() {
  return (
    <AppShell>
      <MatchCentre />
    </AppShell>
  );
}
