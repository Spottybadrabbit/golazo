// TxLINE (TxODDS) live feed client — Solana devnet.
//
// A module-level singleton (see `getClient()` at the bottom). On first use it
// lazily runs the exact flow proved out by `scripts/txline/prove-connection.mjs`
// (read that script first — it is the source of truth for every network/
// on-chain step reproduced here):
//
//   service wallet (.txline/service-wallet.json, devnet SOL)
//     -> subscribe() on TXLINE_PROGRAM_ID (free tier, service_level_id=1, weeks=4) -> txSig
//     -> POST /auth/guest/start                                                    -> guest JWT
//     -> sign `${txSig}::${jwt}` (Base64, detached nacl signature)
//     -> POST /api/token/activate                                                  -> apiToken
//     -> GET  /api/fixtures/snapshot (best-effort; seeds team names)
//     -> open /api/odds/stream + /api/scores/stream (SSE, kept open indefinitely)
//
// Every step is defensive: any failure leaves `isReady()` false with a
// human-readable `statusDetail()` explaining why. Nothing here ever throws to
// the caller — see `getClient().ensureStarted()`.
//
// Normalisation notes (best-effort; see inline TODOs at each gap):
//   - TxLINE's Scores/Odds payloads don't carry team flags/strength, shot/xG/
//     possession stats, an attack-pressure index, or discrete match events.
//     Those fields get neutral defaults rather than fabricated values.
//   - `minute` is derived from `ts - startTime` (assumed epoch-millis; the
//     vendored OpenAPI spec doesn't state the unit explicitly).
//   - `phase` is derived from the free-text `gameState` field via a coarse
//     heuristic — the SoccerFixtureStatus enum's cryptic codes (H11, HT2,
//     FET, ...) aren't documented with plain-English meanings anywhere in
//     the vendored spec.
//   - `odds`/`probs` are derived from the odds stream's `Pct` (demargined
//     percentage) field, matched against `PriceNames` for recognisable 1X2
//     labels. The raw `Prices` array's fixed-point scale is undocumented, so
//     it's deliberately unused — `odds` below is the *fair* price implied by
//     `Pct` (100 / probability), not a bookmaker's quoted price.

import { AnchorProvider, Program, type Idl, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync, existsSync } from "node:fs";
import nacl from "tweetnacl";
import axios from "axios";
import { EventSource } from "eventsource";
import txlineIdl from "@/scripts/txline/idl/txline.json";
import { TICK_MS, type LiveWorld, type MatchPhase, type MatchState, type SideStats, type Team } from "@/lib/engine";

// ---------------------------------------------------------------------------
// Config (same devnet defaults as scripts/txline/prove-connection.mjs)
// ---------------------------------------------------------------------------

const PRICING_MATRIX_SEED = "pricing_matrix";
const TOKEN_TREASURY_SEED = "token_treasury_v2";
const FREE_TIER_SERVICE_LEVEL_ID = 1;
const WEEKS = 4; // on-chain program enforces weeks % 4 == 0

interface RuntimeConfig {
  apiOrigin: string;
  rpcUrl: string;
  programId: string;
  txlMint: string;
}

function readConfig(): RuntimeConfig {
  return {
    apiOrigin: process.env.TXLINE_API_ORIGIN || "https://txline-dev.txodds.com",
    rpcUrl: process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
    programId: process.env.TXLINE_PROGRAM_ID || "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    txlMint: process.env.TXLINE_TXL_MINT || "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  };
}

// Only the JSON-keypair-array format is supported here (that's the actual
// on-disk shape of .txline/service-wallet.json, written by
// scripts/txline/create-service-wallet.mjs). prove-connection.mjs also
// accepts a raw base58 secret key string; that path is intentionally left
// out to avoid pulling in an extra untyped dependency for a format we don't
// actually use.
function loadServiceWallet(): Keypair {
  const spec = process.env.TXLINE_SERVICE_WALLET || ".txline/service-wallet.json";
  if (!existsSync(spec)) {
    throw new Error(
      `service wallet not found at "${spec}" (run \`npm run txline:wallet\`, or set TXLINE_SERVICE_WALLET)`,
    );
  }
  const raw = readFileSync(spec, "utf8").trim();
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

// Minimal Anchor `Wallet` implementation backed by a raw Keypair. Anchor's
// own NodeWallet lives at a non-barrel import path in the package's ESM
// build (dist/esm/nodewallet.js, not re-exported from the package root), so
// we implement the small interface directly rather than reaching past the
// public API surface.
function keypairWallet(payer: Keypair): Wallet {
  return {
    payer,
    publicKey: payer.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if ("version" in tx) tx.sign([payer]);
      else tx.partialSign(payer);
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if ("version" in tx) tx.sign([payer]);
        else tx.partialSign(payer);
      }
      return txs;
    },
  };
}

