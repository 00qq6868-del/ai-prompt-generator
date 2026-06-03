import { errorJson, okJson } from "../../../../server/http/response.js";
import { ingestTestRunV3 } from "../../../../server/services/test-run-ingestion-service.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const optimizedPrompt = String(body.optimizedPrompt ?? "").trim();
  const targetModelId = String(body.targetModelId ?? body.targetImageModelId ?? "").trim();
  if (!optimizedPrompt || !targetModelId) {
    return errorJson("TEST_RUN_FIELDS_REQUIRED", "缺少 optimizedPrompt 或 targetModelId", "optimizedPrompt and targetModelId are required", 400);
  }
  const result = await ingestTestRunV3({
    ...(body.eventId ? { eventId: String(body.eventId) } : {}),
    ...(body.promptId ? { promptId: String(body.promptId) } : {}),
    ...(body.promptVersionId ? { promptVersionId: String(body.promptVersionId) } : {}),
    originalPrompt: String(body.originalPrompt ?? optimizedPrompt),
    optimizedPrompt,
    targetModelId,
    externalScore: Number.isFinite(Number(body.externalScore ?? body.externalSiteScore)) ? Number(body.externalScore ?? body.externalSiteScore) : null,
  });
  return okJson(result, { qualityGate: result.qualityGate });
}
