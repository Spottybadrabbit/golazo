// Server-side Convex client + untyped function references.
//
// convex codegen (`convex/_generated`) isn't committed, so we can't import the
// typed `api` here without breaking the Next build. `makeFunctionReference`
// lets server routes call Convex functions by "file:export" name instead — the
// functions themselves live in convex/notify.ts and are deployed by the Convex
// CLI, independently of the Next build.

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export function convexClient(): ConvexHttpClient | null {
  const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

// (user, fixture) pairs with a linked Telegram chat, for the given fixtures.
export const usersInterestedInRef =
  makeFunctionReference<"query">("notify:usersInterestedIn");

// Dedup gate: returns true the first time a (clerkId, key) is seen, false after.
export const markNotifiedRef =
  makeFunctionReference<"mutation">("notify:markNotified");

// Webhook: link a Telegram chat to a Clerk user via a one-time code.
export const linkTelegramByCodeRef =
  makeFunctionReference<"mutation">("notify:linkTelegramByCode");
