"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import HeroScene from "@/components/HeroScene";
import LiveTicker from "@/components/LiveTicker";
import SiteNav from "@/components/SiteNav";
import { CARDS } from "@/lib/cards";
import { useLiveWorld } from "@/lib/useLiveWorld";

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    // Lenis smooth scroll bridged into GSAP's ticker (no double rAF)
    const lenis = new Lenis({ autoRaf: false });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      // hero headline rises on mount (never viewport-gated)
      gsap.fromTo(
        "[data-hero-line]",
        { yPercent: 108 },
        { yPercent: 0, duration: 1.05, ease: "power4.out", stagger: 0.09, delay: 0.15 },
      );
      // stadium plate: slow settle + parallax against scroll
      gsap.fromTo(
        "[data-hero-plate]",
        { scale: 1.06 },
        { scale: 1, duration: 7, ease: "power1.out" },
      );
      gsap.to("[data-hero-plate]", {
        yPercent: 16,
        ease: "none",
        scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: 0.6 },
      });
      gsap.to("[data-hero-ball]", {
        yPercent: -12,
        ease: "none",
        scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: 0.6 },
      });
      // section headers slide up as they enter (transform only, screenshot-safe)
      gsap.utils.toArray<HTMLElement>("[data-rise]").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 56 },
          {
            y: 0,
            ease: "power3.out",
            duration: 0.9,
            scrollTrigger: { trigger: el, start: "top 88%" },
          },
        );
      });
      // card fan spreads open on scrub
      gsap.fromTo(
        "[data-fan-left]",
        { rotate: 0, xPercent: 0 },
        {
          rotate: -14,
          xPercent: -46,
          ease: "none",
          scrollTrigger: { trigger: "[data-fan]", start: "top 85%", end: "center 45%", scrub: 0.7 },
        },
      );
      gsap.fromTo(
        "[data-fan-right]",
        { rotate: 0, xPercent: 0 },
        {
          rotate: 14,
          xPercent: 46,
          ease: "none",
          scrollTrigger: { trigger: "[data-fan]", start: "top 85%", end: "center 45%", scrub: 0.7 },
        },
      );
      // pulse dial scales in on scrub
      gsap.fromTo(
        "[data-pulse-dial]",
        { scale: 0.82 },
        {
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: "[data-pulse]",
            start: "top 85%",
            end: "center center",
            scrub: 0.8,
          },
        },
      );
    }, rootRef);

    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={rootRef}>
      <SiteNav />
      <Hero />
      <LiveTicker />
      <HowItPlays />
      <StatBand />
      <CardsSection />
      <LivePulse />
      <SquadSection />
      <PunditSection />
      <FairData />
      <Footer />
    </div>
  );
}

/* ---------------- hero ---------------- */

function Hero() {
  return (
    <section data-hero className="relative flex min-h-dvh items-center overflow-hidden pt-16">
      <div data-hero-plate className="absolute inset-[-10%] will-change-transform">
        <Image
          src="/assets/stadium-volt.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-night via-night/70 to-night/25" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-night/70 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.22em] text-muted backdrop-blur-sm">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-volt" />
            World Cup 2026 · TxLINE feed
          </p>
          <h1 className="text-5xl font-extrabold uppercase leading-[0.95] tracking-tighter md:text-7xl">
            <span className="block overflow-hidden pb-1">
              <span data-hero-line className="block">
                Every tick is
              </span>
            </span>
            <span className="block overflow-hidden pb-1">
              <span data-hero-line className="block text-volt">
                a matchday.
              </span>
            </span>
          </h1>
          <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-muted">
            Live World Cup data becomes a game. Call the next stat, ride the streak, rip card
            packs, and drag your mates into a sweepstake.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/play"
              className="group relative overflow-hidden rounded-full bg-volt px-7 py-3.5 text-lg font-extrabold uppercase text-night shadow-[0_10px_34px_rgba(175,255,0,0.35)] transition-transform hover:scale-[1.04] active:translate-y-px"
            >
              <span className="relative z-10">Start a streak</span>
              <span className="absolute inset-0 -translate-x-full bg-volt-deep transition-transform duration-300 group-hover:translate-x-0" />
            </Link>
            <Link
              href="/pundit"
              className="rounded-full border border-chalk/40 px-6 py-3.5 font-bold text-chalk transition-colors hover:border-chalk hover:bg-chalk/10 active:translate-y-px"
            >
              Open PunditBot
            </Link>
          </div>
        </div>

        <div data-hero-ball className="relative h-[46vh] min-h-72 will-change-transform lg:h-[64vh]">
          <HeroScene />
        </div>
      </div>
    </section>
  );
}

