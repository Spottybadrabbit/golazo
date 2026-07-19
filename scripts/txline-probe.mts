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

// ── SSE parsing (from the TxODDS Streaming Data docs) ──
type SseMessage = { id?: string; event?: string; data: string; retry?: number };

function parseSseBlock(block: string): SseMessage | null {
  const message: SseMessage = { data: "" };
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const i = rawLine.indexOf(":");
    const field = i === -1 ? rawLine : rawLine.slice(0, i);
    const value = i === -1 ? "" : rawLine.slice(i + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

async function* readSseMessages(response: Response): AsyncGenerator<SseMessage> {
  if (!response.body) throw new Error("Stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.match(/\r?\n\r?\n/);
      while (sep?.index !== undefined) {
        const block = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep[0].length);
        const m = parseSseBlock(block);
        if (m) yield m;
        sep = buffer.match(/\r?\n\r?\n/);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseData(data: string) {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

// Open an SSE stream for a bounded window and print the first messages, so we
// can confirm the real-time push feed works (not just snapshots).
async function probeStream(name: "odds" | "scores", jwt: string, seconds = 20, max = 8) {
  console.log(`\n── ${name} SSE stream (up to ${seconds}s) ──`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), seconds * 1000);
  try {
    const res = await fetch(`${ORIGIN}/api/${name}/stream`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": TOKEN,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.log(`  stream ${res.status} (401 -> renew jwt; 403 -> wrong network/bundle)`);
      return;
    }
    console.log("  stream open — waiting for messages...");
    let n = 0;
    for await (const msg of readSseMessages(res)) {
      const data = parseSseData(msg.data);
      console.log(`  [${msg.event ?? "message"}]`, JSON.stringify(data).slice(0, 400));
      if (++n >= max) break;
    }
    if (n === 0) console.log("  (only heartbeats / no data in window — no covered fixture live right now)");
  } catch (e) {
    const err = e as Error;
    if (err.name !== "AbortError") console.log("  stream error:", err.message);
    else console.log("  window closed.");
  } finally {
    clearTimeout(timer);
  }
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

  // Confirm the real-time push feeds (SSE). These may only show heartbeats if
  // no covered fixture is live in the window — that is expected on devnet.
  await probeStream("scores", jwt, 20);
  await probeStream("odds", jwt, 15);

  console.log("\nNext: tighten ODDS_MARKET_HINT / PRICE_SCALE / GOAL_STAT_KEYS in convex/txline.ts to match the raw output above.");
}

main().catch((e) => {
  console.error("\nprobe failed:", e?.message ?? e);
  process.exit(1);
});
