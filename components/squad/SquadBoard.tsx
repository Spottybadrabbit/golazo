"use client";

import { useState } from "react";
import Image from "next/image";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useCelebrate } from "@/components/celebrate/Celebration";

// Sweepstakes groups: create a group (work/friends/random), get a shareable
// invite link, and let whoever joins make their pick on the live featured
// match. Real Convex data only — an empty pool (just the owner) is a fine,
// honest state; there are no fabricated members. `pools`/`poolMembers` are
// defined in convex/schema.ts; the functions live in convex/pools.ts (a fresh
// module, so referenced by string here rather than the generated `api` —
// same pattern LiveDataProvider uses for `feed:live`).

const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const createPoolRef = makeFunctionReference<"mutation">("pools:createPool");
const setPickRef = makeFunctionReference<"mutation">("pools:setPick");
const getByInviteRef = makeFunctionReference<"query">("pools:getByInvite");
const myPoolsRef = makeFunctionReference<"query">("pools:myPools");

type Kind = "work" | "friends" | "random";
type Pick = "home" | "draw" | "away";

const KIND_LABELS: Record<Kind, string> = { work: "Work", friends: "Friends", random: "Random" };

interface PoolSummary {
  _id: string;
  inviteCode: string;
  name: string;
  kind: Kind | "public";
  fixtureId?: number;
  competition?: string;
  memberCount: number;
  createdAt: number;
  myRole: "owner" | "member";
  myPick?: string;
}

interface MemberPreview {
  handle: string;
  role: "owner" | "member";
  pick?: string;
}

export default function SquadBoard() {
  if (!convexOn) {
    return (
      <EmptyCard
        title="Sweepstakes"
        body="The live backend isn't configured in this environment, so groups can't be created or joined here yet."
      />
    );
  }
  return <SweepstakesGate />;
}

/** Only renders Clerk hooks when a ClerkProvider is actually mounted (see
 * OnboardingGate/BetSlip for the same guard against the same crash). */
function SweepstakesGate() {
  if (!clerkOn) {
    return (
      <EmptyCard
        title="Sweepstakes"
        body="Sign-in isn't configured in this environment yet, so sweepstakes groups are unavailable."
      />
    );
  }
  return <SweepstakesAuthed />;
}

function SweepstakesAuthed() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-line bg-surface">
        <div className="animate-pulse font-mono text-sm text-muted">Loading sweepstakes…</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-volt">Sweepstakes</p>
        <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tighter">
          Log in to enter
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted">
          Log in with your Solana wallet to create a group or join one with an invite link.
        </p>
        <SignInButton mode="modal">
          <button className="mt-6 rounded-full bg-volt px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-night transition-transform hover:scale-[1.02] active:translate-y-px">
            Log in
          </button>
        </SignInButton>
      </div>
    );
  }

  return <SweepstakesBoard />;
}

