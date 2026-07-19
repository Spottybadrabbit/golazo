"use client";

import Link from "next/link";
import { BallMark } from "@/components/SiteNav";
import AuthButton from "@/components/AuthButton";
import BottomTabs from "@/components/BottomTabs";

/** Shared chrome for app routes: slim sticky top bar + persistent bottom tabs. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <BallMark size={22} />
            <span className="font-extrabold tracking-tight">GOLAZO</span>
          </Link>
          <AuthButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5">{children}</main>
      <BottomTabs />
    </div>
  );
}
