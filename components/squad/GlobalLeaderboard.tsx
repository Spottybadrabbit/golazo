"use client";

import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { squadStandings, type SquadMember } from "@/lib/engine";

// GLOBAL tab of the squad/sweepstakes page: a worldwide leaderboard built
// from the deterministic squadStandings() generator (lib/engine) — same
// simulated world every signed-in-or-not visitor sees, so it needs no Convex
// data. When signed in, the viewer's derived handle is appended to the
// simulated squad so their own row is marked and ranked like everyone
// else's (same handle-derivation fallback as components/AuthButton.tsx).

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function GlobalLeaderboard() {
  if (!clerkOn) return <GlobalLeaderboardBody userHandle={null} />;
  return <GlobalLeaderboardGate />;
}

function GlobalLeaderboardGate() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-line bg-surface">
        <div className="animate-pulse font-mono text-sm text-muted">Loading leaderboard…</div>
      </div>
    );
  }

  const handle = isSignedIn
    ? user.username ||
      user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
      user.web3Wallets?.[0]?.web3Wallet?.slice(0, 6) ||
      "You"
    : null;

  return <GlobalLeaderboardBody userHandle={handle} />;
}

function GlobalLeaderboardBody({ userHandle }: { userHandle: string | null }) {
  const members = useMemo(
    () => squadStandings(Date.now(), userHandle ?? undefined),
    [userHandle],
  );
  const youRank = useMemo(() => {
    if (!userHandle) return 0;
    const i = members.findIndex((m) => m.isUser);
    return i === -1 ? 0 : i + 1;
  }, [members, userHandle]);

  return (
    <div>
      {youRank > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-volt/70 bg-volt/10 px-4 py-3 text-center">
          <span className="font-mono text-sm font-bold uppercase tracking-wide text-volt">
            You&apos;re #{youRank}
          </span>
          <span className="ml-1.5 font-mono text-xs text-muted">of {members.length} worldwide</span>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-[28px_1fr_60px_52px_44px] items-center gap-2 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted sm:grid-cols-[32px_1fr_70px_60px_50px]">
          <span>#</span>
          <span>Player</span>
          <span className="text-center">Teams</span>
          <span className="text-right">Goals</span>
          <span className="text-right">Pts</span>
        </div>
        <div className="max-h-[480px] divide-y divide-line/60 overflow-y-auto">
          {members.map((m, i) => (
            <LeaderboardRow key={`${m.handle}-${i}`} member={m} rank={i + 1} />
          ))}
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
        Points settle automatically as fixtures finish on the TxLINE feed: 3 for a win, 1 for a
        draw, plus goal difference as the tiebreak. No spreadsheets, no arguments.
      </p>
    </div>
  );
}

function LeaderboardRow({ member, rank }: { member: SquadMember; rank: number }) {
  const isTop = rank === 1;
  return (
    <div
      className={`grid grid-cols-[28px_1fr_60px_52px_44px] items-center gap-2 px-4 py-3 sm:grid-cols-[32px_1fr_70px_60px_50px] ${
        isTop ? "bg-volt/15" : member.isUser ? "bg-volt/5" : ""
      }`}
    >
      <span className={`font-mono text-sm font-bold ${isTop ? "text-volt" : "text-muted"}`}>
        {rank}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-chalk">
        {member.handle}
        {member.isUser && (
          <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-volt">
            you
          </span>
        )}
      </span>
      <span className="text-center text-sm" title={`${member.teams[0].name}, ${member.teams[1].name}`}>
        {member.teams[0].flag} {member.teams[1].flag}
      </span>
      <span className="text-right font-mono text-xs text-muted">{member.goals}</span>
      <span className={`text-right font-mono text-sm font-extrabold ${isTop ? "text-volt" : "text-chalk"}`}>
        {member.points}
      </span>
    </div>
  );
}
