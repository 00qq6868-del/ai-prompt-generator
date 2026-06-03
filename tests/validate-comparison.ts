import fs from "node:fs";
import path from "node:path";
import { validateComparisonRecord } from "../src/comparison/rules.js";

const root = process.cwd();
const requiredDocs = [
  "docs/comparison/FEATURE_BENCHMARK_MATRIX.md",
  "docs/comparison/OLD_VS_NEW_DECISIONS.md",
  "docs/comparison/HYBRID_DESIGN_RECORDS.md",
  "docs/comparison/REJECTED_DESIGNS.md",
  "docs/comparison/GOLDEN_CASES.json",
  "docs/comparison/REGRESSION_CASES.json",
  "docs/comparison/DECISION_RECORDS.json",
];

const requiredModules = [
  "model_registry_and_classification",
  "model_auto_recommendation_and_manual_lock",
  "provider_adapters",
  "relay_model_support",
  "prompt_generation_orchestration",
  "multi_generator_evaluator_competition",
  "gpt_image_2_prompt_strategy",
  "strict_scoring_system",
  "user_feedback_ui",
  "version_management_ab_compare",
  "synthetic_blend_generation",
  "local_test_panel",
  "test_site_sync_pipeline",
  "github_jsonl_export",
  "rate_limit_and_security",
  "anti_hallucination_guard",
  "defensive_redteam_template",
  "playwright_e2e_quality",
  "pwa_service_worker_behavior",
  "localstorage_boundaries",
  "postgresql_local_json_fallback",
  "docker_compose",
  "ci_cd_production_smoke",
];

const missing = requiredDocs.filter((relative) => !fs.existsSync(path.join(root, relative)));
if (missing.length) {
  console.error(`Missing comparison artifacts:\n${missing.join("\n")}`);
  process.exit(1);
}

const golden = JSON.parse(fs.readFileSync(path.join(root, "docs/comparison/GOLDEN_CASES.json"), "utf8"));
const regression = JSON.parse(fs.readFileSync(path.join(root, "docs/comparison/REGRESSION_CASES.json"), "utf8"));
const decisionRecords = JSON.parse(fs.readFileSync(path.join(root, "docs/comparison/DECISION_RECORDS.json"), "utf8"));

if (!Array.isArray(golden) || golden.length < 4) {
  console.error("GOLDEN_CASES.json must contain at least 4 cases.");
  process.exit(1);
}

if (!Array.isArray(regression) || regression.length < 5) {
  console.error("REGRESSION_CASES.json must contain at least 5 cases.");
  process.exit(1);
}

for (const item of golden) {
  const required = ["id", "modality", "userIdea", "targetModelId", "requiredPromptFeatures", "minScores"];
  for (const key of required) {
    if (!(key in item)) {
      console.error(`Golden case ${item.id ?? "<unknown>"} missing ${key}`);
      process.exit(1);
    }
  }
}

if (!Array.isArray(decisionRecords)) {
  console.error("DECISION_RECORDS.json must be an array.");
  process.exit(1);
}

const byModule = new Map(decisionRecords.map((item) => [item.module, item]));
const missingModules = requiredModules.filter((module) => !byModule.has(module));
if (missingModules.length) {
  console.error(`Missing required comparison modules:\n${missingModules.join("\n")}`);
  process.exit(1);
}

for (const item of decisionRecords) {
  const required = ["module", "oldBehavior", "newCandidate", "testCases", "oldMetrics", "newMetrics", "decision", "reason", "acceptedParts", "rejectedParts"];
  for (const key of required) {
    if (!(key in item)) {
      console.error(`Decision record ${item.module ?? "<unknown>"} missing ${key}`);
      process.exit(1);
    }
  }
  if (!Array.isArray(item.testCases) || item.testCases.length === 0) {
    console.error(`Decision record ${item.module} needs testCases.`);
    process.exit(1);
  }
  if (!Array.isArray(item.acceptedParts) || item.acceptedParts.length === 0) {
    console.error(`Decision record ${item.module} needs acceptedParts.`);
    process.exit(1);
  }
  if (!Array.isArray(item.rejectedParts) || item.rejectedParts.length === 0) {
    console.error(`Decision record ${item.module} needs rejectedParts.`);
    process.exit(1);
  }
  if (!["new", "old", "hybrid", "redesign"].includes(item.decision)) {
    console.error(`Decision record ${item.module} has invalid decision ${item.decision}.`);
    process.exit(1);
  }
  for (const metricsKey of ["oldMetrics", "newMetrics"]) {
    for (const key of ["intentFidelity", "hallucinationResistance", "stability", "maintainability", "userExperience", "testCoverage", "dataLoopCompleteness", "safetyBoundaryClarity"]) {
      const value = item[metricsKey]?.[key];
      if (typeof value !== "number" || value < 0 || value > 10) {
        console.error(`Decision record ${item.module} has invalid ${metricsKey}.${key}.`);
        process.exit(1);
      }
    }
  }
  const recordErrors = validateComparisonRecord(item);
  if (recordErrors.length) {
    console.error(`Decision record ${item.module} failed comparison rule:\n${recordErrors.join("\n")}`);
    process.exit(1);
  }
}

console.log(`Comparison Lab OK: ${golden.length} golden cases, ${regression.length} regression cases, ${decisionRecords.length} module decisions.`);
