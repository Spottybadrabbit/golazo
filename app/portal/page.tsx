import type { Metadata } from "next";
import PortalBook from "@/components/portal/PortalBook";

// Dynamic (never statically prerendered): the settlement book reads live Convex
// data via useQuery, and the Convex provider only exists when NEXT_PUBLIC_CONVEX_URL
// is present at render time — which a build-time prerender cannot guarantee.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book · Settlement Portal. GOLAZO",
  description: "Live play-money settlement book: bets made, settled, the pot, and the house balance.",
};

export default function PortalPage() {
  return <PortalBook />;
}
