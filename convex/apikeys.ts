import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Developer API keys for the GOLAZO docs site (/technicaldoc). Auth'd via
// Clerk (ctx.auth.getUserIdentity().subject === clerkId), same pattern as
// wallet.ts / players.ts. A key is a display-only credential (nothing in this
// app actually checks it against a request yet) — issuing one lets a builder
// see what a GOLAZO API key looks like and copy it into their own tooling.

const KEY_PREFIX = "glz_";
const KEY_BODY_LENGTH = 32;
const KEY_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomKey(): string {
  let body = "";
  for (let i = 0; i < KEY_BODY_LENGTH; i++) {
    body += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  }
  return `${KEY_PREFIX}${body}`;
}

function mask(key: string): string {
  return `${KEY_PREFIX}••••••••${key.slice(-4)}`;
}

/** Mint a new API key for the signed-in player. Returns the full key ONCE. */
export const generateApiKey = mutation({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const label = args.label.trim() || "Untitled key";
    const key = randomKey();
    const id = await ctx.db.insert("apiKeys", {
      clerkId: identity.subject,
      key,
      label,
      createdAt: Date.now(),
      revoked: false,
    });
    return { id, key, label };
  },
});

/** The signed-in player's keys, newest first, with the secret masked. */
export const listMyKeys = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .order("desc")
      .collect();
    return rows.map((r) => ({
      id: r._id,
      label: r.label,
      masked: mask(r.key),
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revoked: r.revoked,
    }));
  },
});

/** Revoke one of the signed-in player's own keys. */
export const revokeKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const row = await ctx.db.get(args.id);
    if (!row || row.clerkId !== identity.subject) throw new Error("Key not found");
    await ctx.db.patch(args.id, { revoked: true });
    return { ok: true };
  },
});
