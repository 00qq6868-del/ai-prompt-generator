import { NextRequest, NextResponse } from "next/server";
import { getModelPreference, saveModelPreference } from "@/lib/server/storage";
import { BEST_IMAGE_MODEL_ID, normalizeBestModelPreference } from "@/lib/best-model-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanString(value: unknown, max = 180): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, 180)).filter(Boolean).slice(0, 6)
    : [];
}

function deviceIdFrom(req: NextRequest, body?: Record<string, unknown>): string {
  return (
    cleanString(body?.deviceId, 160) ||
    cleanString(req.headers.get("x-ai-prompt-device-id"), 160) ||
    cleanString(req.cookies.get("ai_prompt_device_id")?.value, 160) ||
    "anonymous-device"
  );
}

function hasImageIntent(req: NextRequest, body?: Record<string, unknown>): boolean {
  const explicit = cleanString(body?.targetModelCategory, 40).toLowerCase();
  if (explicit === "image") return true;
  const target = cleanString(body?.targetModelId, 180).toLowerCase();
  if (target === BEST_IMAGE_MODEL_ID) return true;
  const queryCategory = cleanString(req.nextUrl.searchParams.get("targetModelCategory"), 40).toLowerCase();
  if (queryCategory === "image") return true;
  const queryTarget = cleanString(req.nextUrl.searchParams.get("targetModelId"), 180).toLowerCase();
  return queryTarget === BEST_IMAGE_MODEL_ID;
}

export async function GET(req: NextRequest) {
  try {
    const deviceId = deviceIdFrom(req);
    const preference = await getModelPreference(deviceId);
    if (preference) {
      const normalized = hasImageIntent(req)
        ? {
            targetModelId: preference.targetModelId,
            generatorModelIds: preference.generatorModelIds,
            evaluatorModelIds: preference.evaluatorModelIds,
            upgraded: false,
          }
        : normalizeBestModelPreference(preference);
      if (normalized.upgraded) {
        const upgraded = await saveModelPreference({
          ...preference,
          targetModelId: normalized.targetModelId,
          generatorModelIds: normalized.generatorModelIds,
          evaluatorModelIds: normalized.evaluatorModelIds,
          isLocked: false,
          source: "auto",
          deviceId,
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json({ ok: true, preference: upgraded, upgraded: true });
      }
    }
    return NextResponse.json({ ok: true, preference });
  } catch (error: any) {
    console.warn("[model-preferences:get]", error?.message || error);
    return NextResponse.json({
      ok: true,
      preference: null,
      warning: "Model preference fallback used / 已使用模型偏好兜底",
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetModelId = cleanString(body.targetModelId);
    if (!targetModelId) {
      return NextResponse.json(
        { ok: false, error: "targetModelId is required / 缺少目标模型" },
        { status: 400 },
      );
    }
    const source = ["auto", "manual", "history", "server"].includes(String(body.source))
      ? body.source
      : "manual";
    const normalized = hasImageIntent(req, body)
      ? {
          targetModelId,
          generatorModelIds: cleanIds(body.generatorModelIds),
          evaluatorModelIds: cleanIds(body.evaluatorModelIds),
          upgraded: false,
        }
      : normalizeBestModelPreference({
          targetModelId,
          generatorModelIds: cleanIds(body.generatorModelIds),
          evaluatorModelIds: cleanIds(body.evaluatorModelIds),
          isLocked: Boolean(body.isLocked),
          source: String(source),
        });
    const preference = await saveModelPreference({
      targetModelId: normalized.targetModelId,
      generatorModelIds: normalized.generatorModelIds,
      evaluatorModelIds: normalized.evaluatorModelIds,
      imageJudgeModelIds: cleanIds(body.imageJudgeModelIds),
      isLocked: Boolean(body.isLocked) && !normalized.upgraded,
      source: normalized.upgraded ? "auto" : source,
      deviceId: deviceIdFrom(req, body),
      updatedAt: new Date().toISOString(),
    });

    const response = NextResponse.json({ ok: true, preference });
    response.cookies.set("ai_prompt_device_id", preference.deviceId, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  } catch (error: any) {
    console.warn("[model-preferences:put]", error?.message || error);
    return NextResponse.json({
      ok: true,
      preference: null,
      warning: "Model preference save fallback used / 模型偏好保存已降级",
    });
  }
}
