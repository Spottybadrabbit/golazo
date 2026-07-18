"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import FootballScene from "@/components/FootballScene";
import { englandMatch, tomorrowFixtures, type Fixture, type MatchState } from "@/lib/engine";

type Tab = "today" | "tomorrow";

export default function MatchCentre() {
  const [tab, setTab] = useState<Tab>("today");
  return (
    <div>
      <div className="mb-4 flex gap-2 rounded-full border border-line bg-surface p-1">
        <TabButton active={tab === "today"} onClick={() => setTab("today")}>
          Today · Live
        </TabButton>
        <TabButton active={tab === "tomorrow"} onClick={() => setTab("tomorrow")}>
          Tomorrow
        </TabButton>
      </div>
      {tab === "today" ? <Today /> : <Tomorrow />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
        active ? "bg-volt text-night" : "text-muted hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- today: England live ---------------- */

function Today() {
  const [match, setMatch] = useState<MatchState | null>(null);
  useEffect(() => {
    const update = () => setMatch(englandMatch());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!match) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">Loading the big one...</div>
      </div>
    );
  }

  const last = match.events[match.events.length - 1];
  const line =
    match.phase === "LIVE"
      ? `Golo here, live from ${match.home.name} v ${match.away.name}. ${
          last?.type === "GOAL" ? "GOOOOL just now!" : "Pressure building, stay sharp."
        }`
      : `Full time. ${match.home.code} ${match.score[0]}-${match.score[1]} ${match.away.code}. What a watch.`;

  return (
    <div>
      {/* themed banner */}
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <Image
          src="/assets/match-eng.jpg"
          alt="England versus their rival under the lights"
          width={2200}
          height={1229}
          priority
          className="h-48 w-full object-cover object-top sm:h-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <div className="flex items-center gap-2 font-mono text-xs text-chalk">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
            {match.phase === "LIVE" ? `LIVE ${match.minute}'` : match.phase}
          </div>
          <span className="rounded-full bg-volt px-3 py-1 font-mono text-[11px] font-bold text-night">
            MATCH OF THE DAY
          </span>
        </div>
      </div>

      {/* scoreline */}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <Side flag={match.home.flag} code={match.home.code} name={match.home.name} />
          <div className="text-center">
            <div className="font-mono text-5xl font-semibold tracking-tight">
              {match.score[0]}
              <span className="text-muted"> : </span>
              {match.score[1]}
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted">
              1X2 {match.odds.home.toFixed(2)} / {match.odds.draw.toFixed(2)} /{" "}
              {match.odds.away.toFixed(2)}
            </div>
          </div>
          <Side flag={match.away.flag} code={match.away.code} name={match.away.name} right />
        </div>
        {/* probability split */}
        <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-night">
          <div className="h-full bg-volt" style={{ width: `${match.probs.home}%` }} />
          <div className="h-full bg-muted/50" style={{ width: `${match.probs.draw}%` }} />
          <div className="h-full bg-cyan" style={{ width: `${match.probs.away}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
          <span>{match.home.code} {match.probs.home}%</span>
          <span>draw {match.probs.draw}%</span>
          <span>{match.away.code} {match.probs.away}%</span>
        </div>
      </div>

      {/* live stat tiles */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile label="Possession" value={`${match.stats[0].possession}%`} />
        <StatTile label="Shots" value={`${match.stats[0].shots}-${match.stats[1].shots}`} />
        <StatTile label="Pressure" value={String(match.pressure)} accent />
      </div>

      {/* volt Golo commentary */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
        <Image
          src="/assets/mascot-volt.jpg"
          alt="Golo in his volt kit"
          width={56}
          height={56}
          className="bob rounded-xl"
        />
        <p className="text-sm leading-snug">{line}</p>
      </div>

      <Link
        href="/play"
        className="mt-4 block rounded-2xl bg-volt py-4 text-center font-extrabold uppercase text-night transition-transform hover:scale-[1.01] active:translate-y-px"
      >
        Call the next tick
      </Link>
    </div>
  );
}

function Side({
  flag,
  code,
  name,
  right,
}: {
  flag: string;
  code: string;
  name: string;
  right?: boolean;
}) {
  return (
    <div className={`flex flex-col ${right ? "items-end" : "items-start"}`}>
      <span className="text-3xl">{flag}</span>
      <span className="mt-1 text-lg font-extrabold tracking-tight">{code}</span>
      <span className="font-mono text-[10px] text-muted">{name}</span>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-center">
      <div className={`font-mono text-2xl font-semibold ${accent ? "text-volt" : ""}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}

/* ---------------- tomorrow: 3D football + fixtures ---------------- */

function Tomorrow() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFixtures(tomorrowFixtures());
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.to("[data-pitch]", {
        yPercent: 14,
        ease: "none",
        scrollTrigger: { trigger: "[data-hero3d]", start: "top top", end: "bottom top", scrub: 0.6 },
      });
      gsap.utils.toArray<HTMLElement>("[data-fx]").forEach((el, i) => {
        gsap.fromTo(
          el,
          { y: 30, opacity: 0.6 },
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 94%" },
            delay: (i % 6) * 0.03,
          },
        );
      });
    }, rootRef);
    return () => ctx.revert();
  }, [fixtures]);

  return (
    <div ref={rootRef}>
      {/* parallax 3D football hero */}
      <div
        data-hero3d
        className="relative h-72 overflow-hidden rounded-2xl border border-line sm:h-80"
      >
        <div data-pitch className="absolute inset-[-8%] will-change-transform">
          <Image
            src="/assets/pitch-dawn.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-night/10" />
        </div>
        <div className="absolute inset-0">
          <FootballScene />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-volt">Tomorrow</p>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">
            {fixtures.length} fixtures on the slate
          </h1>
        </div>
      </div>

      {/* fixtures list */}
      <div className="mt-4 space-y-3">
        {fixtures.map((f) => (
          <div
            key={f.fixtureId}
            data-fx
            className={`flex items-center justify-between rounded-2xl border p-4 ${
              f.featured
                ? "border-volt bg-volt/10 shadow-[0_0_24px_rgba(175,255,0,0.18)]"
                : "border-line bg-surface"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`rounded-md px-2 py-1 font-mono text-[11px] ${
                  f.featured ? "bg-volt text-night" : "bg-night text-muted"
                }`}
              >
                {f.time}
              </span>
              <span className="truncate font-bold">
                {f.home.flag} {f.home.code}
                <span className="mx-1.5 font-mono text-xs text-muted">v</span>
                {f.away.code} {f.away.flag}
              </span>
            </div>
            {f.featured ? (
              <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest text-volt">
                Headliner
              </span>
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                Grp {f.group}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
        Streaks and squad pools open the moment each fixture kicks off on the TxLINE feed.
      </p>
    </div>
  );
}
