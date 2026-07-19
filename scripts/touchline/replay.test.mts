// Touchline replay-loop test.
//
// Folds the *actual* demo timeline (replay/world-cup-demo.json) through the
// stepAgent reducer exactly as convex/touchline.ts does, and asserts the full
// autonomous sequence the demo depends on: FREEZE (stale market after a goal)
// -> REOPEN (market reprices) -> PAPER_HEDGE (later unexplained shock). This is
// the "does the loop actually work" gate. Run: npm run touchline:test:replay

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  stepAgent,
  initialRuntime,
  tickFromOdds,
  scoreEventFrom,
  type AgentRuntime,
  type ScoreEvent,
} from "../../lib/touchline/index.ts";
import type { ReplayTimeline } from "../../lib/touchline/source.ts";

const here = dirname(fileURLToPath(import.meta.url));
const timeline = JSON.parse(
  readFileSync(join(here, "../../replay/world-cup-demo.json"), "utf8"),
) as ReplayTimeline;

let rt: AgentRuntime = initialRuntime();
let pendingEvent: ScoreEvent | null = null;
const decisions: string[] = [];

for (const e of timeline.events) {
  if (e.type === "SCORE_EVENT") {
    pendingEvent = scoreEventFrom(timeline.fixtureId, e, e.t);
    continue;
  }
  const tick = tickFromOdds(timeline.fixtureId, e.odds, e.t);
  const res = stepAgent(rt, tick, pendingEvent);
  pendingEvent = null;
  rt = res.runtime;
  if (res.emitAction) {
    decisions.push(res.action);
    const p = (n: number) => `${(n * 100).toFixed(1)}%`;
    console.log(
      `  t=${String(e.t).padStart(5)}ms  ARG ${p(tick.probs.home)}  ->  ${res.action}` +
        (res.signal ? `  [${res.signal.type} sev ${res.signal.severity}]` : ""),
    );
  }
}

console.log("");
console.log(`decisions: ${decisions.join(" -> ") || "(none)"}`);

let ok = true;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) ok = false;
}

check("produced a FREEZE_MARKET", decisions.includes("FREEZE_MARKET"));
check("produced a REOPEN_MARKET", decisions.includes("REOPEN_MARKET"));
check("produced a PAPER_HEDGE", decisions.includes("PAPER_HEDGE"));
check(
  "FREEZE happens before REOPEN",
  decisions.indexOf("FREEZE_MARKET") < decisions.indexOf("REOPEN_MARKET"),
);
check(
  "REOPEN happens before the later HEDGE",
  decisions.indexOf("REOPEN_MARKET") < decisions.lastIndexOf("PAPER_HEDGE"),
);

console.log("");
if (!ok) {
  console.log("REPLAY SEQUENCE FAILED");
  process.exit(1);
}
console.log("REPLAY SEQUENCE OK");
