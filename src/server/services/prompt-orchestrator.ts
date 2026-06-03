import { buildPromptEngine } from "../../prompt-engines/router.js";
import { estimatePromptScores, weightedScore } from "../../quality/quality-gate.js";
import { createPrompt, createPromptVersion } from "../repositories/local-store.js";
import { resolveTargetModel } from "./model-selection-service.js";

export interface GenerateV3Input {
  userIdea: string;
  targetModelId?: string;
  deviceId?: string;
  language?: "zh" | "en";
  failedDimensions?: string[];
  hasReferenceImage?: boolean;
}

function renderOptimizedPrompt(systemPrompt: string): string {
  return [
    "V3 Optimized Prompt",
    "===================",
    "",
    systemPrompt,
    "",
    "Final self-check:",
    "- Intent fidelity target: >= 9/10.",
    "- Hallucination resistance target: >= 9/10.",
    "- If any requirement is unknown, require verification instead of inventing.",
  ].join("\n");
}

export async function generatePromptV3(input: GenerateV3Input) {
  const modelSelection = await resolveTargetModel({
    userIdea: input.userIdea,
    ...(input.targetModelId === undefined ? {} : { targetModelId: input.targetModelId }),
    ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
    ...(input.hasReferenceImage === undefined ? {} : { hasReferenceImage: input.hasReferenceImage }),
  });
  const engineInput = {
    userIdea: input.userIdea,
    targetModelId: modelSelection.targetModelId,
    language: input.language ?? "zh",
    failedDimensions: input.failedDimensions ?? [],
    ...(input.hasReferenceImage === undefined ? {} : { hasReferenceImage: input.hasReferenceImage }),
  };
  const engine = buildPromptEngine(engineInput);

  let optimizedPrompt = renderOptimizedPrompt(engine.systemPrompt);
  let qualityGate = weightedScore(
    estimatePromptScores(optimizedPrompt, input.userIdea, input.failedDimensions),
    undefined,
    false,
  );
  let rewriteAttempted = false;

  if (!qualityGate.pass) {
    rewriteAttempted = true;
    optimizedPrompt = [
      optimizedPrompt,
      "",
      "Rewrite reinforcement:",
      `Previous failed dimensions: ${qualityGate.failedDimensions.join(", ") || "none"}.`,
      "Strengthen verifiable constraints, anti-hallucination boundaries, and output checks before final answer.",
    ].join("\n");
    qualityGate = weightedScore(
      estimatePromptScores(optimizedPrompt, input.userIdea, [...(input.failedDimensions ?? []), ...qualityGate.failedDimensions]),
      undefined,
      true,
    );
  }

  const prompt = await createPrompt({
    userIdea: input.userIdea,
    targetModelId: modelSelection.targetModelId,
    modality: engine.modality,
  });
  const version = await createPromptVersion({
    promptId: prompt.id,
    versionType: "optimized",
    promptText: optimizedPrompt,
    decisionStatus: qualityGate.pass ? "candidate" : "needs_review",
    qualityGate: { ...qualityGate, rewriteAttempted },
  });

  return {
    prompt,
    version,
    optimizedPrompt,
    engine,
    modelSelection,
    qualityGate: { ...qualityGate, rewriteAttempted },
  };
}
