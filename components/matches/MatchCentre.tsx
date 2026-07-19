"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import FootballScene from "@/components/FootballScene";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useFavorites, type FavoritesApi } from "@/lib/favorites";
import MerkleBadge from "@/components/MerkleBadge";
import type { LiveMatch } from "@/lib/live-map";

// Match Centre — LIVE ONLY. Every fixture, score, and odds line comes from the
// real TxODDS feed (Convex `feed.live`). Fixtures are bucketed by their real
// kickoff time into Live / Upcoming / Results, so the marquee is always the
// match that is actually next, never a hardcoded one. No simulator.

type Tab = "live" | "upcoming";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const isLive = (m: LiveMatch) => m.phase === "LIVE" || m.phase === "HT";
const isFinished = (m: LiveMatch) => m.phase === "FT";

function kickoffLabel(startTime: number | undefined, now: number): string {
  if (!startTime) return "TBD";
  const d = new Date(startTime);
  const day0 = new Date(startTime);
  day0.setHours(0, 0, 0, 0);
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const diff = Math.round((day0.getTime() - today0.getTime()) / 86_400_000);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Today · ${t}`;
  if (diff === 1) return `Tomorrow · ${t}`;
  if (diff === -1) return `Yesterday · ${t}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · ${t}`;
}

export default function MatchCentre() {
  const feed = useLiveFeed();
  const fav = useFavorites();
  const [tab, setTab] = useState<Tab>("live");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return <CentreLoading />;

  const matches = feed?.matches ?? [];
  if (!feed || feed.mode !== "live" || matches.length === 0) {
    return <AwaitingFeed />;
  }

  const featured = feed.featured ?? matches.find((m) => m.odds) ?? matches[0];
  const liveNow = matches.filter(isLive);
  const upcoming = matches
    .filter((m) => !isLive(m) && !isFinished(m))
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  const results = matches.filter(isFinished).sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));

  return (
    <div>
      <div className="mb-4 flex gap-2 rounded-full border border-line bg-surface p-1">
        <TabButton active={tab === "live"} onClick={() => setTab("live")}>
          {liveNow.length ? "Live now" : "Next up"}
        </TabButton>
        <TabButton active={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Upcoming
        </TabButton>
      </div>

      <Link
        href="/pundit"
        className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-bold text-chalk transition-colors hover:border-volt/50 hover:bg-volt/5 active:translate-y-px"
      >
        <span>🦜 Golo&apos;s takes</span>
        <span className="text-muted">→</span>
      </Link>

      {tab === "live" ? (
        <LiveView featured={featured} live={liveNow} results={results} now={now} fav={fav} />
      ) : (
        <UpcomingView upcoming={upcoming} now={now} fav={fav} />
      )}
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

/* ---------------- live / next featured match ---------------- */

function LiveView({
  featured,
  live,
  results,
  now,
  fav,
}: {
  featured: LiveMatch;
  live: LiveMatch[];
  results: LiveMatch[];
  now: number;
  fav: FavoritesApi;
}) {
  const m = featured;
  const liveState = isLive(m);
  const status = liveState
    ? m.phase === "HT"
      ? "HALF-TIME"
      : `LIVE ${m.minute}'`
    : isFinished(m)
      ? "FULL-TIME"
      : kickoffLabel(m.startTime, now).toUpperCase();

  const line = liveState
    ? `Golo here, live from ${m.home.name} v ${m.away.name}. Every tick counts — stay sharp.`
    : isFinished(m)
      ? `Full time. ${m.home.code} ${m.score[0]}-${m.score[1]} ${m.away.code}. What a watch.`
      : `Next up: ${m.home.name} v ${m.away.name}, ${kickoffLabel(m.startTime, now)}. Odds are live — get your call in.`;

  return (
    <div>
      {/* banner */}
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <Image
          src="/assets/pitch-dawn.jpg"
          alt="Stadium under the lights"
          width={2200}
          height={1229}
          priority
          className="h-48 w-full object-cover object-center sm:h-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <div className="flex items-center gap-2 font-mono text-xs text-chalk">
            <span
              className={`live-dot inline-block h-2 w-2 rounded-full ${liveState ? "bg-volt" : "bg-muted"}`}
            />
            {status}
          </div>
          <span className="rounded-full bg-volt px-3 py-1 font-mono text-[11px] font-bold text-night">
            {liveState ? "LIVE NOW" : "NEXT UP"}
          </span>
        </div>
        <span className="absolute left-4 top-4 rounded-full bg-night/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-chalk">
          {m.competition}
        </span>
        <StarButton
          active={fav.isFav(m.fixtureId)}
          onClick={() => fav.toggle(m.fixtureId)}
          className="absolute right-4 top-4 rounded-full bg-night/70 p-2"
        />
      </div>

      {/* scoreline */}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <Side flag={m.home.flag} code={m.home.code} name={m.home.name} />
          <div className="text-center">
            <div className="font-mono text-5xl font-semibold tracking-tight">
              {m.score[0]}
              <span className="text-muted"> : </span>
              {m.score[1]}
            </div>
            {m.odds ? (
              <div className="mt-1 font-mono text-[11px] text-muted">
                1X2 {m.odds.home.toFixed(2)} / {m.odds.draw.toFixed(2)} / {m.odds.away.toFixed(2)}
              </div>
            ) : (
              <div className="mt-1 font-mono text-[11px] text-muted">odds pending</div>
            )}
          </div>
          <Side flag={m.away.flag} code={m.away.code} name={m.away.name} right />
        </div>

        {m.probs ? (
          <>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-night">
              <div className="h-full bg-volt" style={{ width: `${m.probs.home}%` }} />
              <div className="h-full bg-muted/50" style={{ width: `${m.probs.draw}%` }} />
              <div className="h-full bg-cyan" style={{ width: `${m.probs.away}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
              <span>
                {m.home.code} {m.probs.home}%
              </span>
              <span>draw {m.probs.draw}%</span>
              <span>
                {m.away.code} {m.probs.away}%
              </span>
            </div>
          </>
        ) : (
          <p className="mt-5 text-center font-mono text-[11px] text-muted">
            Win probabilities open when the market prices this fixture.
          </p>
        )}
      </div>

      {/* Miracle Tree — live Merkle root over this fixture's real odds ticks */}
      <MerkleBadge fixtureId={m.fixtureId} />

      {/* real-only note: the free feed carries score + 1X2, not possession/shots */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile label="Home win" value={m.probs ? `${m.probs.home}%` : "—"} />
        <StatTile label="Score" value={`${m.score[0]}-${m.score[1]}`} />
        <StatTile label="Away win" value={m.probs ? `${m.probs.away}%` : "—"} accent />
      </div>

      {/* Golo commentary */}
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

      {/* other live matches */}
      {live.filter((x) => x.fixtureId !== m.fixtureId).length > 0 && (
        <Section title="Also live">
          {live
            .filter((x) => x.fixtureId !== m.fixtureId)
            .map((x) => (
              <FixtureRow key={x.fixtureId} m={x} now={now} live fav={fav} />
            ))}
        </Section>
      )}

      {/* results / previous matches */}
      <Section title="Recent results">
        {results.length ? (
          results.map((x) => <FixtureRow key={x.fixtureId} m={x} now={now} fav={fav} />)
        ) : (
          <p className="rounded-2xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
            No finished matches yet. As fixtures on the feed reach full-time, their real
            results land here.
          </p>
        )}
      </Section>
    </div>
  );
}

/* ---------------- upcoming: real fixtures by date + 3D hero ---------------- */

function UpcomingView({
  upcoming,
  now,
  fav,
}: {
  upcoming: LiveMatch[];
  now: number;
  fav: FavoritesApi;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

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
  }, [upcoming.length]);

  return (
    <div ref={rootRef}>
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
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-volt">Upcoming</p>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">
            {upcoming.length} fixture{upcoming.length === 1 ? "" : "s"} on the feed
          </h1>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {upcoming.length ? (
          upcoming.map((f, i) => (
            <FixtureRow key={f.fixtureId} m={f} now={now} featured={i === 0} fav={fav} />
          ))
        ) : (
          <p className="rounded-2xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
            No upcoming fixtures on the feed right now.
          </p>
        )}
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
        Streaks and squad pools open the moment each fixture kicks off on the TxLINE feed.
      </p>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function FixtureRow({
  m,
  now,
  featured,
  live,
  fav,
}: {
  m: LiveMatch;
  now: number;
  featured?: boolean;
  live?: boolean;
  fav: FavoritesApi;
}) {
  const label = live
    ? m.phase === "HT"
      ? "HT"
      : `LIVE ${m.minute}'`
    : isFinished(m)
      ? "FT"
      : kickoffLabel(m.startTime, now);
  return (
    <Link
      href={`/play`}
      data-fx
      className={`flex items-center justify-between rounded-2xl border p-4 transition-colors ${
        featured
          ? "border-volt bg-volt/10 shadow-[0_0_24px_rgba(175,255,0,0.18)]"
          : "border-line bg-surface hover:border-volt/40"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] ${
            live ? "bg-volt text-night" : featured ? "bg-volt text-night" : "bg-night text-muted"
          }`}
        >
          {label}
        </span>
        <span className="truncate font-bold">
          {m.home.flag} {m.home.code}
          <span className="mx-1.5 font-mono text-xs text-muted">
            {isFinished(m) || live ? `${m.score[0]}-${m.score[1]}` : "v"}
          </span>
          {m.away.code} {m.away.flag}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StarButton
          active={fav.isFav(m.fixtureId)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fav.toggle(m.fixtureId);
          }}
        />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {m.competition}
        </span>
      </div>
    </Link>
  );
}

function StarButton({
  active,
  onClick,
  className,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      className={`z-10 shrink-0 transition-transform active:scale-90 ${className ?? ""}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.7l2.9 6.6 7.1.62-5.4 4.77 1.62 7-6.22-3.78-6.22 3.78 1.62-7-5.4-4.77 7.1-.62z"
          fill={active ? "#AFFF00" : "none"}
          stroke={active ? "#AFFF00" : "#9A9A92"}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
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

function CentreLoading() {
  return (
    <div className="flex h-72 items-center justify-center">
      <div className="animate-pulse font-mono text-sm text-muted">Loading the feed…</div>
    </div>
  );
}

function AwaitingFeed() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-8 text-center">
      <Image
        src="/assets/mascot-volt.jpg"
        alt="Golo waiting"
        width={72}
        height={72}
        className="bob mx-auto rounded-2xl"
      />
      <h2 className="mt-4 text-xl font-extrabold uppercase tracking-tight">Awaiting the feed</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        No live TxODDS fixtures are streaming right now. The moment the feed prices a match, it
        shows up here — real scores, real odds, no filler.
      </p>
    </div>
  );
}
