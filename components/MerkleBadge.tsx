"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";

// "Miracle Tree" badge — shows the live SHA-256 Merkle root committed over this
// fixture's real odds-tick history (convex/merkle.ts, recomputed every 5 min).
// A tamper-evident, on-chain-style commitment to the feed data. Auth-free query;
// renders nothing until a root exists.

const convexOn = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const getRootRef = makeFunctionReference<"query">("merkleStore:getRoot");

interface RootRow {
  root: string;
  leafCount: number;
  algo: string;
  computedAt: number;
}

function Inner({ fixtureId }: { fixtureId: number }) {
  const row = useQuery(getRootRef, { fixtureId }) as RootRow | null | undefined;
  if (!row || !row.root) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5">
      <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
        <span aria-hidden>🌳</span>
        <span className="font-semibold text-volt">Merkle-verified</span>
        <span className="text-muted">· {row.leafCount} ticks</span>
      </span>
      <span
        className="truncate font-mono text-[11px] text-muted"
        title={`${row.algo}: ${row.root}`}
      >
        {row.root.slice(0, 10)}…{row.root.slice(-6)}
      </span>
    </div>
  );
}

export default function MerkleBadge({ fixtureId }: { fixtureId: number }) {
  if (!convexOn) return null;
  return <Inner fixtureId={fixtureId} />;
}
