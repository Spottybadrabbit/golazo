"use client";

import { useEffect, useRef, useState } from "react";

// GOLAZO loading splash — Golo walks out on first load of the session, then
// fades into the app. Shown once per browser session (sessionStorage) so it
// stays a delight, not a toll booth. SSR-safe and reduced-motion aware.

const SESSION_KEY = "golazo.splash.seen";
const MAX_MS = 2800;

export default function GoloSplash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [bar, setBar] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      seen = false;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) return;
    setShow(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    // lock scroll while the splash is up
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dismiss = () => {
      setLeaving(true);
      window.setTimeout(() => setShow(false), 520);
    };
    const hard = window.setTimeout(dismiss, MAX_MS);

    return () => {
      window.clearTimeout(hard);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    videoRef.current?.play().catch(() => {});
    const id = requestAnimationFrame(() => setBar(100));
    return () => cancelAnimationFrame(id);
  }, [show]);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-night transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 42%, rgba(175,255,0,0.16), transparent 70%)",
        }}
      />
      <video
        ref={videoRef}
        src="/assets/golo/golo-walkout.mp4"
        muted
        playsInline
        autoPlay
        preload="auto"
        className="h-[62vh] max-h-[560px] w-auto object-contain drop-shadow-[0_0_40px_rgba(175,255,0,0.25)]"
      />
      <div className="mt-2 flex flex-col items-center gap-3">
        <p className="hi-pop text-2xl font-extrabold text-chalk sm:text-3xl">
          Hi, I&apos;m <span className="text-volt">Golo</span>!
        </p>
        <h1 className="text-4xl font-extrabold uppercase tracking-tighter text-chalk sm:text-5xl">
          GO<span className="text-volt">LAZO</span>
        </h1>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-volt ease-out"
            style={{ width: `${bar}%`, transition: `width ${MAX_MS}ms ease-out` }}
          />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
          warming up the feed
        </p>
      </div>
    </div>
  );
}
