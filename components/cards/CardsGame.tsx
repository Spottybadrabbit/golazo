"use client";

import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";
import FutCard from "@/components/cards/FutCard";
import PackScene from "@/components/cards/PackScene";
import GlossyIcon, { GlossyShelf } from "@/components/icons/GlossyIcons";
import {
  CARDS,
  collectionCount,
  drawCard,
  PACK_COST,
  PACK_SIZE,
  type CardDef,
  type Rarity,
} from "@/lib/cards";
import { BADGES, loadPlayer, savePlayer, type PlayerState } from "@/lib/game";

const RARITY_ORDER: Record<Rarity, number> = { common: 0, rare: 1, legend: 2 };

function bestRarity(cards: CardDef[]): Rarity {
  return cards.reduce<Rarity>(
    (best, c) => (RARITY_ORDER[c.rarity] > RARITY_ORDER[best] ? c.rarity : best),
    "common",
  );
}

export default function CardsGame() {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [pulled, setPulled] = useState<CardDef[] | null>(null);
  const [packKey, setPackKey] = useState(0);
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
  const canAfford = player.goalPoints >= PACK_COST;

  const handleOpen = () => {
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
    if (bestRarity(cards) !== "common") setBurst(Date.now());
    setNote(newBadges.length ? `Badge unlocked: ${newBadges[0].name}` : null);
  };

  const again = () => {
    setPulled(null);
    setBurst(0);
    setNote(null);
    setPackKey((k) => k + 1);
  };

  const pulledBest = pulled ? bestRarity(pulled) : "common";

  return (
    <div className="relative">
      <Confetti burst={burst} />

      {/* header — glossy reward shelf + title */}
      <header className="floodlight relative overflow-hidden rounded-3xl border border-line bg-surface px-5 pb-6 pt-7 text-center">
        <GlossyShelf className="mb-4" />
        <h1 className="text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
          Summer <span className="text-volt">packs</span>
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Bank Hi-Lo streaks into GOAL, rip foil packs, and chase the walkout. Two cards a pack —
          odds on the tin: 52% common, 34% rare, 14% legend.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <Stat icon="bolt" tint="volt" label="balance" value={`${player.goalPoints} GOAL`} />
          <Stat icon="shield" tint="cyan" label="collection" value={`${owned}/${CARDS.length}`} />
          <Stat icon="crown" tint="gold" label="badges" value={`${player.badges.length}`} />
        </div>
      </header>

      {/* pack opener / reveal */}
      <section className="mt-5 rounded-3xl border border-line bg-gradient-to-b from-raised to-surface p-5 sm:p-7">
        {!pulled ? (
          <div className="flex flex-col items-center">
            <PackScene key={packKey} onOpen={handleOpen} busy={!canAfford} />
            <button
              onClick={() => {
                if (!canAfford)
                  setNote(`You need ${PACK_COST} GOAL for a pack. Bank a Hi-Lo streak first.`);
              }}
              className={`mt-5 rounded-xl px-6 py-3 font-extrabold uppercase tracking-wide transition-transform ${
                canAfford
                  ? "cursor-default bg-volt text-night shadow-[0_0_28px_rgba(175,255,0,0.35)]"
                  : "border border-line bg-surface text-muted"
              }`}
            >
              {canAfford ? `Tap the pack · ${PACK_COST} GOAL` : `Locked · ${PACK_COST} GOAL`}
            </button>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted">
              {canAfford ? "tap or press enter to rip" : "bank a streak to afford a pack"}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* light beam behind a non-common walkout */}
            {pulledBest !== "common" && (
              <span
                className="burst-beam pointer-events-none absolute left-1/2 top-0 h-full w-40 -translate-x-1/2 blur-2xl"
                style={{
                  background:
                    pulledBest === "legend"
                      ? "linear-gradient(to bottom, rgba(175,255,0,0.6), transparent)"
                      : "linear-gradient(to bottom, rgba(0,212,255,0.5), transparent)",
                }}
              />
            )}
            <p className="relative text-center font-mono text-[11px] uppercase tracking-widest text-volt">
              {pulledBest === "legend"
                ? "★ Legend walkout ★"
                : pulledBest === "rare"
                  ? "Rare pull"
                  : "Pack opened"}
            </p>
            <div className="relative mx-auto mt-4 grid max-w-lg grid-cols-2 gap-4 sm:gap-6">
              {pulled.map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  className="walkout"
                  style={{ animationDelay: `${0.15 + i * 0.35}s` }}
                >
                  <FutCard card={c} size="lg" />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <button
                onClick={again}
                className="rounded-xl bg-volt px-6 py-3 font-extrabold uppercase tracking-wide text-night transition-transform hover:scale-[1.03] active:translate-y-px"
              >
                Open another
              </button>
            </div>
          </div>
        )}
        {note && <p className="mt-4 text-center font-mono text-xs text-volt">{note}</p>}
      </section>

      {/* collection */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-tight">
            <GlossyIcon name="trophy" tint="gold" size={26} />
            The collection
          </h2>
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
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CARDS.map((c) => {
            const copies = player.cards?.[c.id] ?? 0;
            const has = copies > 0;
            return (
              <div key={c.id} className="relative">
                {has ? <FutCard card={c} size="sm" interactive={false} /> : <LockedSlot card={c} />}
                {copies > 1 && (
                  <span className="absolute right-2 top-2 z-10 rounded-full bg-night/85 px-2 py-0.5 font-mono text-xs text-chalk">
                    x{copies}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
          GOAL points come from banking Hi-Lo streaks. Cards live in your browser for the demo; on
          mainnet they mint as compressed NFTs with TxLINE provenance.
        </p>
      </section>
    </div>
  );
}

function Stat({
  icon,
  tint,
  label,
  value,
}: {
  icon: "bolt" | "shield" | "crown";
  tint: "volt" | "cyan" | "gold";
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-line bg-night/50 py-1.5 pl-1.5 pr-3.5">
      <GlossyIcon name={icon} tint={tint} size={26} />
      <span className="leading-tight">
        <span className="block font-mono text-[9px] uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="block text-sm font-bold text-chalk">{value}</span>
      </span>
    </span>
  );
}

function LockedSlot({ card }: { card: CardDef }) {
  return (
    <div className="flex aspect-[0.72] w-full flex-col items-center justify-center gap-2 rounded-[9%] border border-dashed border-line bg-surface">
      <span className="text-3xl opacity-40" aria-hidden>
        {card.flag}
      </span>
      <span className="font-mono text-2xl text-muted/40">?</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted/60">
        {card.code} · locked
      </span>
    </div>
  );
}
