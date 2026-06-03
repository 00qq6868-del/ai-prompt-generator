import { createPromptVersion, getFeedbackByEventId, getPrompt, getPromptVersion, saveFeedback } from "../repositories/local-store.js";
import { buildSyntheticBlend, normalizePreference } from "./prompt-version-service.js";
import { estimatePromptScores, weightedScore } from "../../quality/quality-gate.js";

const LOW_QUALITY_PATTERNS = /(意图.*没|没实现|幻觉|虚高|不真实|不像|手部|手指|脸部|五官|文字|比例|构图|光影|真实感|商业完成度|hallucination|intent|hands|text|proportion|lighting)/i;

export async function submitFeedbackV3(input: {
  eventId?: string;
  promptId: string;
  promptVersionId: string;
  userScore?: number;
  starRating?: number;
  preference?: unknown;
  userNotes?: string;
}) {
  const userScore = Math.max(0, Math.min(100, Number(input.userScore ?? 0)));
  const starFallback = userScore > 0 ? Math.ceil(userScore / 20) : 3;
  const starRating = Math.max(1, Math.min(5, Math.round(Number(input.starRating ?? starFallback))));
  const preference = normalizePreference(input.preference);
  const userNotes = String(input.userNotes ?? "").slice(0, 4000);
  const eventId = input.eventId || `${input.promptId}:${input.promptVersionId}:${Date.now()}`;
  const existing = await getFeedbackByEventId(eventId);
  if (existing) {
    return { feedback: existing, needsOptimization: existing.needsOptimization, optimizationCandidate: null, idempotentReplay: true };
  }
  const needsOptimization = userScore < 70 ||
    starRating <= 3 ||
    preference === "blend_needed" ||
    preference === "both_bad" ||
    LOW_QUALITY_PATTERNS.test(userNotes);

  const record = await saveFeedback({
    eventId,
    promptId: input.promptId,
    promptVersionId: input.promptVersionId,
    userScore: userScore || starRating * 20,
    starRating,
    preference,
    userNotes,
    needsOptimization,
  });

  let optimizationCandidate = null;
  if (needsOptimization) {
    const prompt = await getPrompt(input.promptId);
    const version = await getPromptVersion(input.promptVersionId);
    const promptText = buildSyntheticBlend({
      userIdea: prompt?.userIdea ?? `Prompt ${input.promptId}`,
      newPrompt: version?.promptText ?? `Version ${input.promptVersionId}`,
      notes: userNotes || "low score feedback requires stricter prompt reconstruction",
      failedDimensions: LOW_QUALITY_PATTERNS.test(userNotes) ? ["intent_fidelity", "hallucination_resistance", "user_feedback_low_score"] : ["user_feedback_low_score"],
    });
    const qualityGate = weightedScore(estimatePromptScores(promptText, userNotes || input.promptId, ["user_feedback_low_score"]));
    optimizationCandidate = await createPromptVersion({
      promptId: input.promptId,
      versionType: "synthetic",
      promptText,
      decisionStatus: qualityGate.pass ? "candidate" : "needs_review",
      qualityGate,
    });
  }

  return { feedback: record, needsOptimization, optimizationCandidate };
}
