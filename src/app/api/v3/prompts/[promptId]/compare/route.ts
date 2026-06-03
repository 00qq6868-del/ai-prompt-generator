import { okJson } from "../../../../../../server/http/response.js";
import { comparePromptVersions } from "../../../../../../server/services/prompt-version-service.js";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { promptId: string } }) {
  const { promptId } = params;
  return okJson(await comparePromptVersions(promptId));
}
