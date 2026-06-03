import test from "node:test";
import assert from "node:assert/strict";
import { decideComparison, validateComparisonRecord } from "../src/comparison/rules.js";
import type { CoreMetrics, ModuleComparisonRecord } from "../src/domain/types.js";

function metrics(value: number): CoreMetrics {
  return {
    intentFidelity: value,
    hallucinationResistance: value,
    stability: value,
    maintainability: value,
    userExperience: value,
    testCoverage: value,
    dataLoopCompleteness: value,
    safetyBoundaryClarity: value,
  };
}

test("comparison rule chooses new only when clearly better", () => {
  assert.equal(decideComparison(metrics(8.6), metrics(9.2)), "new");
});

test("comparison rule chooses old when old is clearly better", () => {
  assert.equal(decideComparison(metrics(9.4), metrics(8.7)), "old");
});

test("comparison rule chooses hybrid when close", () => {
  assert.equal(decideComparison(metrics(9.0), metrics(9.3)), "hybrid");
});

test("comparison rule forces redesign on core failure", () => {
  const oldMetrics = metrics(9);
  const newMetrics = metrics(9);
  newMetrics.hallucinationResistance = 7.9;
  assert.equal(decideComparison(oldMetrics, newMetrics), "redesign");
});

test("comparison record validator rejects mismatched decision", () => {
  const record: ModuleComparisonRecord = {
    module: "image_prompt_engine",
    oldBehavior: "old",
    newCandidate: "new",
    testCases: ["image-hands-text-reference-strict"],
    oldMetrics: metrics(8.6),
    newMetrics: metrics(9.2),
    decision: "old",
    reason: "bad decision",
    acceptedParts: ["x"],
    rejectedParts: ["y"],
  };
  assert.match(validateComparisonRecord(record).join("\n"), /decision must be new/);
});
