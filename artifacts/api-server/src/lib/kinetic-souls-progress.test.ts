import assert from "node:assert/strict";
import test from "node:test";
import { buildKineticSoulsProgress } from "./kinetic-souls-progress";

test("unlocks only milestones earned from accepted match totals", () => {
  const progress = buildKineticSoulsProgress(10, 1_000);
  assert.deepEqual(progress.achievements.map(({ unlocked }) => unlocked), [true, true, true, true]);
  assert.equal(progress.matches, 10);
  assert.equal(progress.bestScore, 1_000);
});

test("leaves milestones locked below their thresholds", () => {
  const progress = buildKineticSoulsProgress(0, 499);
  assert.deepEqual(progress.achievements.map(({ unlocked }) => unlocked), [false, false, false, false]);
});
