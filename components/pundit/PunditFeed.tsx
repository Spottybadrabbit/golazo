"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLiveWorld } from "@/lib/useLiveWorld";

// Golo · PunditBot — LIVE ONLY. Commentary is generated from the real featured
// match on the TxODDS feed: kickoff, goals, phase changes, and win-probability
// swings. No simulated feed.

interface Msg {
  id: string;
  text: string;
  kind: "event" | "note";
  at: number;
}

function timeLabel(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PunditFeed() {
  const world = useLiveWorld();
  const m = world?.featured ?? null;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const last = useRef<{
    fixtureId?: number;
    score?: string;
    phase?: string;
    pHome?: number;
  }>({});

  const push = (text: string, kind: Msg["kind"]) =>
    setMsgs((prev) => [
      ...prev.slice(-14),
      { id: `${Date.now()}-${seq.current++}`, text, kind, at: Date.now() },
    ]);

  useEffect(() => {
    if (!m) return;
    const L = last.current;

    // New match in focus → reset + intro.
    if (L.fixtureId !== m.fixtureId) {
      last.current = { fixtureId: m.fixtureId };
      const opener =
        m.phase === "LIVE"
          ? `we're live, ${m.minute}' on the clock`
          : m.phase === "FT"
            ? "full time, let's break it down"
            : m.phase === "HT"
              ? "half time"
              : "team news is in, kickoff soon";
      push(`Golo here on ${m.home.name} v ${m.away.name} — ${opener}.`, "note");
      if (m.probs) {
        push(
          `Market read: ${m.home.code} ${m.probs.home}% · draw ${m.probs.draw}% · ${m.away.code} ${m.probs.away}%.`,
          "note",
        );
        last.current.pHome = m.probs.home;
      }
      last.current.score = `${m.score[0]}-${m.score[1]}`;
      last.current.phase = m.phase;
      return;
    }

    // Goal.
    const score = `${m.score[0]}-${m.score[1]}`;
    if (L.score !== undefined && L.score !== score) {
      push(`GOOOAL! ${m.home.code} ${m.score[0]}-${m.score[1]} ${m.away.code}. Market's about to move.`, "event");
    }
    L.score = score;

    // Phase change.
    if (L.phase !== undefined && L.phase !== m.phase) {
      const t =
        m.phase === "LIVE"
          ? "And we're underway!"
          : m.phase === "HT"
            ? "That's the half-time whistle."
            : m.phase === "FT"
              ? "Full time. What a watch."
              : "";
      if (t) push(t, "event");
    }
    L.phase = m.phase;

    // Win-probability swing.
    if (m.probs) {
      const p = m.probs.home;
      if (L.pHome === undefined) {
        L.pHome = p;
      } else if (Math.abs(p - L.pHome) >= 1.5) {
        const up = p > L.pHome;
        push(
          `${m.home.code} ${up ? "climbing" : "drifting"} — win prob now ${p}%. ${
            up ? "HIGHER's looking tasty." : "LOWER callers, this is your window."
          }`,
          "note",
        );
        L.pHome = p;
      }
    }
  }, [m?.fixtureId, m?.score?.[0], m?.score?.[1], m?.phase, m?.probs?.home, m?.minute, m]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  return (
    <div>
      {/* bot header */}
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <Image
          src="/assets/mascot-volt.jpg"
          alt="Golo the pundit parrot"
          width={52}
          height={52}
          priority
          className="bob rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight">Golo · PunditBot</h1>
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
            {m ? `watching ${m.home.code} v ${m.away.code}` : "watching the TxLINE feed"}
          </p>
        </div>
        <a
          href="https://t.me"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-bold transition-colors hover:border-volt/70 hover:bg-volt/10 active:translate-y-px"
        >
          Open in Telegram
          <span className="flex gap-0.5" aria-hidden="true">
            <span className="typing-dot h-1 w-1 rounded-full bg-volt" />
            <span className="typing-dot h-1 w-1 rounded-full bg-volt" />
            <span className="typing-dot h-1 w-1 rounded-full bg-volt" />
          </span>
        </a>
      </div>

      {/* feed */}
      <div className="mt-4 space-y-3">
        {msgs.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center font-mono text-sm text-muted">
            {m ? "Golo is clearing his throat…" : "Golo is waiting for the feed to price a match…"}
          </div>
        ) : (
          msgs.map((msg) => (
            <div key={msg.id} className="flex items-end gap-2.5">
              <Image
                src="/assets/mascot-volt.jpg"
                alt=""
                width={30}
                height={30}
                className="mb-1 shrink-0 rounded-lg"
              />
              <div
                className={`max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-2.5 text-sm leading-relaxed ${
                  msg.kind === "event" ? "border-volt/50 bg-volt/10" : "border-line bg-surface"
                }`}
              >
                {msg.text}
                <span className="mt-1 block text-right font-mono text-[10px] text-muted">
                  {timeLabel(msg.at)}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
