import { NextResponse } from "next/server";
import { Connection, LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from "@solana/web3.js";

// Real Solana balance lookup for the connected wallet. Server-side so the RPC
// URL stays private; the client never talks to the chain directly.
export const runtime = "nodejs";

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");

// Brief per-address cache so repeat polls don't hammer the RPC.
const cache = new Map<string, { at: number; sol: number }>();
const TTL_MS = 10_000;

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  let key: PublicKey;
  try {
    key = new PublicKey(address);
  } catch {
    return NextResponse.json({ error: "invalid Solana address" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(address);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json({ address, sol: hit.sol, cached: true });
  }

  try {
    const conn = new Connection(RPC, "confirmed");
    const lamports = await Promise.race([
      conn.getBalance(key),
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error("rpc timeout")), 4000)),
    ]);
    const sol = lamports / LAMPORTS_PER_SOL;
    cache.set(address, { at: now, sol });
    return NextResponse.json({ address, sol }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "RPC unavailable" }, { status: 502 });
  }
}
