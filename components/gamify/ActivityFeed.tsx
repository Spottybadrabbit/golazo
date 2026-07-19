"use client";

import { useState } from "react";
import Image from "next/image";
import GlossyIcon, { type GlossyIconProps } from "@/components/icons/GlossyIcons";

// Recent-actions feed for the Profile screen — Convex-only (activity rows
// only exist server-side), so ProfileView gates this behind sign-in and only
// ever passes real rows. Newest-first, icons + relative timestamps.

type GlossyName = GlossyIconProps["name"];

export interface ActivityRow {
  _id: string;
  kind: string;
  name: string;
  screen?: string;
  meta?: unknown;
  createdAt: number;
}

export default function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <EmptyFeed />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r._id} className="flex items-center gap-3 px-4 py-3">
          <GlossyIcon name={iconFor(r.kind)} tint={tintFor(r.kind)} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-chalk">{labelFor(r)}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {relTime(r.createdAt)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyFeed() {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center">
      {reducedMotion ? (
        <Image
          src="/assets/mascot-volt.jpg"
          alt="Golo"
          width={80}
          height={80}
          className="h-20 w-20 rounded-2xl object-cover opacity-90"
        />
      ) : (
        <video
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          src="/assets/golo/golo-kick.mp4"
          className="h-20 w-20 object-contain opacity-90"
        />
      )}
      <p className="text-sm text-muted">No activity yet — go make a call and it&apos;ll show up here.</p>
    </div>
  );
}

function iconFor(kind: string): GlossyName {
  switch (kind) {
    case "game":
      return "ball";
    case "reward":
      return "trophy";
    case "wallet":
      return "bolt";
    case "onboarding":
      return "star";
    case "celebration":
      return "flame";
    case "screen_view":
      return "shield";
    default:
      return "star";
  }
}

function tintFor(kind: string): GlossyIconProps["tint"] {
  switch (kind) {
    case "reward":
      return "gold";
    case "wallet":
      return "cyan";
    case "celebration":
      return "ember";
    default:
      return "volt";
  }
}

function labelFor(r: ActivityRow): string {
  switch (r.kind) {
    case "screen_view":
      return `Viewed ${r.name}`;
    case "game":
      return `Played ${r.name}`;
    case "reward":
      return `Reward: ${r.name}`;
    case "wallet":
      return `Wallet: ${r.name}`;
    case "onboarding":
      return `Onboarding: ${r.name}`;
    case "celebration":
      return `Celebrated: ${r.name}`;
    default:
      return r.name;
  }
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
