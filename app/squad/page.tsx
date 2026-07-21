import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SweepstakesTabs from "@/components/squad/SweepstakesTabs";

export const metadata: Metadata = {
  title: "Squad sweepstake. GOLAZO",
  description: "Check the worldwide leaderboard, or create a group, share the invite link, and pick the live match together.",
};

export default function SquadPage() {
  return (
    <AppShell>
      <SweepstakesTabs />
    </AppShell>
  );
}
