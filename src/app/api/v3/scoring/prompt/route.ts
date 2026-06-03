import { okJson } from "../../../../../server/http/response.js";
import { estimatePromptScores, weightedScore } from "../../../../../quality/quality-gate.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const promptText = String(body.promptText ?? body.optimizedPrompt ?? "");
  const userIdea = String(body.userIdea ?? body.originalPrompt ?? "");
  const failedDimensions = Array.isArray(body.failedDimensions) ? body.failedDimensions.map(String) : [];
  const result = weightedScore(estimatePromptScores(promptText, userIdea, failedDimensions));
  return okJson({ score: result }, { qualityGate: result });
}
