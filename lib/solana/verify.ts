// Touchline — Solana verification (TOUCHLINE_PRD §12). Node-only.
//
// Verifies that a TxLINE fixture's data is anchored on TxLINE's Solana devnet
// program, entirely READ-ONLY: no service wallet, no SOL, no signature. We ask
// the API for the fixture's Merkle-proof bundle, then let the on-chain program
// do the hashing by SIMULATING its signer-less `validate_fixture` view
// instruction (simulateTransaction, sigVerify:false, replaceRecentBlockhash).
// `err === null` ⇒ the fixture's data root is valid on-chain.
//
// This mechanism was proven end-to-end by scripts probe-verify.mjs ("Full
// Validation Successful! → Program return: AQ=="). The one non-obvious step is
// the root-account PDA (its seeds are absent from the IDL): we locate it by
// scanning likely (prefix, epoch-day) PDAs for a program-owned account, and
// fall back to the address the program itself leaks in a ConstraintSeeds error.
//
// HONEST-VERIFICATION RULE: every failure path returns { verified:false } with
// a real reason — never a fabricated ✓. Score-stat and odds validation are NOT
// anchored on the free devnet tier (see convex/touchlineVerify.ts), so only the
// fixture path is exercised here.

// Named imports (NOT the default namespace) so the Convex bundler resolves the
// values — mirrors lib/feed/txline-client.ts.
import { AnchorProvider, Program, BN, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  clusterApiUrl,
  type Transaction,
  type VersionedTransaction as VTx,
} from "@solana/web3.js";
// Relative (not "@/") so both the Next build and the Convex bundler resolve it.
import txlineIdl from "../../scripts/txline/idl/txline.json";

// Minimal read-only wallet for the provider — simulate() never signs, so these
// are never called; we just need a publicKey + the two signer hooks present.
function readOnlyWallet() {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T extends Transaction | VTx>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VTx>(txs: T[]) => txs,
  };
}

export interface VerifyResult {
  verified: boolean;
  method: string; // "validateFixture"
  network: string; // "devnet"
  detail: string;
  rootPda?: string;
}

const FIXTURE_ROOT_PREFIXES = [
  "ten_daily_fixtures_roots",
  "daily_fixtures_roots",
  "fixtures_root",
  "fixtures_roots",
  "daily_fixtures",
  "ten_daily_fixtures",
];

const CUSTOM_ERR: Record<number, string> = {
  6003: "InvalidSubTreeProof",
  6004: "InvalidMainTreeProof",
  6007: "RootNotAvailable",
  6009: "InvalidPda",
  6010: "TimestampMismatch",
  6013: "InvalidTimeSlot",
  6021: "PredicateFailed",
  6022: "InvalidFixtureSubTreeProof",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    apiOrigin: process.env.TXLINE_API_ORIGIN || "https://txline-dev.txodds.com",
    apiToken: process.env.TXLINE_API_TOKEN || "",
    rpcUrl: process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
    programId: new PublicKey(process.env.TXLINE_PROGRAM_ID || "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
  };
}

function pick(obj: any, ...names: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  const lower: Record<string, any> = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined) return v;
  }
  return undefined;
}

function bytes32(v: any): Buffer {
  let b: Buffer;
  if (v == null) throw new Error("null bytes32");
  if (Array.isArray(v)) b = Buffer.from(v);
  else if (v && Array.isArray(v.data)) b = Buffer.from(v.data);
  else if (typeof v === "string") b = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  else throw new Error("bad bytes32 enc " + typeof v);
  if (b.length !== 32) throw new Error(`want 32 got ${b.length}`);
  return b;
}

const proofNodes = (arr: any[]): Array<{ hash: Buffer; isRightSibling: boolean }> =>
  (arr || []).map((n) => ({ hash: bytes32(pick(n, "hash")), isRightSibling: !!pick(n, "isRightSibling", "is_right_sibling") }));

/**
 * Verify a fixture's data root on TxLINE's Solana devnet program, read-only.
 * Returns an honest result — verified:false carries the real reason.
 */
