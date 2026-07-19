# GOLAZO — Technical Documentation

A World Cup fan-experience app that renders **real, on-chain-activated
TxODDS/TxLINE devnet data** through a Convex reactive pipeline. This document
covers the architecture, data pipeline, HTTP API, Convex schema, the API-key
flow, and a local dev / deploy runbook.

An in-app, Mintlify-style version of this document lives at
[`/technicaldoc`](/technicaldoc) (`app/technicaldoc/page.tsx`).

---

## 1. Overview

GOLAZO is a Next.js 16 (App Router, Turbopack, React 19) fan app built for the
Superteam × TxODDS World Cup hackathon. Its core idea: instead of simulating a
match feed, it **activates a real TxODDS devnet subscription on Solana**, then
streams that feed through a Convex-backed reactive pipeline into every screen
— the Hi-Lo streak game, collectible cards, squad sweepstakes, and PunditBot's
commentary.

**Stack**

| Layer | Choice |
|---|---|
| Framework | Next.js 16, App Router, Turbopack, React 19 |
| Styling | Tailwind v4 ("volt" design system — volt-green `#afff00` on near-black `#0a0a0a`) |
| Realtime store | Convex (deployment `calm-parrot-940`) |
| Auth | Clerk (including a Solana wallet / Web3 sign-in strategy) |
| On-chain | Solana devnet, Anchor program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Motion | GSAP + Three.js |
| Hosting | Vercel (public alias `golazowtf.vercel.app`) |
| Mascot | Golo |

**Honesty notes** (read these before treating any number here as production
truth):

- This is a **play-money / devnet** product. No real transfers of value ever
  occur — every SOL/GOAL balance is a ledger row in Convex, never a signed
  Solana transaction.
- The free devnet TxODDS tier exposes a **small set of sample fixtures** (one
  live World Cup match plus a few international friendlies) — not the full
  FIFA bracket, and not a historical archive.
- In-play score keys are **self-diagnosing at kickoff**: the exact field names
  TxODDS uses for live goals/minutes are confirmed defensively at runtime (see
  `lib/txline.server.ts` / `convex/txline.ts`), because the in-play shape is
  only fully knowable once a tracked match actually kicks off.

---

## 2. Architecture

The heart of the app is a four-stage pipeline: an on-chain activation that
mints an API token, a Convex poller that keeps that feed fresh, a reactive
Convex query the whole UI subscribes to, and the app itself, which never
fabricates data — it renders whatever the feed says, including "no odds yet."

```
┌───────────────────────────────────────────────────────────────────────┐
│ 1. ON-CHAIN ACTIVATION (Solana devnet, one-time)                      │
│                                                                        │
│   scripts/txline-activate.mts                                         │
│   ┌────────────────────────────┐   ┌───────────────────────────────┐  │
│   │ subscribe(service_level=1, │   │ Off-chain handshake:          │  │
│   │ weeks=4) on Anchor program │──▶│  POST /auth/guest/start → jwt │  │
│   │ 6pW64...wyP2J (free World  │   │  sign `${txSig}::${jwt}`      │  │
│   │ Cup tier). Idempotently    │   │  POST /api/token/activate     │  │
│   │ creates the TxL Token-2022 │   │  → TXLINE_API_TOKEN           │  │
│   │ ATA (mint 4Zao8...Eokrg)   │   └───────────────────────────────┘  │
│   │ in the same tx.            │                                     │
│   └────────────────────────────┘                                     │
└───────────────────────────────────────────┬───────────────────────────┘
                                             │ TXLINE_API_TOKEN
                                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 2. CONVEX POLLER (convex/poller.ts, "use node" internalAction)        │
│                                                                        │
│   self-reschedules: 1.5s while a fixture is in-play, 45s idle         │
│   60s cron heartbeat (convex/crons.ts) restarts it if it stalls       │
│                                                                        │
│   each cycle:                                                         │
│     GET {origin}/api/fixtures/snapshot                                │
│     for each fixture:                                                 │
│       GET {origin}/api/odds/snapshot/{id}                            │
│       GET {origin}/api/scores/snapshot/{id}                          │
│     auth: Authorization: Bearer <guest jwt> + X-Api-Token: <TOKEN>    │
│                                                                        │
│   writes → liveFixtures, liveTicks (odds-history), pollState          │
└───────────────────────────────────────────┬───────────────────────────┘
                                             │ Convex tables
                                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 3. REACTIVE READ                                                      │
│                                                                        │
│   feed.live — AUTH-FREE Convex query → LiveFeed                      │
│     { mode: "live"|"sim", updatedAt, featured, matches }              │
│                                                                        │
│   components/LiveDataProvider.tsx subscribes reactively (push)        │
│   GET /api/feed — Vercel serverless polling fallback, same real data  │
│   (reads lib/txline.server.ts directly; the API token never reaches   │
│   the browser either way)                                             │
└───────────────────────────────────────────┬───────────────────────────┘
                                             │
                                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 4. THE APP                                                             │
│   Hi-Lo streak game · Collectible cards · Squad sweepstakes ·         │
│   PunditBot commentary — all rendering this real feed. No simulator.  │
└───────────────────────────────────────────────────────────────────────┘
```

