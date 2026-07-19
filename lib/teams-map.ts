// Map a TxODDS participant NAME (e.g. "Spain", "Argentina", "New Zealand") to a
// display team {code, flag}. The live feed identifies teams by full name; the
// UI wants a 3-letter code + flag. Unknown nations fall back to a derived code
// and a neutral flag rather than guessing wrong.

export interface NamedTeam {
  code: string;
  name: string;
  flag: string;
}

// Full national-team roster covering the WC 2026 field plus the nations that
// currently appear on the devnet sample feed. Keyed by lowercase name.
const BY_NAME: Record<string, { code: string; flag: string }> = {
  argentina: { code: "ARG", flag: "🇦🇷" },
  france: { code: "FRA", flag: "🇫🇷" },
  brazil: { code: "BRA", flag: "🇧🇷" },
  england: { code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  spain: { code: "ESP", flag: "🇪🇸" },
  germany: { code: "GER", flag: "🇩🇪" },
  portugal: { code: "POR", flag: "🇵🇹" },
  netherlands: { code: "NED", flag: "🇳🇱" },
  "united states": { code: "USA", flag: "🇺🇸" },
  usa: { code: "USA", flag: "🇺🇸" },
  mexico: { code: "MEX", flag: "🇲🇽" },
  canada: { code: "CAN", flag: "🇨🇦" },
  japan: { code: "JPN", flag: "🇯🇵" },
  "south korea": { code: "KOR", flag: "🇰🇷" },
  "korea republic": { code: "KOR", flag: "🇰🇷" },
  morocco: { code: "MAR", flag: "🇲🇦" },
  croatia: { code: "CRO", flag: "🇭🇷" },
  uruguay: { code: "URU", flag: "🇺🇾" },
  colombia: { code: "COL", flag: "🇨🇴" },
  senegal: { code: "SEN", flag: "🇸🇳" },
  belgium: { code: "BEL", flag: "🇧🇪" },
  italy: { code: "ITA", flag: "🇮🇹" },
  switzerland: { code: "SUI", flag: "🇨🇭" },
  denmark: { code: "DEN", flag: "🇩🇰" },
  poland: { code: "POL", flag: "🇵🇱" },
  serbia: { code: "SRB", flag: "🇷🇸" },
  wales: { code: "WAL", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
  ecuador: { code: "ECU", flag: "🇪🇨" },
  ghana: { code: "GHA", flag: "🇬🇭" },
  cameroon: { code: "CMR", flag: "🇨🇲" },
  "ivory coast": { code: "CIV", flag: "🇨🇮" },
  tunisia: { code: "TUN", flag: "🇹🇳" },
  algeria: { code: "ALG", flag: "🇩🇿" },
  nigeria: { code: "NGA", flag: "🇳🇬" },
  egypt: { code: "EGY", flag: "🇪🇬" },
  australia: { code: "AUS", flag: "🇦🇺" },
  "new zealand": { code: "NZL", flag: "🇳🇿" },
  "saudi arabia": { code: "KSA", flag: "🇸🇦" },
  qatar: { code: "QAT", flag: "🇶🇦" },
  iran: { code: "IRN", flag: "🇮🇷" },
  "costa rica": { code: "CRC", flag: "🇨🇷" },
  peru: { code: "PER", flag: "🇵🇪" },
  chile: { code: "CHI", flag: "🇨🇱" },
  paraguay: { code: "PAR", flag: "🇵🇾" },
  scotland: { code: "SCO", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  austria: { code: "AUT", flag: "🇦🇹" },
  ukraine: { code: "UKR", flag: "🇺🇦" },
  "czech republic": { code: "CZE", flag: "🇨🇿" },
  czechia: { code: "CZE", flag: "🇨🇿" },
  sweden: { code: "SWE", flag: "🇸🇪" },
  norway: { code: "NOR", flag: "🇳🇴" },
  turkey: { code: "TUR", flag: "🇹🇷" },
  greece: { code: "GRE", flag: "🇬🇷" },
  romania: { code: "ROU", flag: "🇷🇴" },
  hungary: { code: "HUN", flag: "🇭🇺" },
  india: { code: "IND", flag: "🇮🇳" },
  liechtenstein: { code: "LIE", flag: "🇱🇮" },
  gibraltar: { code: "GIB", flag: "🇬🇮" },
  "south africa": { code: "RSA", flag: "🇿🇦" },
  jamaica: { code: "JAM", flag: "🇯🇲" },
  panama: { code: "PAN", flag: "🇵🇦" },
  honduras: { code: "HON", flag: "🇭🇳" },
};

function deriveCode(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "TBD").padEnd(3, "X");
}

/** Resolve a feed participant name to a display team. Never throws. */
export function teamFromName(name: string | null | undefined): NamedTeam {
  const clean = (name ?? "").trim();
  const hit = BY_NAME[clean.toLowerCase()];
  if (hit) return { code: hit.code, name: clean, flag: hit.flag };
  return { code: deriveCode(clean), name: clean || "TBD", flag: "🏳️" };
}
