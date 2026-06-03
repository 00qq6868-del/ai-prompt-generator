import { estimatePromptScores, weightedScore } from "../../quality/quality-gate.js";
import { saveTestRun } from "../repositories/local-store.js";

export async function ingestTestRunV3(input: {
  eventId?: string;
  promptId?: string;
  promptVersionId?: string;
  originalPrompt: string;
  optimizedPrompt: string;
  targetModelId: string;
  externalScore?: number | null;
}) {
  const qualityGate = weightedScore(estimatePromptScores(input.optimizedPrompt, input.originalPrompt));
  const record = await saveTestRun({
    eventId: input.eventId || `${Date.now()}:${input.targetModelId}`,
    ...(input.promptId === undefined ? {} : { promptId: input.promptId }),
    ...(input.promptVersionId === undefined ? {} : { promptVersionId: input.promptVersionId }),
    originalPrompt: input.originalPrompt,
    optimizedPrompt: input.optimizedPrompt,
    targetModelId: input.targetModelId,
    externalScore: input.externalScore ?? null,
    systemScore: qualityGate.totalScore,
    pass: qualityGate.pass,
  });
  return { testRun: record, qualityGate };
}
