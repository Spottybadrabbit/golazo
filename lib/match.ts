// Shared slug helpers for per-match URLs (app/match/[slug]/page.tsx), so the
// build side (LiveTicker, HiLoGame, Landing) and the parse side (the match
// detail page) can't drift apart.

import type { LiveWorld, MatchState } from "@/lib/engine";

/** URL slug for a match: team codes lowercased, e.g. "arg-vs-esp". */
export function matchSlug(match: Pick<MatchState, "home" | "away">): string {
  return `${match.home.code}-vs-${match.away.code}`.toLowerCase();
}

/**
 * Resolve a slug against a live world's matches. Checks both team orderings
 * (home-away and away-home) case-insensitively, since fans may not know
 * which side was "home". If more than one fixture shares the same team-code
 * slug (happens on the real feed — duplicate fixture entries for the same
 * pairing are not unheard of), treat it the same as no match rather than
 * silently picking one, per the "multiple/none -> not found" spec.
 */
export function findMatchBySlug(world: LiveWorld | null, slug: string): MatchState | null {
  if (!world) return null;
  const target = slug.toLowerCase();
  const matches = world.matches.filter((m) => {
    const forward = `${m.home.code}-vs-${m.away.code}`.toLowerCase();
    const reverse = `${m.away.code}-vs-${m.home.code}`.toLowerCase();
    return forward === target || reverse === target;
  });
  return matches.length === 1 ? matches[0] : null;
}
