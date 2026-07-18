import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PunditFeed from "@/components/pundit/PunditFeed";

export const metadata: Metadata = {
  title: "PunditBot. GOLAZO",
  description: "Golo the parrot narrates every goal, card, and odds shift on the feed.",
};

export default function PunditPage() {
  return (
    <AppShell>
      <PunditFeed />
    </AppShell>
  );
}
