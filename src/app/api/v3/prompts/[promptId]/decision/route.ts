import { okJson } from "../../../../../../server/http/response.js";
import { decidePromptVersion } from "../../../../../../server/services/prompt-version-service.js";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { promptId: string } }) {
  const { promptId } = params;
  const body = await req.json().catch(() => ({}));
  const result = await decidePromptVersion({
    promptId,
    decision: body.decision,
    ...(body.oldVersionId ? { oldVersionId: String(body.oldVersionId) } : {}),
    ...(body.newVersionId ? { newVersionId: String(body.newVersionId) } : {}),
    ...(body.oldPrompt ? { oldPrompt: String(body.oldPrompt) } : {}),
    ...(body.newPrompt ? { newPrompt: String(body.newPrompt) } : {}),
    ...(body.userIdea ? { userIdea: String(body.userIdea) } : {}),
    ...(body.notes ? { notes: String(body.notes) } : {}),
    failedDimensions: Array.isArray(body.failedDimensions) ? body.failedDimensions.map(String) : [],
  });
  return okJson(result);
}
