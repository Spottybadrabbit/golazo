"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useCelebrate } from "@/components/celebrate/Celebration";

// The /sweepstakes/join/<code> invite landing page. Anyone with the link can
// preview the group (getByInvite needs no membership); joining requires
// signing in with Clerk. joinByInvite is idempotent, so the button always
// reads "Join this sweepstakes" — clicking it when you're already a member is
// a harmless no-op that just confirms you're in.

const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const getByInviteRef = makeFunctionReference<"query">("pools:getByInvite");
const joinByInviteRef = makeFunctionReference<"mutation">("pools:joinByInvite");

const KIND_LABELS: Record<string, string> = { work: "Work", friends: "Friends", random: "Random", public: "Public" };

interface PoolPreview {
  _id: string;
  inviteCode: string;
  name: string;
  kind: string;
  fixtureId?: number;
  competition?: string;
  memberCount: number;
}
interface MemberPreview {
  handle: string;
  role: "owner" | "member";
  pick?: string;
}

export default function JoinInvite({ code }: { code: string }) {
  if (!convexOn) {
    return (
      <EmptyCard
        title="Invite unavailable"
        body="The live backend isn't configured in this environment, so invite links don't resolve here yet."
      />
    );
  }
  return <JoinInviteCloud code={code} />;
}

function JoinInviteCloud({ code }: { code: string }) {
  const detail = useQuery(getByInviteRef, { inviteCode: code }) as
    | { pool: PoolPreview; members: MemberPreview[] }
    | null
    | undefined;
  const feed = useLiveFeed();

  if (detail === undefined) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-line bg-surface">
        <div className="animate-pulse font-mono text-sm text-muted">Loading invite…</div>
      </div>
    );
  }

  if (detail === null) {
    return (
      <EmptyCard
        title="Invite not found"
        body={`No sweepstakes group matches the code "${code}". Double-check the link.`}
      />
    );
  }

  const { pool, members } = detail;
  const anchored = feed?.matches.find((m) => m.fixtureId === pool.fixtureId) ?? null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-volt">You&apos;re invited</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{pool.name}</h1>
      <p className="mt-1 font-mono text-xs text-muted">
        {KIND_LABELS[pool.kind] ?? pool.kind} sweepstakes · {pool.memberCount}{" "}
        {pool.memberCount === 1 ? "member" : "members"}
      </p>

      {anchored ? (
        <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-line bg-night/50 p-4">
          <span className="flex items-center gap-1.5 font-bold">
            <span aria-hidden>{anchored.home.flag}</span>
            {anchored.home.code}
          </span>
          <span className="font-mono text-xs text-muted">vs</span>
          <span className="flex items-center gap-1.5 font-bold">
            {anchored.away.code}
            <span aria-hidden>{anchored.away.flag}</span>
          </span>
        </div>
      ) : pool.competition ? (
        <p className="mt-4 rounded-xl border border-line bg-night/50 p-4 text-center font-mono text-xs text-muted">
          Anchored to {pool.competition}
        </p>
      ) : null}

      {members.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Already in</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m, i) => (
              <span
                key={`${m.handle}-${i}`}
                className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-chalk"
              >
                {m.handle}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {clerkOn ? <JoinAction pool={pool} /> : <NotConfigured />}
      </div>
    </div>
  );
}

function JoinAction({ pool }: { pool: PoolPreview }) {
  const { isLoaded, isSignedIn } = useUser();
  const joinByInvite = useMutation(joinByInviteRef);
  const celebrate = useCelebrate();
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="text-center">
        <p className="mb-3 text-sm text-muted">Log in with your Solana wallet to join.</p>
        <SignInButton mode="modal">
          <button className="w-full rounded-full bg-volt py-3.5 text-sm font-extrabold uppercase tracking-wide text-night transition-transform hover:scale-[1.02] active:translate-y-px">
            Log in to join
          </button>
        </SignInButton>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="text-center">
        <p className="mb-3 font-mono text-sm text-volt">You&apos;re in! Head to the sweepstakes tab.</p>
        <Link
          href="/squad"
          className="block w-full rounded-full bg-volt py-3.5 text-center text-sm font-extrabold uppercase tracking-wide text-night transition-transform hover:scale-[1.02] active:translate-y-px"
        >
          Go to sweepstakes
        </Link>
      </div>
    );
  }

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinByInvite({ inviteCode: pool.inviteCode });
      setJoined(true);
      celebrate({
        kind: "activation",
        title: "YOU'RE IN!",
        subtitle: `Welcome to ${pool.name} — set your pick on the sweepstakes tab.`,
        cta: "Nice",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join that group — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {error && <p className="mb-3 font-mono text-xs text-down">{error}</p>}
      <button
        onClick={join}
        disabled={busy}
        className={`w-full rounded-full py-3.5 text-sm font-extrabold uppercase tracking-wide transition-transform active:translate-y-px ${
          busy ? "cursor-not-allowed bg-line text-muted" : "bg-volt text-night hover:scale-[1.02]"
        }`}
      >
        {busy ? "Joining…" : "Join this sweepstakes"}
      </button>
    </div>
  );
}

function NotConfigured() {
  return (
    <p className="text-center font-mono text-xs text-muted">
      Sign-in isn&apos;t configured in this environment yet.
    </p>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface p-8 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mx-auto mt-3 max-w-xs font-mono text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
