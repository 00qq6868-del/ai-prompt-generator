import { okJson } from "../../../../server/http/response.js";
import { DEFAULT_DEVICE_ID, getModelPreference, saveModelPreference } from "../../../../server/repositories/local-store.js";

export const runtime = "nodejs";

function parseDeviceId(url: string): string {
  const value = new URL(url).searchParams.get("deviceId");
  return value?.trim() || DEFAULT_DEVICE_ID;
}

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

export async function GET(req: Request) {
  return okJson(await getModelPreference(parseDeviceId(req.url)));
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const current = await getModelPreference(String(body.deviceId ?? DEFAULT_DEVICE_ID));
  const source = body.source === "auto" || body.source === "imported" ? body.source : "manual";
  const preference = await saveModelPreference({
    deviceId: String(body.deviceId ?? current.deviceId),
    targetModelId: String(body.targetModelId ?? current.targetModelId).trim() || current.targetModelId,
    generatorModelIds: normalizeList(body.generatorModelIds, current.generatorModelIds),
    evaluatorModelIds: normalizeList(body.evaluatorModelIds, current.evaluatorModelIds),
    imageJudgeModelIds: normalizeList(body.imageJudgeModelIds, current.imageJudgeModelIds),
    isLocked: Boolean(body.isLocked ?? current.isLocked),
    source,
  });
  return okJson(preference);
}