function errMsg(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { response?: { data?: unknown }; message?: string };
    if (e.response?.data !== undefined) {
      const d = e.response.data;
      return typeof d === "string" ? d : JSON.stringify(d);
    }
    if (typeof e.message === "string") return e.message;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Wire shapes we actually read (loosely typed on purpose — see file header).
// Casing mirrors the vendored OpenAPI spec exactly: Fixture/Odds payloads are
// PascalCase, Scores payloads are camelCase. Yes, that's a real inconsistency
// in the upstream API, not a typo here.
// ---------------------------------------------------------------------------

interface FixtureApi {
  FixtureId?: number;
  Participant1?: string;
  Participant2?: string;
  Participant1IsHome?: boolean;
}

interface FixtureRecord {
  participant1: string;
  participant2: string;
  participant1IsHome: boolean;
}

interface SoccerScoreApi {
  Goals?: number;
  YellowCards?: number;
  RedCards?: number;
  Corners?: number;
}

// The live scores stream is PascalCase on the wire (verified against a real
// frame: {"FixtureId":...,"GameState":...,"Participant1IsHome":...,"StartTime":...}),
// matching FixtureApi/OddsFrame. (An earlier camelCase guess silently dropped
// every frame, so `ready` never flipped.)
interface ScoresFrame {
  FixtureId?: number;
  GameState?: string;
  StartTime?: number;
  Ts?: number;
  Seq?: number;
  Participant1IsHome?: boolean;
  ScoreSoccer?: {
    Total?: {
      Participant1?: SoccerScoreApi;
      Participant2?: SoccerScoreApi;
    };
  };
}

interface OddsFrame {
  FixtureId?: number;
  PriceNames?: string[];
  Pct?: string[];
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

type Status = "idle" | "connecting" | "ready" | "error";

class TxlineClient {
  private started = false;
  private status: Status = "idle";
  private lastError: string | null = null;

  private fixturesById = new Map<number, FixtureRecord>();
  private scoresByFixture = new Map<number, ScoresFrame>();
  private oddsByFixture = new Map<number, OddsFrame>();
  private scoresFrameCount = 0;

  ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    this.init().catch((err) => {
      this.status = "error";
      this.lastError = errMsg(err);
    });
  }

  private hasData(): boolean {
    return (
      this.fixturesById.size > 0 ||
      this.scoresByFixture.size > 0 ||
      this.oddsByFixture.size > 0
    );
  }

  isReady(): boolean {
    this.ensureStarted();
    // Ready once the pipeline is up AND we actually hold data to serve. We do
    // NOT require a scores *stream* frame: per the TxLINE docs these are World
    // Cup / Int'l Friendlies fixtures, many still "scheduled", so the scores
    // stream mostly emits heartbeats. Gating on a scores frame would keep the
    // feed dark even though the fixtures snapshot (+ odds) is already loaded.
    return this.status === "ready" && this.hasData();
  }

  statusDetail(): string {
    if (this.status === "error") {
      return `TxLINE live feed failed to connect: ${this.lastError ?? "unknown error"}.`;
    }
    if (this.status === "idle" || this.status === "connecting") {
      return "TxLINE live feed is connecting (subscribe -> guest JWT -> activate -> SSE)...";
    }
    if (!this.hasData()) {
      return "TxLINE live feed connected but no fixtures/odds/scores loaded yet.";
    }
    return "ready";
  }

  private async init(): Promise<void> {
    this.status = "connecting";

    let wallet: Keypair;
    let cfg: RuntimeConfig;
    try {
      wallet = loadServiceWallet();
      cfg = readConfig();
    } catch (err) {
      this.status = "error";
      this.lastError = `service wallet/config: ${errMsg(err)}`;
      return;
    }

    const connection = new Connection(cfg.rpcUrl, "confirmed");
    const anchorWallet = keypairWallet(wallet);
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });

    let txSig: string | null = null;
    try {
      txSig = await this.subscribeFreeTier(provider, wallet, connection, cfg);
    } catch (err) {
      const msg = errMsg(err);
      if (/already/i.test(msg)) {
        // Devnet subscription already active for this wallet — non-fatal.
        // Recover the most recent signature involving the wallet so
        // activation still has something to bind to.
        try {
          const sigs = await connection.getSignaturesForAddress(wallet.publicKey, { limit: 1 });
          txSig = sigs[0]?.signature ?? null;
        } catch {
          txSig = null;
        }
      }
      if (!txSig) {
        this.status = "error";
        this.lastError = `subscribe(): ${msg}`;
        return;
      }
    }

    let guestJwt: string;
    try {
      const res = await axios.post(`${cfg.apiOrigin}/auth/guest/start`, {});
      const token = res.data?.token;
      if (!token || typeof token !== "string") throw new Error("no token in response");
      guestJwt = token;
    } catch (err) {
      this.status = "error";
      this.lastError = `guest JWT: ${errMsg(err)}`;
      return;
    }

    let apiToken: string;
    try {
      const leagues: string[] = [];
      const message = `${txSig}:${leagues.join(",")}:${guestJwt}`;
      const signature = nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey);
      const walletSignature = Buffer.from(signature).toString("base64");
      const res = await axios.post(
        `${cfg.apiOrigin}/api/token/activate`,
        { txSig, walletSignature, leagues },
        { headers: { Authorization: `Bearer ${guestJwt}` } },
      );
      if (typeof res.data !== "string" || !res.data) throw new Error("unexpected activate response");
      apiToken = res.data;
    } catch (err) {
      this.status = "error";
      this.lastError = `activate: ${errMsg(err)}`;
      return;
    }

    const authHeaders = { Authorization: `Bearer ${guestJwt}`, "X-Api-Token": apiToken };

    // Best-effort: seed fixture names. Missing/failed snapshot just means
    // matches fall back to generic "Team <id>" names (see buildMatchState).
    try {
      const res = await axios.get(`${cfg.apiOrigin}/api/fixtures/snapshot`, { headers: authHeaders });
      const fixtures: unknown = res.data;
      if (Array.isArray(fixtures)) {
        for (const raw of fixtures) this.ingestFixture(raw);
      }
    } catch {
      // non-fatal
    }

    this.openStream(`${cfg.apiOrigin}/api/scores/stream`, authHeaders, (raw) => this.ingestScoresFrame(raw));
    this.openStream(`${cfg.apiOrigin}/api/odds/stream`, authHeaders, (raw) => this.ingestOddsFrame(raw));

    this.status = "ready";
  }

  private async subscribeFreeTier(
    provider: AnchorProvider,
    wallet: Keypair,
    connection: Connection,
    cfg: RuntimeConfig,
  ): Promise<string> {
    const program = new Program(txlineIdl as Idl, provider);

    const programId = new PublicKey(cfg.programId);
    const txlMint = new PublicKey(cfg.txlMint);

    const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from(PRICING_MATRIX_SEED)], programId);
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from(TOKEN_TREASURY_SEED)], programId);
    const tokenTreasuryVault = getAssociatedTokenAddressSync(
      txlMint,
      tokenTreasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
      txlMint,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const ataInfo = await connection.getAccountInfo(userTokenAccount);
    const preIxns = [];
    if (!ataInfo) {
      preIxns.push(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userTokenAccount,
          wallet.publicKey,
          txlMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    return program.methods
      .subscribe(FREE_TIER_SERVICE_LEVEL_ID, WEEKS)
      .accounts({
        user: wallet.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: txlMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .preInstructions(preIxns)
      .rpc({ commitment: "confirmed" });
  }

  private openStream(url: string, authHeaders: Record<string, string>, onData: (raw: unknown) => void): void {
    try {
      const es = new EventSource(url, {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, headers: { ...(init?.headers ?? {}), ...authHeaders } }),
      });
      es.onmessage = (ev: MessageEvent) => {
        try {
          onData(JSON.parse(ev.data));
        } catch {
          // malformed frame — drop it, stream keeps running
        }
      };
      es.onerror = () => {
        // eventsource retries automatically per spec; nothing to do here.
        // We deliberately never close()/throw — a dropped connection just
        // means isReady() stops advancing until it reconnects.
      };
    } catch (err) {
      // Opening the stream itself threw synchronously (rare) — record but
      // don't propagate; isReady() simply never becomes true.
      if (this.status !== "error") {
        this.status = "error";
        this.lastError = `SSE stream ${url}: ${errMsg(err)}`;
      }
    }
  }

  private ingestFixture(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const f = raw as FixtureApi;
    if (typeof f.FixtureId !== "number") return;
    this.fixturesById.set(f.FixtureId, {
      participant1: typeof f.Participant1 === "string" ? f.Participant1 : `Team ${f.FixtureId}-1`,
      participant2: typeof f.Participant2 === "string" ? f.Participant2 : `Team ${f.FixtureId}-2`,
      participant1IsHome: Boolean(f.Participant1IsHome),
    });
  }

  private ingestScoresFrame(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const s = raw as ScoresFrame;
    if (typeof s.FixtureId !== "number") return;
    this.scoresByFixture.set(s.FixtureId, s);
    this.scoresFrameCount += 1;
  }

  private ingestOddsFrame(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const o = raw as OddsFrame;
    if (typeof o.FixtureId !== "number") return;
    this.oddsByFixture.set(o.FixtureId, o);
  }

  getLiveWorld(): LiveWorld {
    const now = Date.now();
    // Build one match per fixture we know about from ANY source — the
    // fixtures snapshot is the baseline roster; scores/odds stream frames
    // enrich those matches as they arrive (rather than being the only source,
    // which left the list empty while scheduled fixtures only sent heartbeats).
    const fixtureIds = new Set<number>([
      ...this.fixturesById.keys(),
      ...this.scoresByFixture.keys(),
      ...this.oddsByFixture.keys(),
    ]);
    const matches: MatchState[] = Array.from(fixtureIds).map((fixtureId, idx) =>
      this.buildMatchState(fixtureId, idx, now),
    );
    const live = matches.filter((m) => m.phase === "LIVE");
    const featured = (live.length ? live : matches).sort((a, b) => b.minute - a.minute)[0] ?? matches[0];
    return {
      now,
      matches,
      featured,
      // TODO: TxLINE pushes updates on its own server-side cadence; we have
      // no real "next tick" signal, so this just reuses the sim's TICK_MS as
      // a client-side polling hint.
      nextTickAt: now + TICK_MS,
      source: "live",
    };
  }

  private buildMatchState(fixtureId: number, idx: number, now: number): MatchState {
    const scores = this.scoresByFixture.get(fixtureId);
    const odds = this.oddsByFixture.get(fixtureId);
    const fixture = this.fixturesById.get(fixtureId);

    const isP1Home = scores?.Participant1IsHome ?? fixture?.participant1IsHome ?? true;
    const p1Name = fixture?.participant1 ?? `Team ${fixtureId}-1`;
    const p2Name = fixture?.participant2 ?? `Team ${fixtureId}-2`;
    const home = teamFromName(isP1Home ? p1Name : p2Name);
    const away = teamFromName(isP1Home ? p2Name : p1Name);

    const total = scores?.ScoreSoccer?.Total;
    const p1 = total?.Participant1;
    const p2 = total?.Participant2;
    const homeRaw = isP1Home ? p1 : p2;
    const awayRaw = isP1Home ? p2 : p1;
    const score: [number, number] = [homeRaw?.Goals ?? 0, awayRaw?.Goals ?? 0];
    const stats: [SideStats, SideStats] = [sideStatsFrom(homeRaw), sideStatsFrom(awayRaw)];

    const { probs, odds: matchOdds } = deriveOddsAndProbs(odds);

    return {
      fixtureId,
      // TODO: "cycle"/"slot" are simulator-only bookkeeping (lib/engine's
      // deterministic fixture scheduler) with no TxLINE equivalent. `slot`
      // is repurposed as a stable positional index for the `featured` pick.
      cycle: 0,
      slot: idx,
      home,
      away,
      minute: deriveMinute(scores, now),
      phase: derivePhase(scores?.GameState),
      score,
      stats,
      probs,
      odds: matchOdds,
      // TODO: TxLINE doesn't expose an attack-pressure metric; neutral default.
      pressure: 50,
      // TODO: TxLINE doesn't expose discrete match events on this stream;
      // left empty rather than fabricated.
      events: [],
      sequence: scores?.Seq ?? 0,
    };
  }
}

function teamFromName(name: string): Team {
  const code = name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "TBD";
  // TODO: TxLINE doesn't provide a flag emoji or a strength rating; neutral
  // defaults (strength is only used by the simulator's own probability model).
  return { code, name, flag: "", strength: 0.75 };
}

function sideStatsFrom(raw: SoccerScoreApi | undefined): SideStats {
  return {
    // TODO: TxLINE's Scores payload has no shots/on-target/xG breakdown.
    shots: 0,
    onTarget: 0,
    xg: 0,
    corners: raw?.Corners ?? 0,
    yellows: raw?.YellowCards ?? 0,
    reds: raw?.RedCards ?? 0,
    // TODO: no possession figure in the Scores payload; neutral split.
    possession: 50,
  };
}

function deriveMinute(scores: ScoresFrame | undefined, now: number): number {
  if (!scores?.StartTime) return 0;
  // TODO: assuming StartTime/Ts are epoch-millis (unverified against a live
  // payload — the OpenAPI spec only says "format: int64").
  const referenceTs = scores.Ts ?? now;
  const elapsedMs = Math.max(0, referenceTs - scores.StartTime);
  return Math.min(120, Math.round(elapsedMs / 60_000));
}

function derivePhase(gameState: string | undefined): MatchPhase {
  // TODO: SoccerFixtureStatus's enum codes (A2, C2, END, ET1, ET2, F2, FET,
  // FPE, H11, H21, HT2, HTET, I2, NS2, P, PE, TXCC2, TXCS2, WET, WPE) aren't
  // documented with plain-English meanings in the vendored spec. This is a
  // conservative best-effort heuristic, not a verified mapping.
  if (!gameState) return "LIVE";
  const gs = gameState.toUpperCase();
  if (gs.includes("HT")) return "HT";
  if (gs.includes("END")) return "FT";
  if (gs.includes("NS")) return "BREAK";
  return "LIVE";
}

const DEFAULT_PROBS = { home: 33.3, draw: 33.3, away: 33.3 };
const DEFAULT_ODDS = { home: 3, draw: 3, away: 3 };

function outcomeIndex(names: string[] | undefined, patterns: RegExp[]): number {
  if (!names) return -1;
  return names.findIndex((n) => patterns.some((p) => p.test(n)));
}

function deriveOddsAndProbs(
  odds: OddsFrame | undefined,
): { probs: { home: number; draw: number; away: number }; odds: { home: number; draw: number; away: number } } {
  if (!odds?.PriceNames || !odds.Pct) return { probs: DEFAULT_PROBS, odds: DEFAULT_ODDS };

  const homeIdx = outcomeIndex(odds.PriceNames, [/^1$/, /home/i]);
  const drawIdx = outcomeIndex(odds.PriceNames, [/^x$/i, /draw/i]);
  const awayIdx = outcomeIndex(odds.PriceNames, [/^2$/, /away/i]);

  const pctAt = (idx: number): number | null => {
    if (idx < 0) return null;
    const raw = odds.Pct?.[idx];
    if (!raw || raw === "NA") return null;
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };

  const homePct = pctAt(homeIdx);
  const drawPct = pctAt(drawIdx);
  const awayPct = pctAt(awayIdx);
  if (homePct == null || drawPct == null || awayPct == null) {
    return { probs: DEFAULT_PROBS, odds: DEFAULT_ODDS };
  }

  const fairOdds = (p: number) => Math.max(1.01, Math.round((100 / p) * 100) / 100);
  return {
    probs: { home: homePct, draw: drawPct, away: awayPct },
    odds: { home: fairOdds(homePct), draw: fairOdds(drawPct), away: fairOdds(awayPct) },
  };
}

// ---------------------------------------------------------------------------

let singleton: TxlineClient | null = null;

export function getClient(): TxlineClient {
  if (!singleton) singleton = new TxlineClient();
  singleton.ensureStarted();
  return singleton;
}
