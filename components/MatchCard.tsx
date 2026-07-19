"use client";

import type { MatchState } from "@/lib/engine";

/**
 * Reusable match summary/detail block, extracted from the inlined match
 * header in HiLoGame.tsx and the stat block in Landing.tsx's LivePulse.
 * `detailed` adds probabilities, possession/xG, shot stats, and the
 * attack-pressure dial — used by the per-match detail page.
 */
export default function MatchCard({
  match,
  detailed = false,
}: {
  match: MatchState;
  detailed?: boolean;
}) {
  const m = match;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between font-mono text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-volt" />
          {m.phase === "LIVE" ? `LIVE ${m.minute}'` : m.phase}
        </span>
        <span>fixture {m.fixtureId}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <TeamBlock flag={m.home.flag} code={m.home.code} name={m.home.name} />
        <div className="text-center">
          <div className="font-mono text-4xl font-semibold tracking-tight">
            {m.score[0]}
            <span className="text-muted"> : </span>
            {m.score[1]}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            1X2 {m.odds.home.toFixed(2)} / {m.odds.draw.toFixed(2)} / {m.odds.away.toFixed(2)}
          </div>
        </div>
        <TeamBlock flag={m.away.flag} code={m.away.code} name={m.away.name} right />
      </div>

      {detailed && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <ProbBar label={`${m.home.flag} ${m.home.name}`} value={m.probs.home} strong />
          <ProbBar label="Draw" value={m.probs.draw} />
          <ProbBar label={`${m.away.flag} ${m.away.name}`} value={m.probs.away} />

          <div className="grid grid-cols-2 gap-3 font-mono text-xs text-muted sm:grid-cols-4">
            <Stat label="possession" home={m.stats[0].possession} away={m.stats[1].possession} />
            <Stat label="shots" home={m.stats[0].shots} away={m.stats[1].shots} />
            <Stat label="on target" home={m.stats[0].onTarget} away={m.stats[1].onTarget} />
            <Stat label="corners" home={m.stats[0].corners} away={m.stats[1].corners} />
            <Stat
              label="xG"
              home={m.stats[0].xg.toFixed(2)}
              away={m.stats[1].xg.toFixed(2)}
            />
            <Stat label="yellows" home={m.stats[0].yellows} away={m.stats[1].yellows} />
            <Stat label="reds" home={m.stats[0].reds} away={m.stats[1].reds} />
            <div>
              <div className="text-chalk">seq {m.sequence}</div>
              <div className="mt-0.5 uppercase tracking-widest">feed sequence</div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface/85 p-4 text-center">
            <div className="font-mono text-5xl font-semibold tracking-tight text-volt">
              {m.pressure}
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
              attack pressure index
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamBlock({
  flag,
  code,
  name,
  right,
}: {
  flag: string;
  code: string;
  name?: string;
  right?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${right ? "flex-row-reverse text-right" : ""}`}>
      <span className="text-3xl">{flag}</span>
      <span className="text-xl font-extrabold tracking-tight" title={name}>
        {code}
      </span>
    </div>
  );
}

function ProbBar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm ${strong ? "font-bold" : "text-muted"}`}>{label}</span>
        <span className="font-mono text-lg font-semibold">{value}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-night">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${strong ? "bg-volt" : "bg-muted/60"}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, home, away }: { label: string; home: number | string; away: number | string }) {
  return (
    <div>
      <div className="text-chalk">
        {home} / {away}
      </div>
      <div className="mt-0.5 uppercase tracking-widest">{label}</div>
    </div>
  );
}
