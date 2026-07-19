"use client";

// GOLAZO collectible player cards. Cards map to real World Cup nations; each
// nation's signature player is minted at a metal tier — gold / silver / bronze
// — set by that nation's global FIFA ranking and the player's rating, exactly
// like FIFA Ultimate Team. Tomorrow's pack only contains players from the
// nations kicking off tomorrow (see lib/engine tomorrowFixtures).

import { tomorrowFixtures, type Fixture } from "@/lib/engine";

export type Tier = "bronze" | "silver" | "gold";

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
  /** Card display title / nickname. */
  title: string;
  /** Short player-style surname shown on the card. */
  name: string;
  /** FUT position tag, e.g. RW / ST / CM. */
  position: string;
  /** Nation / squad line under the crest. */
  squad: string;
  /** Metal tier, from FIFA ranking + rating. */
  tier: Tier;
  /** Nation's global FIFA ranking (1 = best). */
  fifaRank: number;
  rating: number;
  stats: CardStats;
  /** Optional cover art (only the marquee three carry photography). */
  art?: string;
}

export const TIER_LABEL: Record<Tier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export const TIER_ORDER: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 };

type Arch = "fwd" | "wing" | "mid" | "def";

const ARCH_FOR: Record<string, Arch> = {
  ST: "fwd",
  CF: "fwd",
  RW: "wing",
  LW: "wing",
  CM: "mid",
  CAM: "mid",
  CB: "def",
};

const clamp = (n: number) => Math.max(32, Math.min(99, Math.round(n)));

/** Deterministic, position-shaped stat line from a rating + position. */
function mkStats(r: number, pos: string): CardStats {
  const arch = ARCH_FOR[pos] ?? "mid";
  const t: Record<Arch, CardStats> = {
    fwd: { pac: r + 3, sho: r + 2, pas: r - 7, dri: r + 1, def: r - 42, phy: r - 6 },
    wing: { pac: r + 6, sho: r - 3, pas: r - 3, dri: r + 4, def: r - 40, phy: r - 12 },
    mid: { pac: r - 5, sho: r - 4, pas: r + 5, dri: r + 3, def: r - 8, phy: r - 2 },
    def: { pac: r - 7, sho: r - 32, pas: r - 8, dri: r - 12, def: r + 5, phy: r + 4 },
  };
  const s = t[arch];
  return {
    pac: clamp(s.pac),
    sho: clamp(s.sho),
    pas: clamp(s.pas),
    dri: clamp(s.dri),
    def: clamp(s.def),
    phy: clamp(s.phy),
  };
}

/** Tier from FIFA ranking: top 5 gold, 6–10 silver, else bronze. */
function tierForRank(rank: number): Tier {
  if (rank <= 5) return "gold";
  if (rank <= 10) return "silver";
  return "bronze";
}

interface Seed {
  code: string;
  flag: string;
  name: string;
  title: string;
  squad: string;
  position: string;
  fifaRank: number;
  rating: number;
  art?: string;
}

