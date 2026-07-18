// TxLINE / TxODDS live adapter (server-only).
//
// The public game runs on the deterministic engine. The moment a TxLINE API
// token is present, this adapter fetches the real World Cup feed instead,
// mapping it to our MatchState shape. Getting the token is a one-time on-chain
// step per the TxODDS docs: submit the Solana `subscribe` transaction, sign a
// message, activate, then set these env vars:
//
//   TXLINE_MODE=live
//   TXLINE_API_TOKEN=<activated api token>       (X-Api-Token header)
//   TXLINE_API_JWT=<guest jwt>                    (Authorization: Bearer)
//   TXLINE_API_ORIGIN=https://txline.txodds.com   (or txline-dev for devnet)
//
// Docs: https://txline.txodds.com/documentation/worldcup

import type { MatchState, SideStats, Team } from "@/lib/engine";
import { team } from "@/lib/engine";

export function liveConfigured(): boolean {
  return (
    process.env.TXLINE_MODE === "live" &&
    Boolean(process.env.TXLINE_API_TOKEN) &&
    Boolean(process.env.TXLINE_API_ORIGIN)
  );
}

interface TxFixture {
  id: number;
  home: { code: string; name: string };
  away: { code: string; name: string };
  minute: number;
  status: string;
  homeScore: number;
  awayScore: number;
  sequence: number;
}

interface TxOdds {
  home: number;
  draw: number;
  away: number;
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    "X-Api-Token": process.env.TXLINE_API_TOKEN as string,
    Accept: "application/json",
  };
  if (process.env.TXLINE_API_JWT) h.Authorization = `Bearer ${process.env.TXLINE_API_JWT}`;
  return h;
}

async function txGet<T>(path: string): Promise<T> {
  const origin = process.env.TXLINE_API_ORIGIN as string;
  const res = await fetch(`${origin}/api${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`TxLINE ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function knownTeam(code: string, name: string): Team {
  const t = team(code);
  return t.code === code ? t : { code, name, flag: "🏳️", strength: 0.7 };
}

function impliedProbs(o: TxOdds) {
  const raw = { h: 1 / o.home, d: 1 / o.draw, a: 1 / o.away };
  const sum = raw.h + raw.d + raw.a;
  return {
    home: Math.round((raw.h / sum) * 1000) / 10,
    draw: Math.round((raw.d / sum) * 1000) / 10,
    away: Math.round((raw.a / sum) * 1000) / 10,
  };
}

function emptyStats(): SideStats {
  return { shots: 0, onTarget: 0, corners: 0, xg: 0, yellows: 0, reds: 0, possession: 50 };
}

/**
 * Fetch a single live fixture from TxLINE and map it to a MatchState. Returns
 * null on any failure so the caller can fall back to the simulator. Prefers the
 * England v France fixture when present.
 */
export async function fetchLiveMarquee(): Promise<MatchState | null> {
  try {
    const fixtures = await txGet<TxFixture[]>("/worldcup/fixtures?status=live");
    if (!fixtures.length) return null;
    const engFra = fixtures.find(
      (f) =>
        (f.home.code === "ENG" && f.away.code === "FRA") ||
        (f.home.code === "FRA" && f.away.code === "ENG"),
    );
    const fx = engFra ?? fixtures[0];
    const odds = await txGet<TxOdds>(`/worldcup/odds/${fx.id}`);
    const probs = impliedProbs(odds);
    const stats: [SideStats, SideStats] = [emptyStats(), emptyStats()];
    return {
      fixtureId: fx.id,
      cycle: 0,
      slot: -1,
      home: knownTeam(fx.home.code, fx.home.name),
      away: knownTeam(fx.away.code, fx.away.name),
      minute: fx.minute,
      phase: fx.status === "HT" ? "HT" : fx.minute >= 90 ? "FT" : "LIVE",
      score: [fx.homeScore, fx.awayScore],
      stats,
      probs,
      odds,
      pressure: 0,
      events: [],
      sequence: fx.sequence,
    };
  } catch {
    return null; // fall back to the simulator
  }
}
