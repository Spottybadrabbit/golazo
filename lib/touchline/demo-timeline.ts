// Deterministic demo timeline (TOUCHLINE_PRD §31) — TS source of truth.
//
// Mirrors replay/world-cup-demo.json exactly (that JSON is the PRD-required
// artifact and is what scripts/touchline/replay.test.mts loads). Both the
// Convex agentTick loop and the UI import THIS typed const so no bundler needs
// resolveJsonModule. Keep the two in sync if either changes.

import type { ReplayTimeline } from "./source";

export const DEMO_TIMELINE: ReplayTimeline = {
  // A REAL TxLINE devnet fixture (Spain v Argentina, World Cup) so the Solana
  // verification path (lib/solana/verify.ts) validates a genuinely anchored
  // fixture data root on-chain — not a fabricated ✓. The odds/score beats below
  // are a scripted replay; the fixture identity + its on-chain proof are real.
  fixtureId: 18257739,
  home: "Spain",
  away: "Argentina",
  homeCode: "ESP",
  awayCode: "ARG",
  competition: "FIFA World Cup",
  startScore: [0, 1],
  startMinute: 71,
  events: [
    { t: 0, type: "ODDS", minute: 71, odds: { home: 3.2, draw: 2.95, away: 2.55 } },
    { t: 3000, type: "ODDS", minute: 71, odds: { home: 3.18, draw: 2.95, away: 2.57 } },
    { t: 6000, type: "ODDS", minute: 72, odds: { home: 3.22, draw: 2.96, away: 2.53 } },
    {
      t: 9000,
      type: "SCORE_EVENT",
      minute: 72,
      action: "GOAL",
      side: "home",
      sequence: 991,
      homeScore: 1,
      awayScore: 1,
    },
    { t: 11000, type: "ODDS", minute: 72, odds: { home: 3.14, draw: 2.96, away: 2.57 } },
    { t: 15000, type: "ODDS", minute: 73, odds: { home: 3.1, draw: 2.97, away: 2.58 } },
    { t: 25000, type: "ODDS", minute: 74, odds: { home: 2.55, draw: 3.05, away: 3.05 } },
    { t: 33000, type: "ODDS", minute: 75, odds: { home: 3.3, draw: 3.0, away: 2.3 } },
    { t: 40000, type: "ODDS", minute: 76, odds: { home: 2.9, draw: 3.0, away: 2.6 } },
  ],
};
