"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/play", label: "Play", icon: PlayIcon },
  { href: "/matches", label: "Matches", icon: MatchIcon },
  { href: "/cards", label: "Cards", icon: CardsIcon },
  { href: "/squad", label: "Sweeps", icon: SquadIcon },
  { href: "/pundit", label: "Pundit", icon: ChatIcon },
];

/**
 * The persistent bottom tab bar. Rendered on every surface — the app routes via
 * AppShell and the landing page directly — so the menu never disappears and you
 * can hop between sections or back home from anywhere.
 */
export default function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors ${
                active ? "text-chalk" : "text-muted hover:text-chalk"
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-volt" />}
              <Icon active={active} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function PlayIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8.5" stroke={active ? "#AFFF00" : "#9A9A92"} strokeWidth="2" strokeLinecap="round" />
      <path d="M11 6.8l3.2 2.4-1.3 3.8H9.1L7.8 9.2 11 6.8z" fill={active ? "#AFFF00" : "#9A9A92"} />
    </svg>
  );
}

function MatchIcon({ active }: { active: boolean }) {
  const c = active ? "#AFFF00" : "#9A9A92";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8.5" stroke={c} strokeWidth="2" />
      <path d="M11 4.2v13.6M4.2 11h13.6" stroke={c} strokeWidth="1.3" opacity="0.5" />
      <path d="M11 8.4l2.5 1.8-1 3h-3l-1-3L11 8.4z" fill={c} />
    </svg>
  );
}

function CardsIcon({ active }: { active: boolean }) {
  const c = active ? "#AFFF00" : "#9A9A92";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="8" y="4" width="9.5" height="13.5" rx="1.8" stroke={c} strokeWidth="2" transform="rotate(8 12.75 10.75)" />
      <rect x="4" y="4.5" width="9.5" height="13.5" rx="1.8" stroke={c} strokeWidth="2" fill="#0A0A0A" transform="rotate(-6 8.75 11.25)" />
      <circle cx="8.6" cy="11" r="2" fill={c} />
    </svg>
  );
}

function SquadIcon({ active }: { active: boolean }) {
  const c = active ? "#AFFF00" : "#9A9A92";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 18v-1.4c0-1.9 2.2-3.1 4.3-3.1s4.2 1.2 4.2 3.1V18" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <circle cx="8.2" cy="8.6" r="2.9" stroke={c} strokeWidth="2" />
      <path d="M14.6 13.7c1.9.2 3.9 1.3 3.9 3V18" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <circle cx="14.9" cy="8.9" r="2.4" stroke={c} strokeWidth="2" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  const c = active ? "#AFFF00" : "#9A9A92";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 016.5 4h9A2.5 2.5 0 0118 6.5v6a2.5 2.5 0 01-2.5 2.5H9l-3.6 3v-3H6.5A2.5 2.5 0 014 12.5v-6z"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="8.4" cy="9.6" r="1" fill={c} />
      <circle cx="11.2" cy="9.6" r="1" fill={c} />
      <circle cx="14" cy="9.6" r="1" fill={c} />
    </svg>
  );
}
