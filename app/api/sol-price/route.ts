import { NextResponse } from "next/server";

// Indicative SOL → USD/GBP conversion for BetSlip's payout display. Display
// math only — nothing here moves funds or reads a wallet. A short in-memory
// cache keeps repeat polls off CoinGecko's free tier, and a fixed fallback
// keeps the panel usable if that request is slow or blocked.
export const runtime = "nodejs";

const FALLBACK = { usd: 150, gbp: 118 };
const TTL_MS = 60_000;
const SOURCE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd,gbp";

let cache: { at: number; usd: number; gbp: number; source: "live" | "fallback" } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const res = await Promise.race([
      fetch(SOURCE_URL, { headers: { Accept: "application/json" } }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("sol-price timeout")), 4000),
      ),
    ]);
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = (await res.json()) as { solana?: { usd?: number; gbp?: number } };
    const usd = data.solana?.usd;
    const gbp = data.solana?.gbp;
    if (typeof usd !== "number" || typeof gbp !== "number") throw new Error("bad payload");
    cache = { at: now, usd, gbp, source: "live" };
  } catch {
    cache = { at: now, ...FALLBACK, source: "fallback" };
  }

  return NextResponse.json(cache, { headers: { "Cache-Control": "no-store" } });
}