### Why two read paths?

`feed.live` (Convex, reactive) and `/api/feed` (Vercel function, polled) both
serve the **same upstream data** — the poller's Convex tables in the first
case, a direct server-side TxLINE fetch (with its own short-lived warm-instance
cache) in the second. `LiveDataProvider` prefers whichever is live-and-fresher
(see `isFresh`/`liveIsFresh`, a ~3–4 minute staleness window that comfortably
exceeds the poller's idle 45s cadence). This means the UI never freezes even
if Convex is unreachable, unconfigured, or the reactive subscription hasn't
delivered yet — and the TxLINE API token is never sent to the browser in
either path.

---

## 3. Data flow detail

1. **Fixtures.** `GET /api/fixtures/snapshot` returns the list of fixtures
   TxODDS is tracking for this subscription tier. Each fixture carries a
   `Participant1IsHome` flag — every downstream odds/score field is oriented
   using it, so "home" always means the same team throughout the app.
2. **Odds.** `GET /api/odds/snapshot/{fixtureId}` returns a list of odds
   records across markets/bookmakers. Only records where
   `SuperOddsType === "1X2_PARTICIPANT_RESULT"` (moneyline: home/draw/away)
   are used; among those, the `TXLineStablePriceDemargined` bookmaker is
   preferred, and the latest by timestamp wins. Prices are **decimal odds ×
   1000** (`2374` → `2.374`). The record's `Pct` field is an
   **already-de-vigged implied probability** (percent) — no extra math
   needed, just re-orient it to home/away via `Participant1IsHome`.
3. **Scores.** `GET /api/scores/snapshot/{fixtureId}` returns score/status
   records; the latest by sequence (then timestamp) wins. Goal/minute field
   names in the in-play payload are read defensively (multiple candidate
   keys, then a scan, then a "1-0" string fallback) because they're only
   confirmed once a real match is live — hence "self-diagnosing at kickoff."
4. **Persistence.** The poller writes one row per fixture to `liveFixtures`
   (current state, upserted) and appends a row to `liveTicks` per fixture per
   cycle it has fresh odds for (an odds-history time series, pruned past 2
   hours). `pollState` tracks the last poll's mode/timestamp/note and which
   fixture is currently featured.
5. **Featuring.** The featured match is chosen with a consistent preference
   order, applied identically in `convex/poller.ts`, `convex/feed.ts`, and
   `lib/txline.server.ts`: a live World Cup fixture with odds > any World Cup
   fixture with odds > any in-play fixture with odds > any fixture with odds >
   first fixture. Never a special-cased pair — this is why the featured match
   can be a friendly if no World Cup game currently has odds.

---

## 4. HTTP API reference

All routes are `Cache-Control: no-store` (never cached) and require no
authentication. None of them expose the TxLINE API token.

### `GET /api/feed`

The `LiveFeed` — the same shape `feed.live` returns — read via
`lib/txline.server.ts` directly (bypassing Convex). This is the polling
fallback `LiveDataProvider` uses.

```json
{
  "mode": "live",
  "updatedAt": 1768000000000,
  "featured": {
    "fixtureId": 100231,
    "home": { "code": "BRA", "name": "Brazil", "flag": "🇧🇷" },
    "away": { "code": "ARG", "name": "Argentina", "flag": "🇦🇷" },
    "score": [1, 1],
    "minute": 63,
    "phase": "LIVE",
    "competition": "FIFA World Cup",
    "odds": { "home": 2.15, "draw": 3.4, "away": 3.1 },
    "probs": { "home": 41.2, "draw": 24.6, "away": 34.2 },
    "startTime": 1767994000000,
    "updatedAt": 1767999998000
  },
  "matches": [
    { "fixtureId": 100231, "...": "as above" },
    { "fixtureId": 100244, "home": { "code": "JPN", "name": "Japan", "flag": "🇯🇵" },
      "away": { "code": "KOR", "name": "South Korea", "flag": "🇰🇷" },
      "score": [0, 0], "minute": 0, "phase": "BREAK",
      "competition": "International Friendly", "odds": null, "probs": null,
      "startTime": 1768003600000, "updatedAt": 1767999500000 }
  ]
}
```

When the feed is unconfigured or upstream is unreachable, this degrades to
`{ "mode": "sim", "updatedAt": ..., "featured": null, "matches": [] }` — the
client then falls back to the deterministic engine rather than freezing.

### `GET /api/live`

Server-truth endpoint combining the live feed's featured match with the
local game-clock round timer (`lib/engine.ts`'s `currentRound`, which drives
Hi-Lo round countdowns independent of the feed itself).

```json
{
  "mode": "live",
  "ready": true,
  "source": "TxODDS TxLINE World Cup feed (devnet)",
  "now": 1768000000000,
  "nextTickAt": 1768000002000,
  "marquee": "BRA v ARG",
  "competition": "FIFA World Cup",
  "round": {
    "id": "r-31-4",
    "fixtureId": 100231,
    "stat": "WIN",
    "statLabel": "Win probability",
    "question": "Will Brazil's win probability be higher after the next tick?",
    "lockValue": 41.2,
    "unit": "%",
    "startedAt": 1767999998000,
    "endsAt": 1768000022000,
    "team": "home"
  },
  "featured": { "...": "same LiveMatch shape as /api/feed" },
  "matches": [ "..." ]
}
```

When the feed is down: `mode:"sim"`, `ready:false`, and a `detail` string
explaining what env vars are missing.

### `GET /api/sol-price`

Indicative SOL → USD/GBP conversion (CoinGecko, 60s in-memory cache, with a
fixed fallback if the upstream call is slow/blocked). Display-only — used by
the bet-slip payout preview, never moves funds.

```json
{ "at": 1768000000000, "usd": 152.34, "gbp": 120.11, "source": "live" }
```

### `GET /api/balance?address=<pubkey>&network=devnet`

Read-only Solana balance lookup (`network` is `devnet` or `mainnet`, default
`devnet`).

```json
{ "address": "9WzD...AWWM", "network": "devnet", "sol": 1.2345 }
```

`address` is required; a 400 is returned otherwise.

---

## 5. Convex schema (`convex/schema.ts`)

Deployment: `calm-parrot-940`. Every table below is defined in
`convex/schema.ts`; field-level detail is authoritative there.

| Table | Purpose | Key fields | Indexes |
|---|---|---|---|
| `players` | Identity/profile per Clerk user | `clerkId`, `handle`, `wallet`, `xp`, `bestStreak`, `goalPoints`, `cards` | `by_clerk`, `by_wallet` |
| `sessions` | Login sessions | `clerkId`, `wallet`, `startedAt`, `endedAt`, `lastSeenAt` | `by_clerk`, `by_started` |
| `ledger` | Append-only GOAL/SOL balance movements | `clerkId`, `kind`, `currency`, `amount`, `balanceAfter`, `reason` | `by_clerk`, `by_clerk_created` |
| `rewards` | Bonuses, badges, promo codes | `clerkId`, `type`, `label`, `value`, `status` | `by_clerk`, `by_clerk_status` |
| `onboarding` | Onboarding funnel progress | `clerkId`, `step`, `goalId`, `handle` | `by_clerk` |
| `activity` | Catch-all action/screen-view log | `clerkId`, `kind`, `name`, `screen`, `meta` | `by_clerk`, `by_clerk_created`, `by_name` |
| `gamePlays` | Per-round Hi-Lo / pool / cards detail | `clerkId`, `game`, `fixtureId`, `pick`, `result`, `stakeSol`, `oddsAtPick`, `potentialPayout` | `by_clerk`, `by_fixture` |
| `packOpens` | Card pack pulls | `clerkId`, `cost`, `bestTier`, `cardCodes` | `by_clerk` |
| `profileStats` | Rolled-up per-player analytics | `clerkId`, `totalPicks`, `accuracy`, `longestStreak`, `goalEarned` | `by_clerk` |
| `pools` | Sweepstakes groups | `inviteCode`, `name`, `kind`, `ownerClerkId`, `fixtureId`, `status`, `memberCount` | `by_invite`, `by_owner` |
| `poolMembers` | Sweepstakes membership + picks | `poolId`, `clerkId`, `handle`, `role`, `pick` | `by_pool`, `by_clerk`, `by_pool_clerk` |
| `events` | Legacy verifiable event log (back-compat) | `clerkId`, `kind`, `detail`, `fixtureId`, `sequence`, `solanaTx` | `by_clerk` |
| `liveFixtures` | Current state per tracked fixture (poller-written) | `fixtureId`, `home*`/`away*`, `homeGoals`, `awayGoals`, `minute`, `phase`, `oddsHome/Draw/Away`, `pHome/Draw/Away` | `by_fixture`, `by_updated` |
| `liveTicks` | Odds-history time series (poller-written) | `fixtureId`, `ts`, `oddsHome/Draw/Away`, `pHome/Draw/Away` | `by_fixture_ts` |
| `pollState` | Poller heartbeat/mode bookkeeping | `key`, `mode`, `lastPollAt`, `featuredFixtureId`, `note` | `by_key` |
| `apiKeys` | Developer API keys issued from `/technicaldoc` | `clerkId`, `key`, `label`, `createdAt`, `lastUsedAt`, `revoked` | `by_clerk`, `by_key` |

`liveFixtures` / `liveTicks` / `pollState` are the three tables the live
pipeline (section 2) actually writes and reads; everything else is app state.

---

## 6. API-key flow

`/technicaldoc` includes an **API Keys** panel for builders who want a
GOLAZO-shaped credential to reference in their own tooling.

- **Storage:** `convex/schema.ts`'s `apiKeys` table — one row per key:
  `{ clerkId, key, label, createdAt, lastUsedAt?, revoked }`.
- **Functions** (`convex/apikeys.ts`), all auth'd via
  `ctx.auth.getUserIdentity()`:
  - `generateApiKey({ label })` — mints a key shaped `glz_` + 32 lowercase
    base36 characters, inserts the row, and returns `{ id, key, label }`. The
    **full key is only ever returned here** — display it once.
  - `listMyKeys()` — the caller's own keys, newest first, with the secret
    masked to `glz_••••••••<last 4 chars>`.
  - `revokeKey({ id })` — marks one of the caller's own keys `revoked: true`
    (ownership checked server-side; throws if the key belongs to someone
    else or doesn't exist).
- **Client wiring:** because `convex/apikeys.ts` won't appear in
  `convex/_generated/api` until the next `npx convex dev` / deploy, the panel
  addresses these functions by string ref via `makeFunctionReference` —
  exactly the pattern `components/LiveDataProvider.tsx` uses for `feed:live`.
- **Gating:** the whole panel degrades gracefully.
  - Convex not configured (`NEXT_PUBLIC_CONVEX_URL` unset) → a static notice,
    no Convex hooks are called.
  - Signed out → `<SignInButton mode="modal">` ("Log in to generate a key").
  - Signed in → a label input + "Generate key" button, the full key shown
    once with a copy button, and the masked list of existing keys with a
    revoke action.
- **Scope:** these keys are not yet checked against anything server-side —
  there's no protected GOLAZO endpoint that requires one today. This is a
  credential-issuance flow for builders, not a live authorization gate.

---

## 7. Local dev + deploy runbook

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` / Vercel | Clerk client key. Without it, auth degrades to a demo wallet chip. |
| `CLERK_SECRET_KEY` | `.env.local` / Vercel | Clerk server key. |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env | Clerk Frontend API URL — validates Clerk JWTs inside Convex (`convex/auth.config.ts`). |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` / Vercel | Convex deployment URL. Without it, the whole app runs on Clerk + localStorage only — no cloud sync, no reactive feed. |
| `CONVEX_DEPLOYMENT` | `.env.local` | Which Convex deployment `npx convex dev` targets (`calm-parrot-940`). |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` / Vercel | Convex HTTP actions URL (deployment sibling to `NEXT_PUBLIC_CONVEX_URL`). |
| `TXLINE_MODE` | Convex env + `.env.local` | `"sim"` (default, no live feed) or `"live"` (poll TxODDS). |
| `TXLINE_API_ORIGIN` | Convex env + `.env.local` | `https://txline-dev.txodds.com` (devnet). |
| `TXLINE_API_TOKEN` | Convex env + `.env.local` | The activated API token (see below) — never sent to the browser. |
| `TXLINE_SERVICE_WALLET` | local only, never commit | Golazo's own signer for the activation script, if not using the default `~/.config/solana/id.json`. |

### One-time: activate the TxODDS devnet feed

```bash
npm install
npm run txline:activate   # runs scripts/txline-activate.mts
```

This funds/uses a devnet Solana keypair, submits `subscribe(1, 4)` (free
World Cup tier, 4-week term) with the TxL Token-2022 ATA created idempotently
in the same transaction, then performs the off-chain guest-JWT + signed-message
handshake against `TXLINE_API_ORIGIN`. It prints a `TXLINE_API_TOKEN` —
set that plus `TXLINE_MODE=live` and `TXLINE_API_ORIGIN` wherever the poller
runs (Convex env for production, `.env.local` for local dev fallback reads).

### Convex

```bash
npx convex dev     # provisions/links the deployment, watches convex/*.ts,
                    # regenerates convex/_generated/*
```

Set the Convex-side env vars (`TXLINE_MODE`, `TXLINE_API_TOKEN`,
`TXLINE_API_ORIGIN`, `CLERK_JWT_ISSUER_DOMAIN`) via the Convex dashboard or
`npx convex env set <NAME> <VALUE>` — the poller (`convex/poller.ts`) and
`convex/auth.config.ts` read them from the Convex runtime, not from
`.env.local`.

### Local dev

```bash
npm run dev
```

Runs fully in `sim` mode with no credentials at all. Set `NEXT_PUBLIC_CONVEX_URL`
to turn on the reactive feed/cloud sync; set the `TXLINE_*` trio (both in
Convex env for the poller, and in `.env.local` so the Next.js server routes'
own fallback fetch in `lib/txline.server.ts` also goes live) to see real data.

### Build / verify

```bash
npm run build                                  # next build (Turbopack)
npx tsc -p convex/tsconfig.json --noEmit       # typecheck Convex functions
npm run lint
```

### Deploy

Deploys to Vercel (public alias `golazowtf.vercel.app`). Push Convex functions
with `npx convex deploy` (production deployment) before or alongside a Vercel
deploy so the client and the Convex functions it calls stay in sync.

---

## 8. Where things live

| Concern | File |
|---|---|
| On-chain activation | `scripts/txline-activate.mts` |
| TxODDS fetch/mapping (Convex-side) | `convex/txline.ts` |
| TxODDS fetch/mapping (Next.js-side fallback) | `lib/txline.server.ts` |
| Poller loop | `convex/poller.ts` |
| Heartbeat cron | `convex/crons.ts` |
| Reactive query + poller-facing mutations | `convex/feed.ts` |
| Convex schema | `convex/schema.ts` |
| Client feed subscription | `components/LiveDataProvider.tsx` |
| Feed → engine shape mapping | `lib/live-map.ts` |
| API keys (Convex functions) | `convex/apikeys.ts` |
| In-app docs page | `app/technicaldoc/page.tsx`, `components/docs/*` |
