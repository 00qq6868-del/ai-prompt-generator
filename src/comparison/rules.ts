import type { ComparisonDecision, CoreMetrics, ModuleComparisonRecord } from "../domain/types.js";

const CORE_FAILURE_THRESHOLD = 8;
const CLEAR_WIN_DELTA = 0.5;

const CORE_KEYS: Array<keyof CoreMetrics> = [
  "intentFidelity",
  "hallucinationResistance",
  "stability",
  "maintainability",
  "userExperience",
  "testCoverage",
  "dataLoopCompleteness",
  "safetyBoundaryClarity",
];

export function averageCoreMetrics(metrics: CoreMetrics): number {
  const total = CORE_KEYS.reduce((sum, key) => sum + metrics[key], 0);
  return Math.round((total / CORE_KEYS.length) * 100) / 100;
}

export function hasCoreFailure(metrics: CoreMetrics): boolean {
  return metrics.intentFidelity < CORE_FAILURE_THRESHOLD ||
    metrics.hallucinationResistance < CORE_FAILURE_THRESHOLD ||
    metrics.stability < CORE_FAILURE_THRESHOLD ||
    metrics.safetyBoundaryClarity < CORE_FAILURE_THRESHOLD ||
    metrics.testCoverage <= 0;
}

export function decideComparison(oldMetrics: CoreMetrics, newMetrics: CoreMetrics): ComparisonDecision {
  if (hasCoreFailure(oldMetrics) || hasCoreFailure(newMetrics)) return "redesign";

  const oldAverage = averageCoreMetrics(oldMetrics);
  const newAverage = averageCoreMetrics(newMetrics);
  const delta = Math.round((newAverage - oldAverage) * 100) / 100;

  if (delta >= CLEAR_WIN_DELTA) return "new";
  if (delta <= -CLEAR_WIN_DELTA) return "old";
  return "hybrid";
}

export function validateComparisonRecord(record: ModuleComparisonRecord): string[] {
  const errors: string[] = [];
  if (!record.module.trim()) errors.push("module is required");
  if (!record.oldBehavior.trim()) errors.push(`${record.module}: oldBehavior is required`);
  if (!record.newCandidate.trim()) errors.push(`${record.module}: newCandidate is required`);
  if (!record.testCases.length) errors.push(`${record.module}: at least one test case is required`);
  if (!record.reason.trim()) errors.push(`${record.module}: reason is required`);
  if (!record.acceptedParts.length) errors.push(`${record.module}: acceptedParts is required`);
  if (!record.rejectedParts.length) errors.push(`${record.module}: rejectedParts is required`);

  const expected = decideComparison(record.oldMetrics, record.newMetrics);
  if (record.decision !== expected) {
    errors.push(`${record.module}: decision must be ${expected}, got ${record.decision}`);
  }
  return errors;
}
