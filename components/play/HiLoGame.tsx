"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Confetti from "@/components/Confetti";
import {
  applyResult,
  BADGES,
  bankStreak,
  loadPlayer,
  level,
  levelProgress,
  multiplier,
  savePlayer,
  type PlayerState,
} from "@/lib/game";
import { matchSlug } from "@/lib/match";
import { useLiveWorld, useRoundClock } from "@/lib/useLiveWorld";
import { useCelebrate } from "@/components/celebrate/Celebration";
import { usePersist } from "@/components/PlayerSync";

type Pick = { roundId: string; choice: 1 | -1 };

interface Outcome {
  correct: boolean;
  push: boolean;
  gained: number;
  endValue: number;
  badge?: string;
}

const WIN_LINES = [
  "CALLED IT! You read that feed like a pundit.",
  "Golazo of a call! The market wishes it were you.",
  "That is three points of pure vibes. Keep going!",
];
const LOSE_LINES = [
  "Ooof. The feed had other plans. Reset and go again.",
  "Even prime pundits misread a tick. Shake it off!",
  "The market got you there. Revenge next round?",
];
const PUSH_LINES = ["Dead level. Nobody wins, nobody cries. Again!"];

const round1 = (n: number) => Math.round(n * 10) / 10;

type Market = "home" | "draw" | "away";

const MARKET_LABELS: Record<Market, string> = { home: "HOME", draw: "DRAW", away: "AWAY" };

/** Value stored + timestamped every time the selected market's live value
 * changes — the small history a Hi-Lo round needs to show the "edge": how
 * the stat has moved over roughly the last round. */
interface HistPoint {
  value: number;
  at: number;
}

/** The history entry closest to (but not after) `now - windowMs`, or null if
 * the history doesn't yet stretch back that far (still warming up). */
function edgeReference(history: HistPoint[], now: number, windowMs: number): number | null {
  if (history.length === 0) return null;
  const target = now - windowMs;
  if (history[0].at > target) return null; // not enough history yet
  let ref = history[0];
  for (const h of history) {
    if (h.at <= target) ref = h;
    else break;
  }
  return ref.value;
}

function callTitle(streak: number): string {
  if (streak >= 8) return "GOLAZO GOD!";
  if (streak >= 5) return "ON FIRE!";
  if (streak >= 3) return "HAT-TRICK!";
  return "GOOOAL!";
}