export async function verifyFixtureOnChain(fixtureId: number): Promise<VerifyResult> {
  const c = cfg();
  const base: VerifyResult = { verified: false, method: "validateFixture", network: "devnet", detail: "" };
  if (!c.apiToken) return { ...base, detail: "Missing TXLINE_API_TOKEN (server-side)." };

  // 1. Guest JWT via the pre-activated API token (no wallet).
  let jwt: string;
  try {
    const r = await fetch(`${c.apiOrigin}/auth/guest/start`, {
      method: "POST",
      headers: { "X-Api-Token": c.apiToken, Accept: "application/json" },
    });
    jwt = (await r.json())?.token;
    if (!jwt) throw new Error(`no guest token (status ${r.status})`);
  } catch (e: any) {
    return { ...base, detail: `Auth failed: ${e?.message ?? e}` };
  }
  const authHeaders = { Authorization: `Bearer ${jwt}`, "X-Api-Token": c.apiToken, Accept: "application/json" };

  // 2. Fixture validation proof bundle (read-only HTTP).
  let payload: any;
  try {
    const r = await fetch(`${c.apiOrigin}/api/fixtures/validation?fixtureId=${fixtureId}`, { headers: authHeaders });
    payload = await r.json();
    if (r.status !== 200 || !pick(payload, "snapshot") || !pick(payload, "summary")) {
      return { ...base, detail: `No on-chain-anchored validation proof for fixture ${fixtureId} on this tier.` };
    }
  } catch (e: any) {
    return { ...base, detail: `Proof fetch failed: ${e?.message ?? e}` };
  }

  // 3. Build the signer-less validate_fixture instruction.
  const connection = new Connection(c.rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, readOnlyWallet() as never, { commitment: "confirmed" });
  const program = new Program(txlineIdl as Idl, provider);

  let ixArgs: { snapshot: any; summary: any; subTree: any[]; mainTree: any[]; ts: number };
  try {
    const snap = pick(payload, "snapshot");
    const sum = pick(payload, "summary");
    const us = pick(sum, "updateStats", "update_stats") ?? {};
    const snapshot = {
      ts: new BN(pick(snap, "Ts", "ts")),
      startTime: new BN(pick(snap, "StartTime", "startTime")),
      competition: pick(snap, "Competition", "competition") ?? "",
      competitionId: Number(pick(snap, "CompetitionId", "competitionId") ?? 0),
      fixtureGroupId: Number(pick(snap, "FixtureGroupId", "fixtureGroupId") ?? 0),
      participant1Id: Number(pick(snap, "Participant1Id", "participant1Id") ?? 0),
      participant1: pick(snap, "Participant1", "participant1") ?? "",
      participant2Id: Number(pick(snap, "Participant2Id", "participant2Id") ?? 0),
      participant2: pick(snap, "Participant2", "participant2") ?? "",
      fixtureId: new BN(pick(snap, "FixtureId", "fixtureId")),
      participant1IsHome: !!pick(snap, "Participant1IsHome", "participant1IsHome"),
    };
    const summary = {
      fixtureId: new BN(pick(sum, "fixtureId", "FixtureId")),
      competitionId: Number(pick(sum, "competitionId", "CompetitionId") ?? 0),
      competition: pick(sum, "competition", "Competition") ?? "",
      updateStats: {
        updateCount: Number(pick(us, "updateCount", "update_count") ?? 0),
        minTimestamp: new BN(pick(us, "minTimestamp", "min_timestamp") ?? 0),
        maxTimestamp: new BN(pick(us, "maxTimestamp", "max_timestamp") ?? 0),
      },
      updateSubTreeRoot: bytes32(pick(sum, "updateSubTreeRoot", "update_sub_tree_root")),
    };
    ixArgs = {
      snapshot,
      summary,
      subTree: proofNodes(pick(payload, "subTreeProof", "sub_tree_proof")),
      mainTree: proofNodes(pick(payload, "mainTreeProof", "main_tree_proof")),
      ts: Number(pick(snap, "Ts", "ts")),
    };
  } catch (e: any) {
    return { ...base, detail: `Proof decode error: ${e?.message ?? e}` };
  }

  const buildIx = (rootPda: PublicKey) =>
    program.methods
      .validateFixture(ixArgs.snapshot, ixArgs.summary, ixArgs.subTree, ixArgs.mainTree)
      .accounts({ tenDailyFixturesRoots: rootPda })
      .instruction();

  // simulate() needs a fee payer that EXISTS on-chain (a random key → the RPC
  // returns AccountNotFound before the program even runs). Its signature is
  // never checked (sigVerify:false) and it is never charged. Any funded,
  // system-owned account works, so we borrow one from a recent program tx.
  const payer = await discoverFeePayer(connection, c.programId);
  if (!payer) return { ...base, detail: "Could not establish a read-only simulate fee payer (devnet RPC unavailable)." };

  const simulate = async (ix: any) => {
    const { blockhash } = await connection.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    return (await connection.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true })).value;
  };

  const customErr = (err: any): { code: number; name: string } | null => {
    if (err == null) return null;
    const m = JSON.stringify(err).match(/"Custom":(\d+)/);
    if (m) return { code: +m[1], name: CUSTOM_ERR[+m[1]] ?? `Custom:${m[1]}` };
    return { code: -1, name: JSON.stringify(err) };
  };

  // 4. Locate the fixtures-root PDA (seeds absent from IDL): scan program-owned
  //    (prefix, epoch-day) candidates.
  const today = Math.floor(Date.now() / 86400000);
  const snapDay = Math.floor(ixArgs.ts / 86400000);
  const days = [today, today - 1, snapDay, snapDay - 1, snapDay + 1];
  let rootPda: PublicKey | null = null;
  for (const prefix of FIXTURE_ROOT_PREFIXES) {
    for (const ed of days) {
      const e2 = Buffer.alloc(2); e2.writeUInt16LE(ed & 0xffff);
      for (const seeds of [[e2], [] as Buffer[]]) {
        let pda: PublicKey;
        try {
          [pda] = PublicKey.findProgramAddressSync([Buffer.from(prefix), ...seeds], c.programId);
        } catch {
          continue;
        }
        let info = null;
        try {
          info = await connection.getAccountInfo(pda);
        } catch {
          /* rate limit — keep scanning */
        }
        await sleep(120);
        if (info && info.owner.equals(c.programId)) {
          rootPda = pda;
          break;
        }
      }
      if (rootPda) break;
    }
    if (rootPda) break;
  }

  // 5. Simulate; if the root PDA is wrong, the program leaks the expected one
  //    in a ConstraintSeeds error ("Right: <pubkey>") — use it and retry once.
  try {
    if (!rootPda) {
      const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], c.programId);
      rootPda = pricingMatrix; // forces the handler to run and leak the expected root
    }
    let sim = await simulate(await buildIx(rootPda));
    let ce = customErr(sim.err);
    if (!ce) return { ...base, verified: true, detail: "Fixture data root verified on Solana devnet (read-only validate_fixture).", rootPda: rootPda.toBase58() };

    const expected = leakExpectedPda(sim.logs ?? []);
    if (expected) {
      const info = await connection.getAccountInfo(expected).catch(() => null);
      if (!info) {
        return { ...base, detail: `Fixture ${fixtureId} verification unavailable: its on-chain root has aged out of the anchoring window.`, rootPda: expected.toBase58() };
      }
      sim = await simulate(await buildIx(expected));
      ce = customErr(sim.err);
      rootPda = expected;
      if (!ce) return { ...base, verified: true, detail: "Fixture data root verified on Solana devnet (read-only validate_fixture).", rootPda: expected.toBase58() };
    }
    return { ...base, detail: `On-chain check did not pass for fixture ${fixtureId}: ${ce?.name ?? "unknown"}.`, rootPda: rootPda.toBase58() };
  } catch (e: any) {
    return { ...base, detail: `Verification error: ${e?.message ?? e}` };
  }
}

