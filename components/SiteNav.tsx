"use client";

import Link from "next/link";
import AuthButton from "@/components/AuthButton";

/** Landing page top navigation. */
export default function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-night/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <BallMark />
          <span className="text-lg font-extrabold tracking-tight">GOLAZO</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-muted md:flex">
          <Link href="/play" className="transition-colors hover:text-chalk">
            Play
          </Link>
          <Link href="/squad" className="transition-colors hover:text-chalk">
            Squad
          </Link>
          <Link href="/pundit" className="transition-colors hover:text-chalk">
            PunditBot
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <AuthButton />
          <Link
            href="/play"
            className="hidden rounded-full bg-volt px-4 py-2 text-sm font-bold text-night transition-transform hover:scale-[1.03] active:translate-y-px md:block"
          >
            Start a streak
          </Link>
        </div>
      </nav>
    </header>
  );
}

/** Inline chalk ball monogram. */
export function BallMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" stroke="#F7F7F4" strokeWidth="2" />
      <path
        d="M13 8.2l4 3-1.6 4.8h-4.8L9 11.2l4-3z"
        fill="#AFFF00"
        stroke="#AFFF00"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
