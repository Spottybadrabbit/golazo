import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SquadBoard from "@/components/squad/SquadBoard";

export const metadata: Metadata = {
  title: "Squad sweepstake. GOLAZO",
  description: "Create a sweepstakes group, share the invite link, and pick the live match together.",
};

export default function SquadPage() {
  return (
    <AppShell>
      <SquadBoard />
    </AppShell>
  );
}