// One signature player per nation. fifaRank drives the metal tier; ratings and
// names are original to GOLAZO (no real-player likeness). The marquee three
// keep their existing cover art so the landing fan render is unchanged.
const SEEDS: Seed[] = [
  { code: "ARG", flag: "🇦🇷", name: "Rivera", title: "The Golden Ten", squad: "La Albiceleste", position: "RW", fifaRank: 1, rating: 96, art: "/assets/card-arg.jpg" },
  { code: "BRA", flag: "🇧🇷", name: "do Santos", title: "Samba Nine", squad: "Seleção", position: "LW", fifaRank: 5, rating: 91, art: "/assets/card-bra.jpg" },
  { code: "FRA", flag: "🇫🇷", name: "Lacroix", title: "Bleu Eight", squad: "Les Bleus", position: "ST", fifaRank: 2, rating: 93, art: "/assets/card-fra.jpg" },
  { code: "ESP", flag: "🇪🇸", name: "Herrera", title: "La Roja Maestro", squad: "La Roja", position: "CM", fifaRank: 3, rating: 90 },
  { code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "Ashworth", title: "Lion Seven", squad: "Three Lions", position: "LW", fifaRank: 4, rating: 89 },
  { code: "POR", flag: "🇵🇹", name: "Mendes", title: "Selecção Spark", squad: "Seleção das Quinas", position: "RW", fifaRank: 6, rating: 87 },
  { code: "NED", flag: "🇳🇱", name: "de Bruin", title: "Oranje Wall", squad: "Oranje", position: "CB", fifaRank: 8, rating: 85 },
  { code: "CRO", flag: "🇭🇷", name: "Kovač", title: "Vatreni Metronome", squad: "Vatreni", position: "CM", fifaRank: 9, rating: 86 },
  { code: "GER", flag: "🇩🇪", name: "Vogel", title: "Adler Engine", squad: "Die Mannschaft", position: "CM", fifaRank: 7, rating: 85 },
  { code: "MAR", flag: "🇲🇦", name: "El Fassi", title: "Atlas Flyer", squad: "Atlas Lions", position: "RW", fifaRank: 10, rating: 84 },
  { code: "URU", flag: "🇺🇾", name: "Cardozo", title: "Celeste Nine", squad: "La Celeste", position: "ST", fifaRank: 11, rating: 83 },
  { code: "JPN", flag: "🇯🇵", name: "Takeda", title: "Samurai Eleven", squad: "Samurai Blue", position: "CAM", fifaRank: 13, rating: 82 },
  { code: "SEN", flag: "🇸🇳", name: "Diallo", title: "Teranga Striker", squad: "Lions of Teranga", position: "ST", fifaRank: 14, rating: 81 },
  { code: "COL", flag: "🇨🇴", name: "Restrepo", title: "Cafetero Ten", squad: "Los Cafeteros", position: "CAM", fifaRank: 12, rating: 81 },
  { code: "USA", flag: "🇺🇸", name: "Brooks", title: "Stars & Stripes", squad: "USMNT", position: "RW", fifaRank: 15, rating: 80 },
  { code: "MEX", flag: "🇲🇽", name: "Márquez", title: "El Tri Poacher", squad: "El Tri", position: "CF", fifaRank: 16, rating: 79 },
];

export const CARDS: CardDef[] = SEEDS.map((s) => ({
  id: `${s.code.toLowerCase()}-${s.name.toLowerCase().replace(/[^a-z]/g, "")}`,
  code: s.code,
  flag: s.flag,
  title: s.title,
  name: s.name,
  position: s.position,
  squad: s.squad,
  tier: tierForRank(s.fifaRank),
  fifaRank: s.fifaRank,
  rating: s.rating,
  stats: mkStats(s.rating, s.position),
  art: s.art,
}));

const BY_CODE = new Map(CARDS.map((c) => [c.code, c]));

export const PACK_COST = 100;
export const PACK_SIZE = 2;

/** Pull odds by tier — bronze common, gold rare, like a real pack. */
const TIER_WEIGHT: Record<Tier, number> = { bronze: 0.56, silver: 0.32, gold: 0.12 };

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

/** Tomorrow's fixtures (for the pack header). */
export function tomorrowSlate(now: number = Date.now()): Fixture[] {
  return tomorrowFixtures(now);
}

/** The player pool for tomorrow's pack: every nation kicking off tomorrow. */
export function tomorrowPool(now: number = Date.now()): CardDef[] {
  const codes = new Set<string>();
  for (const f of tomorrowFixtures(now)) {
    codes.add(f.home.code);
    codes.add(f.away.code);
  }
  const pool = [...codes].map((c) => BY_CODE.get(c)).filter((c): c is CardDef => Boolean(c));
  return pool.length ? pool : CARDS;
}

/** Draw one card from a pool, weighted by tier. */
export function drawFromPool(pool: CardDef[], rand: () => number = Math.random): CardDef {
  const roll = rand();
  let acc = 0;
  let tier: Tier = "bronze";
  for (const t of ["bronze", "silver", "gold"] as Tier[]) {
    acc += TIER_WEIGHT[t];
    if (roll <= acc) {
      tier = t;
      break;
    }
  }
  const tierPool = pool.filter((c) => c.tier === tier);
  const pick = tierPool.length ? tierPool : pool;
  return pick[Math.floor(rand() * pick.length)];
}

export function collectionCount(cards: Record<string, number>): number {
  return CARDS.filter((c) => (cards[c.id] ?? 0) > 0).length;
}
