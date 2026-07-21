"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useLiveFeed } from "@/components/LiveDataProvider";
import { useFavorites } from "@/lib/favorites";
import { recommendHiLo, fmtMove } from "@/lib/hilo-edge";

// Full-match recap for the focused favorited match (convex/feed.ts:recap).
const recapRef = makeFunctionReference<"query">("feed:recap");

interface RecapEvent {
  seq: number;
  minute: number;
  action: string;
  side: string;
  detail: string;
}
interface RecapData {
  fixtureId: number;
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  score: [number, number];
  minute: number;
  phase: string;
  probs: { home: number; draw: number; away: number } | null;
  events: RecapEvent[];
}

/** Turn one recorded match event into a Golo recap line. */
function recapLine(e: RecapEvent, homeCode: string, awayCode: string): { text: string; kind: "event" | "note" } {
  const team = e.side === "home" ? homeCode : e.side === "away" ? awayCode : "";
  const at = `${e.minute}'`;
  const who = team ? ` ${team}` : "";
  switch (e.action) {
    case "goal":
      return { text: `${at} ⚽ GOAL —${who}! The market lurches.`, kind: "event" };
    case "red_card":
      return { text: `${at} 🟥 RED CARD —${who} down to ten.`, kind: "event" };
    case "yellow_card":
      return { text: `${at} 🟨 Booking —${who}.`, kind: "note" };
    case "corner":
      return { text: `${at} Corner${who ? ` won by${who}` : ""}.`, kind: "note" };
    case "shot":
      return { text: `${at} Shot${who} — ${e.detail || "on the move"}.`, kind: "note" };
    case "free_kick":
      return { text: `${at} Free kick${e.detail ? ` (${e.detail})` : ""}.`, kind: "note" };
    case "substitution":
      return { text: `${at} Substitution${who}.`, kind: "note" };
    case "injury":
      return { text: `${at} Play stops — injury.`, kind: "note" };
    default:
      return { text: `${at} ${e.action.replace(/_/g, " ")}${who}.`, kind: "note" };
  }
}

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

  // The match Golo features: the MOST RECENTLY favorited one, preferring a live
  // (or half-time) game, otherwise the latest favorite even if it's finished. JS
  // Sets keep insertion order, so the last starred id is the most recent.
  const focus = useMemo(() => {
    if (favorited.length === 0) return null;
    const favIds = [...favorites];
    const byRecency = favorited
      .slice()
      .sort((a, b) => favIds.indexOf(b.fixtureId) - favIds.indexOf(a.fixtureId));
    return byRecency.find((m) => m.phase === "LIVE" || m.phase === "HT") ?? byRecency[0];
  }, [favorited, favorites]);

  // Full-match recap for the focused fixture (beginning → now).
  const recap = useQuery(recapRef, focus ? { fixtureId: focus.fixtureId } : "skip") as
    | RecapData
    | null
    | undefined;

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const tracked = useRef<Record<number, TrackedState>>({});

  const push = (text: string, kind: Msg["kind"]) =>
    setMsgs((prev) => [
      ...prev.slice(-70),
      { id: `${Date.now()}-${seq.current++}`, text, kind, at: Date.now() },
    ]);

  // Load out the whole match, kickoff → now, whenever the focused fixture
  // changes: seed the feed with a recap built from its recorded events, then let
  // the live loop below carry on from there.
  const recappedFixture = useRef<number | null>(null);
  useEffect(() => {
    if (!focus || !recap || recap.fixtureId !== focus.fixtureId) return;
    if (recappedFixture.current === focus.fixtureId) return;
    recappedFixture.current = focus.fixtureId;

    let n = 0;
    const mk = (text: string, kind: Msg["kind"]): Msg => ({
      id: `recap-${focus.fixtureId}-${n++}`,
      text,
      kind,
      at: Date.now(),
    });
    const lines: Msg[] = [
      mk(`📼 Full-match recap — ${recap.homeName} v ${recap.awayName}. Here's the whole story, call by call.`, "note"),
    ];
    if (recap.probs) {
      lines.push(
        mk(`Kickoff market: ${recap.homeCode} ${recap.probs.home}% · draw ${recap.probs.draw}% · ${recap.awayCode} ${recap.probs.away}%.`, "note"),
      );
    }
    for (const e of recap.events.slice(-40)) {
      const l = recapLine(e, recap.homeCode, recap.awayCode);
      lines.push(mk(l.text, l.kind));
    }
    const standing =
      recap.phase === "FT"
        ? `Full time — ${recap.homeCode} ${recap.score[0]}-${recap.score[1]} ${recap.awayCode}.`
        : `${recap.minute}' now — ${recap.homeCode} ${recap.score[0]}-${recap.score[1]} ${recap.awayCode}. Live from here.`;
    lines.push(mk(standing, "note"));
    setMsgs(lines);

    // Reset live tracking so the loop below continues from the recap's end
    // rather than re-announcing everything.
    tracked.current = {
      [focus.fixtureId]: {
        seenIntro: true,
        score: `${recap.score[0]}-${recap.score[1]}`,
        phase: recap.phase,
        pHome: recap.probs?.home,
        minute: recap.minute,
        lastCall: null,
        lastRecAt: 0,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.fixtureId, recap?.fixtureId]);

  useEffect(() => {
    for (const m of focus ? [focus] : []) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.fixtureId, focus?.minute, focus?.score, focus?.phase, focus?.probs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const noFavorites = favorites.size === 0;
  const watchingLabel = noFavorites
    ? "no favorites yet"
    : !focus
      ? "favorited matches aren't live right now"
      : `${focus.phase === "LIVE" || focus.phase === "HT" ? "live · " : ""}${focus.home.code} v ${focus.away.code}`;

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

      {/* low-context notch: explains the full-match recap behaviour */}
      {focus && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-night/50 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
          <span className="mt-px shrink-0 text-volt">ⓘ</span>
          <span>
            Golo loads your most-recent favourite from kickoff — the full match, call by call —
            then keeps going live. Live games come up first; otherwise the latest star.{" "}
            <Link href="/matches" className="text-volt hover:underline">
              Star another match
            </Link>{" "}
            to switch.
          </span>
        </p>
      )}

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
