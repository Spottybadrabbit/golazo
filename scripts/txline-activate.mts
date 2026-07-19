/**
 * One-time DEVNET activation for the FREE World Cup tier.
 *
 * This performs the on-chain `subscribe` transaction and the off-chain
 * activation handshake, then prints your TXLINE_API_TOKEN. Run it yourself with
 * your own devnet wallet — it signs a transaction, so it is not run for you.
 *
 * Prereqs:
 *   1. solana-keygen new -o ~/.config/solana/id.json   (or reuse a key)
 *   2. solana airdrop 2 --url devnet                    (devnet SOL for fees/rent; free tier needs no TxL)
 *
 * Run:
 *   ANCHOR_PROVIDER_URL="https://api.devnet.solana.com" \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npm run txline:activate
 *
 * Then set in the CONVEX dashboard env (Settings -> Environment Variables):
 *   TXLINE_MODE=live
 *   TXLINE_API_ORIGIN=https://txline-dev.txodds.com
 *   TXLINE_API_TOKEN=<printed token>
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import txoracleIdl from "../idl/txoracle.json" with { type: "json" };

const API_ORIGIN = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
const PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");

const SERVICE_LEVEL_ID = 1; // devnet free World Cup & Int Friendlies (real-time)
const DURATION_WEEKS = 4; // 28-day minimum term
const SELECTED_LEAGUES: number[] = []; // free bundle -> none

async function main() {
  const provider = anchor.AnchorProvider.env(); // reads ANCHOR_WALLET + ANCHOR_PROVIDER_URL
  anchor.setProvider(provider);
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);

  if (!program.programId.equals(PROGRAM_ID)) {
    throw new Error(`IDL program id ${program.programId.toBase58()} != devnet ${PROGRAM_ID.toBase58()}`);
  }

  const bal = await provider.connection.getBalance(provider.wallet.publicKey);
  console.log("wallet:", provider.wallet.publicKey.toBase58(), "| devnet SOL:", bal / 1e9);
  if (bal === 0) throw new Error("Wallet has 0 SOL. Run: solana airdrop 2 --url devnet");

  // PDAs + token accounts (Solana's deterministic per-program storage)
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
    provider.wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  console.log("Subscribing on-chain (devnet, free tier)…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txSig = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accountsPartial({
      user: provider.wallet.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("subscribe tx:", txSig);

  // Off-chain activation: guest JWT -> sign message -> exchange for API token.
  const { data: guest } = await axios.post(`${API_ORIGIN}/auth/guest/start`);
  const jwt = guest.token;

  // Free bundle => empty leagues => message is `${txSig}::${jwt}`.
  const message = new TextEncoder().encode(`${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`);
  const payer = (provider.wallet as anchor.Wallet).payer;
  const walletSignature = Buffer.from(nacl.sign.detached(message, payer.secretKey)).toString("base64");

  const activation = await axios.post(
    `${API_ORIGIN}/api/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  const apiToken = activation.data.token ?? activation.data;

  console.log("\n──────────────────────────────────────────");
  console.log("TXLINE_API_TOKEN:", apiToken);
  console.log("\nSet these in the CONVEX dashboard env:");
  console.log("  TXLINE_MODE=live");
  console.log("  TXLINE_API_ORIGIN=" + API_ORIGIN);
  console.log("  TXLINE_API_TOKEN=<the token above>");
}

main().catch((e) => {
  console.error("\nactivation failed:", e?.response?.data ?? e?.message ?? e);
  process.exit(1);
});
