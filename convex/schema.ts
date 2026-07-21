import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// GOLAZO off-chain store (Convex deployment: calm-parrot-940).
//
// Design intent: persist *everything* a player does — sign-in, balance
// movement, rewards/promotions, onboarding, every screen and action, every
// Hi-Lo round, every pack pull — and roll it up into a per-user analytics
// profile. Sweepstakes groups + invites also live here so a shared link works
// across devices/testers. High-volume logs stay off chain here; each verifiable
// match event also carries its TxLINE fixture/sequence and (when settled) a
// Solana proof ref, keeping the on-chain side anchored to TxODDS.
export default defineSchema({
  // ── Identity / profile ────────────────────────────────────────────────
  players: defineTable({
    clerkId: v.string(),
    handle: v.string(),
    wallet: v.optional(v.string()),
    xp: v.number(),
    bestStreak: v.number(),
    goalPoints: v.number(),
    cards: v.optional(v.record(v.string(), v.number())),
    createdAt: v.optional(v.number()),
    lastActiveAt: v.optional(v.number()),
    streakDays: v.optional(v.number()),
    streakGoal: v.optional(v.number()),
    promoBalance: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_wallet", ["wallet"]),

  sessions: defineTable({
    clerkId: v.string(),
    wallet: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    lastSeenAt: v.number(),
    userAgent: v.optional(v.string()),
    country: v.optional(v.string()),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_started", ["startedAt"]),

  // ── Money: every GOAL/SOL movement ────────────────────────────────────
  ledger: defineTable({
    clerkId: v.string(),
    kind: v.union(
      v.literal("earn"),
      v.literal("spend"),
      v.literal("reward"),
      v.literal("promo"),
      v.literal("bonus"),
      v.literal("refund"),
    ),
    currency: v.union(v.literal("GOAL"), v.literal("SOL")),
    amount: v.number(),
    balanceAfter: v.number(),
    reason: v.string(),
    ref: v.optional(v.string()),
    solanaTx: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_clerk_created", ["clerkId", "createdAt"]),

  rewards: defineTable({
    clerkId: v.string(),
    type: v.union(
      v.literal("welcome_bonus"),
      v.literal("daily_bonus"),
      v.literal("streak_milestone"),
      v.literal("badge"),
      v.literal("referral"),
      v.literal("promo_code"),
    ),
    label: v.string(),
    value: v.number(),
    status: v.union(v.literal("granted"), v.literal("claimed"), v.literal("expired")),
    grantedAt: v.number(),
    claimedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_clerk_status", ["clerkId", "status"]),

  // ── Behaviour: onboarding, navigation, catch-all action log ───────────
  onboarding: defineTable({
    clerkId: v.string(),
    step: v.number(),
    goalId: v.optional(v.string()),
    handle: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    skipped: v.optional(v.boolean()),
  }).index("by_clerk", ["clerkId"]),

  activity: defineTable({
    clerkId: v.string(),
    kind: v.union(
      v.literal("screen_view"),
      v.literal("action"),
      v.literal("onboarding"),
      v.literal("game"),
      v.literal("reward"),
      v.literal("wallet"),
      v.literal("celebration"),
    ),
    name: v.string(),
    screen: v.optional(v.string()),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_clerk_created", ["clerkId", "createdAt"])
    .index("by_name", ["name"]),

  // ── Games: per-round + per-pack detail ────────────────────────────────
  gamePlays: defineTable({
    clerkId: v.string(),
    game: v.union(v.literal("hilo"), v.literal("pool"), v.literal("cards")),
    fixtureId: v.optional(v.number()),
    roundRef: v.optional(v.string()),
    pick: v.optional(v.string()),
    lockedProb: v.optional(v.number()),
    result: v.optional(v.union(v.literal("win"), v.literal("loss"), v.literal("void"))),
    delta: v.optional(v.number()),
    streakAfter: v.optional(v.number()),
    sequence: v.optional(v.number()),
    solanaTx: v.optional(v.string()),
    // Play-money SOL wager fields (game:"pool") — set by convex/wallet.ts's
    // placeBet; optional so existing Hi-Lo/pack rows are unaffected.
    stakeSol: v.optional(v.number()),
    oddsAtPick: v.optional(v.number()),
    potentialPayout: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_fixture", ["fixtureId"]),

  packOpens: defineTable({
    clerkId: v.string(),
    cost: v.number(),
    bestTier: v.string(),
    cardCodes: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_clerk", ["clerkId"]),

  profileStats: defineTable({
    clerkId: v.string(),
    totalPicks: v.number(),
    correctPicks: v.number(),
    accuracy: v.number(),
    longestStreak: v.number(),
    roundsPlayed: v.number(),
    packsOpened: v.number(),
    cardsOwned: v.number(),
    goalEarned: v.number(),
    goalSpent: v.number(),
    daysActive: v.number(),
    lastActiveAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk", ["clerkId"]),

  // ── Fast Hi-Lo escrow + instant settlement (play money, devnet only) ──
  bets: defineTable({
    clerkId: v.string(),
    fixtureId: v.number(),
    market: v.string(), // "home" | "draw" | "away"
    direction: v.union(v.literal("higher"), v.literal("lower")),
    stakeSol: v.number(),
    lockedValue: v.number(),
    multiplier: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("won"),
      v.literal("lost"),
      v.literal("void"),
    ),
    placedAt: v.number(),
    roundEndsAt: v.number(),
    settledAt: v.optional(v.number()),
    payoutSol: v.optional(v.number()),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_status_clerk", ["status", "clerkId"]),

  // ── Sweepstakes: groups + members + invites ───────────────────────────
  pools: defineTable({
    inviteCode: v.string(), // short code for the shareable /sweepstakes/join/<code> link
    name: v.string(),
    kind: v.union(v.literal("work"), v.literal("friends"), v.literal("random"), v.literal("public")),
    ownerClerkId: v.string(),
    fixtureId: v.optional(v.number()), // the match the pool is anchored to
    competition: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("locked"), v.literal("settled")),
    memberCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_invite", ["inviteCode"])
    .index("by_owner", ["ownerClerkId"]),

  poolMembers: defineTable({
    poolId: v.id("pools"),
    clerkId: v.string(),
    handle: v.string(),
    wallet: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("member")),
    pick: v.optional(v.string()), // their sweepstakes selection
    joinedAt: v.number(),
  })
    .index("by_pool", ["poolId"])
    .index("by_clerk", ["clerkId"])
    .index("by_pool_clerk", ["poolId", "clerkId"]),

  // ── Legacy verifiable event log (kept for back-compat) ────────────────
  events: defineTable({
    clerkId: v.string(),
    kind: v.union(
      v.literal("pick"),
      v.literal("result"),
      v.literal("bank"),
      v.literal("pack"),
      v.literal("pool_join"),
    ),
    detail: v.string(),
    fixtureId: v.optional(v.number()),
    sequence: v.optional(v.number()),
    solanaTx: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    // Used by notify.usersInterestedIn to find who bet on / joined a fixture.
    .index("by_fixture", ["fixtureId"]),

  // Telegram chat linked to a Clerk user, so the cron notifier can reach them.
  telegramLinks: defineTable({
    clerkId: v.string(),
    chatId: v.string(),
    linkedAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_chat", ["chatId"]),

  // One-time codes minted in-app ("Connect Telegram") and redeemed by the bot
  // webhook via `/start <code>`. Expire after 30 minutes (see notify.ts).
  telegramLinkCodes: defineTable({
    code: v.string(),
    clerkId: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Dedup ledger so each match event notifies a given user at most once.
  notified: defineTable({
    clerkId: v.string(),
    key: v.string(),
    sentAt: v.number(),
  }).index("by_clerk_key", ["clerkId", "key"]),
  // TOUCHLINE — autonomous sports-trading-intelligence audit trail.
  //
  // A separate product living in the same deployment as the Golazo fan app.
  // Every table is prefixed `touchline*` so the two products never collide.
  // These tables are the inspectable record behind each autonomous decision:
  // raw ingest (matches/oddsTicks/scoreEvents) -> detection (signals) ->
  // action (actions) -> verification (proofs). See convex/touchline.ts for
  // the agentTick loop that writes them, and lib/touchline/* for the pure
  // deterministic engine. (TOUCHLINE_PRD §17.)
  // ════════════════════════════════════════════════════════════════════

  // Latest state per monitored fixture (upserted each tick).
  touchlineMatches: defineTable({
    fixtureId: v.number(),
    homeTeam: v.string(),
    awayTeam: v.string(),
    homeScore: v.number(),
    awayScore: v.number(),
    status: v.string(), // ACTIVE | FROZEN — Touchline's own simulated market state
    minute: v.number(),
    phase: v.optional(v.string()),
    competition: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_fixture", ["fixtureId"]),

  // Append-only odds history (normalized probabilities computed at write).
  touchlineOddsTicks: defineTable({
    fixtureId: v.number(),
    homeOdds: v.number(),
    drawOdds: v.number(),
    awayOdds: v.number(),
    homeProbability: v.number(),
    drawProbability: v.number(),
    awayProbability: v.number(),
    timestamp: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_fixture_ts", ["fixtureId", "timestamp"]),

  // Append-only discrete match events (goals, cards) with TxLINE sequence.
  touchlineScoreEvents: defineTable({
    fixtureId: v.number(),
    sequence: v.number(),
    action: v.string(), // GOAL | YELLOW | RED | KICKOFF | HT | FT ...
    homeScore: v.number(),
    awayScore: v.number(),
    timestamp: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_fixture_ts", ["fixtureId", "timestamp"]),

  // Detected market signals (the "why" behind an action).
  touchlineSignals: defineTable({
    fixtureId: v.number(),
    type: v.union(
      v.literal("EVENT_MARKET_DIVERGENCE"),
      v.literal("UNEXPLAINED_PRICE_SHOCK"),
    ),
    severity: v.number(), // 0-100 risk score
    probabilityBefore: v.number(),
    probabilityAfter: v.number(),
    triggerValue: v.number(), // observed move / volatility
    threshold: v.number(), // configured threshold it breached
    sequence: v.optional(v.number()), // TxLINE sequence of the triggering event
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_created", ["createdAt"]),

  // Autonomous actions executed by the agent (all SIMULATED).
  touchlineActions: defineTable({
    signalId: v.optional(v.id("touchlineSignals")),
    fixtureId: v.number(),
    action: v.union(
      v.literal("HOLD"),
      v.literal("FREEZE_MARKET"),
      v.literal("REOPEN_MARKET"),
      v.literal("PAPER_HEDGE"),
    ),
    status: v.string(), // "EXECUTED"
    reason: v.string(),
    // PAPER_HEDGE detail (labelled simulated position)
    notional: v.optional(v.number()),
    executionPrice: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_created", ["createdAt"])
    .index("by_signal", ["signalId"]),

  // Solana verification results (honest state — never a fabricated ✓).
  touchlineProofs: defineTable({
    signalId: v.optional(v.id("touchlineSignals")),
    fixtureId: v.number(),
    sequence: v.number(),
    network: v.string(), // "devnet"
    validationMethod: v.string(), // e.g. "validateStatV2" | "merkleProof"
    verified: v.boolean(),
    detail: v.optional(v.string()), // human-readable reason (esp. when unavailable)
    txRef: v.optional(v.string()), // on-chain account / signature reference
    requestedAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_signal", ["signalId"])
    .index("by_created", ["requestedAt"]),

  // Agent runtime config + status (singleton row, key="agent").
  touchlineAgent: defineTable({
    key: v.string(), // always "agent"
    status: v.union(v.literal("ACTIVE"), v.literal("STOPPED")),
    mode: v.union(v.literal("live"), v.literal("replay")),
    replaySpeed: v.optional(v.number()), // 1 | 5 | 20
    eventWindowSec: v.number(), // default 10
    minReprice: v.number(), // default 0.05 (5%)
    volatilityThreshold: v.number(), // default 0.08 (8%)
    autoFreeze: v.boolean(),
    autoHedge: v.boolean(),
    solanaVerification: v.boolean(),
    lastTickAt: v.optional(v.number()),
    replayCursor: v.optional(v.number()), // ms position played through the replay timeline
    replayStartedAt: v.optional(v.number()),
    featuredFixtureId: v.optional(v.number()),
    // Per-fixture agent runtime state (MVP monitors one featured fixture).
    // Mirrors lib/touchline/runtime.ts AgentRuntime so a tick can resume.
    marketStatus: v.optional(v.string()), // ACTIVE | FROZEN
    prevProb: v.optional(v.number()), // last tick's home win probability
    frozenAtProb: v.optional(v.number()),
    lastEventProb: v.optional(v.number()), // home prob just before the last event
    lastEventTs: v.optional(v.number()),
    lastEventSeq: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),



  // ── Restored from main (merge gap): tables the merged merkle/apikeys/feed
  //    functions require. Additive. ──
  liveFixtures: defineTable({
    fixtureId: v.number(),
    homeCode: v.string(),
    homeName: v.string(),
    homeFlag: v.string(),
    awayCode: v.string(),
    awayName: v.string(),
    awayFlag: v.string(),
    homeGoals: v.number(),
    awayGoals: v.number(),
    minute: v.optional(v.number()),
    statusId: v.optional(v.number()),
    phase: v.string(),
    inPlay: v.boolean(),
    // ── Completion / settlement (drives instant pool-bet payout) ──
    // `final` is set once the match is over (feed's final flag, or a past-90'
    // fixture the feed has stopped updating). `outcome` is the settled 1X2
    // result; `settledAt` marks that pending pool bets on this fixture have
    // been paid/graded, so settlement is idempotent (never double-pays).
    final: v.optional(v.boolean()),
    outcome: v.optional(v.union(v.literal("HOME"), v.literal("DRAW"), v.literal("AWAY"))),
    settledAt: v.optional(v.number()),
    // Live match stats (written by the in-game-stats poller on another branch);
    // declared optional here so this schema validates against that shared data.
    statsHome: v.optional(
      v.object({
        corners: v.number(),
        fouls: v.number(),
        goals: v.number(),
        red: v.number(),
        shots: v.number(),
        shotsOnTarget: v.number(),
        yellow: v.number(),
      }),
    ),
    statsAway: v.optional(
      v.object({
        corners: v.number(),
        fouls: v.number(),
        goals: v.number(),
        red: v.number(),
        shots: v.number(),
        shotsOnTarget: v.number(),
        yellow: v.number(),
      }),
    ),
    // Recent notable events (goal/card/corner/shot/…) — also written by the
    // in-game-stats poller on another branch; optional so this schema validates.
    recentEvents: v.optional(
      v.array(
        v.object({
          seq: v.number(),
          minute: v.number(),
          action: v.string(),
          side: v.string(),
          detail: v.string(),
        }),
      ),
    ),
    competition: v.string(),
    // pre-match / live 1X2 (nullable until odds exist)
    oddsHome: v.optional(v.number()),
    oddsDraw: v.optional(v.number()),
    oddsAway: v.optional(v.number()),
    pHome: v.optional(v.number()),
    pDraw: v.optional(v.number()),
    pAway: v.optional(v.number()),
    startTime: v.optional(v.number()),
    // Cumulative in-game stats, oriented to display home/away (absent until the
    // scores snapshot carries a Score accumulator).
    statsHome: v.optional(
      v.object({
        goals: v.number(),
        corners: v.number(),
        shots: v.number(),
        shotsOnTarget: v.number(),
        yellow: v.number(),
        red: v.number(),
        fouls: v.number(),
      }),
    ),
    statsAway: v.optional(
      v.object({
        goals: v.number(),
        corners: v.number(),
        shots: v.number(),
        shotsOnTarget: v.number(),
        yellow: v.number(),
        red: v.number(),
        fouls: v.number(),
      }),
    ),
    // Recent notable events (goal/card/corner/shot/…), oldest→newest by seq,
    // side oriented to display home/away ("" when unattributed). PunditBot
    // streams these line-by-line.
    recentEvents: v.optional(
      v.array(
        v.object({
          seq: v.number(),
          minute: v.number(),
          action: v.string(),
          side: v.string(),
          detail: v.string(),
        }),
      ),
    ),
    updatedAt: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_updated", ["updatedAt"]),

  liveTicks: defineTable({
    fixtureId: v.number(),
    ts: v.number(),
    oddsHome: v.number(),
    oddsDraw: v.number(),
    oddsAway: v.number(),
    pHome: v.number(),
    pDraw: v.number(),
    pAway: v.number(),
  }).index("by_fixture_ts", ["fixtureId", "ts"]),

  pollState: defineTable({
    key: v.string(),
    mode: v.string(),
    lastPollAt: v.number(),
    featuredFixtureId: v.optional(v.number()),
    note: v.optional(v.string()),
    // Single-loop lease: only the poll loop whose id matches keeps running, so
    // stray/duplicate loops (from redeploys or manual triggers) self-terminate.
    loopId: v.optional(v.string()),
  }).index("by_key", ["key"]),

  merkleRoots: defineTable({
    fixtureId: v.number(),
    root: v.string(),
    leafCount: v.number(),
    fromTs: v.number(),
    toTs: v.number(),
    algo: v.string(),
    computedAt: v.number(),
  })
    .index("by_fixture", ["fixtureId"])
    .index("by_computed", ["computedAt"]),

  apiKeys: defineTable({
    clerkId: v.string(),
    key: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revoked: v.boolean(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_key", ["key"]),
});
