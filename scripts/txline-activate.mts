/**
 * One-command DEVNET activation for the FREE World Cup tier.
 *
 * Self-contained: no Solana CLI needed. It will
 *   1. load a keypair from ANCHOR_WALLET (default ~/.config/solana/id.json),
 *      or generate + save one if it does not exist,
 *   2. airdrop devnet SOL if the balance is low (free, valueless test SOL),
 *   3. run the on-chain `subscribe(1, 4)` and the activation handshake,
 *   4. print your TXLINE_API_TOKEN.
 *
 * Run:  npm run txline:activate
 *
 * Then set (in Convex env for the live poller, or .env.local for local):
 *   TXLINE_MODE=live
 *   TXLINE_API_ORIGIN=https://txline-dev.txodds.com
 *   TXLINE_API_TOKEN=<printed token>
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import txoracleIdl from "../idl/txoracle.json" with { type: "json" };

const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH = (process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(
  /^~/,
  homedir(),
);
const API_ORIGIN = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
const PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");

const SERVICE_LEVEL_ID = 1; // devnet free World Cup & Int Friendlies (real-time)
const DURATION_WEEKS = 4; // 28-day minimum term
const SELECTED_LEAGUES: number[] = []; // free bundle -> none

function loadOrCreateKeypair(): Keypair {
  if (existsSync(WALLET_PATH)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  mkdirSync(dirname(WALLET_PATH), { recursive: true });
  writeFileSync(WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log("Created a new devnet keypair at", WALLET_PATH);
  return kp;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureFunds(connection: Connection, kp: Keypair) {
  let bal = await connection.getBalance(kp.publicKey);
  console.log("wallet:", kp.publicKey.toBase58(), "| devnet SOL:", bal / LAMPORTS_PER_SOL);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) return;

  // The public devnet faucet is heavily rate-limited; retry a few times with
  // 1 SOL requests and backoff.
  for (let attempt = 1; attempt <= 5 && bal < 0.05 * LAMPORTS_PER_SOL; attempt++) {
    console.log(`airdrop attempt ${attempt}/5 (1 SOL)…`);
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      bal = await connection.getBalance(kp.publicKey);
      console.log("  funded:", bal / LAMPORTS_PER_SOL, "SOL");
    } catch {
      if (attempt < 5) await sleep(4000);
    }
  }

  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Devnet faucet is rate-limited right now. Fund this address at https://faucet.solana.com (web faucet), then re-run \`npm run txline:activate\`:\n  ${kp.publicKey.toBase58()}`,
    );
  }
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const keypair = loadOrCreateKeypair();
  await ensureFunds(connection, keypair);

  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);

  if (!program.programId.equals(PROGRAM_ID)) {
    throw new Error(`IDL program id ${program.programId.toBase58()} != devnet ${PROGRAM_ID.toBase58()}`);
  }

  // PDAs + token accounts (deterministic per-program storage)
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  console.log("Subscribing on-chain (devnet, free tier)…");
  // The program expects the user's TxL token account to already exist. Create
  // it idempotently in the same tx (empty ATA — the free tier costs 0 TxL).
  const createAta = createAssociatedTokenAccountIdempotentInstruction(
    keypair.publicKey,
    userTokenAccount,
    keypair.publicKey,
    TXL_MINT,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txSig = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accountsPartial({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([createAta])
    .rpc();
  console.log("subscribe tx:", txSig);

  // Off-chain activation: guest JWT -> sign message -> exchange for API token.
  const { data: guest } = await axios.post(`${API_ORIGIN}/auth/guest/start`);
  const jwt = guest.token;
  const message = new TextEncoder().encode(`${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, keypair.secretKey)).toString("base64");

  const activation = await axios.post(
    `${API_ORIGIN}/api/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  const apiToken = activation.data.token ?? activation.data;

  console.log("\n──────────────────────────────────────────");
  console.log("TXLINE_API_TOKEN:", apiToken);
  console.log("\nSet these where the live poller runs (Convex env) or in .env.local:");
  console.log("  TXLINE_MODE=live");
  console.log("  TXLINE_API_ORIGIN=" + API_ORIGIN);
  console.log("  TXLINE_API_TOKEN=<the token above>");
}

main().catch((e) => {
  console.error("\nactivation failed:", e?.response?.data ?? e?.message ?? e);
  process.exit(1);
});