/* ---------------- how it plays ---------------- */

const STEPS = [
  {
    n: "01",
    title: "Watch the tick",
    body: "Every few seconds the TxLINE feed drops a fresh snapshot: probabilities, possession, pressure.",
  },
  {
    n: "02",
    title: "Call it",
    body: "Higher or lower than right now? Lock your call before the next tick lands.",
  },
  {
    n: "03",
    title: "Ride the boost",
    body: "Streaks multiply your XP up to 5x. Bank a hot streak for GOAL points and spend them on packs.",
  },
];

function HowItPlays() {
  return (
    <section className="floodlight mx-auto max-w-6xl px-5 py-24 md:py-32">
      <div data-rise className="max-w-2xl">
        <h2 className="text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
          24 seconds of drama, all match long
        </h2>
      </div>
      <div className="mt-14 grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
        <ol className="space-y-9">
          {STEPS.map((s) => (
            <li key={s.n} data-rise className="flex gap-5">
              <span className="font-mono text-sm text-volt">{s.n}</span>
              <div>
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className="mt-1.5 max-w-[46ch] leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <DemoCard />
      </div>
    </section>
  );
}

function DemoCard() {
  const world = useLiveWorld();
  const m = world?.featured;
  return (
    <div data-rise className="relative">
      <div className="absolute -inset-3 rounded-3xl bg-volt/10 blur-2xl" aria-hidden="true" />
      <div className="relative rounded-3xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between font-mono text-xs text-muted">
          <span className="flex items-center gap-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
            {m ? `LIVE ${m.minute}'` : "LIVE"}
          </span>
          <span>{m ? `fixture ${m.fixtureId}` : "connecting"}</span>
        </div>
        <div className="mt-4 text-center">
          <div className="text-lg font-bold">
            {m
              ? `${m.home.flag} ${m.home.code}  ${m.score[0]} : ${m.score[1]}  ${m.away.code} ${m.away.flag}`
              : "Feed warming up"}
          </div>
          <div className="mt-5 font-mono text-6xl font-semibold tracking-tight">
            {m ? `${m.probs.home}%` : "50%"}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
            {m ? `${m.home.code} win probability` : "win probability"}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <span className="rounded-xl border-2 border-volt bg-volt/10 py-3 text-center font-extrabold">
            HIGHER ↑
          </span>
          <span className="rounded-xl border-2 border-cyan/70 bg-cyan/10 py-3 text-center font-extrabold">
            LOWER ↓
          </span>
        </div>
        <Link
          href="/play"
          className="mt-4 block text-center font-mono text-xs text-muted underline-offset-4 transition-colors hover:text-chalk hover:underline"
        >
          this card is live, the real thing awaits
        </Link>
      </div>
    </div>
  );
}

/* ---------------- stat band (energy-drink style) ---------------- */

const STATS = [
  {
    value: "5x",
    label: "Max streak boost",
    note: "Eight straight calls, five times the XP",
    color: "text-volt",
    rule: "bg-volt",
  },
  {
    value: "24s",
    label: "Round length",
    note: "One call every two feed ticks",
    color: "text-cyan",
    rule: "bg-cyan",
  },
  {
    value: "2%",
    label: "Platform fee",
    note: "On banked boosts and pool rakes, nothing else",
    color: "text-ember",
    rule: "bg-ember",
  },
];

function StatBand() {
  return (
    <section className="border-y border-line bg-[#101010]">
      <div className="mx-auto grid max-w-6xl gap-4 px-5 py-14 md:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} data-rise className="rounded-2xl border border-line bg-surface p-6">
            <div className={`font-mono text-5xl font-semibold tracking-tight ${s.color}`}>
              {s.value}
            </div>
            <div className="mt-2 font-bold">{s.label}</div>
            <p className="mt-1 font-mono text-xs leading-relaxed text-muted">{s.note}</p>
            <div className={`mt-4 h-0.5 w-full rounded-full ${s.rule}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- cards ---------------- */

function CardsSection() {
  const fan = [CARDS[1], CARDS[0], CARDS[2]]; // BRA, ARG (center), FRA
  return (
    <section data-fan className="mx-auto max-w-6xl overflow-hidden px-5 py-24 md:py-32">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className="relative mx-auto h-80 w-56 sm:h-96 sm:w-64">
          {fan.map((c, i) => (
            <div
              key={c.id}
              data-fan-left={i === 0 ? "" : undefined}
              data-fan-right={i === 2 ? "" : undefined}
              className={`absolute inset-0 overflow-hidden rounded-2xl border-2 will-change-transform ${
                i === 1
                  ? "card-shine z-10 border-volt shadow-[0_0_40px_rgba(175,255,0,0.3)]"
                  : "border-line"
              }`}
              style={{ transformOrigin: "50% 90%" }}
            >
              <Image src={c.art} alt={c.title} fill sizes="16rem" className="object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/70 to-transparent p-3">
                <div className="text-sm font-extrabold uppercase">{c.title}</div>
                <div className="font-mono text-[11px] uppercase text-muted">
                  {c.flag} {c.code}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div data-rise>
          <h2 className="text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
            Collect the whole summer
          </h2>
          <p className="mt-4 max-w-[50ch] leading-relaxed text-muted">
            Bank your streaks into GOAL points, rip open packs, chase the legends. Five cards in
            season one, odds printed on every pack.
          </p>
          <Link
            href="/cards"
            className="group mt-8 inline-flex items-center gap-3 rounded-xl border-2 border-volt/70 bg-volt/10 px-7 py-3.5 font-extrabold uppercase transition-all hover:bg-volt hover:text-night hover:shadow-[0_10px_30px_rgba(175,255,0,0.3)] active:translate-y-px"
          >
            Rip a pack
            <span className="transition-transform group-hover:rotate-12">✦</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- live pulse ---------------- */

function LivePulse() {
  const world = useLiveWorld();
  const m = world?.featured;
  return (
    <section data-pulse className="relative overflow-hidden py-24 md:py-32">
      <Image src="/assets/tifo.jpg" alt="" fill sizes="100vw" className="object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-b from-night via-night/60 to-night" />
      <div className="relative mx-auto max-w-6xl px-5">
        <div data-rise className="max-w-2xl">
          <h2 className="text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
            The market breathes. You can see it
          </h2>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-muted">
            Win probabilities, possession, and attack pressure reprice on every snapshot. No
            refresh button anywhere.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-line bg-surface/85 p-6 backdrop-blur-sm">
            {m ? (
              <>
                <ProbBar label={`${m.home.flag} ${m.home.name}`} value={m.probs.home} strong />
                <ProbBar label="Draw" value={m.probs.draw} />
                <ProbBar label={`${m.away.flag} ${m.away.name}`} value={m.probs.away} />
                <div className="mt-5 flex justify-between border-t border-line pt-4 font-mono text-xs text-muted">
                  <span>
                    possession {m.stats[0].possession} / {m.stats[1].possession}
                  </span>
                  <span>
                    xG {m.stats[0].xg.toFixed(2)} / {m.stats[1].xg.toFixed(2)}
                  </span>
                  <span>seq {m.sequence}</span>
                </div>
              </>
            ) : (
              <div className="animate-pulse py-16 text-center font-mono text-sm text-muted">
                Tuning into the feed...
              </div>
            )}
          </div>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-surface/85 p-6 text-center backdrop-blur-sm">
            <div
              data-pulse-dial
              className="font-mono text-7xl font-semibold tracking-tight text-volt"
            >
              {m ? m.pressure : 0}
            </div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted">
              attack pressure index
            </div>
            <p className="mt-4 max-w-[26ch] text-sm leading-relaxed text-muted">
              When this spikes, PunditBot starts typing.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProbBar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between">
        <span className={`text-sm ${strong ? "font-bold" : "text-muted"}`}>{label}</span>
        <span className="font-mono text-lg font-semibold">{value}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-night">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${strong ? "bg-volt" : "bg-muted/60"}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------- squad ---------------- */

function SquadSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 md:py-32">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div data-rise className="relative order-2 md:order-1">
          <Image
            src="/assets/trophy.jpg"
            alt="The sweepstake trophy under stadium lights"
            width={1200}
            height={800}
            className="rounded-3xl border border-line object-cover"
          />
          <div className="absolute bottom-4 left-4 rounded-xl border border-line bg-night/85 px-4 py-3 backdrop-blur-sm">
            <div className="font-mono text-xl font-semibold text-volt">80 USDC</div>
            <div className="font-mono text-[11px] text-muted">demo pool · 2% rake</div>
          </div>
        </div>
        <div data-rise className="order-1 md:order-2">
          <h2 className="text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
            The group chat sweepstake, minus the spreadsheet
          </h2>
          <p className="mt-4 max-w-[50ch] leading-relaxed text-muted">
            Everyone throws in, everyone gets nations from the hat, and the table settles itself
            from the feed while the match is still running. Winner takes the pot.
          </p>
          <Link
            href="/squad"
            className="group mt-8 inline-flex items-center gap-3 rounded-full border-2 border-chalk/50 px-7 py-3.5 font-extrabold uppercase transition-all hover:border-volt hover:bg-volt hover:text-night hover:shadow-[0_10px_30px_rgba(175,255,0,0.3)] active:translate-y-px"
          >
            Join the squad
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- pundit ---------------- */

function PunditSection() {
  const world = useLiveWorld();
  const latest = world?.featured.events.slice(-2) ?? [];
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 md:py-32">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div data-rise>
          <h2 className="text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
            A pundit in your pocket
          </h2>
          <p className="mt-4 max-w-[50ch] leading-relaxed text-muted">
            Golo watches every snapshot so you can watch the match. Goals, cards, sharp odds
            moves: he calls them in the app and in Telegram, with feelings.
          </p>
          <Link
            href="/pundit"
            className="group mt-8 inline-flex items-center gap-3 rounded-2xl rounded-bl-md bg-surface px-6 py-4 font-extrabold uppercase ring-1 ring-line transition-all hover:bg-raised hover:ring-volt/60 active:translate-y-px"
          >
            Open PunditBot
            <span className="flex gap-0.5" aria-hidden="true">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-volt" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-volt" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-volt" />
            </span>
          </Link>
        </div>
        <div data-rise className="relative">
          <Image
            src="/assets/mascot.jpg"
            alt="Golo the pundit parrot, headset on, mid broadcast"
            width={520}
            height={520}
            className="bob mx-auto w-64 rounded-3xl border border-line md:w-80"
          />
          <div className="absolute -left-2 top-6 max-w-56 rounded-2xl rounded-br-md border border-volt/50 bg-volt/15 px-4 py-2.5 text-sm backdrop-blur-sm md:left-0">
            {latest[latest.length - 1]
              ? `${latest[latest.length - 1].minute}' ${latest[latest.length - 1].detail}!`
              : "We are LIVE. Streaks are open!"}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- fair data ---------------- */

function FairData() {
  return (
    <section className="border-y border-line bg-[#101010]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-3">
        <div>
          <h3 className="font-bold uppercase">Verifiable data</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Scores and odds ride the TxLINE feed with Solana-anchored proofs, the same rails the
            trading desks use.
          </p>
        </div>
        <div>
          <h3 className="font-bold uppercase">Honest economics</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            GOLAZO takes 2% when you bank a boost or a pool settles. That is the whole business
            model, printed right here.
          </p>
        </div>
        <div>
          <h3 className="font-bold uppercase">Demo mode</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This build runs a simulated feed and play money. Flip TXLINE_MODE to live and the
            same engine rides the real one.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- footer ---------------- */

function Footer() {
  return (
    <footer className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-24 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted">
          104 matches · one summer · zero boring ticks
        </p>
        <h2 className="mt-4 text-5xl font-extrabold uppercase tracking-tighter md:text-7xl">
          Fancy a call?
        </h2>
        <Link
          href="/play"
          className="group relative mt-8 inline-block overflow-hidden rounded-full bg-volt px-9 py-4 text-xl font-extrabold uppercase text-night shadow-[0_10px_34px_rgba(175,255,0,0.35)] transition-transform hover:scale-[1.04] active:translate-y-px"
        >
          <span className="relative z-10">Start a streak</span>
          <span className="absolute inset-0 -translate-x-full bg-volt-deep transition-transform duration-300 group-hover:translate-x-0" />
        </Link>
        <div className="mt-20 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 font-mono text-[11px] text-muted md:flex-row">
          <span>GOLAZO · a TxLINE World Cup hackathon build</span>
          <span>simulated markets, play money, real adrenaline</span>
        </div>
      </div>
    </footer>
  );
}
