import { NextRequest, NextResponse } from "next/server";
import { buildSyntheticBlendPrompt } from "@/lib/prompt-versioning";

export const runtime = "nodejs";

function cleanString(value: unknown, max = 12000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const syntheticPrompt = buildSyntheticBlendPrompt({
      userIdea: cleanString(body.userIdea, 8000),
      oldPrompt: cleanString(body.oldPrompt, 12000),
      newPrompt: cleanString(body.newPrompt || body.currentPrompt, 12000),
      feedbackNotes: cleanString(body.feedbackNotes || body.notes, 4000),
      failedDimensions: Array.isArray(body.failedDimensions)
        ? body.failedDimensions.map((item: unknown) => cleanString(item, 120)).filter(Boolean)
        : [],
      language: body.language === "en" ? "en" : "zh",
    });

    return NextResponse.json({
      ok: true,
      jobId: `local-${Date.now().toString(36)}`,
      status: "completed",
      mode: cleanString(body.mode, 80) || "feedback_loop",
      includeGithubSources: Boolean(body.includeGithubSources),
      includeTestRuns: Boolean(body.includeTestRuns),
      syntheticPrompt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Optimization job failed / 优化任务失败" },
      { status: 500 },
    );
  }
}
