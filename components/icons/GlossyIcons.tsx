// Glossy, toy-3D icon set in the GOLAZO palette. Each icon is a self-contained
// SVG with layered gradients, a soft floor shadow, and a top gloss highlight so
// it reads like a moulded plastic charm rather than a flat line glyph — the
// "collectible" language for badges, pack rewards, and section markers.

import type { ReactNode } from "react";

type GlossyName = "trophy" | "crown" | "ball" | "boot" | "flame" | "star" | "shield" | "bolt";

const TINTS: Record<string, [string, string, string]> = {
  // [highlight, mid, shadow]
  volt: ["#e8ffb0", "#afff00", "#5f8a00"],
  gold: ["#fff2b8", "#ecc24c", "#8a6410"],
  cyan: ["#c7f4ff", "#00d4ff", "#0a6f88"],
  ember: ["#ffcbab", "#ff6b35", "#8f3413"],
  chalk: ["#ffffff", "#d9d9d2", "#7d7d75"],
};

export type GlossyTint = keyof typeof TINTS;

export interface GlossyIconProps {
  name: GlossyName;
  tint?: GlossyTint;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * A single glossy icon. `tint` keys into the brand ramp; `name` picks the form.
 */
export default function GlossyIcon({
  name,
  tint = "volt",
  size = 56,
  className,
  title,
}: GlossyIconProps) {
  const [hi, mid, lo] = TINTS[tint];
  const uid = `g-${name}-${tint}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.5" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
        <radialGradient id={`${uid}-gloss`} cx="0.35" cy="0.25" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2.2" floodColor={lo} floodOpacity="0.55" />
        </filter>
      </defs>

      {/* floor shadow */}
      <ellipse cx="32" cy="57" rx="15" ry="3.4" fill="#000000" opacity="0.35" />

      <g filter={`url(#${uid}-soft)`}>
        <Shape name={name} bodyId={`${uid}-body`} glossId={`${uid}-gloss`} accent={mid} deep={lo} />
      </g>
    </svg>
  );
}

function Shape({
  name,
  bodyId,
  glossId,
  accent,
  deep,
}: {
  name: GlossyName;
  bodyId: string;
  glossId: string;
  accent: string;
  deep: string;
}): ReactNode {
  const body = `url(#${bodyId})`;
  const gloss = `url(#${glossId})`;

  switch (name) {
    case "trophy":
      return (
        <>
          <path
            d="M20 12h24v8c0 9-5.4 15-12 15S20 29 20 20v-8Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.2"
          />
          <path d="M20 14h-6v4c0 5 3 8 7 8" stroke={deep} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M44 14h6v4c0 5-3 8-7 8" stroke={deep} strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="29" y="34" width="6" height="8" fill={body} stroke={deep} strokeWidth="1" />
          <path d="M22 44h20l-2 6H24l-2-6Z" fill={body} stroke={deep} strokeWidth="1.2" />
          <path d="M24 14h16v6c0 6-3.4 10-8 10s-8-4-8-10v-6Z" fill={gloss} />
        </>
      );
    case "crown":
      return (
        <>
          <path
            d="M12 24l6 20h28l6-20-11 9-9-15-9 15-11-9Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect x="17" y="44" width="30" height="6" rx="2" fill={body} stroke={deep} strokeWidth="1.2" />
          <circle cx="12" cy="23" r="3" fill={accent} stroke={deep} strokeWidth="1" />
          <circle cx="52" cy="23" r="3" fill={accent} stroke={deep} strokeWidth="1" />
          <circle cx="32" cy="17" r="3" fill={accent} stroke={deep} strokeWidth="1" />
          <path d="M14 26l5 14h26l5-14-9 7-9-12-9 12-9-7Z" fill={gloss} />
        </>
      );
    case "ball":
      return (
        <>
          <circle cx="32" cy="32" r="20" fill={body} stroke={deep} strokeWidth="1.4" />
          <path
            d="M32 20l7 5-3 8h-8l-3-8 7-5Z"
            fill={deep}
            opacity="0.9"
          />
          <path d="M20 30l6 3M44 30l-6 3M26 44l2-6M38 44l-2-6" stroke={deep} strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="26" cy="25" rx="8" ry="5" fill={gloss} />
        </>
      );
    case "boot":
      return (
        <>
          <path
            d="M14 24c8 0 10 4 16 6s14 2 18 6c3 2.6 2 8-2 8H16c-2 0-3-1.6-3-4l1-22Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M16 46h34" stroke={deep} strokeWidth="3" strokeLinecap="round" />
          <circle cx="22" cy="49" r="2" fill={deep} />
          <circle cx="30" cy="49" r="2" fill={deep} />
          <circle cx="38" cy="49" r="2" fill={deep} />
          <path d="M15 26c7 0.5 9 3.6 15 5.6" stroke={gloss} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "flame":
      return (
        <>
          <path
            d="M32 8c5 8 14 12 14 24a14 14 0 1 1-28 0c0-6 3-9 5-12 1 3 3 4 5 4-2-6 0-12 4-16Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.4"
          />
          <path
            d="M32 30c2.6 3 5 5 5 9a5 5 0 1 1-10 0c0-2.4 1.4-3.6 2.4-5 .8 1.2 1.6 1.4 2.6 1.4-1-2.4 0-4 0-5.4Z"
            fill={deep}
            opacity="0.55"
          />
          <path d="M30 14c-3 4-5 7-5 12 0 3 1.4 5 3 6-1-6 0-13 2-18Z" fill={gloss} />
        </>
      );
    case "star":
      return (
        <>
          <path
            d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2 7-15Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M32 14l4.5 9.6 10.5 1.4-7.8 7 1.6 9.4-8.8-5" fill={gloss} />
        </>
      );
    case "shield":
      return (
        <>
          <path
            d="M32 8l18 6v14c0 12-8 19-18 24-10-5-18-12-18-24V14l18-6Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M32 14v34c-7-4-12-9-12-18V17l12-3Z" fill={gloss} opacity="0.8" />
          <path d="M32 22l3 6 6 .8-4.4 4 1 6-5.6-3-5.6 3 1-6-4.4-4 6-.8 3-6Z" fill={deep} opacity="0.85" />
        </>
      );
    case "bolt":
      return (
        <>
          <path
            d="M36 6L16 36h12l-4 22 24-32H34l6-20Z"
            fill={body}
            stroke={deep}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M34 10L20 34h8" stroke={gloss} strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      );
  }
}

/** Convenience row of glossy icons used as a decorative "reward shelf" strip. */
export function GlossyShelf({ className }: { className?: string }) {
  const items: { name: GlossyName; tint: GlossyTint }[] = [
    { name: "crown", tint: "gold" },
    { name: "trophy", tint: "chalk" },
    { name: "ball", tint: "volt" },
    { name: "boot", tint: "ember" },
    { name: "star", tint: "cyan" },
  ];
  return (
    <div className={`flex items-end justify-center gap-3 sm:gap-5 ${className ?? ""}`}>
      {items.map((it, i) => (
        <div
          key={it.name}
          className={i === 2 ? "bob scale-125" : "bob opacity-90"}
          style={{ animationDelay: `${i * 0.24}s` }}
        >
          <GlossyIcon name={it.name} tint={it.tint} size={i === 2 ? 68 : 48} />
        </div>
      ))}
    </div>
  );
}
