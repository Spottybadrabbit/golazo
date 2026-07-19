// Attempts to fetch the on-chain Anchor IDL for the TxLINE program on devnet.
// If the program published its IDL on-chain, this is enough to build subscribe()
// without the TxODDS reference scripts.
//
//   Usage:  node scripts/txline/fetch-idl.mjs
//
// Writes scripts/txline/idl/txline.json on success; otherwise prints why not.

import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID =
  process.env.TXLINE_PROGRAM_ID || "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

const conn = new Connection(RPC, "confirmed");
const wallet = new anchor.Wallet(Keypair.generate());
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });

console.log(`RPC:        ${RPC}`);
console.log(`Program:    ${PROGRAM_ID}`);

const programPk = new PublicKey(PROGRAM_ID);

// 1) Does the program account even exist / is it executable on this cluster?
const acct = await conn.getAccountInfo(programPk);
if (!acct) {
  console.log("[fail] program account not found on this cluster.");
  process.exit(2);
}
console.log(
  `[ok]   program account exists (executable=${acct.executable}, owner=${acct.owner.toBase58()})`,
);

// 2) Try the on-chain Anchor IDL.
let idl = null;
try {
  idl = await anchor.Program.fetchIdl(programPk, provider);
} catch (e) {
  console.log(`[warn] fetchIdl threw: ${e.message}`);
}

if (!idl) {
  console.log("[fail] no Anchor IDL published on-chain for this program.");
  console.log("       -> need TxODDS' IDL json or subscription_free_tier.ts reference.");
  process.exit(3);
}

const OUT_DIR = join("scripts", "txline", "idl");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = join(OUT_DIR, "txline.json");
writeFileSync(OUT, JSON.stringify(idl, null, 2));

const ixns = (idl.instructions || []).map((i) => i.name);
console.log(`[ok]   IDL fetched -> ${OUT}`);
console.log(`       instructions: ${ixns.join(", ") || "(none)"}`);
console.log(
  `       has subscribe(): ${ixns.some((n) => /subscrib/i.test(n)) ? "YES" : "no"}`,
);
