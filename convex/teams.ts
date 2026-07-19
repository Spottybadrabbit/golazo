// Resolve TxODDS participant names (e.g. "England", "Korea Republic") to a
// { code, flag, strength } we can render. The feed can carry any of ~48 World
// Cup / friendly nations, so this map is much wider than the sim's 16-team
// pool; unknown names fall back to a derived 3-letter code and a neutral flag.

export interface TeamInfo {
  code: string;
  name: string;
  flag: string;
  strength: number;
}

// name (lowercased) -> [code, flag, strength]
const NATIONS: Record<string, [string, string, number]> = {
  argentina: ["ARG", "🇦🇷", 0.92],
  france: ["FRA", "🇫🇷", 0.9],
  brazil: ["BRA", "🇧🇷", 0.88],
  england: ["ENG", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", 0.86],
  spain: ["ESP", "🇪🇸", 0.87],
  germany: ["GER", "🇩🇪", 0.82],
  portugal: ["POR", "🇵🇹", 0.83],
  netherlands: ["NED", "🇳🇱", 0.8],
  "united states": ["USA", "🇺🇸", 0.72],
  usa: ["USA", "🇺🇸", 0.72],
  mexico: ["MEX", "🇲🇽", 0.7],
  japan: ["JPN", "🇯🇵", 0.74],
  morocco: ["MAR", "🇲🇦", 0.78],
  croatia: ["CRO", "🇭🇷", 0.79],
  uruguay: ["URU", "🇺🇾", 0.76],
  colombia: ["COL", "🇨🇴", 0.75],
  senegal: ["SEN", "🇸🇳", 0.71],
  belgium: ["BEL", "🇧🇪", 0.83],
  italy: ["ITA", "🇮🇹", 0.82],
  switzerland: ["SUI", "🇨🇭", 0.74],
  denmark: ["DEN", "🇩🇰", 0.75],
  "korea republic": ["KOR", "🇰🇷", 0.71],
  "south korea": ["KOR", "🇰🇷", 0.71],
  "saudi arabia": ["KSA", "🇸🇦", 0.62],
  australia: ["AUS", "🇦🇺", 0.68],
  poland: ["POL", "🇵🇱", 0.72],
  serbia: ["SRB", "🇷🇸", 0.72],
  ecuador: ["ECU", "🇪🇨", 0.69],
  ghana: ["GHA", "🇬🇭", 0.68],
  cameroon: ["CMR", "🇨🇲", 0.68],
  canada: ["CAN", "🇨🇦", 0.68],
  wales: ["WAL", "🏴󠁧󠁢󠁷󠁬󠁳󠁿", 0.7],
  "costa rica": ["CRC", "🇨🇷", 0.63],
  tunisia: ["TUN", "🇹🇳", 0.66],
  iran: ["IRN", "🇮🇷", 0.67],
  qatar: ["QAT", "🇶🇦", 0.6],
  nigeria: ["NGA", "🇳🇬", 0.72],
  egypt: ["EGY", "🇪🇬", 0.7],
  "ivory coast": ["CIV", "🇨🇮", 0.71],
  "cote d'ivoire": ["CIV", "🇨🇮", 0.71],
  algeria: ["ALG", "🇩🇿", 0.7],
  scotland: ["SCO", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", 0.69],
  austria: ["AUT", "🇦🇹", 0.73],
  turkey: ["TUR", "🇹🇷", 0.72],
  "turkiye": ["TUR", "🇹🇷", 0.72],
  ukraine: ["UKR", "🇺🇦", 0.71],
  peru: ["PER", "🇵🇪", 0.67],
  chile: ["CHI", "🇨🇱", 0.68],
  paraguay: ["PAR", "🇵🇾", 0.65],
  sweden: ["SWE", "🇸🇪", 0.72],
  norway: ["NOR", "🇳🇴", 0.74],
  greece: ["GRE", "🇬🇷", 0.69],
  "czech republic": ["CZE", "🇨🇿", 0.71],
  czechia: ["CZE", "🇨🇿", 0.71],
  hungary: ["HUN", "🇭🇺", 0.69],
  romania: ["ROU", "🇷🇴", 0.67],
  "new zealand": ["NZL", "🇳🇿", 0.6],
  panama: ["PAN", "🇵🇦", 0.61],
  jamaica: ["JAM", "🇯🇲", 0.62],
};

function derivedCode(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "TBD").padEnd(3, "X");
}

export function teamFromName(name: string | undefined | null): TeamInfo {
  const clean = (name ?? "").trim();
  const hit = NATIONS[clean.toLowerCase()];
  if (hit) return { code: hit[0], name: clean, flag: hit[1], strength: hit[2] };
  return { code: derivedCode(clean), name: clean || "Unknown", flag: "🏳️", strength: 0.68 };
}
