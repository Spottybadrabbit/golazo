"use client";

import { ReactNode, useMemo } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

// Convex is optional at build/runtime: the app ships fully working on Clerk +
// localStorage, and turns on cloud sync automatically once a deployment URL is
// present (run `npx convex dev` once to provision, then set
// NEXT_PUBLIC_CONVEX_URL). No URL means we render children untouched.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [],
  );

  if (!client) return <>{children}</>;

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

export const cloudSyncEnabled = Boolean(convexUrl);
