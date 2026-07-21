import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PunditFeed from "@/components/pundit/PunditFeed";

// PunditBot is a live, Convex-driven feed (recap + minute-by-minute useQuery),
// so render it dynamically rather than statically prerendering — a build-time
// prerender has no ConvexProvider when NEXT_PUBLIC_CONVEX_URL is absent.
export const dynamic = "force-dynamic";

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
