import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import CardsGame from "@/components/cards/CardsGame";

export const metadata: Metadata = {
  title: "Card packs. GOLAZO",
  description: "Bank streaks, rip packs, complete the summer collection.",
};

export default function CardsPage() {
  return (
    <AppShell>
      <CardsGame />
    </AppShell>
  );
}
