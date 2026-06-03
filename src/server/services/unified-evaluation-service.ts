import type { ArtifactType, EvaluationScoreSet, FeedbackMemoryDelta } from "../../domain/types.js";
import { buildQualityFindings, partitionFindings, shouldOptimize } from "../../quality/icon-rules.js";
import { estimatePromptScores, weightedScore } from "../../quality/quality-gate.js";
import { createPromptVersion, getPrompt, getPromptVersion } from "../repositories/local-store.js";
import { writeGithubLedgerPayload } from "./github-ledger-service.js";
import { buildSyntheticBlend } from "./prompt-version-service.js";

function nowIso(): string {
  return new Date().toISOString();
}

function mapPromptScores(raw: Record<string, number>, artifactType: ArtifactType): EvaluationScoreSet {
  const intent = raw.intent_fidelity ?? 0;
  const hallucination = raw.hallucination_resistance ?? 0;
  const structure = raw.structure_completeness ?? 0;
  const detail = raw.detail_coverage ?? 0;
  return {
    hallucination_resistance: hallucination,
    user_intent_alignment: intent,
    completeness: detail,
    factual_accuracy: hallucination,
    actionability: raw.specificity_control ?? 0,
    format_compliance: raw.output_format_clarity ?? 0,
    model_specific_optimization: raw.target_model_fit ?? 0,
    safety: raw.hallucination_resistance ?? 0,
    consistency: raw.generation_stability ?? 0,
    maintainability: structure,
    testability: raw.evaluation_readiness ?? 0,
    ...(artifactType === "image_prompt" ? { image_prompt_quality: Math.min(detail, raw.negative_constraints ?? 0, raw.reference_image_consistency ?? 0) } : {}),
    ...(artifactType === "workbench_task" ? { workspace_task_quality: Math.min(detail, raw.evaluation_readiness ?? 0, hallucination) } : {}),
  };
}

function inferRepeatedIssueKeys(humanNotes: string, scores: Partial<EvaluationScoreSet>): string[] {
  const keys: string[] = [];
  if (/幻觉|hallucination/i.test(humanNotes) || (scores.hallucination_resistance ?? 10) < 9) keys.push("hallucination_resistance");
  if (/意图|没实现|intent/i.test(humanNotes) || (scores.user_intent_alignment ?? 10) < 9) keys.push("user_intent_alignment");
  if (/文字|text/i.test(humanNotes)) keys.push("text_rendering");
  if (/手|hand|finger/i.test(humanNotes)) keys.push("hand_anatomy");
  if (/比例|proportion/i.test(humanNotes)) keys.push("object_proportion");
  return [...new Set(keys)];
}

export async function evaluateAndOptimizeUnified(input: {
  artifactType: ArtifactType;
  promptId: string;
  promptVersionId: string;
  targetModelId?: string;
  aiScores?: Partial<EvaluationScoreSet>;
  humanScore?: number;
  humanNotes?: string;
  humanSeverity?: "low" | "medium" | "high" | "critical";
  evaluatorVersion?: string;
  githubSyncMode?: "payload_only" | "disabled";
}) {
  const prompt = await getPrompt(input.promptId);
  const version = await getPromptVersion(input.promptVersionId);
  if (!prompt || !version) {
    return { ok: false as const, code: "PROMPT_OR_VERSION_NOT_FOUND", message: "prompt or prompt version was not found" };
  }

  const rawScores = estimatePromptScores(version.promptText, prompt.userIdea);
  const inferredScores = mapPromptScores(rawScores, input.artifactType);
  const scores: EvaluationScoreSet = { ...inferredScores, ...input.aiScores };
  const repeatedIssueKeys = inferRepeatedIssueKeys(input.humanNotes ?? "", scores);
  const findings = buildQualityFindings({
    scores,
    ...(input.humanNotes === undefined ? {} : { humanNotes: input.humanNotes }),
    ...(input.humanScore === undefined ? {} : { humanScore: input.humanScore }),
    ...(input.humanSeverity === undefined ? {} : { humanSeverity: input.humanSeverity }),
    repeatedIssueKeys,
  });
  const partitions = partitionFindings(findings);
  const optimize = shouldOptimize(findings);

  const memoryDelta: FeedbackMemoryDelta = {
    id: `fm_${Date.now()}`,
    artifactId: input.promptId,
    artifactType: input.artifactType,
    versionId: input.promptVersionId,
    targetModelId: input.targetModelId ?? prompt.targetModelId,
    humanOverridesAi: Boolean(input.humanNotes || input.humanScore !== undefined),
    repeatedIssueKeys,
    effectiveStrategies: [],
    ineffectiveStrategies: [],
    yellowItems: partitions.yellow,
    greenBelowNineItems: partitions.greenBelowNine,
    createdAt: nowIso(),
  };

  let optimizationCandidate = null;
  if (optimize) {
    const failedDimensions = findings.map((item) => item.dimension);
    const promptText = buildSyntheticBlend({
      userIdea: prompt.userIdea,
      newPrompt: version.promptText,
      notes: [
        input.humanNotes ? `Human feedback: ${input.humanNotes}` : "",
        `Priority findings: ${findings.map((item) => `${item.icon}:${item.dimension}`).join(", ")}`,
        "Mandatory order: human feedback, red issues, yellow issues, green hallucination below 9, green intent below 9, other green below 9.",
      ].filter(Boolean).join("\n"),
      failedDimensions,
    });
    const qualityGate = weightedScore(estimatePromptScores(promptText, prompt.userIdea, failedDimensions), undefined, true);
    optimizationCandidate = await createPromptVersion({
      promptId: input.promptId,
      versionType: "synthetic",
      promptText,
      decisionStatus: qualityGate.pass && partitions.red.length === 0 ? "candidate" : "needs_review",
      qualityGate,
    });
  }

  const githubLedgerPayload = {
    schemaVersion: "v3.github-ledger.1",
    generatedAt: nowIso(),
    evaluatorVersion: input.evaluatorVersion ?? "unified-evaluator-v1",
    project: "ai-prompt-generator-v3",
    artifactType: input.artifactType,
    promptId: input.promptId,
    promptVersionId: input.promptVersionId,
    targetModelId: input.targetModelId ?? prompt.targetModelId,
    redactedInput: prompt.userIdea,
    aiEvaluation: { scores, findings },
    humanEvaluation: {
      score: input.humanScore ?? null,
      notes: input.humanNotes ?? "",
      severity: input.humanSeverity ?? null,
      priority: "highest",
      overridesAi: memoryDelta.humanOverridesAi,
    },
    yellowItems: partitions.yellow,
    greenBelowNineItems: partitions.greenBelowNine,
    redItems: partitions.red,
    feedbackMemoryDelta: memoryDelta,
    optimization: {
      triggered: optimize,
      newVersionId: optimizationCandidate?.id ?? null,
      status: optimizationCandidate?.decisionStatus ?? "not_needed",
    },
    regression: {
      required: true,
      commands: ["npm run test:compiled", "npm run quality:golden", "npm run schema:validate"],
    },
  };

  const githubLedger = input.githubSyncMode === "disabled"
    ? null
    : await writeGithubLedgerPayload({ payload: githubLedgerPayload, projectSlug: "ai-prompt-generator-v3", dryRun: input.githubSyncMode === "payload_only" });

  return {
    ok: true as const,
    scores,
    findings,
    partitions,
    needsOptimization: optimize,
    optimizationCandidate,
    feedbackMemoryDelta: memoryDelta,
    githubLedgerPayload,
    githubLedger,
  };
}
