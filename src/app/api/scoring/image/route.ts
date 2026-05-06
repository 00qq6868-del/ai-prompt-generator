import { NextRequest, NextResponse } from "next/server";
import { exportDatasetRow } from "@/lib/server/github-dataset";
import { saveScoreReport } from "@/lib/server/storage";
import { IMAGE_SCORE_DIMENSIONS, strictWeightedScore } from "@/lib/strict-scoring";

export const runtime = "nodejs";

function cleanString(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function collectScores(body: Record<string, unknown>): Record<string, number> {
  const raw = body.dimensionScores && typeof body.dimensionScores === "object"
    ? body.dimensionScores as Record<string, unknown>
    : {};
  const defaults: Record<string, number> = {};
  for (const dimension of IMAGE_SCORE_DIMENSIONS) {
    defaults[dimension.id] = Number.isFinite(Number(raw[dimension.id])) ? Number(raw[dimension.id]) : 0;
  }

  const metrics = body.metrics && typeof body.metrics === "object" ? body.metrics as Record<string, unknown> : {};
  if (Number.isFinite(Number(metrics.faceSimilarity))) {
    defaults.reference_similarity = Math.min(10, Math.max(defaults.reference_similarity, Number(metrics.faceSimilarity) * 10));
    defaults.identity_preservation = Math.min(10, Math.max(defaults.identity_preservation, Number(metrics.faceSimilarity) * 10));
  }
  if (Number.isFinite(Number(metrics.ssim))) {
    defaults.composition = Math.min(10, Math.max(defaults.composition, Number(metrics.ssim) * 10));
  }
  return defaults;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = strictWeightedScore({
      scoreType: "image",
      dimensions: collectScores(body),
    }, IMAGE_SCORE_DIMENSIONS);

    const report = await saveScoreReport({
      testRunId: cleanString(body.testRunId, 120) || null,
      promptVersionId: cleanString(body.promptVersionId || body.versionId, 120) || null,
      scoreType: "image",
      totalScore: result.total,
      pass: result.pass,
      dimensionScores: result.dimensionScores,
      deductions: result.deductions,
      evaluatorModelIds: Array.isArray(body.evaluatorModelIds)
        ? body.evaluatorModelIds.map((item: unknown) => cleanString(item, 180)).filter(Boolean).slice(0, 6)
        : [],
    });

    const github = await exportDatasetRow("score-reports", {
      id: report.id,
      timestamp: Date.now(),
      promptVersionId: cleanString(body.promptVersionId || body.versionId, 120),
      testScores: {
        system_score: result.total,
        external_score: Number.isFinite(Number(body.externalSiteScore)) ? Number(body.externalSiteScore) : null,
      },
      strictScore: result,
      failedDimensions: result.deductions.map((item) => item.dimension),
    });

    return NextResponse.json({
      ok: true,
      scoreReportId: report.id,
      strictScore: result,
      github,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Image scoring failed / 图片评分失败" },
      { status: 500 },
    );
  }
}
