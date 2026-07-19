"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Confetti from "@/components/Confetti";

// Duolingo-style celebration overlay for GOLAZO, in the volt design system.
// Fires a flashy full-screen pop — mascot walkout + big headline + stat tiles +
// confetti/burst — on goals, streak milestones, card unlocks, rewards, and
// activations. Call `useCelebrate()` anywhere under <CelebrationProvider>.

export type CelebrationKind =
  | "goal"
  | "streak"
  | "card"
  | "reward"
  | "bank"
  | "activation";

export interface CelebrationTile {
  label: string;
  value: string;
  icon?: string; // emoji
}

export interface CelebrationPayload {
  kind: CelebrationKind;
  title: string;
  subtitle?: string;
  tiles?: CelebrationTile[];
  tone?: "volt" | "cyan" | "legend"; // accent + intensity
  cta?: string; // dismiss button label
  autoMs?: number; // auto-dismiss delay (0 = manual only)
}

const KIND_DEFAULTS: Record<CelebrationKind, { emoji: string; tone: CelebrationPayload["tone"] }> = {
  goal: { emoji: "⚽️", tone: "volt" },
  streak: { emoji: "🔥", tone: "volt" },
  card: { emoji: "✦", tone: "legend" },
  reward: { emoji: "🎁", tone: "cyan" },
  bank: { emoji: "💰", tone: "volt" },
  activation: { emoji: "⚡️", tone: "cyan" },
};

const TONE_ACCENT: Record<NonNullable<CelebrationPayload["tone"]>, string> = {
  volt: "text-volt",
  cyan: "text-cyan",
  legend: "text-volt",
};

interface CelebrationCtx {
  celebrate: (p: CelebrationPayload) => void;
}
const Ctx = createContext<CelebrationCtx>({ celebrate: () => {} });
export const useCelebrate = () => useContext(Ctx).celebrate;

export default function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<CelebrationPayload | null>(null);
  const [burst, setBurst] = useState(0);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setShown(false);
    if (timer.current) clearTimeout(timer.current);
    // let the exit transition play before unmounting
    setTimeout(() => setPayload(null), 260);
  }, []);

  const celebrate = useCallback((p: CelebrationPayload) => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPayload(p);
    setShown(true);
    setBurst(Date.now());
    if (timer.current) clearTimeout(timer.current);
    const auto = p.autoMs ?? (reduced ? 2200 : 3600);
    if (auto > 0) timer.current = setTimeout(() => setShown(false), auto);
  }, []);

  // unmount shortly after hide
  useEffect(() => {
    if (!shown && payload) {
      const t = setTimeout(() => setPayload(null), 260);
      return () => clearTimeout(t);
    }
  }, [shown, payload]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <Ctx.Provider value={{ celebrate }}>
      {children}
      {payload && (
        <Overlay payload={payload} shown={shown} burst={burst} onDismiss={dismiss} />
      )}
    </Ctx.Provider>
  );
}

function Overlay({
  payload,
  shown,
  burst,
  onDismiss,
}: {
  payload: CelebrationPayload;
  shown: boolean;
  burst: number;
  onDismiss: () => void;
}) {
  const kd = KIND_DEFAULTS[payload.kind];
  const tone = payload.tone ?? kd.tone ?? "volt";
  const accent = TONE_ACCENT[tone];
  const legend = tone === "legend";

  return (
    <div
      role="dialog"
      aria-live="assertive"
      onClick={onDismiss}
      className={`fixed inset-0 z-[120] flex items-center justify-center px-6 transition-opacity duration-200 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* scrim + radial glow */}
      <div className="absolute inset-0 bg-night/85 backdrop-blur-sm" />
      <div
        className="absolute inset-0"
        style={{
          background:
            tone === "cyan"
              ? "radial-gradient(60% 45% at 50% 42%, rgba(0,212,255,0.22), transparent 60%)"
              : "radial-gradient(60% 45% at 50% 42%, rgba(175,255,0,0.22), transparent 60%)",
        }}
      />
      <Confetti burst={burst} />

      {/* content card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-sm text-center transition-transform duration-300 ${
          shown ? "translate-y-0 scale-100" : "translate-y-4 scale-95"
        }`}
      >
        {/* light burst behind the mascot */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <div
            className={`burst-beam h-64 w-40 ${legend ? "opacity-90" : "opacity-70"}`}
            style={{
              background:
                tone === "cyan"
                  ? "linear-gradient(to top, transparent, rgba(0,212,255,0.5))"
                  : "linear-gradient(to top, transparent, rgba(175,255,0,0.5))",
            }}
          />
        </div>

        <div className="relative mx-auto mb-4 w-40">
          <Image
            src="/assets/mascot-volt.jpg"
            alt="Golo celebrating"
            width={320}
            height={320}
            priority
            className="walkout mx-auto w-40 rounded-3xl"
          />
          <span className="absolute -right-1 -top-1 text-3xl">{kd.emoji}</span>
        </div>

        <h2
          className={`text-4xl font-extrabold uppercase leading-none tracking-tighter ${accent} sm:text-5xl`}
        >
          {payload.title}
        </h2>
        {payload.subtitle && (
          <p className="mt-3 text-sm leading-relaxed text-chalk/80">{payload.subtitle}</p>
        )}

        {payload.tiles && payload.tiles.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            {payload.tiles.map((t) => (
              <div
                key={t.label}
                className="rounded-2xl border border-line bg-surface p-3 text-center"
              >
                <div className={`font-mono text-xl font-semibold ${accent}`}>
                  {t.icon ? `${t.icon} ` : ""}
                  {t.value}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {t.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onDismiss}
          className="mt-6 w-full rounded-full bg-volt py-3.5 text-lg font-extrabold uppercase text-night transition-transform hover:scale-[1.02] active:translate-y-px"
        >
          {payload.cta ?? "Nice!"}
        </button>
      </div>
    </div>
  );
}
