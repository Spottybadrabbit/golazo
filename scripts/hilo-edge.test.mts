// Golo Hi-Lo edge recommender tests. Run: npm run hilo:test
import assert from "node:assert/strict";
import { recommendHiLo } from "../lib/hilo-edge.ts";

let passed = 0;
const fail: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail.push(name);
    console.log(`  ✗ ${name} — ${(e as Error).message.split("\n")[0]}`);
  }
}

test("ignores small wiggles (de-spam)", () => {
  assert.equal(recommendHiLo({ prevProb: 31, currProb: 32.2 }), null); // +1.2pp < gate
});

test("calls HIGHER on a meaningful climb with room", () => {
  const r = recommendHiLo({ prevProb: 31, currProb: 38 });
  assert.ok(r, "expected a rec");
  assert.equal(r!.call, "HIGHER");
  assert.ok(r!.edge >= 35);
});

test("calls LOWER on a meaningful drift", () => {
  const r = recommendHiLo({ prevProb: 42, currProb: 34 });
  assert.ok(r);
  assert.equal(r!.call, "LOWER");
});

test("thin value near the ceiling is suppressed (little room to run)", () => {
  // A +3pp climb but already at 96% → almost no room; edge should fall below gate.
  assert.equal(recommendHiLo({ prevProb: 93, currProb: 96 }), null);
});

test("bigger move ⇒ higher edge / stronger confidence", () => {
  const small = recommendHiLo({ prevProb: 40, currProb: 45 })!;
  const big = recommendHiLo({ prevProb: 40, currProb: 55 })!;
  assert.ok(big.edge > small.edge);
});

test("deterministic", () => {
  const a = recommendHiLo({ prevProb: 30, currProb: 40 })!;
  const b = recommendHiLo({ prevProb: 30, currProb: 40 })!;
  assert.deepEqual(a, b);
});

console.log("");
if (fail.length) {
  console.log(`FAILED ${fail.length}/${passed + fail.length}: ${fail.join(", ")}`);
  process.exit(1);
}
console.log(`PASSED all ${passed} tests.`);
