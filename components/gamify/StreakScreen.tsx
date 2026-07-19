"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useUser } from "@clerk/nextjs";
import GlossyIcon from "@/components/icons/GlossyIcons";
import { useCelebrate } from "@/components/celebrate/Celebration";
import { loadPlayer, savePlayer, pushTx, type PlayerState } from "@/lib/game";

// Duolingo-style Streak screen: a day-streak (consecutive *calendar days*
// with real activity), distinct from the Hi-Lo pick-streak (player.streak)
// used elsewhere in the app. Derived client-side from recent activity/ledger
// timestamps rather than a stored counter — convex/schema.ts reserves
// `streakGoal`/`streakDays` on `players` but nothing writes them yet, so this
// screen is the first consumer and computes the day-streak itself. Screen
// views are excluded from "active" days (AppShell logs one on every route
// visit) so the streak reflects a real action, not just opening the app.
//
// Signed in: activity dates come from `profile:myProfile` (last 20 rows —
// enough for a week strip, may undercount a very long streak; acceptable,
// convex/profile.ts can't be touched here). Signed out / Convex or Clerk not
// configured: derived from the local ledger (lib/game.ts, capped at 60
// rows), same shape of computation either way.

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const myProfileRef = makeFunctionReference<"query">("profile:myProfile");

const DEFAULT_STREAK_GOAL = 7; // no goal-picker UI yet — sensible default
const DAILY_BONUS = 15; // GOAL points for the once-a-day claim
const BONUS_KEY = "golazo.dailyBonus.v1";

interface ActivityRow {
  kind: string;
  createdAt: number;
}

interface MyProfileResult {
  player: { streakGoal?: number } | null;
  activity: ActivityRow[];
}

// Passive views don't count toward "active" — only real actions do.
const COUNTS_AS_ACTIVE = new Set(["action", "onboarding", "game", "reward", "wallet", "celebration"]);

export default function StreakScreen() {
  if (!convexOn || !clerkOn) return <StreakBody activityDays={null} streakGoal={null} />;
  return <StreakGate />;
}

function StreakGate() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <LoadingCard />;
  if (!isSignedIn) return <StreakBody activityDays={null} streakGoal={null} />;
  return <SignedInStreak />;
}

function SignedInStreak() {
  const profile = useQuery(myProfileRef) as MyProfileResult | null | undefined;
  const days = useMemo(() => {
    if (!profile?.activity) return null;
    return profile.activity
      .filter((a) => COUNTS_AS_ACTIVE.has(a.kind))
      .map((a) => a.createdAt);
  }, [profile]);
  return <StreakBody activityDays={days} streakGoal={profile?.player?.streakGoal ?? null} />;
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-line bg-surface">
      <div className="animate-pulse font-mono text-sm text-muted">Loading your streak…</div>
    </div>
  );
}

function activeDateSet(timestamps: number[]): Set<string> {
  return new Set(timestamps.map((ts) => new Date(ts).toDateString()));
}

function dayStreakFrom(days: Set<string>): number {
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(cursor.toDateString())) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function weekStrip(days: Set<string>): { label: string; active: boolean; isToday: boolean }[] {
  const out: { label: string; active: boolean; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      active: days.has(d.toDateString()),
      isToday: i === 0,
    });
  }
  return out;
}

function hasClaimedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BONUS_KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

function markClaimedToday() {
  try {
    window.localStorage.setItem(BONUS_KEY, new Date().toDateString());
  } catch {
    /* best effort */
  }
}

function StreakBody({
  activityDays,
  streakGoal,
}: {
  activityDays: number[] | null;
  streakGoal: number | null;
}) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [claimedToday, setClaimedToday] = useState(false);
  const celebrate = useCelebrate();
  const claiming = useRef(false);

  useEffect(() => {
    setPlayer(loadPlayer());
    setClaimedToday(hasClaimedToday());
  }, []);

  const localDays = useMemo(() => {
    if (!player) return [];
    return (player.ledger ?? []).map((t) => t.ts);
  }, [player]);

  const days = useMemo(
    () => activeDateSet(activityDays ?? localDays),
    [activityDays, localDays],
  );
  const dayStreak = useMemo(() => dayStreakFrom(days), [days]);
  const strip = useMemo(() => weekStrip(days), [days]);
  const goal = streakGoal ?? DEFAULT_STREAK_GOAL;
  const progress = Math.min(1, goal > 0 ? dayStreak / goal : 0);

  if (!player) return <LoadingCard />;

  const claim = () => {
    if (claimedToday || claiming.current) return;
    claiming.current = true;
    const bumped: PlayerState = { ...player, goalPoints: player.goalPoints + DAILY_BONUS };
    const next = pushTx(bumped, { kind: "bank", label: "Daily streak bonus", goal: DAILY_BONUS });
    savePlayer(next);
    setPlayer(next);
    markClaimedToday();
    setClaimedToday(true);
    celebrate({
      kind: "reward",
      title: "Bonus banked!",
      subtitle: `+${DAILY_BONUS} GOAL for showing up today`,
      tiles: [
        { label: "Day streak", value: String(dayStreak), icon: "🔥" },
        { label: "GOAL", value: String(next.goalPoints) },
      ],
      tone: "volt",
    });
  };

  const ringSize = 132;
  const stroke = 10;
  const r = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  return (
    <div className="space-y-6">
      {/* flame + streak number */}
      <div className="flex flex-col items-center rounded-2xl border border-line bg-surface py-8 text-center">
        <div className="flame">
          <GlossyIcon name="flame" tint="volt" size={72} />
        </div>
        <div className="mt-2 font-mono text-6xl font-extrabold text-volt">{dayStreak}</div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">day streak</p>
      </div>

      {/* 7-day week strip */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">This week</h3>
        <div className="mt-3 flex justify-between gap-1.5">
          {strip.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase text-muted">{d.label}</span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  d.active
                    ? "bg-volt text-night"
                    : d.isToday
                      ? "border-2 border-dashed border-volt/60 text-volt"
                      : "border border-line text-muted"
                }`}
              >
                {d.active ? "🔥" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* streak goal progress ring */}
      <div className="flex items-center gap-5 rounded-2xl border border-line bg-surface p-5">
        <svg width={ringSize} height={ringSize} className="shrink-0 -rotate-90">
          <circle cx={ringSize / 2} cy={ringSize / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            stroke="#AFFF00"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
        </svg>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Streak goal</p>
          <p className="mt-1 text-2xl font-extrabold text-chalk">
            {dayStreak}/{goal} <span className="text-sm font-semibold text-muted">days</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {dayStreak >= goal ? "Goal reached — keep it going!" : `${goal - dayStreak} to go`}
          </p>
        </div>
      </div>

      {/* daily bonus claim */}
      <div className="rounded-2xl border-2 border-dashed border-volt/70 bg-volt/10 p-5 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-volt">Daily bonus</p>
        <p className="mt-1 text-sm text-chalk/90">Show up every day for a free GOAL top-up.</p>
        <button
          onClick={claim}
          disabled={claimedToday}
          className={`mt-4 w-full rounded-full py-3.5 text-lg font-extrabold uppercase transition-transform ${
            claimedToday
              ? "cursor-not-allowed bg-surface text-muted"
              : "bg-volt text-night hover:scale-[1.02] active:translate-y-px"
          }`}
        >
          {claimedToday ? "Claimed for today" : `Claim +${DAILY_BONUS} GOAL`}
        </button>
      </div>
    </div>
  );
}
