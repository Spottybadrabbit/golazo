"use client";

import { ReactNode, useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

// Convex is optional: the app ships fully working on Clerk + localStorage, and
// turns on cloud sync automatically once a deployment URL is present (run
// `npx convex dev` once to provision, then set NEXT_PUBLIC_CONVEX_URL).
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Always mount a Convex context so useQuery/useMutation resolve to a provider
  // and never throw "Could not find Convex client" — including static prerenders
  // on preview builds where NEXT_PUBLIC_CONVEX_URL isn't inlined. With a real URL
  // we wire Clerk auth; without one we mount a placeholder client whose queries
  // simply stay in the loading state (components still gate real reads/writes on
  // `cloudSyncEnabled`, so no request is ever made to the placeholder).
  const client = useMemo(
    () => new ConvexReactClient(convexUrl ?? "https://placeholder.convex.cloud"),
    [],
  );

  if (!convexUrl) return <ConvexProvider client={client}>{children}</ConvexProvider>;

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

export const cloudSyncEnabled = Boolean(convexUrl);
