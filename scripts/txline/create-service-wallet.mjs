// Creates Golazo's TxLINE devnet SERVICE wallet (this is Golazo's own wallet,
// NOT a fan's), funds it with devnet SOL, and prints what to add to .env.local.
//
//   Usage:  npm run txline:wallet
//
// The secret key is written to .txline/service-wallet.json, which is
// gitignored. Never commit it.

import {
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const OUT_DIR = ".txline";
const OUT = join(OUT_DIR, "service-wallet.json");

function loadOrCreate() {
  if (existsSync(OUT)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(OUT, "utf8")));
    return { kp: Keypair.fromSecretKey(secret), created: false };
  }
  const kp = Keypair.generate();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(Array.from(kp.secretKey)));
  return { kp, created: true };
}

const { kp, created } = loadOrCreate();
const conn = new Connection(RPC, "confirmed");

console.log("\nGolazo TxLINE service wallet");
console.log(`  RPC:     ${RPC}`);
console.log(`  ${created ? "created" : "loaded "}  ${OUT}`);
console.log(`  pubkey:  ${kp.publicKey.toBase58()}`);

let lamports = await conn.getBalance(kp.publicKey);
console.log(`  balance: ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

if (lamports < 0.5 * LAMPORTS_PER_SOL) {
  process.stdout.write("  requesting 1 SOL devnet airdrop... ");
  try {
    await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      lamports = await conn.getBalance(kp.publicKey);
      if (lamports > 0) break;
    }
    console.log(`ok (${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    console.log("  -> public devnet faucet is rate-limited. Fund manually:");
    console.log("     https://faucet.solana.com/  (paste the pubkey above)");
  }
}

const funded = lamports > 0;
console.log("\n  " + (created ? "[new] " : "[ok]  ") + "service wallet created");
console.log("  " + (funded ? "[ok]  " : "[todo]") + " devnet SOL funded");
console.log("\nAdd this to .env.local (path is gitignored):");
console.log(`  TXLINE_SERVICE_WALLET=${OUT}\n`);
