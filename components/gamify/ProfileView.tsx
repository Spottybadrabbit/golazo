"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { SignInButton, useUser } from "@clerk/nextjs";
import GlossyIcon from "@/components/icons/GlossyIcons";
import ActivityFeed, { type ActivityRow } from "@/components/gamify/ActivityFeed";
import { loadPlayer, level, levelProgress, BADGES, type PlayerState } from "@/lib/game";

// Profile screen: header (handle/level/XP), headline stats, badges grid, and
// an activity feed. Header/stats/badges always render from local
// PlayerState (device-local progress is real regardless of sign-in) — only
// the activity feed section is Convex-only and gates on sign-in, per
// SquadBoard's guard pattern: Clerk hooks (`useUser`, `SignInButton`) must
// never render unless a ClerkProvider is actually mounted.

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const myProfileRef = makeFunctionReference<"query">("profile:myProfile");
const recomputeStatsRef = makeFunctionReference<"mutation">("profile:recomputeStats");

interface ProfileStats {
  accuracy: number;
  longestStreak: number;
  roundsPlayed: number;
  packsOpened: number;
  goalEarned: number;
  goalSpent: number;
}

interface MyProfileResult {
  player: { handle: string; xp: number; goalPoints: number } | null;
  stats: ProfileStats | null;
  activity: ActivityRow[];
}

export default function ProfileView() {
  const [player, setPlayer] = useState<PlayerState | null>(null);

  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);

  if (!player) return <LoadingCard />;
  if (!convexOn || !clerkOn) return <ProfileBody player={player} profile={null} signedIn={false} />;
  return <ProfileGate player={player} />;
}

function ProfileGate({ player }: { player: PlayerState }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <LoadingCard />;
  if (!isSignedIn) return <ProfileBody player={player} profile={null} signedIn={false} />;
  return <SignedInProfile player={player} />;
}

function SignedInProfile({ player }: { player: PlayerState }) {
  const profile = useQuery(myProfileRef) as MyProfileResult | null | undefined;
  const recompute = useMutation(recomputeStatsRef);
  const ran = useRef(false);

  // Populate profileStats the first time this screen is opened signed-in —
  // nothing else calls this mutation yet, so without it `stats` stays null
  // and the header just falls back to local numbers.
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    recompute({}).catch(() => {});
  }, [recompute]);

  return <ProfileBody player={player} profile={profile} signedIn />;
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-line bg-surface">
      <div className="animate-pulse font-mono text-sm text-muted">Loading your profile…</div>
    </div>
  );
}

function ProfileBody({
  player,
  profile,
  signedIn,
}: {
  player: PlayerState;
  profile: MyProfileResult | null | undefined;
  signedIn: boolean;
}) {
  const handle = profile?.player?.handle || player.handle || "Player";
  const xp = profile?.player?.xp ?? player.xp;
  const goalPoints = profile?.player?.goalPoints ?? player.goalPoints;
  const lvl = level(xp);
  const prog = levelProgress(xp);

  const localStats = useMemo<ProfileStats>(() => {
    const ledger = player.ledger ?? [];
    const goalEarned = ledger.reduce((sum, t) => sum + (t.goal && t.goal > 0 ? t.goal : 0), 0);
    const goalSpent = ledger.reduce((sum, t) => sum + (t.goal && t.goal < 0 ? -t.goal : 0), 0);
    return {
      accuracy: player.picks > 0 ? player.wins / player.picks : 0,
      longestStreak: player.bestStreak,
      roundsPlayed: player.picks,
      packsOpened: ledger.filter((t) => t.kind === "pack").length,
      goalEarned,
      goalSpent,
    };
  }, [player]);

  const stats = profile?.stats ?? localStats;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-volt/15">
            <GlossyIcon name="star" tint="volt" size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-extrabold text-chalk">{handle}</div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
              Level {lvl} · {goalPoints} GOAL
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-night">
          <div
            className="h-full rounded-full bg-volt transition-all"
            style={{ width: `${Math.round(prog * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
          {xp} XP · Level {lvl + 1} at {Math.round(prog * 100)}%
        </div>
      </div>

      {/* headline stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Accuracy" value={`${Math.round(stats.accuracy * 100)}%`} />
        <StatTile label="Best streak" value={String(stats.longestStreak)} />
        <StatTile label="Rounds" value={String(stats.roundsPlayed)} />
        <StatTile label="Packs opened" value={String(stats.packsOpened)} />
        <StatTile label="GOAL earned" value={String(stats.goalEarned)} />
        <StatTile label="GOAL spent" value={String(stats.goalSpent)} />
      </div>

      {/* badges */}
      <div>
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

      {/* activity feed */}
      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">Activity</h3>
        <div className="mt-2">
          {signedIn ? (
            profile === undefined ? (
              <div className="flex h-24 items-center justify-center rounded-2xl border border-line bg-surface">
                <div className="animate-pulse font-mono text-sm text-muted">Loading activity…</div>
              </div>
            ) : (
              <ActivityFeed rows={profile?.activity ?? []} />
            )
          ) : (
            <SignInGate />
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center">
      <div className="font-mono text-xl font-semibold text-volt">{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}

/** Only rendered when clerkOn is true (see ProfileGate/ProfileView above) —
 * SignInButton must never mount without a ClerkProvider in the tree. */
function SignInGate() {
  if (!clerkOn) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
        Sign-in isn&apos;t configured in this environment, so the activity feed is unavailable.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm text-chalk/90">Log in to see your activity feed.</p>
      <SignInButton mode="modal">
        <button className="mt-4 rounded-full bg-volt px-6 py-2.5 text-sm font-extrabold uppercase tracking-wide text-night transition-transform hover:scale-[1.02] active:translate-y-px">
          Log in
        </button>
      </SignInButton>
    </div>
  );
}
