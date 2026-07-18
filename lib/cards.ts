"use client";

// GOLAZO collectible cards: earn GOAL points from streaks, open packs,
// complete the summer collection. Rarity odds are printed in the UI.

export type Rarity = "common" | "rare" | "legend";

/** The six FUT-style attributes, in display order (PAC SHO PAS DRI DEF PHY). */
export interface CardStats {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export interface CardDef {
  id: string;
  code: string;
  flag: string;
  title: string;
  /** Short player-style surname shown on the card. */
  name: string;
  /** FUT position tag, e.g. RW / ST / CM. */
  position: string;
  /** Nation / squad line under the crest. */
  squad: string;
  rarity: Rarity;
  rating: number;
  stats: CardStats;
  art: string;
}

export const CARDS: CardDef[] = [
  {
    id: "arg-ten",
    code: "ARG",
    flag: "🇦🇷",
    title: "The Golden Ten",
    name: "Rivera",
    position: "RW",
    squad: "La Albiceleste",
    rarity: "legend",
    rating: 96,
    stats: { pac: 89, sho: 92, pas: 94, dri: 97, def: 38, phy: 68 },
    art: "/assets/card-arg.jpg",
  },
  {
    id: "bra-nine",
    code: "BRA",
    flag: "🇧🇷",
    title: "Samba Nine",
    name: "Do Santos",
    position: "ST",
    squad: "Seleção",
    rarity: "rare",
    rating: 89,
    stats: { pac: 90, sho: 88, pas: 80, dri: 89, def: 35, phy: 78 },
    art: "/assets/card-bra.jpg",
  },
  {
    id: "fra-eight",
    code: "FRA",
    flag: "🇫🇷",
    title: "Bleu Eight",
    name: "Laurent",
    position: "CM",
    squad: "Les Bleus",
    rarity: "rare",
    rating: 88,
    stats: { pac: 76, sho: 82, pas: 87, dri: 86, def: 74, phy: 79 },
    art: "/assets/card-fra.jpg",
  },
  {
    id: "eng-seven",
    code: "ENG",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    title: "Lion Seven",
    name: "Ashworth",
    position: "LW",
    squad: "Three Lions",
    rarity: "common",
    rating: 84,
    stats: { pac: 91, sho: 80, pas: 78, dri: 85, def: 42, phy: 70 },
    art: "/assets/card-eng.jpg",
  },
  {
    id: "jpn-eleven",
    code: "JPN",
    flag: "🇯🇵",
    title: "Samurai Eleven",
    name: "Takeda",
    position: "CAM",
    squad: "Samurai Blue",
    rarity: "common",
    rating: 82,
    stats: { pac: 84, sho: 78, pas: 83, dri: 85, def: 55, phy: 68 },
    art: "/assets/card-jpn.jpg",
  },
];

/** Stat rows as [label, value] pairs in the canonical FUT two-column order. */
export function statRows(s: CardStats): [string, number][] {
  return [
    ["PAC", s.pac],
    ["SHO", s.sho],
    ["PAS", s.pas],
    ["DRI", s.dri],
    ["DEF", s.def],
    ["PHY", s.phy],
  ];
}

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
