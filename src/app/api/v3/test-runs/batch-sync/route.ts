import { okJson } from "../../../../../server/http/response.js";
import { ingestTestRunV3 } from "../../../../../server/services/test-run-ingestion-service.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const results = [];
  for (const item of items.slice(0, 50)) {
    const optimizedPrompt = String(item.optimizedPrompt ?? "").trim();
    const targetModelId = String(item.targetModelId ?? item.targetImageModelId ?? "").trim();
    if (!optimizedPrompt || !targetModelId) continue;
    results.push(await ingestTestRunV3({
      ...(item.eventId ? { eventId: String(item.eventId) } : {}),
      ...(item.promptId ? { promptId: String(item.promptId) } : {}),
      ...(item.promptVersionId ? { promptVersionId: String(item.promptVersionId) } : {}),
      originalPrompt: String(item.originalPrompt ?? optimizedPrompt),
      optimizedPrompt,
      targetModelId,
      externalScore: Number.isFinite(Number(item.externalScore ?? item.externalSiteScore)) ? Number(item.externalScore ?? item.externalSiteScore) : null,
    }));
  }
  return okJson({ synced: results.length, results });
}
