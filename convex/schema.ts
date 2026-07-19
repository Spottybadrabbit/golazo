import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// GOLAZO off-chain store. Player profiles and the append-only game-event log
// live here in Convex; each verifiable match event also carries the TxLINE
// fixture/sequence and (when settled) its Solana proof reference, so the
// on-chain side stays anchored to TxODDS while the high-volume logs stay off
// chain.
export default defineSchema({
  players: defineTable({
    clerkId: v.string(),
    handle: v.string(),
    wallet: v.optional(v.string()),
    xp: v.number(),
    bestStreak: v.number(),
    goalPoints: v.number(),
    cards: v.optional(v.record(v.string(), v.number())),
    updatedAt: v.number(),
  }).index("by_clerk", ["clerkId"]),

  events: defineTable({
    clerkId: v.string(),
    kind: v.union(
      v.literal("pick"),
      v.literal("result"),
      v.literal("bank"),
      v.literal("pack"),
      v.literal("pool_join"),
    ),
    detail: v.string(),
    fixtureId: v.optional(v.number()),
    sequence: v.optional(v.number()),
    solanaTx: v.optional(v.string()), // on-chain proof ref when settled via TxODDS
    createdAt: v.number(),
  }).index("by_clerk", ["clerkId"]),

  // ── live TxODDS feed (written by the poller, read by the app) ──
  liveFixtures: defineTable({
    fixtureId: v.number(),
    homeCode: v.string(),
    homeName: v.string(),
    homeFlag: v.string(),
    awayCode: v.string(),
    awayName: v.string(),
    awayFlag: v.string(),
    homeGoals: v.number(),
    awayGoals: v.number(),
    minute: v.optional(v.number()),
    statusId: v.optional(v.number()),
    phase: v.string(), // LIVE | HT | FT | SCHED
    inPlay: v.boolean(),
    competition: v.string(),
    updatedAt: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_updated", ["updatedAt"]),

  liveTicks: defineTable({
    fixtureId: v.number(),
    ts: v.number(),
    oddsHome: v.number(),
    oddsDraw: v.number(),
    oddsAway: v.number(),
    pHome: v.number(),
    pDraw: v.number(),
    pAway: v.number(),
  }).index("by_fixture_ts", ["fixtureId", "ts"]),

  // singleton heartbeat / featured pointer for the poll loop
  pollState: defineTable({
    key: v.string(), // always "global"
    mode: v.string(), // sim | live
    lastPollAt: v.number(),
    featuredFixtureId: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index("by_key", ["key"]),
});
