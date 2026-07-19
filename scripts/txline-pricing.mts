/**
 * Read-only devnet health check + on-chain pricing/cost reader.
 *
 * Confirms the TxLINE devnet program is reachable, then reads the
 * `pricing_matrix` PDA and prints every service row with its cost in TxL and
 * USD (conversion: 1 USD = 1,000 TxL). No wallet funds and no API token are
 * needed — this only reads public on-chain accounts.
 *
 * Run:  npm run txline:pricing
 */
import * as anchor from "@coral-xyz/anchor";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import txoracleIdl from "../idl/txoracle.json" with { type: "json" };

const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID = new anchor.web3.PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new anchor.web3.PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const TXL_PER_USD = 1_000; // docs: 1 USD = 1,000 TxL
const DEFAULT_WEEKS = 4; // subscriptions are sold in 28-day (4-week) terms

interface ServiceRow {
  rowId: number;
  pricePerWeekToken: anchor.BN;
  samplingIntervalSec: number;
  leagueBundleId: number;
  marketBundleId: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

async function main() {
  const connection = new anchor.web3.Connection(RPC, "confirmed");

  // ── 1. connection / testnet health ──────────────────────────────────────
  console.log("── TxLINE devnet connection check ──");
  console.log("RPC:", RPC);
  const version = await connection.getVersion();
  const slot = await connection.getSlot();
  const blockHeight = await connection.getBlockHeight();
  console.log("solana-core:", version["solana-core"], "| slot:", fmt(slot), "| blockHeight:", fmt(blockHeight));

  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  console.log(
    "program:",
    PROGRAM_ID.toBase58(),
    programInfo ? `reachable (executable=${programInfo.executable})` : "NOT FOUND",
  );
  if (!programInfo) throw new Error("TxLINE program not found on this RPC — wrong network?");

  // TxL mint decimals (Token-2022)
  let decimals = 0;
  try {
    const mint = await getMint(connection, TXL_MINT, "confirmed", TOKEN_2022_PROGRAM_ID);
    decimals = mint.decimals;
    console.log("TxL mint:", TXL_MINT.toBase58(), `(decimals=${decimals}, Token-2022)`);
  } catch {
    console.log("TxL mint:", TXL_MINT.toBase58(), "(decimals unknown)");
  }

  // ── 2. read the on-chain pricing matrix ─────────────────────────────────
  // Read-only Anchor program: a throwaway wallet is fine, account reads never sign.
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(txoracleIdl as anchor.Idl, provider);
  /* eslint-disable @typescript-eslint/no-explicit-any */

  const [pricingMatrixPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  console.log("\n── Pricing matrix ──");
  console.log("PDA:", pricingMatrixPda.toBase58());

  const matrix = (await (program.account as any).pricingMatrix.fetch(
    pricingMatrixPda,
  )) as { admin: anchor.web3.PublicKey; rows: ServiceRow[] };

  console.log("admin:", matrix.admin.toBase58(), "| rows:", matrix.rows.length);
  console.log(
    "\n  id  interval  leagueB  marketB  TxL/week        cost/28d (TxL)     USD (28d)",
  );
  console.log("  " + "─".repeat(76));

  const scale = decimals > 0 ? 10 ** decimals : 1;
  for (const row of matrix.rows) {
    const perWeekRaw = Number(row.pricePerWeekToken.toString());
    const perWeekTxL = perWeekRaw / scale; // base units -> whole TxL
    const total28 = perWeekTxL * DEFAULT_WEEKS;
    const usd = total28 / TXL_PER_USD;
    const interval = row.samplingIntervalSec === 0 ? "real-time" : `${row.samplingIntervalSec}s`;
    console.log(
      "  " +
        String(row.rowId).padEnd(4) +
        interval.padEnd(10) +
        String(row.leagueBundleId).padEnd(9) +
        String(row.marketBundleId).padEnd(9) +
        fmt(perWeekTxL).padEnd(16) +
        fmt(total28).padEnd(18) +
        (usd === 0 ? "FREE" : `$${fmt(usd)}`),
    );
  }

  // ── 3. estimated cost for the tier we use (free World Cup) ───────────────
  const wcRows = matrix.rows.filter((r) => r.rowId === 1 || r.rowId === 12);
  console.log("\n── Estimated cost for GOLAZO (free World Cup tier) ──");
  for (const r of wcRows) {
    const perWeek = Number(r.pricePerWeekToken.toString()) / scale;
    const usd = (perWeek * DEFAULT_WEEKS) / TXL_PER_USD;
    console.log(
      `  service level ${r.rowId}: ${r.samplingIntervalSec === 0 ? "real-time" : r.samplingIntervalSec + "s"} delay, ` +
        `${DEFAULT_WEEKS} weeks = ${usd === 0 ? "$0.00 (FREE)" : "$" + fmt(usd)}`,
    );
  }
  if (!wcRows.length) console.log("  (no World Cup tier rows found on this matrix)");
  console.log("\nConversion rate: 1 USD = 1,000 TxL");
}

main().catch((e) => {
  console.error("\npricing check failed:", e?.message ?? e);
  process.exit(1);
});
