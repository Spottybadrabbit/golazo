# GOLAZO

**Every tick is a matchday.** A World Cup 2026 fan game built on the TxLINE
feed for the Superteam x TxODDS World Cup hackathon, Consumer and Fan
Experiences track.

Live: **https://golazo-eta.vercel.app**

Four loops, one heartbeat (the feed tick):

1. **Hi-Lo streak game** (`/play`). Every 24 seconds: will the featured
   match's win probability, possession, or attack pressure land higher or
   lower after the next TxLINE tick? Streaks multiply XP up to 5x, badges
   unlock Duolingo-style, and hot streaks can be banked for GOAL points.
2. **Collectible cards** (`/cards`). Spend GOAL points on packs, tap to
   reveal, chase the legends. Rarity odds printed on every pack; on mainnet
   the cards mint as compressed NFTs with TxLINE provenance.
3. **Squad sweepstake** (`/squad`). Friends drawn into nations, standings
   settled live from the feed as fixtures finish. No spreadsheet admin.
4. **PunditBot** (`/pundit`). Golo the parrot narrates every goal, card, and
   sharp odds move as a Telegram-style chat, derived from feed events.

## Accounts and storage

- **Clerk** handles sign-in, including a Solana wallet (Web3) strategy on the
  same rails as TxODDS. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` +
  `CLERK_SECRET_KEY` to enable it; without keys the app runs a demo wallet.
- **Convex** is the off-chain store: player profiles and an append-only game
  event log (`convex/schema.ts`, `convex/game.ts`), each verifiable event
  carrying its TxLINE fixture/sequence and an optional Solana proof ref so the
  on-chain side stays anchored to TxODDS. Run `npx convex dev` once to
  provision, then set `NEXT_PUBLIC_CONVEX_URL` to turn on cloud sync; until
  then the game persists locally.

## Judging criteria, mapped

| Criterion | Where |
|---|---|
| Fan accessible, polished UI | Landing plus three thumb-first app screens, mobile bottom tabs, no betting jargon |
| Responds fluidly to the pitch | Deterministic engine recomputed every second client-side; countdown rings and probability bars move between ticks, zero polling lag |
| New interaction model | The feed tick itself is the game clock: call-lock-resolve every 24s, streak boosts, mascot commentary |
| Monetization | 2% fee on banked boosts and 2% rake on sweepstake pools, stated honestly in the UI |
| End-to-end product | Landing, game, sweepstake, pundit feed, live JSON API, shareable OG cards |

## How the data works

`lib/engine.ts` is a seeded, deterministic TxLINE-style World Cup simulator:
same wall-clock window in, same world out, on the server (`/api/live`) and on
every client. That gives judge-proof liveness (hackathon rules explicitly
allow simulated feeds) with a clean seam: set `TXLINE_MODE=live` and swap the
adapter in `app/api/live/route.ts` to ride the real Solana-anchored feed.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · GSAP +
ScrollTrigger + Lenis · Three.js · Clerk (auth + Web3 wallet) · Convex
(off-chain store) · Higgsfield-generated brand assets (stadium, mascot,
trophy, tifo, card art, packs) · Vercel.

Palette: near-black `#0a0a0a` + acid-lime volt `#afff00`, cyan and ember
accents.

## Run it

```bash
npm install
npm run dev
```

Demo mode uses play money and a simulated feed. No real wagering.
