"use node";
// The "Miracle Tree": a tamper-evident Merkle root computed over each
// fixture's real live odds-tick history, as an on-chain-style validation
// commitment. Runs on a cron (see convex/crons.ts). Reads/writes go through
// convex/merkleStore.ts — a "use node" file may only contain actions.

import { createHash } from "crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Build a Merkle root over leaf strings. Deterministic: no wall-clock reads. */
function merkleRoot(leafStrings: string[]): { root: string; leafCount: number } {
  const leafCount = leafStrings.length;
  if (leafCount === 0) return { root: sha256(""), leafCount: 0 };

  let level = leafStrings.map(sha256);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last if odd
      next.push(sha256(a + b));
    }
    level = next;
  }
  return { root: level[0], leafCount };
}

export const computeRoots = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const fixtureIds: number[] = await ctx.runQuery(internal.merkleStore.fixturesWithTicks, {});

    for (const fixtureId of fixtureIds) {
      const ticks: Doc<"liveTicks">[] = await ctx.runQuery(internal.merkleStore.ticksForFixture, {
        fixtureId,
      });
      if (ticks.length === 0) continue;

      const leaves = ticks.map(
        (t: Doc<"liveTicks">) =>
          `${t.fixtureId}|${t.ts}|${t.oddsHome}|${t.oddsDraw}|${t.oddsAway}|${t.pHome}|${t.pDraw}|${t.pAway}`,
      );
      const { root, leafCount } = merkleRoot(leaves);

      await ctx.runMutation(internal.merkleStore.upsertRoot, {
        fixtureId,
        root,
        leafCount,
        fromTs: ticks[0].ts,
        toTs: ticks[ticks.length - 1].ts,
        algo: "sha256-merkle",
      });
    }
  },
});
