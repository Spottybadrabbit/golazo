"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";
import FutCard from "@/components/cards/FutCard";
import PackScene from "@/components/cards/PackScene";
import GlossyIcon, { GlossyShelf } from "@/components/icons/GlossyIcons";
import {
  CARDS,
  collectionCount,
  drawFromPool,
  poolFromTeams,
  TIER_ORDER,
  PACK_COST,
  PACK_SIZE,
  type CardDef,
  type Tier,
} from "@/lib/cards";
import { BADGES, loadPlayer, pushTx, savePlayer, type PlayerState } from "@/lib/game";
import { useLiveFeed } from "@/components/LiveDataProvider";
import type { LiveMatch } from "@/lib/live-map";
import { useCelebrate } from "@/components/celebrate/Celebration";

function bestTier(cards: CardDef[]): Tier {
  return cards.reduce<Tier>(
    (best, c) => (TIER_ORDER[c.tier] > TIER_ORDER[best] ? c.tier : best),
    "bronze",
  );
}

export default function CardsGame() {
  const celebrate = useCelebrate();
  const feed = useLiveFeed();
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
  const matches = feed?.matches ?? [];
  const slate = matches.slice(0, 6);
  const pool = poolFromTeams(matches.flatMap((m) => [m.home, m.away]));
  const canAfford = player.goalPoints >= PACK_COST;
  const canOpen = canAfford && pool.length > 0;

  const handleOpen = () => {
    if (pool.length === 0) return;
    const cards = Array.from({ length: PACK_SIZE }, () => drawFromPool(pool));
    const nextCards = { ...(player.cards ?? {}) };
    for (const c of cards) nextCards[c.id] = (nextCards[c.id] ?? 0) + 1;
    const next: PlayerState = {
      ...player,
      goalPoints: player.goalPoints - PACK_COST,
      cards: nextCards,
    };
    const newBadges = BADGES.filter((b) => !player.badges.includes(b.id) && b.earned(next));
    next.badges = [...player.badges, ...newBadges.map((b) => b.id)];
    const logged = pushTx(next, {
      kind: "pack",
      label: `Opened a pack · pulled ${cards.map((c) => c.code).join(" + ")}`,
      goal: -PACK_COST,
    });
    savePlayer(logged);
    setPlayer(logged);
    setPulled(cards);
    const best = bestTier(cards);
    if (best !== "bronze") setBurst(Date.now());
    setNote(newBadges.length ? `Badge unlocked: ${newBadges[0].name}` : null);
    celebrate({
      kind: "card",
      title: best === "gold" ? "LEGEND PULL!" : best === "silver" ? "RARE PULL!" : "PACK OPENED!",
      subtitle: newBadges[0]
        ? `Badge unlocked: ${newBadges[0].name}`
        : `You pulled ${cards.map((c) => c.code).join(" + ")}.`,
      tiles: cards.slice(0, 3).map((c) => ({ label: "Pulled", value: c.code })),
      tone: best === "gold" ? "legend" : best === "silver" ? "cyan" : "volt",
      cta: "Add to collection",
    });
  };

  const again = () => {
    setPulled(null);
    setBurst(0);
    setNote(null);
    setPackKey((k) => k + 1);
  };

  const pulledBest = pulled ? bestTier(pulled) : "bronze";

  return (
    <div className="relative">
      <Confetti burst={burst} />

      {/* header — glossy reward shelf + title */}
      <header className="floodlight relative overflow-hidden rounded-3xl border border-line bg-surface px-5 pb-6 pt-7 text-center">
        <GlossyShelf className="mb-4" />
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-volt">
          Matchday · live feed
        </p>
        <h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
          Today&apos;s <span className="text-volt">pack</span>
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Only players from nations live on the feed right now. Two cards a pack — pull odds by
          FIFA tier: 56% bronze, 32% silver, 12% gold.
        </p>
        <FixtureStrip slate={slate} featuredId={feed?.featured?.fixtureId ?? null} />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <Stat icon="bolt" tint="volt" label="balance" value={`${player.goalPoints} GOAL`} />
          <Stat icon="shield" tint="cyan" label="collection" value={`${owned}/${CARDS.length}`} />
          <Stat icon="crown" tint="gold" label="badges" value={`${player.badges.length}`} />
        </div>
      </header>

      {/* pack opener / reveal */}
      <section className="mt-5 rounded-3xl border border-line bg-gradient-to-b from-raised to-surface p-5 sm:p-7">
        {!pulled && pool.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <p className="font-mono text-sm text-muted">
              {matches.length === 0
                ? "No live fixtures on the feed yet. Packs open the moment real matches start streaming."
                : "None of today's live fixtures have a card yet — check back as more nations kick off."}
            </p>
          </div>
        ) : !pulled ? (
          <div className="flex flex-col items-center">
            <PackScene key={packKey} onOpen={handleOpen} busy={!canOpen} />
            <button
              onClick={() => {
                if (!canAfford)
                  setNote(`You need ${PACK_COST} GOAL for a pack. Bank a Hi-Lo streak first.`);
              }}
              className={`mt-5 rounded-xl px-6 py-3 font-extrabold uppercase tracking-wide transition-transform ${
                canOpen
                  ? "cursor-default bg-volt text-night shadow-[0_0_28px_rgba(175,255,0,0.35)]"
                  : "border border-line bg-surface text-muted"
              }`}
            >
              {canOpen ? `Tap the pack · ${PACK_COST} GOAL` : `Locked · ${PACK_COST} GOAL`}
            </button>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted">
              {canOpen ? "tap or press enter to rip" : "bank a streak to afford a pack"}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* light beam behind a non-common walkout */}
            {pulledBest !== "bronze" && (
              <span
                className="burst-beam pointer-events-none absolute left-1/2 top-0 h-full w-40 -translate-x-1/2 blur-2xl"
                style={{
                  background:
                    pulledBest === "gold"
                      ? "linear-gradient(to bottom, rgba(175,255,0,0.6), transparent)"
                      : "linear-gradient(to bottom, rgba(215,230,238,0.5), transparent)",
                }}
              />
            )}
            <p className="relative text-center font-mono text-[11px] uppercase tracking-widest text-volt">
              {pulledBest === "gold"
                ? "★ Gold walkout ★"
                : pulledBest === "silver"
                  ? "Silver pull"
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
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <GlossyIcon name="bolt" tint="volt" size={30} />
            <p className="text-[13px] leading-relaxed text-muted">
              GOAL comes from banking Hi-Lo streaks. Cards live in your browser for the demo; on
              mainnet they mint as compressed NFTs with TxLINE provenance.
            </p>
          </div>
          <Link
            href="/wallet"
            className="shrink-0 rounded-full border border-line bg-night px-4 py-2 text-center text-xs font-semibold text-chalk transition-colors hover:border-volt/60 hover:text-volt"
          >
            View wallet &amp; history →
          </Link>
        </div>
      </section>
    </div>
  );
}

function timeLabel(startTime?: number): string {
  if (!startTime) return "—";
  return new Date(startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function FixtureStrip({
  slate,
  featuredId,
}: {
  slate: LiveMatch[];
  featuredId: number | null;
}) {
  if (!slate.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {slate.map((f) => (
        <span
          key={f.fixtureId}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] ${
            f.fixtureId === featuredId
              ? "border-volt/60 bg-volt/10 text-chalk"
              : "border-line bg-night/50 text-muted"
          }`}
          title={`${f.home.name} v ${f.away.name}`}
        >
          <span aria-hidden>{f.home.flag}</span>
          <span className="font-semibold text-chalk">{f.home.code}</span>
          <span className="opacity-50">v</span>
          <span className="font-semibold text-chalk">{f.away.code}</span>
          <span aria-hidden>{f.away.flag}</span>
          <span className="ml-0.5 opacity-60">{timeLabel(f.startTime)}</span>
        </span>
      ))}
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
