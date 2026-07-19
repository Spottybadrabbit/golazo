// End-to-end proof that Golazo's service wallet can talk to TxLINE (TxODDS)
// on Solana devnet: subscribe on-chain (free tier), activate an off-chain API
// token, pull snapshots, and open both SSE streams.
//
//   Usage:  npm run txline:prove
//           node scripts/txline/prove-connection.mjs
//
// Mirrors TxODDS' own subscription_free_tier.ts / subscription_scores.ts
// examples. Every step is defensive: on failure we print exactly which ✓
// step broke and why, then exit non-zero, but we still attempt every
// subsequent step that doesn't strictly depend on the failed one's output.
//
// ---- On-chain PDA derivation ----
// The vendored IDL (scripts/txline/idl/txline.json) has NO pda.seeds
// metadata on the subscribe() accounts (Anchor's fetchIdl() doesn't always
// preserve it). Seeds below were recovered empirically against devnet, not
// guessed:
//   - pricing_matrix: getProgramAccounts() filtered by the PricingMatrix
//     account discriminator found exactly one account; findProgramAddressSync
//     with seed "pricing_matrix" reproduces that same address.
//   - token_treasury_pda: decoded a real, recent subscribe() transaction on
//     devnet (found via getSignaturesForAddress on the program) and read its
//     actual account list. findProgramAddressSync with seed
//     "token_treasury_v2" reproduces the token_treasury_pda used there.
//   - token_treasury_vault: confirmed to be the Token-2022 ATA of
//     (TXL mint, token_treasury_pda, allowOwnerOffCurve=true) — matches the
//     vault address seen in that same real transaction.
// The on-chain PricingMatrix account was also fetched directly and its single
// row confirms row_id=1 / price_per_week_token=0 / sampling_interval_sec=0,
// i.e. exactly the free World Cup tier described in the task.
//
// IMPORTANT: the TXL mint (4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG) is a
// Token-2022 mint, not classic SPL Token. The `token_program` account passed
// to subscribe() must be TOKEN_2022_PROGRAM_ID.
//
// ---- Off-chain activation message ----
// The OpenAPI spec's prose (not the schema, which has no format info) says
// the signed message binds txSig, a comma-separated leagues list, and the
// JWT. For the free tier, leagues=[] (empty), so the 3-part colon-delimited
// message `${txSig}:${leagues.join(",")}:${jwt}` collapses to
// `${txSig}::${jwt}` — consistent with both the spec prose and this task's
// brief. walletSignature is Base64 (confirmed by spec prose: "Base64-encoded"),
// NOT base58.

import anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync, existsSync } from "node:fs";
import nacl from "tweetnacl";
import axios from "axios";
import { EventSource } from "eventsource";
import bs58 from "bs58";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
const API_ORIGIN = process.env.TXLINE_API_ORIGIN || "https://txline-dev.txodds.com";
const PROGRAM_ID = new PublicKey(
  process.env.TXLINE_PROGRAM_ID || "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
);
const TXL_MINT = new PublicKey(
  process.env.TXLINE_TXL_MINT || "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
);

// Empirically confirmed devnet PDAs (see header comment for how).
const PRICING_MATRIX_SEED = "pricing_matrix";
const TOKEN_TREASURY_SEED = "token_treasury_v2";

const FREE_TIER_SERVICE_LEVEL_ID = 1;
// The deployed txoracle program enforces weeks % 4 == 0 (on-chain error
// InvalidWeeks/6041 "Weeks must be a multiple of 4"), even though the vendored
// IDL's static text only says "greater than zero". Smallest valid term = 4.
const WEEKS = 4;

