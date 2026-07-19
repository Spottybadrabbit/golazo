import type { Metadata } from "next";
import DocsPage from "@/components/docs/DocsPage";

export const metadata: Metadata = {
  title: "Technical docs. GOLAZO",
  description:
    "How GOLAZO's on-chain activation, Convex poller, and reactive feed turn a real TxODDS devnet subscription into every screen — plus the HTTP API, Convex schema, and API-key flow.",
};

export default function TechnicalDocPage() {
  return <DocsPage />;
}
