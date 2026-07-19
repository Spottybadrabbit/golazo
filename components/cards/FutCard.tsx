"use client";

import { useRef } from "react";
import { statRows, type CardDef } from "@/lib/cards";

// A procedural FUT-style player card, rendered entirely from tokens — no photo
// asset required, so it stays razor-sharp at any size. The FIFA Ultimate Team
// language (corner rating, position, crest, name bar, six-stat grid, foil
// sheen) is recast in the GOLAZO palette: legend = volt-gold holo, rare =
// cyan steel, common = graphite.

interface RarityTheme {
  hi: string;
  mid: string;
  lo: string;
  glow: string;
  ink: string;
  sub: string;
  accent: string;
  holo: boolean;
  prism: boolean;
}

const THEMES: Record<string, RarityTheme> = {
  gold: {
    hi: "#fff6c8",
    mid: "#e9c65a",
    lo: "#7a5a12",
    glow: "rgba(175,255,0,0.42)",
    ink: "#1c1600",
    sub: "#5a4408",
    accent: "#afff00",
    holo: true,
    prism: true,
  },
  silver: {
    hi: "#f3f7f9",
    mid: "#b6c3cb",
    lo: "#525e67",
    glow: "rgba(200,222,232,0.30)",
    ink: "#0e161b",
    sub: "#3d4a53",
    accent: "#d7e6ee",
    holo: true,
    prism: false,
  },
  bronze: {
    hi: "#f3cda2",
    mid: "#bd7d46",
    lo: "#5a3619",
    glow: "rgba(199,133,74,0.30)",
    ink: "#241305",
    sub: "#6e4526",
    accent: "#e9ab68",
    holo: false,
    prism: false,
  },
};

export interface FutCardProps {
  card: CardDef;
  size?: "sm" | "lg";
  /** Pointer-tilt + sheen. Off for dense grids / reduced motion contexts. */
  interactive?: boolean;
  className?: string;
}

