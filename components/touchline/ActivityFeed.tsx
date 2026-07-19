// Touchline terminal-style audit feed (TOUCHLINE_PRD §25). Presentational —
// takes the rows produced by the `activity` Convex query.

import { TL, clock } from "./theme";
import { Label } from "./ui";

export interface ActivityRow {
  ts: number;
  group: string; // data | signals | actions | proofs
  kind: string;
  label: string;
  value: string;
  refId?: string;
}

const GROUP_COLOR: Record<string, string> = {
  data: TL.cyan,
  signals: TL.amber,
  actions: TL.red,
  proofs: TL.green,
};

export function ActivityFeed({ rows, max }: { rows: ActivityRow[]; max?: number }) {
  const shown = max ? rows.slice(0, max) : rows;
  if (!shown.length) {
    return <div className="py-6 text-center"><Label>No activity yet — start the agent</Label></div>;
  }
  return (
    <div className="font-mono overflow-x-auto" style={{ fontSize: 12 }}>
      {shown.map((r, i) => {
        const color = GROUP_COLOR[r.group] ?? TL.muted;
        return (
          <div
            key={`${r.ts}-${i}`}
            className="flex items-center gap-3 whitespace-nowrap py-1 border-b"
            style={{ borderColor: "var(--tl-line)" }}
          >
            <span style={{ color: TL.faint }}>{clock(r.ts)}</span>
            <span className="inline-block w-[150px]" style={{ color }}>{r.label}</span>
            <span style={{ color: TL.text }}>{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}
