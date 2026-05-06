import { NextRequest, NextResponse } from "next/server";
import { exportDatasetRow } from "@/lib/server/github-dataset";
import { saveFeedbackRecord, saveDecision } from "@/lib/server/storage";
import { buildSyntheticBlendPrompt, normalizeDecision } from "@/lib/prompt-versioning";

interface FeedbackPayload {
  id?: string;
  timestamp?: number;
  deviceId?: string;
  promptId?: string;
  promptVersionId?: string;
  versionId?: string;
  oldVersionId?: string;
  newVersionId?: string;
  selectedVersionId?: string;
  userIdea?: string;
  originalPrompt?: string;
  previousPrompt?: string;
  optimizedPrompt?: string;
  selectedPrompt?: string;
  targetModel?: string;
  generatorModels?: string[];
  evaluatorModels?: string[];
  language?: "zh" | "en";
  userScore?: number;
  starRating?: number;
  userNotes?: string;
  preference?: string;
  aiPromptScore?: number | null;
  aiSummary?: string;
  sourceCommits?: string[];
  strictScore?: unknown;
  localTestRunIds?: string[];
}

export const runtime = "nodejs";

function cleanString(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanStringArray(value: unknown, maxItems = 12, maxLength = 160): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function cleanDeviceId(req: NextRequest, body: FeedbackPayload): string {
  return (
    cleanString(body.deviceId, 160) ||
    cleanString(req.headers.get("x-ai-prompt-device-id"), 160) ||
    cleanString(req.cookies.get("ai_prompt_device_id")?.value, 160) ||
    "anonymous-device"
  );
}

function sanitizeFeedback(req: NextRequest, input: FeedbackPayload) {
  const timestamp = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  const legacyScore = Math.max(0, Math.min(100, Number(input.userScore ?? 0)));
  const starRating = Math.max(
    1,
    Math.min(5, Math.round(Number(input.starRating ?? (legacyScore > 0 ? Math.ceil(legacyScore / 20) : 3)))),
  );
  const preference = normalizeDecision(input.preference);
  const promptVersionId = cleanString(input.promptVersionId || input.versionId, 120);

  return {
    id: cleanString(input.id, 80) || `${timestamp}`,
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
    deviceId: cleanDeviceId(req, input),
    promptId: cleanString(input.promptId, 120),
    promptVersionId,
    oldVersionId: cleanString(input.oldVersionId, 120),
    newVersionId: cleanString(input.newVersionId || input.promptVersionId || input.versionId, 120),
    selectedVersionId: cleanString(input.selectedVersionId, 120),
    userIdea: cleanString(input.userIdea, 8000),
    originalPrompt: cleanString(input.originalPrompt, 8000),
    previousPrompt: cleanString(input.previousPrompt, 12000),
    optimizedPrompt: cleanString(input.optimizedPrompt, 12000),
    selectedPrompt: cleanString(input.selectedPrompt, 12000),
    targetModel: cleanString(input.targetModel, 160),
    generatorModels: cleanStringArray(input.generatorModels),
    evaluatorModels: cleanStringArray(input.evaluatorModels),
    language: input.language === "en" ? "en" : "zh",
    userScore: legacyScore || starRating * 20,
    starRating,
    userNotes: cleanString(input.userNotes, 4000),
    preference,
    aiPromptScore: typeof input.aiPromptScore === "number" ? input.aiPromptScore : null,
    aiSummary: cleanString(input.aiSummary, 1000),
    sourceCommits: cleanStringArray(input.sourceCommits, 40, 220),
    strictScore: input.strictScore && typeof input.strictScore === "object" ? input.strictScore : null,
    localTestRunIds: cleanStringArray(input.localTestRunIds, 20, 120),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: FeedbackPayload = await req.json();
    const feedback = sanitizeFeedback(req, body);
    if (!feedback.userIdea || !feedback.optimizedPrompt || !feedback.selectedPrompt) {
      return NextResponse.json(
        { ok: false, error: "Missing feedback fields / 反馈字段不完整" },
        { status: 400 },
      );
    }

    const failedDimensions = Array.isArray((feedback.strictScore as any)?.deductions)
      ? (feedback.strictScore as any).deductions
          .map((deduction: any) => cleanString(deduction?.dimension, 120))
          .filter(Boolean)
      : [];

    const syntheticPrompt =
      feedback.promptId && (feedback.preference === "blend_needed" || feedback.preference === "both_bad")
        ? buildSyntheticBlendPrompt({
            userIdea: feedback.userIdea,
            oldPrompt: feedback.previousPrompt,
            newPrompt: feedback.optimizedPrompt,
            feedbackNotes: feedback.userNotes,
            failedDimensions,
            language: feedback.language === "en" ? "en" : "zh",
          })
        : null;

    const stored = await saveFeedbackRecord({
      promptId: feedback.promptId || null,
      promptVersionId: feedback.promptVersionId || null,
      deviceId: feedback.deviceId,
      starRating: feedback.starRating,
      userNotes: feedback.userNotes,
      preference: feedback.preference,
      oldVersionId: feedback.oldVersionId || null,
      newVersionId: feedback.newVersionId || null,
      selectedVersionId: feedback.selectedVersionId || feedback.promptVersionId || null,
      payload: feedback as unknown as Record<string, unknown>,
    });

    let decision: Awaited<ReturnType<typeof saveDecision>> | null = null;
    if (feedback.promptId) {
      decision = await saveDecision({
        promptId: feedback.promptId,
        decision: feedback.preference,
        oldVersionId: feedback.oldVersionId || null,
        newVersionId: feedback.newVersionId || feedback.promptVersionId || null,
        selectedVersionId:
          feedback.preference === "old_better"
            ? feedback.oldVersionId || null
            : feedback.preference === "new_better"
              ? feedback.newVersionId || feedback.promptVersionId || null
              : null,
        syntheticPrompt,
      });
    }

    const github = await exportDatasetRow("prompt-feedback", {
      ...feedback,
      id: stored.id,
      failedDimensions,
      selectedVersionId: decision?.selectedVersionId ?? feedback.selectedVersionId,
    });

    return NextResponse.json({
      ok: true,
      feedbackId: stored.id,
      syntheticPrompt,
      syntheticVersionId: decision?.syntheticVersionId,
      selectedVersionId: decision?.selectedVersionId,
      github,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Feedback save failed / 反馈保存失败" },
      { status: 500 },
    );
  }
}
