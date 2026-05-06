import { NextRequest, NextResponse } from "next/server";
import { exportDatasetRow } from "@/lib/server/github-dataset";
import { createTestRun, saveScoreReport } from "@/lib/server/storage";
import { strictPromptScore } from "@/lib/strict-scoring";

export const runtime = "nodejs";

function cleanString(value: unknown, max = 8000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanDeviceId(req: NextRequest, body: Record<string, unknown>): string {
  return (
    cleanString(body.deviceId, 160) ||
    cleanString(req.headers.get("x-ai-prompt-device-id"), 160) ||
    cleanString(req.cookies.get("ai_prompt_device_id")?.value, 160) ||
    "anonymous-device"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const originalPrompt = cleanString(body.originalPrompt, 12000);
    const optimizedPrompt = cleanString(body.optimizedPrompt, 12000);
    const targetImageModelId = cleanString(body.targetImageModelId || body.targetModelId, 180);
    if (!optimizedPrompt || !targetImageModelId) {
      return NextResponse.json(
        { ok: false, error: "optimizedPrompt and targetImageModelId are required / 缺少测试提示词或目标图像模型" },
        { status: 400 },
      );
    }

    const strictScore = strictPromptScore({
      userIdea: originalPrompt || optimizedPrompt,
      promptText: optimizedPrompt,
      targetModelId: targetImageModelId,
      hasReferenceImage: body.testMode === "image_to_image" || Boolean(body.referenceImageId),
    });
    const testRun = await createTestRun({
      promptId: cleanString(body.promptId, 120) || null,
      promptVersionId: cleanString(body.promptVersionId || body.versionId, 120) || null,
      deviceId: cleanDeviceId(req, body),
      testSource: cleanString(body.testSource, 120) || "local-gpt-image2-panel",
      testMode: ["text_to_image", "image_to_image", "prompt_only"].includes(String(body.testMode))
        ? body.testMode
        : "prompt_only",
      originalPrompt,
      optimizedPrompt,
      targetImageModelId,
      externalSiteScore: Number.isFinite(Number(body.externalSiteScore)) ? Number(body.externalSiteScore) : null,
      systemScore: strictScore.total,
      pass: strictScore.pass,
    });

    const report = await saveScoreReport({
      testRunId: testRun.id,
      promptVersionId: cleanString(body.promptVersionId || body.versionId, 120) || null,
      scoreType: "prompt",
      totalScore: strictScore.total,
      pass: strictScore.pass,
      dimensionScores: strictScore.dimensionScores,
      deductions: strictScore.deductions,
      evaluatorModelIds: Array.isArray(body.evaluatorModelIds)
        ? body.evaluatorModelIds.map((item: unknown) => cleanString(item, 180)).filter(Boolean).slice(0, 6)
        : [],
    });

    const github = await exportDatasetRow("test-runs", {
      ...body,
      id: testRun.id,
      timestamp: Date.now(),
      systemScore: strictScore.total,
      strictScore,
    });

    return NextResponse.json({
      ok: true,
      testRunId: testRun.id,
      scoreReportId: report.id,
      strictScore,
      github,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Test run save failed / 测试数据保存失败" },
      { status: 500 },
    );
  }
}
