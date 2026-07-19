"use client";

// Touchline top navigation — the terminal's title bar + section tabs.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_TIMELINE } from "@/lib/touchline/demo-timeline";
import { TL } from "./theme";

const LINKS = [
  { href: "/touchline", label: "Dashboard" },
  { href: `/touchline/match/${DEMO_TIMELINE.fixtureId}`, label: "Match" },
  { href: "/touchline/agent", label: "Agent" },
  { href: "/touchline/activity", label: "Activity" },
];

export function TouchlineNav() {
  const pathname = usePathname();
  return (
    <header
      className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur"
      style={{ borderColor: "var(--tl-line)", background: "rgba(10,12,16,0.82)" }}
    >
      <div className="flex items-center gap-3">
        <Link href="/touchline" className="flex items-baseline gap-2">
          <span className="font-mono font-semibold tracking-[0.22em]" style={{ fontSize: 15, color: TL.text }}>
            TOUCHLINE
          </span>
          <span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 9, color: TL.muted }}>
            Autonomous Market Intelligence
          </span>
        </Link>
      </div>
      <nav className="flex items-center gap-1">
        {LINKS.map((l) => {
          const active = l.href === "/touchline" ? pathname === "/touchline" : pathname.startsWith(l.href.split("/").slice(0, 3).join("/"));
          return (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-3 py-1.5 font-mono uppercase tracking-wider transition-colors"
              style={{
                fontSize: 11,
                color: active ? TL.bg : TL.muted,
                background: active ? TL.green : "transparent",
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