// A funded, system-owned account to use as the (never-charged) simulate fee
// payer. Borrowed from the fee payer of a recent program transaction and cached
// for the process. Read-only.
let CACHED_FEE_PAYER: PublicKey | null = null;
async function discoverFeePayer(connection: Connection, programId: PublicKey): Promise<PublicKey | null> {
  if (CACHED_FEE_PAYER) return CACHED_FEE_PAYER;
  try {
    const sigs = await connection.getSignaturesForAddress(programId, { limit: 1 });
    if (!sigs.length) return null;
    const tx = await connection.getTransaction(sigs[0].signature, { maxSupportedTransactionVersion: 0 });
    const key = tx?.transaction.message.getAccountKeys().get(0) ?? null;
    if (key) CACHED_FEE_PAYER = key;
    return CACHED_FEE_PAYER;
  } catch {
    return null;
  }
}

function leakExpectedPda(logs: string[]): PublicKey | null {
  const ri = logs.findIndex((l) => /Right:/.test(l));
  if (ri < 0) return null;
  const line = logs.slice(ri + 1).find((l) => /Program log:\s*[1-9A-HJ-NP-Za-km-z]{32,44}\s*$/.test(l));
  const s = line ? line.replace(/^.*Program log:\s*/, "").trim() : null;
  if (!s) return null;
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}
