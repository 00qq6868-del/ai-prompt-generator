import { errorJson, okJson } from "../../../../server/http/response.js";
import { submitFeedbackV3 } from "../../../../server/services/feedback-loop-service.js";
import { evaluateAndOptimizeUnified } from "../../../../server/services/unified-evaluation-service.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const promptId = String(body.promptId ?? "").trim();
  const promptVersionId = String(body.promptVersionId ?? body.versionId ?? "").trim();
  if (!promptId || !promptVersionId) {
    return errorJson("FEEDBACK_IDS_REQUIRED", "缺少 promptId 或 promptVersionId", "promptId and promptVersionId are required", 400);
  }
  const result = await submitFeedbackV3({
    ...(body.eventId ? { eventId: String(body.eventId) } : {}),
    promptId,
    promptVersionId,
    userScore: Number(body.userScore ?? 0),
    starRating: Number(body.starRating ?? 0),
    preference: body.preference,
    userNotes: String(body.userNotes ?? ""),
  });
  const artifactType = String(body.artifactType ?? "text_prompt");
  const unified = await evaluateAndOptimizeUnified({
    artifactType: ["text_prompt", "image_prompt", "workbench_task", "system_prompt", "rag_prompt"].includes(artifactType) ? artifactType as any : "text_prompt",
    promptId,
    promptVersionId,
    ...(body.targetModelId === undefined ? {} : { targetModelId: String(body.targetModelId) }),
    humanScore: Number(body.userScore ?? 0),
    humanNotes: String(body.userNotes ?? ""),
    humanSeverity: Number(body.userScore ?? 100) < 70 ? "high" : "medium",
    githubSyncMode: "payload_only",
  });
  return okJson({ ...result, unifiedEvaluation: unified.ok ? unified : null });
}
