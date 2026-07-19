import { NextResponse } from "next/server";
import { getSolBalance, type SolNetwork } from "@/lib/solana";

// Runs on Node so @solana/web3.js (and its deps) work; never cached.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const network: SolNetwork = searchParams.get("network") === "mainnet" ? "mainnet" : "devnet";

  if (!address) {
    return NextResponse.json(
      { error: "address is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sol = await getSolBalance(address, network);

  return NextResponse.json(
    { address, network, sol },
    { headers: { "Cache-Control": "no-store" } },
  );
}
