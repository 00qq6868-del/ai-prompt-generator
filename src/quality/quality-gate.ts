import type { QualityGateResult } from "../domain/types.js";
import { PROMPT_SCORE_DIMENSIONS, type ScoreDimension } from "./dimensions.js";

function clamp10(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(10, number));
}

export function weightedScore(
  rawScores: Record<string, number>,
  dimensions: ScoreDimension[] = PROMPT_SCORE_DIMENSIONS,
  rewriteAttempted = false,
): QualityGateResult {
  const normalized: Record<string, number> = {};
  const deductions: QualityGateResult["deductions"] = [];
  let totalScore = 0;

  for (const dimension of dimensions) {
    const score = clamp10(rawScores[dimension.id]);
    normalized[dimension.id] = score;
    totalScore += (score / 10) * dimension.weight;
    if (score < 3) {
      deductions.push({ dimension: dimension.id, reason: "dimension_below_3_direct_fail", score });
    }
    if (dimension.id === "text_rendering" && score < 6) {
      deductions.push({ dimension: dimension.id, reason: "text_not_reliably_readable", score });
    }
    if (dimension.id === "reference_similarity" && score < 5) {
      deductions.push({ dimension: dimension.id, reason: "reference_identity_or_pose_drift", score });
    }
  }

  const intentFidelity = normalized.intent_fidelity ?? normalized.reference_similarity ?? 0;
  const hallucinationResistance = normalized.hallucination_resistance ?? normalized.artifact_control ?? 0;
  const coreFailure = deductions.some((deduction) =>
    dimensions.some((dimension) => dimension.id === deduction.dimension && dimension.core && deduction.score < 3),
  );
  const failedDimensions = deductions.map((deduction) => deduction.dimension);
  const pass = totalScore >= 70 &&
    intentFidelity >= 9 &&
    hallucinationResistance >= 9 &&
    !coreFailure;

  return {
    pass,
    totalScore: Math.round(totalScore * 100) / 100,
    intentFidelity,
    hallucinationResistance,
    rewriteAttempted,
    needsReview: !pass && rewriteAttempted,
    failedDimensions,
    deductions,
  };
}

export function estimatePromptScores(prompt: string, userIdea: string, failedDimensions: string[] = []): Record<string, number> {
  const lower = prompt.toLowerCase();
  const ideaTerms = userIdea
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .slice(0, 32);
  const matched = ideaTerms.filter((term) => prompt.includes(term)).length;
  const intent = ideaTerms.length ? Math.min(10, 4 + (matched / ideaTerms.length) * 6) : 8;
  const hasStructure = /final prompt|negative prompt|quality checklist|output|constraints|验证|检查|最终提示词|负面|质量清单/i.test(prompt);
  const hasNoFabrication = /do not fabricate|do not invent|不得编造|不要编造|unknown|不确定|来源|evidence/i.test(prompt);
  const hasEvaluation = /score|quality gate|rubric|verify|test|评分|验证|质量门槛|检查/i.test(prompt);
  const hasNegative = /negative|avoid|do not|no |禁止|不要|避免|负面/i.test(prompt);
  const hasReference = /reference|identity|face|hand|text rendering|参考|身份|五官|手部|文字/i.test(prompt);
  const failureBoost = failedDimensions.length ? 1 : 0;

  return {
    intent_fidelity: Math.round(intent * 10) / 10,
    detail_coverage: Math.min(10, 6 + (prompt.length > 900 ? 2 : 0) + failureBoost),
    target_model_fit: Math.min(10, 6 + (/gpt-image|image|reasoning|red team|defensive|模型/i.test(prompt) ? 2 : 0)),
    structure_completeness: hasStructure ? 9 : 5,
    specificity_control: Math.min(10, 6 + (hasNegative ? 1 : 0) + failureBoost + (/exact|specific|must|必须|精确/i.test(prompt) ? 1 : 0)),
    negative_constraints: hasNegative ? 9 : 3,
    output_format_clarity: hasStructure ? 9 : 5,
    evaluation_readiness: hasEvaluation ? 9 : 4,
    hallucination_resistance: hasNoFabrication ? 9 : 5,
    generation_stability: Math.min(10, 7 + (hasStructure ? 1 : 0) + (hasEvaluation ? 1 : 0)),
    reference_image_consistency: hasReference ? 9 : 6,
  };
}
