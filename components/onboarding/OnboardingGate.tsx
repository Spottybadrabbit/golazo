"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";
import { loadPlayer, savePlayer } from "@/lib/game";

// Duolingo-style gamified first-visit onboarding for GOLAZO, skinned in the
// volt design system. One decision per screen: welcome -> streak goal ->
// handle -> celebratory finish. Gated on a standalone `golazo.onboarded` key
// so game.ts stays untouched; only `handle` is written on completion.

const ONBOARDED_KEY = "golazo.onboarded";
const TOTAL_STEPS = 4;

interface Goal {
  id: string;
  name: string;
  streak: number;
  bonus: number;
  tag: string;
}

const GOALS: Goal[] = [
  { id: "casual", name: "Casual", streak: 3, bonus: 50, tag: "3-day streak" },
  { id: "regular", name: "Regular", streak: 5, bonus: 150, tag: "5-day streak" },
  { id: "committed", name: "Committed", streak: 7, bonus: 300, tag: "7-day streak" },
];

export default function OnboardingGate() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [burst, setBurst] = useState(0);

  // SSR-safe first-visit check: never read localStorage/window until mounted.
  useEffect(() => {
    setMounted(true);
    try {
      if (window.localStorage.getItem(ONBOARDED_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  // Lock page scroll behind the full-screen overlay while it's open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Fire the confetti when the finish screen appears.
  useEffect(() => {
    if (step === TOTAL_STEPS) setBurst(Date.now());
  }, [step]);

  if (!mounted || !open) return null;

  const goal = GOALS.find((g) => g.id === goalId) ?? null;

  function finishOnboarding() {
    try {
      savePlayer({ ...loadPlayer(), handle: handle.trim() });
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore storage failures — still close the overlay */
    }
    setOpen(false);
  }

  function skip() {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  const back = () => setStep((s) => Math.max(1, s - 1));
  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

  const showBar = step >= 2;
  const canBack = step >= 2;
  const canSkip = step <= 3;
  const pct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to GOLAZO"
      className="floodlight fixed inset-0 z-[110] overflow-y-auto bg-night text-chalk"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-8 pt-6">
        {/* header: back arrow · progress bar · skip */}
        <div className="flex h-9 items-center gap-3">
          <div className="flex w-9 shrink-0 justify-start">
            {canBack && (
              <button
                type="button"
                onClick={back}
                aria-label="Go back"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-chalk"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M15 5l-7 7 7 7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1">
            {showBar && (
              <div className="h-2.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-volt transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex w-12 shrink-0 justify-end">
            {canSkip && (
              <button
                type="button"
                onClick={skip}
                className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:text-chalk"
              >
                Skip
              </button>
            )}
          </div>
        </div>

        {/* step body */}
        {step === 1 && <Welcome onStart={next} />}
        {step === 2 && (
          <PickGoal selected={goalId} onSelect={setGoalId} onContinue={next} />
        )}
        {step === 3 && (
          <PickHandle value={handle} onChange={setHandle} onContinue={next} />
        )}
        {step === 4 && (
          <Finish handle={handle.trim()} goal={goal} burst={burst} onStart={finishOnboarding} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------- step 1 -------------------------------- */

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative mb-8">
          <div
            className="pointer-events-none absolute inset-0 -z-10 blur-2xl"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(175,255,0,0.22), transparent 70%)",
            }}
          />
          <Image
            src="/assets/mascot-volt.jpg"
            alt="Golo, the GOLAZO mascot"
            width={320}
            height={320}
            priority
            className="bob w-44 rounded-3xl border border-line"
          />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-volt">Kick off</p>
        <h1 className="mt-2 text-4xl font-extrabold uppercase leading-none tracking-tighter sm:text-5xl">
          Welcome to
          <br />
          <span className="text-volt">GOLAZO</span>
        </h1>
        <p className="mt-4 max-w-xs text-base leading-relaxed text-muted">
          Call the World Cup as it happens. Streaks, packs, glory.
        </p>
      </div>
      <PrimaryButton onClick={onStart}>Get started</PrimaryButton>
    </div>
  );
}

/* -------------------------------- step 2 -------------------------------- */

function PickGoal({
  selected,
  onSelect,
  onContinue,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-volt">Your goal</p>
        <h2 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tighter">
          Set your streak goal
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Commit to a run of match days. Bigger goals, bigger welcome bonus.
        </p>

        <div className="mt-6 space-y-3">
          {GOALS.map((g) => {
            const active = selected === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g.id)}
                aria-pressed={active}
                className={`flex w-full items-center justify-between rounded-2xl border p-5 text-left transition ${
                  active
                    ? "border-volt bg-volt/10 shadow-[0_0_24px_rgba(175,255,0,0.18)]"
                    : "border-line bg-surface hover:border-muted"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-lg font-extrabold uppercase tracking-tight">
                    {g.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-widest text-muted">
                    {g.tag}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono text-sm font-bold ${
                    active ? "text-volt" : "text-muted"
                  }`}
                >
                  +{g.bonus} GOAL
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <PrimaryButton onClick={onContinue} disabled={!selected}>
        Continue
      </PrimaryButton>
    </div>
  );
}

/* -------------------------------- step 3 -------------------------------- */

function PickHandle({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  const ok = value.trim().length > 0;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-volt">Your identity</p>
        <h2 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tighter">
          Pick your handle
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This is how you&apos;ll show up on the leaderboards and streak feed.
        </p>

        <label
          htmlFor="golazo-handle"
          className="mt-6 block font-mono text-[11px] uppercase tracking-widest text-muted"
        >
          Your handle
        </label>
        <div className="mt-2 flex items-center rounded-2xl border border-line bg-surface transition-colors focus-within:border-volt focus-within:ring-2 focus-within:ring-volt/40">
          <span className="pl-4 font-mono text-lg text-muted">@</span>
          <input
            id="golazo-handle"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={18}
            autoComplete="off"
            spellCheck={false}
            placeholder="GoloGoat"
            className="w-full bg-transparent px-2 py-4 text-lg font-bold text-chalk placeholder:text-muted/50 focus:outline-none"
          />
          <span className="pr-4 font-mono text-[11px] text-muted">{value.length}/18</span>
        </div>
      </div>
      <PrimaryButton onClick={onContinue} disabled={!ok}>
        Continue
      </PrimaryButton>
    </div>
  );
}

/* -------------------------------- step 4 -------------------------------- */

function Finish({
  handle,
  goal,
  burst,
  onStart,
}: {
  handle: string;
  goal: Goal | null;
  burst: number;
  onStart: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      <Confetti burst={burst} />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {/* light burst behind the mascot */}
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div
            className="burst-beam h-64 w-40 opacity-80"
            style={{ background: "linear-gradient(to top, transparent, rgba(175,255,0,0.5))" }}
          />
        </div>

        <div className="relative mb-6 w-40">
          <Image
            src="/assets/mascot-volt.jpg"
            alt="Golo celebrating"
            width={320}
            height={320}
            priority
            className="walkout mx-auto w-40 rounded-3xl border border-line"
          />
          <span className="absolute -right-1 -top-2 text-3xl" aria-hidden="true">
            ⚡️
          </span>
        </div>

        <h2 className="text-4xl font-extrabold uppercase leading-none tracking-tighter text-volt sm:text-5xl">
          You&apos;re in!
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your locker&apos;s ready. Time to call the tournament.
        </p>

        <div className="mt-6 w-full space-y-2 rounded-2xl border border-line bg-surface p-4 text-left">
          <RecapRow label="Handle" value={handle ? `@${handle}` : "—"} />
          <RecapRow label="Streak goal" value={goal ? goal.tag : "—"} />
          <RecapRow
            label="Welcome bonus"
            value={`+${goal ? goal.bonus : 0} GOAL`}
            accent
          />
        </div>
      </div>
      <PrimaryButton onClick={onStart}>Start playing</PrimaryButton>
    </div>
  );
}

function RecapRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <span
        className={`font-mono text-sm font-bold ${accent ? "text-volt" : "text-chalk"}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------- shared --------------------------------- */

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-8 w-full rounded-2xl bg-volt py-4 text-center text-lg font-extrabold uppercase tracking-tight text-night transition-transform hover:scale-[1.01] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
    >
      {children}
    </button>
  );
}
