import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SquadBoard from "@/components/squad/SquadBoard";

export const metadata: Metadata = {
  title: "Squad sweepstake. GOLAZO",
  description: "Friends drawn into nations, standings settled live by the TxLINE feed.",
};

export default function SquadPage() {
  return (
    <AppShell>
      <SquadBoard />
    </AppShell>
  );
}
