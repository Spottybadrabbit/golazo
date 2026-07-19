"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Confetti from "@/components/Confetti";
import { resolveRound, statValue } from "@/lib/engine";
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
import { useLiveWorld, useRoundClock } from "@/lib/useLiveWorld";
import { useCelebrate } from "@/components/celebrate/Celebration";

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

function callTitle(streak: number): string {
  if (streak >= 8) return "GOLAZO GOD!";
  if (streak >= 5) return "ON FIRE!";
  if (streak >= 3) return "HAT-TRICK!";
  return "GOOOAL!";
}

export default function HiLoGame() {
  const world = useLiveWorld();
  const clock = useRoundClock();
  const celebrate = useCelebrate();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [burst, setBurst] = useState(0);
  const [banked, setBanked] = useState<{ banked: number; fee: number } | null>(null);
  const lastResolved = useRef<string | null>(null);

  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);

  // resolve the previous round the moment the round id rolls over
  useEffect(() => {
    if (!clock || !player) return;
    if (!pick || pick.roundId === clock.round.id) return;
    if (lastResolved.current === pick.roundId) return;
    lastResolved.current = pick.roundId;
    const res = resolveRound(pick.roundId);
    if (!res) {
      setPick(null);
      return;
    }
    const push = res.result === 0;
    const correct = !push && res.result === pick.choice;
    const { next, gained, newBadges } = applyResult(player, correct, push);
    savePlayer(next);
    setPlayer(next);
    setOutcome({
      correct,
      push,
      gained,
      endValue: res.endValue,
      badge: newBadges[0]?.name,
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
    }
    setPick(null);
    setBanked(null);
  }, [clock, pick, player, celebrate]);

  if (!world || !clock || !player) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">
          Syncing the TxLINE feed...
        </div>
      </div>
    );
  }

  const { round, progress, secondsLeft } = clock;
  const m = world.featured;
  const liveValue =
    m.fixtureId === round.fixtureId ? Math.round(statValue(m, round.stat) * 10) / 10 : null;
  const picked = pick?.roundId === round.id ? pick.choice : null;
  const mult = multiplier(player.streak);
  const ring = 2 * Math.PI * 44;

  const choose = (choice: 1 | -1) => {
    if (picked) return;
    setPick({ roundId: round.id, choice });
    setOutcome(null);
  };

  const bank = () => {
    if (player.streak < 3) return;
    const res = bankStreak(player);
    savePlayer(res.next);
    setPlayer(res.next);
    setBanked({ banked: res.banked, fee: res.fee });
    setBurst(Date.now());
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
          <span>fixture {m.fixtureId}</span>
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
              1X2 {m.odds.home.toFixed(2)} / {m.odds.draw.toFixed(2)} / {m.odds.away.toFixed(2)}
            </div>
          </div>
          <TeamBlock flag={m.away.flag} code={m.away.code} right />
        </div>
      </div>

      {/* the round card */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span>Round {round.id.split("-")[2]}</span>
          <span>next tick in {secondsLeft}s</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-5">
          <div>
            <p className="text-sm text-muted">{round.question}</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-mono text-5xl font-semibold tracking-tight">
                {round.lockValue}
                <span className="text-2xl text-muted">{round.unit}</span>
              </span>
              {liveValue !== null && (
                <span
                  className={`mb-1.5 font-mono text-sm ${
                    liveValue > round.lockValue
                      ? "text-up"
                      : liveValue < round.lockValue
                        ? "text-down"
                        : "text-muted"
                  }`}
                >
                  now {liveValue}
                  {round.unit}
                </span>
              )}
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
          <p className="text-sm leading-snug">{line}</p>
          {outcome && !outcome.push && (
            <p className="mt-0.5 font-mono text-xs text-muted">
              settled at {outcome.endValue}
              {round.unit}
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
