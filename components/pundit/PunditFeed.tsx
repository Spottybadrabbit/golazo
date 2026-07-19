"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useFavorites } from "@/lib/favorites";
import { recommendHiLo, fmtMove } from "@/lib/hilo-edge";

// Golo · PunditBot — LIVE ONLY. Golo only talks about the matches you've
// favorited (⭐ on Match Centre). Commentary is generated from each favorited
// match's REAL feed data — minute-by-minute status, goals, cards, phase
// changes — plus value-aware Hi-Lo calls: HIGHER/LOWER is only shouted when a
// market move carries genuine edge (magnitude × room to run), with a cooldown
// so it never oscillates or repeats. No simulated feed.

// Same-direction Hi-Lo calls are held back for this long so the feed doesn't
// spam; a genuine reversal (flip) bypasses it.
const REC_COOLDOWN_MS = 40_000;

interface Msg {
  id: string;
  text: string;
  kind: "event" | "note";
  at: number;
}

interface TrackedState {
  seenIntro: boolean;
  score?: string;
  phase?: string;
  pHome?: number; // baseline home win prob the next Hi-Lo edge is measured from
  minute?: number;
  lastCall?: "HIGHER" | "LOWER" | null;
  lastRecAt?: number;
}

function timeLabel(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PunditFeed() {
  const feed = useLiveFeed();
  const { favorites, isFav } = useFavorites();
  const favorited = useMemo(() => {
    // real matches only — a "sim" mode feed carries fabricated data we never
    // want Golo commenting on.
    const matches = feed && feed.mode === "live" ? feed.matches : [];
    return matches.filter((m) => isFav(m.fixtureId));
  }, [feed, isFav]);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const tracked = useRef<Record<number, TrackedState>>({});

  const push = (text: string, kind: Msg["kind"]) =>
    setMsgs((prev) => [
      ...prev.slice(-14),
      { id: `${Date.now()}-${seq.current++}`, text, kind, at: Date.now() },
    ]);

  useEffect(() => {
    for (const m of favorited) {
      const L = tracked.current[m.fixtureId];

      // New favorited match in focus → intro once.
      if (!L) {
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
        }
        tracked.current[m.fixtureId] = {
          seenIntro: true,
          score: `${m.score[0]}-${m.score[1]}`,
          phase: m.phase,
          pHome: m.probs?.home,
          minute: m.minute,
          lastCall: null,
          lastRecAt: 0,
        };
        continue;
      }

      // Goal.
      const score = `${m.score[0]}-${m.score[1]}`;
      if (L.score !== undefined && L.score !== score) {
        push(
          `GOOOAL! ${m.home.code} ${m.score[0]}-${m.score[1]} ${m.away.code}. Market's about to move — watch the Hi-Lo.`,
          "event",
        );
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
        if (t) push(`${m.home.code} v ${m.away.code}: ${t}`, "event");
      }
      L.phase = m.phase;

      // Minute-by-minute status line while live: clock, score, live win-prob,
      // and 1X2 odds — the real TxLINE data as it ticks. (The devnet feed
      // doesn't expose possession/xG/cards, so we never fabricate them.)
      if (m.phase === "LIVE" && L.minute !== undefined && m.minute > L.minute) {
        const oddsPart = m.odds
          ? ` · odds ${m.odds.home.toFixed(2)}/${m.odds.draw.toFixed(2)}/${m.odds.away.toFixed(2)}`
          : "";
        const probPart = m.probs
          ? ` · ${m.probs.home >= m.probs.away ? m.home.code : m.away.code} favoured (${Math.max(m.probs.home, m.probs.away)}%)`
          : "";
        push(
          `${m.minute}' — ${m.home.code} ${m.score[0]}-${m.score[1]} ${m.away.code}${probPart}${oddsPart}.`,
          "note",
        );
        L.minute = m.minute;
      } else if (L.minute === undefined) {
        L.minute = m.minute;
      }

      // Hi-Lo call — only when the market move carries real edge, and de-spammed
      // (same-direction calls wait out a cooldown; a reversal fires immediately).
      if (m.probs) {
        const p = m.probs.home;
        const base = L.pHome ?? p;
        const rec = recommendHiLo({ prevProb: base, currProb: p });
        if (rec) {
          const now = Date.now();
          const flipped = L.lastCall != null && L.lastCall !== rec.call;
          const cooled = !L.lastRecAt || now - L.lastRecAt > REC_COOLDOWN_MS;
          if (flipped || cooled || L.lastCall == null) {
            const verb = rec.call === "HIGHER" ? "climbing" : "drifting";
            const tail =
              rec.confidence === "strong"
                ? `${rec.call}'s the value call`
                : rec.confidence === "lean"
                  ? `lean ${rec.call}`
                  : `slight ${rec.call} edge`;
            push(
              `${m.home.code} ${verb} ${fmtMove(rec.move)} → ${p}% · ${tail} (edge ${rec.edge}/100, room ${rec.room}pp).`,
              "note",
            );
            L.lastCall = rec.call;
            L.lastRecAt = now;
            L.pHome = p; // reset baseline so the next call needs a fresh move
          }
        } else if (L.pHome === undefined) {
          L.pHome = p;
        }
      }
    }
  }, [favorited]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const noFavorites = favorites.size === 0;
  const watchingLabel = noFavorites
    ? "no favorites yet"
    : favorited.length === 0
      ? "favorited matches aren't live right now"
      : favorited.length === 1
        ? `watching ${favorited[0].home.code} v ${favorited[0].away.code}`
        : `watching ${favorited.length} favorited matches`;

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
            {watchingLabel}
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

      {/* feed / empty state */}
      {noFavorites ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-6 text-center">
          <Image
            src="/assets/mascot-volt.jpg"
            alt="Golo waiting"
            width={64}
            height={64}
            className="bob mx-auto rounded-xl"
          />
          <p className="mt-3 text-sm leading-relaxed text-chalk">
            ⭐ Favorite a match and I&apos;ll bring you the takes
          </p>
          <Link
            href="/matches"
            className="mt-4 inline-block rounded-full bg-volt px-5 py-2 text-sm font-bold text-night transition-transform hover:scale-[1.02] active:translate-y-px"
          >
            Browse matches
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {msgs.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center font-mono text-sm text-muted">
              {favorited.length
                ? "Golo is clearing his throat…"
                : "Golo is waiting for your favorited matches to go live…"}
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
      )}
    </div>
  );
}
