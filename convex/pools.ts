import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// Sweepstakes groups + shareable invites (schema.ts: `pools` + `poolMembers`).
// Every mutation requires a signed-in Clerk identity (ctx.auth.getUserIdentity()
// -> identity.subject is the clerkId); `getByInvite` is the one function anyone
// can call without being a member yet, so the /sweepstakes/join/<code> landing
// page can preview a group before the visitor signs in. Play-money only — no
// real transfers happen anywhere here.

const INVITE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomInviteCode(len = 6): string {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return code;
}

/** Generate an inviteCode guaranteed unused (checked against the by_invite index). */
async function uniqueInviteCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomInviteCode();
    const existing = await ctx.db
      .query("pools")
      .withIndex("by_invite", (q) => q.eq("inviteCode", code))
      .unique();
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique invite code — try again");
}

/** A short display handle derived from the signed-in Clerk identity's claims. */
function deriveHandle(identity: {
  nickname?: string;
  name?: string;
  givenName?: string;
  subject: string;
}): string {
  const raw = identity.nickname || identity.name || identity.givenName;
  const trimmed = raw?.trim();
  if (trimmed) return trimmed.slice(0, 24);
  return `Player-${identity.subject.slice(-4)}`;
}

async function memberRow(ctx: MutationCtx, poolId: Id<"pools">, clerkId: string) {
  return await ctx.db
    .query("poolMembers")
    .withIndex("by_pool_clerk", (q) => q.eq("poolId", poolId).eq("clerkId", clerkId))
    .unique();
}

async function membersOf(ctx: QueryCtx | MutationCtx, poolId: Id<"pools">) {
  return await ctx.db
    .query("poolMembers")
    .withIndex("by_pool", (q) => q.eq("poolId", poolId))
    .collect();
}

/** Create a new sweepstakes group; the caller becomes its owner + first member. */
export const createPool = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("work"), v.literal("friends"), v.literal("random")),
    fixtureId: v.optional(v.number()),
    competition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to create a sweepstakes group");
    const clerkId = identity.subject;
    const name = args.name.trim().slice(0, 60) || "Untitled group";
    const inviteCode = await uniqueInviteCode(ctx);

    const poolId = await ctx.db.insert("pools", {
      inviteCode,
      name,
      kind: args.kind,
      ownerClerkId: clerkId,
      fixtureId: args.fixtureId,
      competition: args.competition,
      status: "open",
      memberCount: 1,
      createdAt: Date.now(),
    });
    await ctx.db.insert("poolMembers", {
      poolId,
      clerkId,
      handle: deriveHandle(identity),
      role: "owner",
      joinedAt: Date.now(),
    });

    return { inviteCode, poolId };
  },
});

/** Join a group by its invite code. Idempotent — joining twice is a no-op. */
export const joinByInvite = mutation({
  args: {
    inviteCode: v.string(),
    pick: v.optional(v.union(v.literal("home"), v.literal("draw"), v.literal("away"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to join a sweepstakes group");
    const pool = await ctx.db
      .query("pools")
      .withIndex("by_invite", (q) => q.eq("inviteCode", args.inviteCode))
      .unique();
    if (!pool) throw new Error("That invite code doesn't match a sweepstakes group");

    const clerkId = identity.subject;
    const existing = await memberRow(ctx, pool._id, clerkId);
    if (!existing) {
      await ctx.db.insert("poolMembers", {
        poolId: pool._id,
        clerkId,
        handle: deriveHandle(identity),
        role: "member",
        pick: args.pick,
        joinedAt: Date.now(),
      });
      await ctx.db.patch(pool._id, { memberCount: pool.memberCount + 1 });
    }

    const freshPool = await ctx.db.get(pool._id);
    const members = await membersOf(ctx, pool._id);
    return { pool: freshPool, members };
  },
});

/** Set the caller's pick on a pool they've already joined. */
export const setPick = mutation({
  args: {
    poolId: v.id("pools"),
    pick: v.union(v.literal("home"), v.literal("draw"), v.literal("away")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to set your pick");
    const member = await memberRow(ctx, args.poolId, identity.subject);
    if (!member) throw new Error("You're not a member of this sweepstakes group");
    await ctx.db.patch(member._id, { pick: args.pick });
    return { pick: args.pick };
  },
});

/**
 * Preview a group by its invite code — no membership required, so the
 * /sweepstakes/join/<code> landing page can show it before sign-in. Returns
 * null when the code doesn't match a pool.
 */
export const getByInvite = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const pool = await ctx.db
      .query("pools")
      .withIndex("by_invite", (q) => q.eq("inviteCode", args.inviteCode))
      .unique();
    if (!pool) return null;
    const rows = await membersOf(ctx, pool._id);
    const members = rows
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({ handle: m.handle, role: m.role, pick: m.pick }));
    return { pool, members };
  },
});

/** Groups the caller owns or belongs to, newest first, with their own role/pick. */
export const myPools = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const memberships = await ctx.db
      .query("poolMembers")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .collect();
    const pools = await Promise.all(
      memberships.map(async (m) => {
        const pool = await ctx.db.get(m.poolId);
        if (!pool) return null;
        return { ...pool, myRole: m.role, myPick: m.pick };
      }),
    );
    return pools
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
