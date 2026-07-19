/**
 * Probe the live devnet feed to reveal real payload shapes.
 *
 * Run AFTER activation, with the token in your shell env:
 *   TXLINE_API_ORIGIN="https://txline-dev.txodds.com" \
 *   TXLINE_API_TOKEN="<token from npm run txline:activate>" \
 *   npm run txline:probe
 *
 * It prints raw fixtures + odds + scores JSON and what our mappers make of
 * them, so the PROBE-NOTE constants in convex/txline.ts can be finalized:
 *   ODDS_MARKET_HINT, PRICE_SCALE, GOAL_STAT_KEYS, in-play GameState.
 */
import { mapFixture, mapOdds, mapScore, isInPlay } from "../convex/txline.ts";

const ORIGIN = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
const TOKEN = process.env.TXLINE_API_TOKEN ?? "";

async function guestJwt(): Promise<string> {
  const r = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!r.ok) throw new Error(`guest/start -> ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}

async function get(path: string, jwt: string) {
  const r = await fetch(`${ORIGIN}/api${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": TOKEN, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

function show(label: string, v: unknown) {
  console.log(`\n── ${label} ──`);
  console.log(JSON.stringify(v, null, 2).slice(0, 4000));
}

async function main() {
  if (!TOKEN) throw new Error("Set TXLINE_API_TOKEN in your env first (run npm run txline:activate).");
  console.log("origin:", ORIGIN);
  const jwt = await guestJwt();
  console.log("guest jwt acquired.");

  const fixturesRaw = await get("/fixtures/snapshot", jwt);
  const list: unknown[] = Array.isArray(fixturesRaw)
    ? fixturesRaw
    : ((fixturesRaw as Record<string, unknown>).fixtures as unknown[]) ?? [];
  console.log(`\nfixtures: ${list.length}`);
  show("raw fixture[0]", list[0]);

  const mapped = list.map(mapFixture);
  console.log("\nmapped fixtures (first 6):");
  for (const f of mapped.slice(0, 6)) {
    console.log(`  ${f.fixtureId}  ${f.home} v ${f.away}  gameState=${f.gameState}  ${f.competition}`);
  }

  const target = mapped[0];
  if (!target) {
    console.log("\nNo fixtures returned — nothing in-play on devnet right now.");
    return;
  }
  console.log(`\nProbing fixture ${target.fixtureId} (${target.home} v ${target.away})`);

  try {
    const oddsRaw = await get(`/odds/snapshot/${target.fixtureId}`, jwt);
    show("raw odds", oddsRaw);
    console.log("mapped odds:", JSON.stringify(mapOdds(oddsRaw)));
  } catch (e) {
    console.log("odds fetch failed:", (e as Error).message);
  }

  try {
    const scoreRaw = await get(`/scores/snapshot/${target.fixtureId}?asOf=${Date.now()}`, jwt);
    show("raw scores", scoreRaw);
    const score = mapScore(scoreRaw);
    console.log("mapped score:", JSON.stringify(score));
    console.log("isInPlay:", isInPlay(target, null, score));
  } catch (e) {
    console.log("scores fetch failed:", (e as Error).message);
  }

  console.log("\nNext: tighten ODDS_MARKET_HINT / PRICE_SCALE / GOAL_STAT_KEYS in convex/txline.ts to match the raw output above.");
}

main().catch((e) => {
  console.error("\nprobe failed:", e?.message ?? e);
  process.exit(1);
});