function SweepstakesBoard() {
  const feed = useLiveFeed();
  const featured = feed?.featured ?? null;
  const celebrate = useCelebrate();

  const myPools = useQuery(myPoolsRef) as PoolSummary[] | undefined;
  const createPool = useMutation(createPoolRef);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("friends");

  // Default to the most recently created group until the viewer picks another.
  const effectiveId = selectedId ?? myPools?.[0]?._id ?? null;
  const selected = myPools?.find((p) => p._id === effectiveId) ?? null;

  const submitCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { poolId } = await createPool({
        name: name.trim(),
        kind,
        fixtureId: featured?.fixtureId,
        competition: featured?.competition,
      });
      setName("");
      setSelectedId(poolId as string);
      celebrate({
        kind: "activation",
        title: "GROUP CREATED!",
        subtitle: `${KIND_LABELS[kind]} sweepstakes ready — share the link to fill it up.`,
        cta: "Nice",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that group — try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* header */}
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <Image
          src="/assets/trophy.jpg"
          alt="Sweepstake trophy"
          width={1200}
          height={800}
          priority
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Sweepstakes</h1>
            <p className="font-mono text-xs text-muted">create a group, share the link, make your pick</p>
          </div>
          {myPools && (
            <div className="sm:text-right">
              <div className="font-mono text-2xl font-semibold">{myPools.length}</div>
              <div className="font-mono text-[11px] text-muted">groups you&apos;re in</div>
            </div>
          )}
        </div>
      </div>

      {/* create a group */}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">Create a group</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Office sweepstake"
          className="mt-3 w-full rounded-xl border border-line bg-night px-3.5 py-2.5 text-sm text-chalk placeholder:text-muted/50 outline-none focus:border-volt/60"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                kind === k ? "border-volt bg-volt/15 text-volt" : "border-line text-muted hover:text-chalk"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {featured && (
          <p className="mt-3 font-mono text-[11px] text-muted">
            Anchored to {featured.home.code} v {featured.away.code} · {featured.competition}
          </p>
        )}
        {error && <p className="mt-3 font-mono text-xs text-down">{error}</p>}
        <button
          onClick={submitCreate}
          disabled={!name.trim() || creating}
          className={`mt-4 w-full rounded-xl py-3.5 text-sm font-extrabold uppercase tracking-wide transition-transform active:translate-y-px ${
            name.trim() && !creating
              ? "bg-volt text-night hover:scale-[1.01]"
              : "cursor-not-allowed bg-line text-muted"
          }`}
        >
          {creating ? "Creating…" : "Create group"}
        </button>
      </div>

      {/* my groups */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          Your groups
        </div>
        {!myPools ? (
          <div className="animate-pulse px-4 py-8 text-center font-mono text-sm text-muted">
            Loading…
          </div>
        ) : myPools.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-sm text-muted">
            No groups yet — create one above, or join one with an invite link.
          </div>
        ) : (
          myPools.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelectedId(p._id)}
              className={`flex w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-0 transition-colors ${
                effectiveId === p._id ? "bg-volt/10" : "hover:bg-night/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">{p.name}</span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                  {KIND_LABELS[p.kind as Kind] ?? p.kind} · {p.memberCount}{" "}
                  {p.memberCount === 1 ? "member" : "members"}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-volt">
                {p.myRole}
              </span>
            </button>
          ))
        )}
      </div>

      {selected && <PoolDetail pool={selected} />}
    </div>
  );
}

function PoolDetail({ pool }: { pool: PoolSummary }) {
  const detail = useQuery(getByInviteRef, { inviteCode: pool.inviteCode }) as
    | { pool: PoolSummary; members: MemberPreview[] }
    | null
    | undefined;
  const setPick = useMutation(setPickRef);
  const feed = useLiveFeed();
  const celebrate = useCelebrate();
  const [copied, setCopied] = useState(false);
  const [busyPick, setBusyPick] = useState<Pick | null>(null);
  const [error, setError] = useState<string | null>(null);

  const featured = feed?.featured ?? null;
  const anchored =
    feed?.matches.find((m) => m.fixtureId === pool.fixtureId) ??
    (featured?.fixtureId === pool.fixtureId ? featured : null);

  const link =
    typeof window !== "undefined" ? `${window.location.origin}/sweepstakes/join/${pool.inviteCode}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code is still shown for manual copy */
    }
  };

  const choosePick = async (pick: Pick) => {
    setBusyPick(pick);
    setError(null);
    try {
      await setPick({ poolId: pool._id, pick });
      celebrate({
        kind: "activation",
        title: "PICK LOCKED IN!",
        subtitle: `You're riding with ${pick.toUpperCase()} in ${pool.name}.`,
        cta: "Nice",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set that pick — try again.");
    } finally {
      setBusyPick(null);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold tracking-tight">{pool.name}</h3>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-muted">
          {KIND_LABELS[pool.kind as Kind] ?? pool.kind}
        </span>
      </div>

      {/* shareable invite link */}
      <div className="mt-4 rounded-xl border border-line bg-night/50 p-3.5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Shareable invite link
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-chalk">{link || "…"}</code>
          <button
            onClick={copyLink}
            className="shrink-0 rounded-full border border-volt/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase text-volt transition-colors hover:bg-volt/10 active:translate-y-px"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-muted">
          Invite code: <span className="text-chalk">{pool.inviteCode}</span>
        </div>
      </div>

      {/* anchored match + your pick */}
      <div className="mt-4">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {anchored ? "Make your pick" : "Anchored match"}
        </div>
        {anchored ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["home", "draw", "away"] as Pick[]).map((p) => {
              const label = p === "home" ? anchored.home.code : p === "away" ? anchored.away.code : "Draw";
              const active = pool.myPick === p;
              return (
                <button
                  key={p}
                  onClick={() => choosePick(p)}
                  disabled={busyPick !== null}
                  className={`rounded-xl border-2 py-3 text-center transition-all active:translate-y-px ${
                    active ? "border-volt bg-volt/15" : "border-line bg-night/40 hover:border-volt/40"
                  }`}
                >
                  <div className="text-sm font-extrabold text-chalk">{label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
                    {busyPick === p ? "Setting…" : p}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 font-mono text-xs text-muted">
            {pool.competition
              ? `${pool.competition} — the anchored fixture isn't on the live feed right now.`
              : "No live match was anchored when this group was created."}
          </p>
        )}
        {error && <p className="mt-2 font-mono text-xs text-down">{error}</p>}
      </div>

      {/* members */}
      <div className="mt-5">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Members ({detail?.members.length ?? pool.memberCount})
        </div>
        <div className="mt-2 divide-y divide-line/60">
          {(detail?.members ?? []).map((m, i) => (
            <div key={`${m.handle}-${i}`} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-sm font-semibold">
                {m.handle}
                {m.role === "owner" && (
                  <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-volt">
                    owner
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs uppercase text-muted">
                {m.pick ?? "no pick yet"}
              </span>
            </div>
          ))}
          {!detail && (
            <div className="py-4 text-center font-mono text-xs text-muted">Loading members…</div>
          )}
        </div>
      </div>
    </div>
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
