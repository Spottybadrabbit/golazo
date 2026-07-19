import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { fetchLiveFeed } from "@/lib/txline.server";

// Protected developer API. Requires a live GOLAZO API key (glz_…) generated at
// /technicaldoc. Pass it as `Authorization: Bearer glz_…` or `?key=glz_…`.
// The key is validated against Convex (must exist and not be revoked); on
// success we return the same real TxODDS LiveFeed the app consumes. The TxLINE
// token itself never leaves the server.

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const validateKeyRef = makeFunctionReference<"query">("apikeys:validateKey");
const touchKeyRef = makeFunctionReference<"mutation">("apikeys:touchKey");

function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const xkey = req.headers.get("x-api-key");
  if (xkey) return xkey.trim();
  return new URL(req.url).searchParams.get("key");
}

export async function GET(req: Request) {
  const key = extractKey(req);
  if (!key || !key.startsWith("glz_")) {
    return NextResponse.json(
      { error: "Missing API key. Pass 'Authorization: Bearer glz_…', 'X-Api-Key', or '?key='." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!CONVEX_URL) {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  let valid = false;
  let label: string | undefined;
  try {
    const res = (await client.query(validateKeyRef, { key })) as {
      valid: boolean;
      label?: string;
    };
    valid = res?.valid === true;
    label = res?.label;
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid or revoked API key." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Best-effort usage stamp — never block the response on it.
  client.mutation(touchKeyRef, { key }).catch(() => {});

  const feed = await fetchLiveFeed();
  if (!feed) {
    return NextResponse.json(
      { authenticated: true, error: "Live feed temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { authenticated: true, key: { label }, feed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
