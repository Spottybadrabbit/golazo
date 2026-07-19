// Touchline engine tests (TOUCHLINE_PRD Phase 4).
//
// Framework-free: run with `npm run touchline:test` (tsx). Exits non-zero on
// any failure so it can gate a build. Covers the four required behaviours plus
// normalization, detection, and risk-score determinism.

import assert from "node:assert/strict";
import {
  evaluateMarket,
  normalizeOdds,
  detectEventDivergence,
  detectPriceShock,
  riskScore,
  DEFAULT_THRESHOLDS,
  type MarketState,
  type Tick,
} from "../../lib/touchline/index.ts";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${(err as Error).message.split("\n")[0]}`);
  }
}

function state(partial: Partial<MarketState>): MarketState {
  return {
    verifiedEventOccurred: false,
    secondsSinceEvent: 999,
    probabilityMove: 0,
    marketFrozen: false,
    unexplainedVolatility: 0,
    ...partial,
  };
}

console.log("evaluateMarket — the four required behaviours");

test("freezes stale market after match event", () => {
  const action = evaluateMarket(
    state({ verifiedEventOccurred: true, secondsSinceEvent: 8, probabilityMove: 0.012 }),
  );
  assert.equal(action, "FREEZE_MARKET");
});

test("hedges unexplained price shock", () => {
  const action = evaluateMarket(
    state({ verifiedEventOccurred: false, unexplainedVolatility: 0.117 }),
  );
  assert.equal(action, "PAPER_HEDGE");
});

test("holds stable market", () => {
  const action = evaluateMarket(
    state({ probabilityMove: 0.01, unexplainedVolatility: 0.01 }),
  );
  assert.equal(action, "HOLD");
});

test("reopens repriced market", () => {
  const action = evaluateMarket(
    state({ marketFrozen: true, probabilityMove: 0.078 }),
  );
  assert.equal(action, "REOPEN_MARKET");
});

console.log("evaluateMarket — boundary + ordering");

test("does not freeze once the response window has passed", () => {
  const action = evaluateMarket(
    state({ verifiedEventOccurred: true, secondsSinceEvent: 11, probabilityMove: 0.01 }),
  );
  assert.equal(action, "HOLD");
});

test("does not freeze when the market already repriced enough", () => {
  const action = evaluateMarket(
    state({ verifiedEventOccurred: true, secondsSinceEvent: 5, probabilityMove: 0.06 }),
  );
  assert.equal(action, "HOLD");
});

console.log("normalizeOdds — margin stripping");

test("normalizes 1X2 odds to a distribution summing to 1", () => {
  const p = normalizeOdds({ home: 2.5, draw: 3.0, away: 3.5 });
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9);
  // Shortest odds -> highest probability.
  assert.ok(p.home > p.draw && p.draw > p.away);
});

test("normalizeOdds is defensive against garbage odds", () => {
  const p = normalizeOdds({ home: 0, draw: NaN, away: -1 });
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9);
});

console.log("detection helpers");

const tick = (home: number, seq?: number): Tick => ({
  fixtureId: 1,
  odds: { home: 1, draw: 1, away: 1 },
  probs: { home, draw: (1 - home) / 2, away: (1 - home) / 2 },
  timestamp: 0,
  sequence: seq,
});

test("detectEventDivergence fires on a stale post-event market", () => {
  const sig = detectEventDivergence(tick(0.31), tick(0.322, 991), {
    secondsSinceEvent: 8,
    sequence: 991,
  });
  assert.ok(sig, "expected a divergence signal");
  assert.equal(sig!.type, "EVENT_MARKET_DIVERGENCE");
  assert.equal(sig!.sequence, 991);
  assert.ok(sig!.severity > 50);
});

test("detectEventDivergence stays quiet when the market repriced", () => {
  const sig = detectEventDivergence(tick(0.31), tick(0.4), { secondsSinceEvent: 5 });
  assert.equal(sig, null);
});

test("detectPriceShock fires on a large unexplained move", () => {
  const sig = detectPriceShock(tick(0.31), tick(0.427));
  assert.ok(sig, "expected a shock signal");
  assert.equal(sig!.type, "UNEXPLAINED_PRICE_SHOCK");
});

test("detectPriceShock stays quiet on a small move", () => {
  const sig = detectPriceShock(tick(0.31), tick(0.34));
  assert.equal(sig, null);
});

console.log("risk-score — determinism");

test("riskScore is deterministic and bounded 0-100", () => {
  const a = riskScore("EVENT_MARKET_DIVERGENCE", 0.012, DEFAULT_THRESHOLDS.minReprice);
  const b = riskScore("EVENT_MARKET_DIVERGENCE", 0.012, DEFAULT_THRESHOLDS.minReprice);
  assert.equal(a, b);
  assert.ok(a >= 0 && a <= 100);
  // A fully stale market (no move) is maximally risky.
  assert.ok(
    riskScore("EVENT_MARKET_DIVERGENCE", 0, DEFAULT_THRESHOLDS.minReprice) >
      riskScore("EVENT_MARKET_DIVERGENCE", 0.04, DEFAULT_THRESHOLDS.minReprice),
  );
});

console.log("");
if (failures.length) {
  console.log(`FAILED ${failures.length} / ${passed + failures.length}: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`PASSED all ${passed} tests.`);
