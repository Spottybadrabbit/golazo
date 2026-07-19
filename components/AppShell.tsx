"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BallMark } from "@/components/SiteNav";
import AuthButton from "@/components/AuthButton";
import BottomTabs from "@/components/BottomTabs";

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/matches", label: "Matches" },
  { href: "/cards", label: "Cards" },
  { href: "/squad", label: "Squad" },
  { href: "/pundit", label: "Pundit" },
];

/**
 * Shared chrome for app routes: a sticky top bar carrying the logo + a
 * persistent horizontal menu (desktop) and the account control, plus the
 * thumb-first bottom tabs (mobile). The menu is present on every page.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <BallMark size={22} />
            <span className="font-extrabold tracking-tight">GOLAZO</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-volt/15 text-volt"
                      : "text-muted hover:bg-surface hover:text-chalk"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="shrink-0">
            <AuthButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5">{children}</main>
      <BottomTabs />
    </div>
  );
}
