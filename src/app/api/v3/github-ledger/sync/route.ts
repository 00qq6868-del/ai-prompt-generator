import { errorJson, okJson } from "../../../../../server/http/response.js";
import { writeGithubLedgerPayload } from "../../../../../server/services/github-ledger-service.js";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.payload || typeof body.payload !== "object") {
    return errorJson("LEDGER_PAYLOAD_REQUIRED", "缺少 payload", "payload is required", 400);
  }
  const result = await writeGithubLedgerPayload({
    payload: body.payload,
    projectSlug: body.projectSlug ?? "ai-prompt-generator-v3",
    dryRun: body.dryRun !== false,
  });
  return okJson(result);
}
