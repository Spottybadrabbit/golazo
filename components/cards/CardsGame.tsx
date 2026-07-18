"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";
import {
  CARDS,
  collectionCount,
  drawCard,
  PACK_COST,
  PACK_SIZE,
  RARITY_LABEL,
  type CardDef,
} from "@/lib/cards";
import { BADGES, loadPlayer, savePlayer, type PlayerState } from "@/lib/game";

const RARITY_RING: Record<string, string> = {
  legend: "border-volt shadow-[0_0_28px_rgba(175,255,0,0.35)]",
  rare: "border-cyan shadow-[0_0_22px_rgba(0,212,255,0.28)]",
  common: "border-line",
};

const RARITY_TEXT: Record<string, string> = {
  legend: "text-volt",
  rare: "text-cyan",
  common: "text-muted",
};

export default function CardsGame() {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [pulled, setPulled] = useState<CardDef[] | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [burst, setBurst] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setPlayer(loadPlayer());
  }, []);

  if (!player) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-muted">Shuffling the deck...</div>
      </div>
    );
  }

  const owned = collectionCount(player.cards ?? {});

  const openPack = () => {
    if (player.goalPoints < PACK_COST) {
      setNote(`You need ${PACK_COST} GOAL for a pack. Bank a streak on the Hi-Lo game first.`);
      return;
    }
    const cards = Array.from({ length: PACK_SIZE }, () => drawCard());
    const nextCards = { ...(player.cards ?? {}) };
    for (const c of cards) nextCards[c.id] = (nextCards[c.id] ?? 0) + 1;
    const next: PlayerState = {
      ...player,
      goalPoints: player.goalPoints - PACK_COST,
      cards: nextCards,
    };
    const newBadges = BADGES.filter((b) => !player.badges.includes(b.id) && b.earned(next));
    next.badges = [...player.badges, ...newBadges.map((b) => b.id)];
    savePlayer(next);
    setPlayer(next);
    setPulled(cards);
    setFlipped(cards.map(() => false));
    setNote(newBadges.length ? `Badge unlocked: ${newBadges[0].name}` : null);
  };

  const flip = (i: number) => {
    setFlipped((f) => {
      if (f[i]) return f;
      const next = [...f];
      next[i] = true;
      if (pulled && pulled[i].rarity !== "common") setBurst(Date.now());
      return next;
    });
  };

  return (
    <div className="relative">
      <Confetti burst={burst} />

      {/* pack opener */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid items-center gap-4 p-5 sm:grid-cols-[auto_1fr_auto]">
          <Image
            src="/assets/pack.jpg"
            alt="A sealed GOLAZO card pack"
            width={86}
            height={129}
            priority
            className="pack-glow mx-auto rounded-lg"
          />
          <div>
            <h1 className="text-2xl font-extrabold uppercase tracking-tight">Summer packs</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Two cards a pack. Odds printed on the tin: 52% common, 34% rare, 14% legend.
            </p>
            <p className="mt-1 font-mono text-xs text-muted">
              balance: {player.goalPoints} GOAL · collection {owned}/{CARDS.length}
            </p>
          </div>
          <button
            onClick={openPack}
            className="rounded-xl bg-volt px-6 py-3.5 font-extrabold uppercase text-night transition-transform hover:scale-[1.03] active:translate-y-px"
          >
            Rip it open · {PACK_COST}
          </button>
        </div>
        {note && (
          <p className="border-t border-line px-5 py-2.5 font-mono text-xs text-volt">{note}</p>
        )}
      </div>

      {/* fresh pulls */}
      {pulled && (
        <div className="mt-5">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">
            Tap to reveal
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-4">
            {pulled.map((c, i) => (
              <button
                key={`${c.id}-${i}`}
                onClick={() => flip(i)}
                className="flip-scene block text-left"
                aria-label={flipped[i] ? c.title : "Face-down card, tap to reveal"}
              >
                <div className={`flip-inner relative aspect-[2/3] ${flipped[i] ? "flipped" : ""}`}>
                  <div className="flip-face absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-volt/40 bg-raised">
                    <Image src="/assets/pack.jpg" alt="" fill className="rounded-2xl object-cover opacity-80" />
                    <span className="relative font-mono text-xs uppercase tracking-widest text-volt">
                      tap
                    </span>
                  </div>
                  <div
                    className={`flip-face flip-back absolute inset-0 overflow-hidden rounded-2xl border-2 bg-raised ${RARITY_RING[c.rarity]}`}
                  >
                    <Image src={c.art} alt={c.title} fill className="object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/70 to-transparent p-3">
                      <div className="text-sm font-extrabold uppercase">{c.title}</div>
                      <div className={`font-mono text-[11px] uppercase ${RARITY_TEXT[c.rarity]}`}>
                        {c.flag} {c.code} · {RARITY_LABEL[c.rarity]}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* collection */}
      <div className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold uppercase tracking-tight">The collection</h2>
          <span className="font-mono text-xs text-muted">
            {owned}/{CARDS.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-volt transition-all duration-700"
            style={{ width: `${(owned / CARDS.length) * 100}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CARDS.map((c) => {
            const copies = player.cards?.[c.id] ?? 0;
            const has = copies > 0;
            return (
              <div
                key={c.id}
                className={`relative aspect-[2/3] overflow-hidden rounded-2xl border-2 ${
                  has ? `${RARITY_RING[c.rarity]} ${c.rarity === "legend" ? "card-shine" : ""}` : "border-line"
                }`}
              >
                {has ? (
                  <>
                    <Image src={c.art} alt={c.title} fill className="object-cover" />
                    {copies > 1 && (
                      <span className="absolute right-2 top-2 rounded-full bg-night/85 px-2 py-0.5 font-mono text-xs text-chalk">
                        x{copies}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface">
                    <span className="text-3xl opacity-40">{c.flag}</span>
                    <span className="font-mono text-2xl text-muted/50">?</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/70 to-transparent p-2.5">
                  <div className="text-xs font-extrabold uppercase">
                    {has ? c.title : "Not pulled yet"}
                  </div>
                  <div className={`font-mono text-[10px] uppercase ${RARITY_TEXT[c.rarity]}`}>
                    {c.code} · {RARITY_LABEL[c.rarity]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
          GOAL points come from banking Hi-Lo streaks. Cards live in your browser for the demo;
          on mainnet they mint as compressed NFTs with TxLINE provenance.
        </p>
      </div>
    </div>
  );
}
