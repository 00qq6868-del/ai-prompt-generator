import { errorJson, okJson } from "../../../../../server/http/response.js";
import { generatePromptV3 } from "../../../../../server/services/prompt-orchestrator.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userIdea = String(body.userIdea ?? "").trim();
  const targetModelId = String(body.targetModelId ?? "").trim();
  if (!userIdea) return errorJson("USER_IDEA_REQUIRED", "请输入需求", "userIdea is required", 400);
  const result = await generatePromptV3({
    userIdea,
    ...(targetModelId ? { targetModelId } : {}),
    ...(body.deviceId ? { deviceId: String(body.deviceId) } : {}),
    language: body.language === "en" ? "en" : "zh",
    failedDimensions: Array.isArray(body.failedDimensions) ? body.failedDimensions.map(String) : [],
    hasReferenceImage: Boolean(body.hasReferenceImage),
  });
  return okJson({
    promptId: result.prompt.id,
    versionId: result.version.id,
    versionNumber: result.version.versionNumber,
    modality: result.engine.modality,
    targetModelId: result.prompt.targetModelId,
    modelSelection: result.modelSelection,
    optimizedPrompt: result.optimizedPrompt,
    outputContract: result.engine.outputContract,
    inheritedLessons: result.engine.inheritedLessons,
  }, { qualityGate: result.qualityGate });
}
