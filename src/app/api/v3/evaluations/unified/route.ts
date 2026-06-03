import { evaluateAndOptimizeUnified } from "../../../../../server/services/unified-evaluation-service.js";
import { errorJson, okJson } from "../../../../../server/http/response.js";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.promptId || !body.promptVersionId) {
    return errorJson("EVALUATION_IDS_REQUIRED", "缺少 promptId 或 promptVersionId", "promptId and promptVersionId are required", 400);
  }
  const artifactType = body.artifactType ?? "text_prompt";
  if (!["text_prompt", "image_prompt", "workbench_task", "system_prompt", "rag_prompt"].includes(artifactType)) {
    return errorJson("INVALID_ARTIFACT_TYPE", "artifactType 不合法", "artifactType is invalid", 400);
  }
  const result = await evaluateAndOptimizeUnified({
    artifactType,
    promptId: String(body.promptId),
    promptVersionId: String(body.promptVersionId),
    ...(body.targetModelId === undefined ? {} : { targetModelId: String(body.targetModelId) }),
    ...(body.aiScores === undefined ? {} : { aiScores: body.aiScores }),
    ...(body.humanScore === undefined ? {} : { humanScore: Number(body.humanScore) }),
    ...(body.humanNotes === undefined ? {} : { humanNotes: String(body.humanNotes) }),
    ...(body.humanSeverity === undefined ? {} : { humanSeverity: body.humanSeverity }),
    ...(body.evaluatorVersion === undefined ? {} : { evaluatorVersion: String(body.evaluatorVersion) }),
  });
  if (!result.ok) {
    return errorJson(result.code, result.message, result.message, 404);
  }
  return okJson(result);
}
