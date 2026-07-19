import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * (user, fixture) pairs — for the given fixtures — where the user has a
 * betting/sweepstakes interest AND a linked Telegram chat. One row per pair.
 * Interest = an event of kind "pick" (bet on a game) or "pool_join"
 * (sweepstakes) that carries that fixtureId. Consumed by the cron notifier.
 */
export const usersInterestedIn = query({
  args: { fixtureIds: v.array(v.number()) },
  handler: async (ctx, { fixtureIds }) => {
    const out: { clerkId: string; chatId: string; fixtureId: number }[] = [];
    const seen = new Set<string>();
    for (const fixtureId of fixtureIds) {
      const evs = await ctx.db
        .query("events")
        .withIndex("by_fixture", (q) => q.eq("fixtureId", fixtureId))
        .collect();
      for (const e of evs) {
        if (e.kind !== "pick" && e.kind !== "pool_join") continue;
        const pairKey = `${e.clerkId}:${fixtureId}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const link = await ctx.db
          .query("telegramLinks")
          .withIndex("by_clerk", (q) => q.eq("clerkId", e.clerkId))
          .unique();
        if (link?.chatId) out.push({ clerkId: e.clerkId, chatId: link.chatId, fixtureId });
      }
    }
    return out;
  },
});

/** Dedup gate: true the first time a (clerkId, key) is seen, false afterwards. */
export const markNotified = mutation({
  args: { clerkId: v.string(), key: v.string() },
  handler: async (ctx, { clerkId, key }) => {
    const existing = await ctx.db
      .query("notified")
      .withIndex("by_clerk_key", (q) => q.eq("clerkId", clerkId).eq("key", key))
      .unique();
    if (existing) return false;
    await ctx.db.insert("notified", { clerkId, key, sentAt: Date.now() });
    return true;
  },
});

/** Authed: mint a one-time code the user sends to the Telegram bot (/start <code>). */
export const startTelegramLink = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const code = Math.random().toString(36).slice(2, 10);
    await ctx.db.insert("telegramLinkCodes", {
      code,
      clerkId: identity.subject,
      createdAt: Date.now(),
    });
    return code;
  },
});

/** Webhook: resolve a link code to its user and attach the Telegram chatId. */
export const linkTelegramByCode = mutation({
  args: { code: v.string(), chatId: v.string() },
  handler: async (ctx, { code, chatId }) => {
    const pending = await ctx.db
      .query("telegramLinkCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!pending) return false;
    if (Date.now() - pending.createdAt > 30 * 60_000) {
      await ctx.db.delete(pending._id); // expired
      return false;
    }
    const existing = await ctx.db
      .query("telegramLinks")
      .withIndex("by_clerk", (q) => q.eq("clerkId", pending.clerkId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { chatId, linkedAt: Date.now() });
    else await ctx.db.insert("telegramLinks", { clerkId: pending.clerkId, chatId, linkedAt: Date.now() });
    await ctx.db.delete(pending._id);
    return true;
  },
});
