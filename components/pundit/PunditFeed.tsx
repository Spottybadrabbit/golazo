"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useFavorites } from "@/lib/favorites";
import { recommendHiLo, fmtMove } from "@/lib/hilo-edge";
import type { LiveEvent, LiveMatch } from "@/lib/live-map";

// Golo · PunditBot — LIVE ONLY. Golo streams the real TxODDS feed line-by-line
// — the notable-event stream (goals, cards, corners, shots, free kicks, subs),
// minute-by-minute status, and phase changes — plus value-aware Hi-Lo calls:
// HIGHER/LOWER is only shouted when a market move carries genuine edge
// (magnitude × room to run), with a cooldown so it never oscillates. He watches
// the matches you've favorited (⭐ on Match Centre); with none set he follows
// the featured live match so he's never silent during the marquee game. Every
// line is real feed data — no simulated commentary.

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
  lastSeq: number; // highest notable-event seq already streamed
}

function timeLabel(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Turn one real feed event into a Golo commentary line. Goals are handled by
// the score-change path (more reliable + celebratory), so they return null here.
function eventLine(m: LiveMatch, e: LiveEvent): { text: string; kind: Msg["kind"] } | null {
  const team = e.side === "home" ? m.home : e.side === "away" ? m.away : null;
  const who = team ? `${team.flag} ${team.name}` : "";
  const tail = who ? ` — ${who}` : "";
  const min = `${e.minute}'`;
  switch (e.action) {
    case "yellow_card":
      return { text: `${min} 🟨 Yellow card${tail}`, kind: "note" };
    case "red_card":
      return { text: `${min} 🟥 RED CARD${tail}! Down to ten.`, kind: "event" };
    case "penalty":
      return { text: `${min} 🎯 PENALTY${who ? ` to ${who}` : ""}! Massive moment.`, kind: "event" };
    case "corner":
      return { text: `${min} 🚩 Corner${tail}`, kind: "note" };
    case "shot":
      return e.detail.toLowerCase().includes("target")
        ? { text: `${min} 🧤 Shot on target${tail} — keeper called into action`, kind: "note" }
        : { text: `${min} 👟 Shot${tail}`, kind: "note" };
    case "free_kick":
      return {
        text: `${min} ➰ Free kick${tail}${e.detail ? ` (${e.detail.toLowerCase()})` : ""}`,
        kind: "note",
      };
    case "substitution":
      return { text: `${min} 🔁 Substitution${tail}`, kind: "note" };
    case "injury":
      return { text: `${min} 🚑 Injury stoppage${tail}`, kind: "note" };
    default:
      return null; // goal → handled via score change
  }
}

export default function PunditFeed() {
  const feed = useLiveFeed();
  const { favorites, isFav } = useFavorites();
  // Real matches only (a "sim" feed carries fabricated data we never comment
  // on). Golo watches your favorited matches; with none set he follows the
  // featured live match so the feed is never dead during the marquee game.
  const watched = useMemo<LiveMatch[]>(() => {
    if (!feed || feed.mode !== "live") return [];
    const favs = feed.matches.filter((m) => isFav(m.fixtureId));
    if (favs.length) return favs;
    const f = feed.featured;
    return f && (f.phase === "LIVE" || f.phase === "HT") ? [f] : [];
  }, [feed, isFav]);
  const followingFeatured = favorites.size === 0 && watched.length > 0;

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const tracked = useRef<Record<number, TrackedState>>({});

  const push = (text: string, kind: Msg["kind"]) =>
    setMsgs((prev) => [
      ...prev.slice(-16),
      { id: `${Date.now()}-${seq.current++}`, text, kind, at: Date.now() },
    ]);

  useEffect(() => {
    for (const m of watched) {
      const L = tracked.current[m.fixtureId];
      const events = m.events ?? [];
      const maxSeq = events.length ? Math.max(...events.map((e) => e.seq)) : -1;

      // New match in focus → intro once, then replay the last few events as
      // recent context (seeding lastSeq to max so we don't flood the backlog).
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
        for (const e of events.slice(-4)) {
          if (e.action === "goal") continue;
          const line = eventLine(m, e);
          if (line) push(line.text, line.kind);
        }
        tracked.current[m.fixtureId] = {
          seenIntro: true,
          score: `${m.score[0]}-${m.score[1]}`,
          phase: m.phase,
          pHome: m.probs?.home,
          minute: m.minute,
          lastCall: null,
          lastRecAt: 0,
          lastSeq: maxSeq,
        };
        continue;
      }

      // Goal (score change is the authoritative, celebratory signal).
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

      // Real notable-event stream — one line per NEW event (by seq). Goals are
      // handled above via the score change, so eventLine skips them.
      for (const e of events) {
        if (e.seq <= L.lastSeq) continue;
        if (e.action === "goal") continue;
        const line = eventLine(m, e);
        if (line) push(line.text, line.kind);
      }
      if (maxSeq > L.lastSeq) L.lastSeq = maxSeq;

      // Minute-by-minute status line while live: clock, score, live win-prob,
      // and 1X2 odds — the real TxLINE data as it ticks.
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
  }, [watched]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const nothingToWatch = watched.length === 0;
  const watchingLabel = nothingToWatch
    ? favorites.size === 0
      ? "waiting for a live match"
      : "favorited matches aren't live right now"
    : followingFeatured
      ? `live: ${watched[0].home.code} v ${watched[0].away.code}`
      : watched.length === 1
        ? `watching ${watched[0].home.code} v ${watched[0].away.code}`
        : `watching ${watched.length} favorited matches`;

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
      {nothingToWatch ? (
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
              {watched.length
                ? "Golo is clearing his throat…"
                : "Golo is waiting for a live match…"}
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
