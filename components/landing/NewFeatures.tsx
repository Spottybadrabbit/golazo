"use client";

// "Just shipped" promo section for the landing page — showcases the newest
// features (instant bet settlement + the autonomous Touchline hedge, plus the
// global/group sweepstakes). Uses two Golo mascot animations (hero close-up +
// card/celebration), glossy icons, and the volt design language. Falls back to
// a static mascot image under reduced-motion.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import GlossyIcon, { type GlossyIconProps } from "@/components/icons/GlossyIcons";

interface Feature {
  icon: GlossyIconProps["name"];
  tint: GlossyIconProps["tint"];
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}

const FEATURES: Feature[] = [
  {
    icon: "bolt",
    tint: "volt",
    kicker: "New · Payouts",
    title: "Instant settlement",
    body: "The second a match ends, every bet grades itself and pays out — stake × odds, straight to your balance. No waiting, no manual claims.",
    href: "/wallet",
    cta: "See your wallet",
  },
  {
    icon: "shield",
    tint: "cyan",
    kicker: "New · Risk engine",
    title: "Autonomous hedge",
    body: "Touchline watches the market, freezes stale or shocked odds, and fires a paper hedge on its own — every decision verified on Solana.",
    href: "/touchline",
    cta: "Open Touchline",
  },
  {
    icon: "trophy",
    tint: "gold",
    kicker: "New · Sweepstakes",
    title: "Global + group",
    body: "Climb the worldwide leaderboard and see exactly where you rank, or run an invite-only group with your mates. Two tabs, one game.",
    href: "/squad",
    cta: "Enter the board",
  },
];

export default function NewFeatures() {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div className="floodlight pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-5">
        {/* header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-night/70 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.22em] text-muted backdrop-blur-sm">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-volt" />
            Just shipped
          </p>
          <h2 className="text-4xl font-extrabold uppercase leading-[0.95] tracking-tighter md:text-6xl">
            Play the market,
            <br />
            <span className="text-volt">not just the match.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed text-muted">
            Real odds, an autonomous risk engine, and payouts that land the instant a
            match ends. Golo brought receipts.
          </p>
        </div>

        {/* mascot centerpiece + lead feature */}
        <div className="mt-14 grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative mx-auto w-full max-w-sm">
            {/* volt glow */}
            <div className="absolute inset-6 -z-10 rounded-full bg-volt/20 blur-3xl" />
            <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
              {reduced ? (
                <Image
                  src="/assets/golo-hero.png"
                  alt="Golo the pundit"
                  width={480}
                  height={600}
                  className="h-auto w-full object-contain"
                />
              ) : (
                <video
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="auto"
                  poster="/assets/golo-hero.png"
                  src="/assets/hf/golo-hero.mp4"
                  className="h-auto w-full object-contain"
                />
              )}
            </div>
            {/* floating card accent (2nd animation) */}
            <div className="absolute -bottom-5 -right-3 w-24 rotate-6 overflow-hidden rounded-2xl border border-volt/50 bg-night shadow-[0_10px_30px_rgba(175,255,0,0.25)] sm:w-28">
              {reduced ? (
                <Image src="/assets/card-bra.jpg" alt="" width={112} height={158} className="h-auto w-full object-cover" />
              ) : (
                <video
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="auto"
                  src="/assets/hf/golo-card.mp4"
                  className="h-auto w-full object-cover"
                />
              )}
            </div>
          </div>

          <div>
            <FeatureRow f={FEATURES[0]} big />
            <div className="mt-4 grid gap-4 sm:grid-cols-1">
              <FeatureRow f={FEATURES[1]} />
              <FeatureRow f={FEATURES[2]} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ f, big = false }: { f: Feature; big?: boolean }) {
  return (
    <Link
      href={f.href}
      className="group flex items-start gap-4 rounded-2xl border border-line bg-surface/80 p-5 backdrop-blur-sm transition-colors hover:border-volt/60 hover:bg-surface"
    >
      <span className="shrink-0 rounded-xl bg-night/60 p-2.5">
        <GlossyIcon name={f.icon} tint={f.tint} size={big ? 34 : 28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{f.kicker}</span>
        <span className={`mt-0.5 block font-extrabold tracking-tight ${big ? "text-2xl" : "text-lg"}`}>{f.title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{f.body}</span>
        <span className="mt-2 inline-flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider text-volt">
          {f.cta}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </span>
    </Link>
  );
}