export default function FutCard({ card, size = "lg", interactive = true, className }: FutCardProps) {
  const t = THEMES[card.tier];
  const ref = useRef<HTMLDivElement>(null);
  const rows = statRows(card.stats);
  const left = rows.slice(0, 3);
  const right = rows.slice(3);
  const lg = size === "lg";

  const onMove = (e: React.PointerEvent) => {
    if (!interactive) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 12).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 14).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${((px + 0.5) * 100).toFixed(1)}%`);
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div
      className={`[perspective:1000px] ${className ?? ""}`}
      style={{ filter: `drop-shadow(0 18px 34px ${t.glow})` }}
    >
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={reset}
        className="relative aspect-[0.72] w-full select-none overflow-hidden rounded-[9%] transition-transform duration-200 ease-out [transform:rotateX(var(--rx,0))_rotateY(var(--ry,0))] [transform-style:preserve-3d]"
        style={{
          background: `linear-gradient(157deg, ${t.hi} 0%, ${t.mid} 46%, ${t.lo} 100%)`,
          boxShadow: `inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.35)`,
          border: `1px solid ${t.lo}`,
          color: t.ink,
          containerType: "inline-size",
        }}
      >
        {/* prismatic wash + moving sheen for higher rarities */}
        {t.prism && <span className="fut-prism pointer-events-none absolute inset-0" />}
        {t.holo && interactive && (
          <span className="fut-holo pointer-events-none absolute inset-0 overflow-hidden rounded-[9%]" />
        )}
        {/* engraved plate texture */}
        <span
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(0,0,0,0.6) 0 1px, transparent 1px 5px)",
          }}
        />

        {/* content */}
        <div className={`relative flex h-full flex-col ${lg ? "p-[7%]" : "p-[6%]"}`}>
          {/* top: rating block + crest medallion */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col items-center leading-none">
              <span className="font-extrabold tracking-tight" style={{ fontSize: lg ? "clamp(1.6rem,13cqw,3rem)" : "clamp(1rem,15cqw,1.6rem)" }}>
                {card.rating}
              </span>
              <span className="font-mono font-bold uppercase" style={{ fontSize: lg ? "clamp(.6rem,4.5cqw,1rem)" : "clamp(.5rem,5cqw,.7rem)" }}>
                {card.position}
              </span>
              <span className="mt-[6%] h-px w-[70%]" style={{ background: t.sub }} />
              <span className="mt-[6%]" style={{ fontSize: lg ? "clamp(1rem,7cqw,1.6rem)" : "clamp(.7rem,8cqw,1rem)" }} aria-hidden>
                {card.flag}
              </span>
            </div>

            {/* crest medallion — the "portrait" slot */}
            <div
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: lg ? "42%" : "44%",
                aspectRatio: "1",
                background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.55), ${t.mid} 55%, ${t.lo})`,
                boxShadow: `inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.4)`,
                border: `1px solid ${t.lo}`,
              }}
            >
              <PlayerSilhouette color={t.ink} />
              <span
                className="absolute bottom-[8%] font-mono font-bold uppercase leading-none"
                style={{ fontSize: "clamp(.4rem,4cqw,.7rem)", color: t.sub }}
              >
                {card.code}
              </span>
            </div>
          </div>

          {/* name bar */}
          <div className="mt-auto text-center">
            <div
              className="mx-auto mb-[3%] h-[2px] w-[80%]"
              style={{ background: `linear-gradient(90deg, transparent, ${t.sub}, transparent)` }}
            />
            <h3
              className="truncate font-extrabold uppercase tracking-wide"
              style={{ fontSize: lg ? "clamp(.85rem,8cqw,1.5rem)" : "clamp(.6rem,9cqw,.95rem)" }}
            >
              {card.name}
            </h3>
            <div
              className="mx-auto mt-[3%] h-[2px] w-[80%]"
              style={{ background: `linear-gradient(90deg, transparent, ${t.sub}, transparent)` }}
            />
          </div>

          {/* stat grid */}
          <div className="mt-[5%] grid grid-cols-2 gap-x-[10%] gap-y-[3%]">
            {[left, right].map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[6%]">
                {col.map(([label, val]) => (
                  <div key={label} className="flex items-baseline gap-[6%]">
                    <span
                      className="font-extrabold tabular-nums"
                      style={{ fontSize: lg ? "clamp(.75rem,6.5cqw,1.2rem)" : "clamp(.55rem,7cqw,.85rem)" }}
                    >
                      {val}
                    </span>
                    <span
                      className="font-mono font-semibold uppercase"
                      style={{ fontSize: lg ? "clamp(.55rem,4cqw,.8rem)" : "clamp(.45rem,4.5cqw,.6rem)", color: t.sub }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* footer wordmark */}
          <div className="mt-[5%] flex items-center justify-center gap-[3%]">
            <span
              className="inline-block h-[8px] w-[8px] rotate-45"
              style={{ background: t.accent, boxShadow: `0 0 8px ${t.accent}` }}
            />
            <span
              className="font-mono font-bold uppercase tracking-[0.3em]"
              style={{ fontSize: "clamp(.4rem,3.4cqw,.7rem)", color: t.sub }}
            >
              GOLAZO
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stylized footballer silhouette — the "player image" slot. No real-player
 * likeness is used; the tier color alone signals rarity (bust + ball reads
 * clearly even at the small `size="sm"` collection-grid scale). */
function PlayerSilhouette({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill={color}
      className="h-[64%] w-[64%]"
      style={{ filter: "drop-shadow(0 1px 1px rgba(255,255,255,0.35))" }}
      aria-hidden
    >
      {/* head */}
      <circle cx="50" cy="26" r="14" />
      {/* shoulders / torso bust */}
      <path d="M50 44c-16 0-27 10-27 26v4h54v-4c0-16-11-26-27-26z" />
      {/* ball at the feet, kept clear of the torso so it reads as a ball */}
      <circle cx="50" cy="88" r="9" />
    </svg>
  );
}
