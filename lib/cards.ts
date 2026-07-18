"use client";

// GOLAZO collectible cards: earn GOAL points from streaks, open packs,
// complete the summer collection. Rarity odds are printed in the UI.

export type Rarity = "common" | "rare" | "legend";

export interface CardDef {
  id: string;
  code: string;
  flag: string;
  title: string;
  rarity: Rarity;
  art: string;
}

export const CARDS: CardDef[] = [
  {
    id: "arg-ten",
    code: "ARG",
    flag: "🇦🇷",
    title: "The Golden Ten",
    rarity: "legend",
    art: "/assets/card-arg.jpg",
  },
  {
    id: "bra-nine",
    code: "BRA",
    flag: "🇧🇷",
    title: "Samba Nine",
    rarity: "rare",
    art: "/assets/card-bra.jpg",
  },
  {
    id: "fra-eight",
    code: "FRA",
    flag: "🇫🇷",
    title: "Bleu Eight",
    rarity: "rare",
    art: "/assets/card-fra.jpg",
  },
  {
    id: "eng-seven",
    code: "ENG",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    title: "Lion Seven",
    rarity: "common",
    art: "/assets/card-eng.jpg",
  },
  {
    id: "jpn-eleven",
    code: "JPN",
    flag: "🇯🇵",
    title: "Samurai Eleven",
    rarity: "common",
    art: "/assets/card-jpn.jpg",
  },
];

export const PACK_COST = 100;
export const PACK_SIZE = 2;

const RARITY_WEIGHT: Record<Rarity, number> = { common: 0.52, rare: 0.34, legend: 0.14 };

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  legend: "Legend",
};

/** Draw one card by rarity weight, then uniformly within that rarity. */
export function drawCard(rand: () => number = Math.random): CardDef {
  const roll = rand();
  let acc = 0;
  let rarity: Rarity = "common";
  for (const r of ["common", "rare", "legend"] as Rarity[]) {
    acc += RARITY_WEIGHT[r];
    if (roll <= acc) {
      rarity = r;
      break;
    }
  }
  const pool = CARDS.filter((c) => c.rarity === rarity);
  return pool[Math.floor(rand() * pool.length)];
}

export function collectionCount(cards: Record<string, number>): number {
  return CARDS.filter((c) => (cards[c.id] ?? 0) > 0).length;
}
