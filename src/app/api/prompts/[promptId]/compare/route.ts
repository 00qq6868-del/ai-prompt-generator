import { NextRequest, NextResponse } from "next/server";
import { getPromptVersions } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { promptId: string } },
) {
  try {
    const versions = await getPromptVersions(params.promptId);
    const normalized = versions.map((version) => ({
      id: version.id,
      promptId: version.prompt_id ?? version.promptId,
      parentVersionId: version.parent_version_id ?? version.parentVersionId,
      versionNumber: version.version_number ?? version.versionNumber,
      versionType: version.version_type ?? version.versionType,
      promptText: version.prompt_text ?? version.promptText,
      score: Number(version.ai_score ?? version.aiScore ?? 0),
      decisionStatus: version.decision_status ?? version.decisionStatus,
      createdAt: version.created_at ?? version.createdAt,
    }));
    const active = normalized.find((item) => item.decisionStatus === "active" || item.decisionStatus === "accepted") ?? normalized[0] ?? null;
    const previous = normalized.find((item) => item.id !== active?.id) ?? null;
    const synthetic = normalized.find((item) => item.versionType === "synthetic") ?? null;
    return NextResponse.json({
      ok: true,
      oldVersion: previous,
      newVersion: active,
      syntheticVersion: synthetic,
      versions: normalized,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Compare load failed / 读取版本对比失败" },
      { status: 500 },
    );
  }
}