function loadServiceWallet() {
  const spec = process.env.TXLINE_SERVICE_WALLET || ".txline/service-wallet.json";
  if (!existsSync(spec)) {
    throw new Error(
      `Service wallet not found at "${spec}". Run \`npm run txline:wallet\` first, ` +
        `or set TXLINE_SERVICE_WALLET to a keypair json path or a base58 secret key.`,
    );
  }
  const raw = readFileSync(spec, "utf8").trim();
  try {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    // Not JSON -> treat TXLINE_SERVICE_WALLET itself as a base58 secret key string.
    return Keypair.fromSecretKey(bs58.decode(raw));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logStep(ok, label, extra = "") {
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${label}${extra ? ` ${extra}` : ""}`);
}

function fail(step, err) {
  console.error(`\n✗ FAILED at step: ${step}`);
  console.error(err?.response?.data ?? err?.message ?? err);
  if (err?.logs) console.error("logs:", err.logs);
}

async function main() {
  console.log("TxLINE devnet connection proof");
  console.log(`  RPC:         ${RPC_URL}`);
  console.log(`  API origin:  ${API_ORIGIN}`);
  console.log(`  Program:     ${PROGRAM_ID.toBase58()}`);
  console.log(`  TXL mint:    ${TXL_MINT.toBase58()}\n`);

  const results = {
    subscribe: false,
    guestJwt: false,
    apiToken: false,
    fixtures: false,
    oddsSnapshot: false,
    scoresSnapshot: false,
    oddsStream: false,
    scoresStream: false,
  };

  let wallet;
  try {
    wallet = loadServiceWallet();
    console.log(`Service wallet: ${wallet.publicKey.toBase58()}`);
  } catch (e) {
    fail("load service wallet", e);
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const anchorWallet = new anchor.Wallet(wallet);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, {
    commitment: "confirmed",
  });

  const idl = JSON.parse(
    readFileSync(new URL("./idl/txline.json", import.meta.url), "utf8"),
  );
  const program = new anchor.Program(idl, provider);

  // -------------------------------------------------------------------------
  // Step a: subscribe() free tier
  // -------------------------------------------------------------------------
  let txSig = null;
  try {
    const lamports = await connection.getBalance(wallet.publicKey);
    console.log(`  balance: ${lamports / 1e9} SOL`);
    if (lamports === 0) {
      throw new Error(
        "Service wallet has 0 SOL on devnet — cannot pay the subscribe() tx fee. " +
          "Fund it (npm run txline:wallet, or https://faucet.solana.com/) and re-run.",
      );
    }

    const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PRICING_MATRIX_SEED)],
      PROGRAM_ID,
    );
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(TOKEN_TREASURY_SEED)],
      PROGRAM_ID,
    );
    const tokenTreasuryVault = getAssociatedTokenAddressSync(
      TXL_MINT,
      tokenTreasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
      TXL_MINT,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    console.log(`  pricing_matrix:       ${pricingMatrixPda.toBase58()}`);
    console.log(`  token_treasury_pda:   ${tokenTreasuryPda.toBase58()}`);
    console.log(`  token_treasury_vault: ${tokenTreasuryVault.toBase58()}`);
    console.log(`  user_token_account:   ${userTokenAccount.toBase58()}`);

    // Ensure the user's TXL ATA exists (idempotent create-if-missing).
    const ataInfo = await connection.getAccountInfo(userTokenAccount);
    const preIxns = [];
    if (!ataInfo) {
      console.log("  user TXL ATA missing -> will create it idempotently in the same tx");
      preIxns.push(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userTokenAccount,
          wallet.publicKey,
          TXL_MINT,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    const sig = await program.methods
      .subscribe(FREE_TIER_SERVICE_LEVEL_ID, WEEKS)
      .accounts({
        user: wallet.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: TXL_MINT,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .preInstructions(preIxns)
      .rpc({ commitment: "confirmed" });

    txSig = sig;
    results.subscribe = true;
    logStep(true, "TxLINE subscription activated", `(txSig=${txSig})`);
  } catch (e) {
    fail("subscribe() free tier", e);
  }

  // -------------------------------------------------------------------------
  // Step b: guest JWT
  // -------------------------------------------------------------------------
  let jwt = null;
  try {
    const res = await axios.post(`${API_ORIGIN}/auth/guest/start`, {});
    jwt = res.data?.token;
    if (!jwt) throw new Error(`no token in response: ${JSON.stringify(res.data)}`);
    results.guestJwt = true;
    logStep(true, "Guest JWT received");
  } catch (e) {
    fail("POST /auth/guest/start", e);
  }

  // -------------------------------------------------------------------------
  // Step c: sign + activate API token
  // -------------------------------------------------------------------------
  let apiToken = null;
  if (txSig && jwt) {
    try {
      const leagues = [];
      const message = `${txSig}:${leagues.join(",")}:${jwt}`;
      const signature = nacl.sign.detached(
        new TextEncoder().encode(message),
        wallet.secretKey,
      );
      const walletSignature = Buffer.from(signature).toString("base64");

      const res = await axios.post(
        `${API_ORIGIN}/api/token/activate`,
        { txSig, walletSignature, leagues },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      apiToken = res.data;
      if (!apiToken || typeof apiToken !== "string") {
        throw new Error(`unexpected activate response: ${JSON.stringify(res.data)}`);
      }
      results.apiToken = true;
      logStep(true, "API token activated");
    } catch (e) {
      fail("POST /api/token/activate", e);
    }
  } else {
    console.log("✗ SKIPPED: POST /api/token/activate (missing txSig and/or guest JWT)");
  }

  const authHeaders = jwt && apiToken
    ? { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken }
    : null;

  // -------------------------------------------------------------------------
  // Step d: fixtures snapshot
  // -------------------------------------------------------------------------
  let fixtureId = null;
  if (authHeaders) {
    try {
      const res = await axios.get(`${API_ORIGIN}/api/fixtures/snapshot`, {
        headers: authHeaders,
      });
      const fixtures = res.data;
      const count = Array.isArray(fixtures) ? fixtures.length : 0;
      results.fixtures = true;
      logStep(true, "Fixture data received", `(count=${count})`);
      if (count > 0) fixtureId = fixtures[0].FixtureId ?? fixtures[0].fixtureId;
    } catch (e) {
      fail("GET /api/fixtures/snapshot", e);
    }
  } else {
    console.log("✗ SKIPPED: GET /api/fixtures/snapshot (no API token)");
  }

  // -------------------------------------------------------------------------
  // Step e: odds + scores snapshot
  // -------------------------------------------------------------------------
  if (authHeaders && fixtureId != null) {
    try {
      const res = await axios.get(
        `${API_ORIGIN}/api/odds/snapshot/${fixtureId}`,
        { headers: authHeaders },
      );
      results.oddsSnapshot = true;
      logStep(true, "Odds snapshot received", `(fixtureId=${fixtureId}, count=${Array.isArray(res.data) ? res.data.length : 0})`);
    } catch (e) {
      fail("GET /api/odds/snapshot/{fixtureId}", e);
    }

    try {
      const res = await axios.get(
        `${API_ORIGIN}/api/scores/snapshot/${fixtureId}`,
        { headers: authHeaders },
      );
      results.scoresSnapshot = true;
      logStep(true, "Scores snapshot received", `(fixtureId=${fixtureId}, count=${Array.isArray(res.data) ? res.data.length : 0})`);
    } catch (e) {
      fail("GET /api/scores/snapshot/{fixtureId}", e);
    }
  } else {
    console.log("✗ SKIPPED: odds/scores snapshot (no API token and/or fixtureId)");
  }

  // -------------------------------------------------------------------------
  // Step f: SSE streams
  // -------------------------------------------------------------------------
  async function openStream(path, label, resultKey) {
    if (!authHeaders) {
      console.log(`✗ SKIPPED: ${label} (no API token)`);
      return;
    }
    await new Promise((resolve) => {
      const url = `${API_ORIGIN}${path}`;
      // eventsource v4 dropped the top-level `headers` option: custom headers
      // must be injected through a fetch override, else the request goes out
      // unauthenticated and the server returns 401 "Invalid or expired guest JWT".
      const es = new EventSource(url, {
        fetch: (input, init) =>
          fetch(input, { ...init, headers: { ...init.headers, ...authHeaders } }),
      });
      let opened = false;
      let eventsSeen = 0;
      const timeout = setTimeout(() => {
        es.close();
        if (!opened) fail(label, new Error("timed out waiting for SSE open"));
        resolve();
      }, 15000);

      es.onopen = () => {
        opened = true;
        results[resultKey] = true;
        logStep(true, label);
      };
      es.onmessage = (ev) => {
        eventsSeen++;
        console.log(`  [${label}] event: ${ev.data?.slice?.(0, 300) ?? ev.data}`);
        if (eventsSeen >= 2) {
          clearTimeout(timeout);
          es.close();
          resolve();
        }
      };
      es.onerror = (err) => {
        clearTimeout(timeout);
        es.close();
        if (!opened) fail(label, err);
        resolve();
      };
    });
  }

  await openStream("/api/odds/stream", "Odds SSE connection opened", "oddsStream");
  await openStream("/api/scores/stream", "Scores SSE connection opened", "scoresStream");

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n--- Summary ---");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${v ? "✓" : "✗"} ${k}`);
  }

  const allOk = Object.values(results).every(Boolean);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  fail("unexpected top-level error", e);
  process.exit(1);
});
