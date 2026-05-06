import { NextRequest, NextResponse } from "next/server";
import { buildSyntheticBlendPrompt, normalizeDecision } from "@/lib/prompt-versioning";
import { saveDecision } from "@/lib/server/storage";

export const runtime = "nodejs";

function cleanString(value: unknown, max = 12000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(
  req: NextRequest,
  { params }: { params: { promptId: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const decision = normalizeDecision(body.decision);
    const syntheticPrompt =
      decision === "blend_needed" || decision === "both_bad"
        ? buildSyntheticBlendPrompt({
            userIdea: cleanString(body.userIdea, 8000),
            oldPrompt: cleanString(body.oldPrompt, 12000),
            newPrompt: cleanString(body.newPrompt, 12000),
            feedbackNotes: cleanString(body.notes, 4000),
            failedDimensions: Array.isArray(body.failedDimensions)
              ? body.failedDimensions.map((item: unknown) => cleanString(item, 120)).filter(Boolean)
              : [],
            language: body.language === "en" ? "en" : "zh",
          })
        : null;

    const result = await saveDecision({
      promptId: params.promptId,
      decision,
      oldVersionId: cleanString(body.oldVersionId, 120) || null,
      newVersionId: cleanString(body.newVersionId, 120) || null,
      selectedVersionId: cleanString(body.selectedVersionId, 120) || null,
      syntheticPrompt,
    });

    return NextResponse.json({
      ok: true,
      decision,
      syntheticPrompt,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Decision save failed / 保存版本决策失败" },
      { status: 500 },
    );
  }
}
