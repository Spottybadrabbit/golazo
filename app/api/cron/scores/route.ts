import { NextResponse } from "next/server";
import { liveWorld } from "@/lib/engine";

// Per-minute "pull the scores/stats and refresh" heartbeat.
//
// Vercel Cron hits this route every minute (see vercel.json). It reconciles the
// live world against the deterministic sim engine and returns a compact
// snapshot of every live fixture. It is read-only and idempotent: recomputing
// the same clock window yields the same snapshot, so it is safe to run
// repeatedly with no side effects.
//
// SEAM: when the real live feed + Convex are provisioned, this route becomes
// the place that mirrors the current scores/stats into the live store. For now
// it simply surfaces the engine truth.

export const maxDuration = 60;
export const runtime = "nodejs";

// Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
// If it is set we require a matching header (else 401). If it is not set
// (local/dev) we allow the request so it stays testable, but flag secured:false.
function authorize(request: Request): { ok: boolean; secured: boolean } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true, secured: false };
  const header = request.headers.get("authorization");
  return { ok: header === `Bearer ${secret}`, secured: true };
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const world = liveWorld();
  const matches = world.matches.map((m) => ({
    fixtureId: m.fixtureId,
    home: m.home.code,
    away: m.away.code,
    score: m.score,
    minute: m.minute,
    phase: m.phase,
    probs: m.probs,
  }));

  return NextResponse.json(
    {
      ok: true,
      secured: auth.secured,
      ranAt: new Date(world.now).toISOString(),
      mode: world.source,
      matches,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
