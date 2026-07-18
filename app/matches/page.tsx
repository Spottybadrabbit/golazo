import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import MatchCentre from "@/components/matches/MatchCentre";

export const metadata: Metadata = {
  title: "Match Centre. GOLAZO",
  description: "Today's marquee England game live, and tomorrow's fixtures in 3D.",
};

export default function MatchesPage() {
  return (
    <AppShell>
      <MatchCentre />
    </AppShell>
  );
}
