import fs from "node:fs";
import path from "node:path";
import type { GoldenCase } from "../src/domain/types.js";
import { buildPromptEngine } from "../src/prompt-engines/router.js";
import { estimatePromptScores, weightedScore } from "../src/quality/quality-gate.js";

let failed = 0;

const cases = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "docs/comparison/GOLDEN_CASES.json"), "utf8"),
) as GoldenCase[];

for (const item of cases) {
  const output = buildPromptEngine({
    userIdea: item.userIdea,
    targetModelId: item.targetModelId,
    language: "zh",
    failedDimensions: item.failedDimensions,
  });
  const scores = estimatePromptScores(output.systemPrompt, item.userIdea, item.failedDimensions);
  const result = weightedScore(scores);
  const ok = result.intentFidelity >= 8.5 && result.hallucinationResistance >= 9;
  console.log(`${ok ? "PASS" : "FAIL"} ${item.id}: total=${result.totalScore}, intent=${result.intentFidelity}, hallucination=${result.hallucinationResistance}, modality=${output.modality}`);
  if (!ok) failed += 1;
}

if (failed > 0) process.exit(1);
