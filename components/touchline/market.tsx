// Touchline market display components: match header, probability bars, and a
// dependency-free SVG probability chart (CSP-safe — no external chart lib).

import { TL, pct, fmtMinute } from "./theme";
import { Label } from "./ui";

export interface MatchLike {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string; // ACTIVE | FROZEN
  competition?: string;
}

export function MatchHeader({ match, homeProb, drawProb, awayProb }: {
  match: MatchLike;
  homeProb?: number;
  drawProb?: number;
  awayProb?: number;
}) {
  const frozen = match.status === "FROZEN";
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{match.competition || "LIVE MATCH"}</Label>
        <span
          className="font-mono uppercase tracking-wider"
          style={{ fontSize: 10, color: frozen ? TL.red : TL.green }}
        >
          MARKET {match.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="text-right">
          <div className="font-semibold leading-tight" style={{ fontSize: 22 }}>{match.homeTeam}</div>
        </div>
        <div className="text-center">
          <div className="font-mono tabular-nums leading-none" style={{ fontSize: 40 }}>
            {match.homeScore}<span style={{ color: TL.faint, margin: "0 8px" }}>–</span>{match.awayScore}
          </div>
          <div className="mt-1 font-mono" style={{ fontSize: 12, color: TL.amber }}>{fmtMinute(match.minute)}</div>
        </div>
        <div className="text-left">
          <div className="font-semibold leading-tight" style={{ fontSize: 22 }}>{match.awayTeam}</div>
        </div>
      </div>
      {homeProb != null && drawProb != null && awayProb != null && (
        <div className="mt-4">
          <ProbabilityBars
            home={{ label: match.homeTeam, p: homeProb }}
            draw={{ label: "Draw", p: drawProb }}
            away={{ label: match.awayTeam, p: awayProb }}
          />
        </div>
      )}
    </div>
  );
}

export function ProbabilityBars({
  home,
  draw,
  away,
}: {
  home: { label: string; p: number };
  draw: { label: string; p: number };
  away: { label: string; p: number };
}) {
  const rows: Array<{ label: string; p: number; color: string }> = [
    { label: home.label, p: home.p, color: TL.green },
    { label: draw.label, p: draw.p, color: TL.muted },
    { label: away.label, p: away.p, color: TL.cyan },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[110px_1fr_52px] items-center gap-3">
          <span className="truncate font-mono" style={{ fontSize: 11, color: TL.muted }}>{r.label}</span>
          <span className="h-2 rounded-full overflow-hidden" style={{ background: "var(--tl-raised)" }}>
            <span
              className="block h-full rounded-full tl-bar"
              style={{ width: `${Math.max(2, r.p * 100)}%`, background: r.color }}
            />
          </span>
          <span className="text-right font-mono tabular-nums" style={{ fontSize: 13, color: r.color }}>
            {pct(r.p)}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface ChartTick {
  timestamp: number;
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
}

/** Autoscaled multi-line probability chart over the tick series. */
export function MarketChart({ ticks, height = 160 }: { ticks: ChartTick[]; height?: number }) {
  const W = 600;
  const H = height;
  const padY = 14;
  if (ticks.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border"
        style={{ height: H, borderColor: "var(--tl-line)", background: "var(--tl-raised)" }}
      >
        <Label>Awaiting ticks…</Label>
      </div>
    );
  }

  const series = [
    { key: "homeProbability" as const, color: TL.green },
    { key: "drawProbability" as const, color: TL.muted },
    { key: "awayProbability" as const, color: TL.cyan },
  ];
  const all = ticks.flatMap((t) => [t.homeProbability, t.drawProbability, t.awayProbability]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(0.02, max - min);
  const x = (i: number) => (i / (ticks.length - 1)) * W;
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);

  const line = (key: (typeof series)[number]["key"]) =>
    ticks.map((t, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(t[key]).toFixed(1)}`).join(" ");
  const area =
    `M0,${H} ` +
    ticks.map((t, i) => `L${x(i).toFixed(1)},${y(t.homeProbability).toFixed(1)}`).join(" ") +
    ` L${W},${H} Z`;

  return (
    <div className="w-full overflow-hidden rounded-lg border" style={{ borderColor: "var(--tl-line)", background: "var(--tl-raised)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <defs>
          <linearGradient id="tl-home-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TL.green} stopOpacity="0.22" />
            <stop offset="100%" stopColor={TL.green} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tl-home-fill)" />
        {series.map((s) => (
          <path
            key={s.key}
            d={line(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.key === "homeProbability" ? 2 : 1}
            strokeOpacity={s.key === "homeProbability" ? 1 : 0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