export default function HiLoGame() {
  const world = useLiveWorld();
  const clock = useRoundClock(world?.round ?? null);
  const { recordGamePlay, logActivity } = usePersist();
  const celebrate = useCelebrate();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [burst, setBurst] = useState(0);
  const [banked, setBanked] = useState<{ banked: number; fee: number } | null>(null);
  const [market, setMarket] = useState<Market>("home");
  const lastResolved = useRef<string | null>(null);
  // Snapshot of the featured match's real selected-market probability the
  // moment each round is first observed (or the market is switched) — the
  // "lock" value every round resolves against. Keyed by round id so it
  // survives re-renders untouched; stores which market it was captured for,
  // so resolving a round always compares against the market it was locked to
  // even if the player has since switched markets for the next round.
  const lockSnapshots = useRef<Record<string, { market: Market; value: number }>>({});
  // Timestamped recent values of the *currently selected* market's live
  // number — the small history the "edge" readout diffs against.
  const marketHistory = useRef<HistPoint[]>([]);
  const historyMarket = useRef<Market>(market);

  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);

  // Capture the round's lock value as soon as both a round and live data
  // exist. Idempotent (write-once per round id), so it's safe to run on
  // every render rather than chase effect timing.
  if (clock && world?.featured && lockSnapshots.current[clock.round.id] === undefined) {
    lockSnapshots.current[clock.round.id] = { market, value: world.featured.probs[market] };
  }

  // Track recent history of the selected market's live value for the "edge"
  // readout. Resets whenever the market changes (a fresh stat needs its own
  // history) and otherwise only appends when the value actually moves.
  useEffect(() => {
    if (!world?.featured) return;
    const value = world.featured.probs[market];
    const now = Date.now();
    if (historyMarket.current !== market) {
      historyMarket.current = market;
      marketHistory.current = [{ value, at: now }];
      return;
    }
    const last = marketHistory.current[marketHistory.current.length - 1];
    if (!last || last.value !== value) {
      marketHistory.current = [...marketHistory.current, { value, at: now }].slice(-40);
    }
  }, [
    market,
    world?.featured,
    world?.featured?.probs.home,
    world?.featured?.probs.draw,
    world?.featured?.probs.away,
  ]);

  // resolve the previous round the moment the round id rolls over, comparing
  // the lock snapshot to the featured match's current real win-probability.
  useEffect(() => {
    if (!clock || !player || !world?.featured) return;
    if (!pick || pick.roundId === clock.round.id) return;
    if (lastResolved.current === pick.roundId) return;
    const snap = lockSnapshots.current[pick.roundId];
    if (snap === undefined) {
      // Never got a snapshot for this round (feed dropped mid-round) — void it.
      lastResolved.current = pick.roundId;
      setPick(null);
      return;
    }
    lastResolved.current = pick.roundId;
    const endValue = round1(world.featured.probs[snap.market]);
    const av = round1(snap.value);
    const push = endValue === av;
    const result: 1 | -1 | 0 = push ? 0 : endValue > av ? 1 : -1;
    const correct = !push && result === pick.choice;
    const { next, gained, newBadges } = applyResult(player, correct, push);
    savePlayer(next);
    setPlayer(next);
    setOutcome({
      correct,
      push,
      gained,
      endValue,
      badge: newBadges[0]?.name,
    });
    recordGamePlay({
      game: "hilo",
      fixtureId: world.featured.fixtureId,
      roundRef: pick.roundId,
      pick: `${snap.market}-${pick.choice === 1 ? "higher" : "lower"}`,
      lockedProb: av,
      result: push ? "void" : correct ? "win" : "loss",
      delta: gained,
      streakAfter: next.streak,
    });
    if (correct) {
      setBurst(Date.now());
      celebrate({
        kind: "goal",
        title: callTitle(next.streak),
        subtitle: newBadges[0]
          ? `Badge unlocked: ${newBadges[0].name}`
          : `${next.streak} in a row. Keep the run alive!`,
        tiles: [
          { label: "XP", value: `+${gained}`, icon: "⚡️" },
          { label: "Streak", value: String(next.streak), icon: "🔥" },
          { label: "Boost", value: `${multiplier(next.streak)}x` },
        ],
        tone: next.streak >= 8 ? "legend" : "volt",
      });
      logActivity("celebration", "goal", undefined, { streak: next.streak });
    }
    setPick(null);
    setBanked(null);
  }, [clock, pick, player, world, celebrate, recordGamePlay, logActivity]);

  if (!clock || !player) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (!world?.featured) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <Image
          src="/assets/mascot-volt.jpg"
          alt="Golo, the GOLAZO pundit parrot"
          width={88}
          height={88}
          className="mx-auto rounded-xl"
        />
        <h2 className="mt-4 text-xl font-extrabold">Awaiting the live feed</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          The TxLINE feed isn&apos;t streaming yet. Hi-Lo goes live the moment real match data
          starts flowing — check back shortly.
        </p>
      </div>
    );
  }

  const { round, progress, secondsLeft } = clock;
  const m = world.featured;
  const noOdds = m.odds.home === 0 && m.odds.draw === 0 && m.odds.away === 0;
  const noProbs = m.probs.home === 0 && m.probs.draw === 0 && m.probs.away === 0;
  const snapshot = lockSnapshots.current[round.id];
  const lockValue = round1(snapshot?.value ?? m.probs[market]);
  const liveValue = round1(m.probs[market]);
  const picked = pick?.roundId === round.id ? pick.choice : null;
  const mult = multiplier(player.streak);
  const ring = 2 * Math.PI * 44;
  const marketName = market === "home" ? m.home.name : market === "away" ? m.away.name : "Draw";
  const roundMs = round.endsAt - round.startedAt;
  // Reconstruct "now" from the round clock's own progress rather than a fresh
  // Date.now() call, so this stays a pure read of already-computed state.
  const approxNow = round.startedAt + progress * roundMs;
  const edgeRef = edgeReference(marketHistory.current, approxNow, roundMs);
  const edgeDelta = edgeRef !== null ? round1(liveValue - edgeRef) : null;

  const choose = (choice: 1 | -1) => {
    if (picked || noProbs) return;
    setPick({ roundId: round.id, choice });
    setOutcome(null);
  };

  const chooseMarket = (mk: Market) => {
    if (picked || noProbs || mk === market) return;
    setMarket(mk);
    lockSnapshots.current[round.id] = { market: mk, value: m.probs[mk] };
  };

  const bank = () => {
    if (player.streak < 3) return;
    const res = bankStreak(player);
    savePlayer(res.next);
    setPlayer(res.next);
    setBanked({ banked: res.banked, fee: res.fee });
    setBurst(Date.now());
    logActivity("action", "bank", undefined, { streak: player.streak, banked: res.banked, fee: res.fee });
    logActivity("celebration", "bank", undefined, { banked: res.banked });
    celebrate({
      kind: "bank",
      title: "BANKED!",
      subtitle: `You locked in a ${player.streak}-streak.`,
      tiles: [
        { label: "GOAL", value: `+${res.banked}`, icon: "💰" },
        { label: "Fee", value: String(res.fee) },
      ],
      cta: "Sweet",
    });
  };

  const line = outcome
    ? outcome.push
      ? PUSH_LINES[0]
      : outcome.correct
        ? WIN_LINES[outcome.gained % WIN_LINES.length]
        : LOSE_LINES[outcome.gained % LOSE_LINES.length]
    : picked
      ? "Locked in. Watching the feed with you..."
      : "Call the next tick. Higher or lower?";

  return (
    <div className="relative">
      <Confetti burst={burst} />

      {/* match header */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between font-mono text-xs text-muted">
          <span className="flex items-center gap-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
            {m.phase === "LIVE" ? `LIVE ${m.minute}'` : m.phase}
          </span>
          <Link
            href={`/match/${matchSlug(m)}`}
            className="underline-offset-4 hover:text-chalk hover:underline"
          >
            fixture {m.fixtureId}
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <TeamBlock flag={m.home.flag} code={m.home.code} />
          <div className="text-center">
            <div className="font-mono text-4xl font-semibold tracking-tight">
              {m.score[0]}
              <span className="text-muted"> : </span>
              {m.score[1]}
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted">
              {noOdds
                ? "1X2 — / — / —"
                : `1X2 ${m.odds.home.toFixed(2)} / ${m.odds.draw.toFixed(2)} / ${m.odds.away.toFixed(2)}`}
            </div>
          </div>
          <TeamBlock flag={m.away.flag} code={m.away.code} right />
        </div>
      </div>

      {/* the round card */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span>Round {Number(round.id.split("-")[2] ?? 0) % 1000}</span>
          <span>next tick in {secondsLeft}s</span>
        </div>
        {noProbs ? (
          <div className="px-5 py-8 text-center font-mono text-sm text-muted">
            Waiting for a live win-probability price on this match...
          </div>
        ) : (
          <>
            {/* market selector */}
            <div className="flex gap-2 px-5 pt-4">
              {(["home", "draw", "away"] as Market[]).map((mk) => (
                <button
                  key={mk}
                  type="button"
                  onClick={() => chooseMarket(mk)}
                  disabled={Boolean(picked)}
                  className={`flex-1 rounded-full border py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                    market === mk
                      ? "border-volt bg-volt text-night"
                      : picked
                        ? "border-line text-muted opacity-50"
                        : "border-line text-muted hover:border-volt/50 hover:text-chalk"
                  }`}
                >
                  {MARKET_LABELS[mk]}
                </button>
              ))}
            </div>

            {/* edge readout */}
            <div className="flex items-center justify-between px-5 pt-3 font-mono text-[11px] text-muted">
              <span>edge · last ~{Math.round(roundMs / 1000)}s</span>
              {edgeDelta === null ? (
                <span>gathering data…</span>
              ) : (
                <span className={edgeDelta > 0 ? "text-up" : edgeDelta < 0 ? "text-down" : "text-muted"}>
                  {edgeDelta > 0 ? "▲" : edgeDelta < 0 ? "▼" : "="} {Math.abs(edgeDelta).toFixed(1)}pp
                  {Math.abs(edgeDelta) >= 1.5 ? " · market moving" : ""}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-5">
              <div>
                <p className="text-sm text-muted">
                  {marketName} win probability — higher or lower by the next tick?
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="font-mono text-5xl font-semibold tracking-tight">
                    {lockValue}
                    <span className="text-2xl text-muted">%</span>
                  </span>
                  <span
                    className={`mb-1.5 font-mono text-sm ${
                      liveValue > lockValue
                        ? "text-up"
                        : liveValue < lockValue
                          ? "text-down"
                          : "text-muted"
                    }`}
                  >
                    now {liveValue}%
                  </span>
                </div>
              </div>
              {/* countdown ring */}
              <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
                <circle cx="52" cy="52" r="44" stroke="var(--line)" strokeWidth="7" fill="none" />
                <circle
                  cx="52"
                  cy="52"
                  r="44"
                  stroke="var(--volt)"
                  strokeWidth="7"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={ring}
                  strokeDashoffset={ring * progress}
                />
              </svg>
            </div>

            {/* HI / LO buttons */}
            <div className="grid grid-cols-2 gap-3 px-5 pb-5">
              <button
                onClick={() => choose(1)}
                disabled={Boolean(picked)}
                className={`group rounded-xl border-2 py-4 text-lg font-extrabold tracking-wide transition-all active:translate-y-px ${
                  picked === 1
                    ? "border-volt bg-volt text-night"
                    : picked
                      ? "border-line text-muted opacity-50"
                      : "border-volt bg-volt/10 text-chalk hover:bg-volt hover:text-night hover:shadow-[0_6px_24px_rgba(175,255,0,0.35)]"
                }`}
              >
                HIGHER ↑
              </button>
              <button
                onClick={() => choose(-1)}
                disabled={Boolean(picked)}
                className={`rounded-xl border-2 py-4 text-lg font-extrabold tracking-wide transition-all active:translate-y-px ${
                  picked === -1
                    ? "border-cyan bg-cyan text-night"
                    : picked
                      ? "border-line text-muted opacity-50"
                      : "border-cyan/70 bg-cyan/10 text-chalk hover:bg-cyan hover:text-night hover:shadow-[0_6px_24px_rgba(0,212,255,0.3)]"
                }`}
              >
                LOWER ↓
              </button>
            </div>
          </>
        )}
      </div>

      {/* mascot commentary */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
        <Image
          src="/assets/mascot-volt.jpg"
          alt="Golo, the GOLAZO pundit parrot"
          width={56}
          height={56}
          className={`rounded-xl ${outcome?.correct ? "bob" : ""}`}
        />
        <div className="min-w-0">
          <p className="text-sm leading-snug">{noProbs ? "Feed's warming up the odds market..." : line}</p>
          {outcome && !outcome.push && (
            <p className="mt-0.5 font-mono text-xs text-muted">
              settled at {outcome.endValue}%
              {outcome.correct ? ` · +${outcome.gained} XP` : ""}
              {outcome.badge ? ` · badge unlocked: ${outcome.badge}` : ""}
            </p>
          )}
          {banked && (
            <p className="mt-0.5 font-mono text-xs text-up">
              banked +{banked.banked} GOAL (2% fee: {banked.fee})
            </p>
          )}
        </div>
      </div>

      {/* streak + progress row */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 text-center">
          <div className="text-3xl font-extrabold">
            {player.streak > 0 && <span className="flame">🔥</span>} {player.streak}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
            streak · {mult}x boost
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 text-center">
          <div className="text-3xl font-extrabold">{level(player.xp)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night">
            <div
              className="h-full rounded-full bg-volt transition-all duration-700"
              style={{ width: `${Math.round(levelProgress(player.xp) * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted">
            level · {player.xp} XP
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 text-center">
          <div className="text-3xl font-extrabold">{player.goalPoints}</div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
            GOAL points
          </div>
        </div>
      </div>

      {/* bank the boost */}
      {player.streak >= 3 && (
        <button
          onClick={bank}
          className="mt-4 w-full rounded-2xl border-2 border-dashed border-volt/70 bg-volt/10 py-4 text-center font-bold text-chalk transition-colors hover:bg-volt/20 active:translate-y-px"
        >
          Bank this streak for {player.streak * 25 * mult} GOAL
          <span className="ml-2 font-mono text-xs font-normal text-muted">
            (2% platform fee applies)
          </span>
        </button>
      )}

      {/* badges */}
      <div className="mt-6">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">Badges</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BADGES.map((b) => {
            const earned = player.badges.includes(b.id);
            return (
              <div
                key={b.id}
                className={`rounded-xl border p-3 ${
                  earned ? "border-volt/60 bg-volt/10" : "border-line bg-surface opacity-60"
                }`}
              >
                <div className="text-sm font-bold">{b.name}</div>
                <div className="mt-0.5 text-xs text-muted">{b.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamBlock({ flag, code, right }: { flag: string; code: string; right?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${right ? "flex-row-reverse text-right" : ""}`}>
      <span className="text-3xl">{flag}</span>
      <span className="text-xl font-extrabold tracking-tight">{code}</span>
    </div>
  );
}
