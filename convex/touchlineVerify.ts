"use node";
// Touchline — Solana verification action (TOUCHLINE_PRD §12).
//
// Runs in the Node runtime (Anchor / @solana/web3.js). Delegates to the proven
// read-only verifier in lib/solana/verify.ts: request the fixture's Merkle
// proof from TxLINE, then simulate the program's signer-less validate_fixture
// instruction against its on-chain root. No service wallet, no SOL, no
// signature. HONEST-VERIFICATION RULE: any failure resolves the proof to an
// honest verified:false with the real reason — never a fabricated ✓.

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyFixtureOnChain } from "../lib/solana/verify";

export const verify = internalAction({
  args: {
    proofId: v.id("touchlineProofs"),
    fixtureId: v.number(),
    sequence: v.number(),
  },
  handler: async (ctx, { proofId, fixtureId }): Promise<void> => {
    let result;
    try {
      result = await verifyFixtureOnChain(fixtureId);
    } catch (e: any) {
      result = {
        verified: false,
        method: "validateFixture",
        detail: `Verification error: ${e?.message ?? e}`,
        rootPda: undefined as string | undefined,
      };
    }
    await ctx.runMutation(internal.touchline.resolveProof, {
      proofId,
      verified: result.verified,
      validationMethod: result.method,
      detail: result.detail,
      txRef: result.rootPda,
    });
  },
});
