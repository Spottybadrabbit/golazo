import { NextResponse } from "next/server";
import { fetchLiveFeed } from "@/lib/txline.server";

// Client-facing live feed (a Vercel serverless function). Returns the real
// TxODDS LiveFeed the UI consumes. The API token stays server-side here and is
// never exposed to the browser. When the feed is unconfigured or upstream is
// down, we return a `mode:"sim"` sentinel so the client cleanly falls back to
// the deterministic engine instead of freezing.
export async function GET() {
  const feed = await fetchLiveFeed();
  if (!feed) {
    return NextResponse.json(
      { mode: "sim", updatedAt: Date.now(), featured: null, matches: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
