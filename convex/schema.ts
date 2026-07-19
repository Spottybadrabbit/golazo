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
  })
    .index("by_clerk", ["clerkId"])
    // Used by notify.usersInterestedIn to find who bet on / joined a fixture.
    .index("by_fixture", ["fixtureId"]),

  // Telegram chat linked to a Clerk user, so the cron notifier can reach them.
  telegramLinks: defineTable({
    clerkId: v.string(),
    chatId: v.string(),
    linkedAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_chat", ["chatId"]),

  // One-time codes minted in-app ("Connect Telegram") and redeemed by the bot
  // webhook via `/start <code>`. Expire after 30 minutes (see notify.ts).
  telegramLinkCodes: defineTable({
    code: v.string(),
    clerkId: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Dedup ledger so each match event notifies a given user at most once.
  notified: defineTable({
    clerkId: v.string(),
    key: v.string(),
    sentAt: v.number(),
  }).index("by_clerk_key", ["clerkId", "key"]),
});
