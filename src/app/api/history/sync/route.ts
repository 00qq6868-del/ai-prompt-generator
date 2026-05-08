import { NextRequest, NextResponse } from "next/server";
import { exportDatasetRow } from "@/lib/server/github-dataset";

export const runtime = "nodejs";

interface HistorySyncItem {
  id?: string;
  timestamp?: number;
  userIdea?: string;
  optimizedPrompt?: string;
  targetModel?: string;
  generatorModel?: string;
  language?: "zh" | "en";
  isFavorite?: boolean;
}

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

function sanitizeHistoryItem(item: HistorySyncItem, deviceId: string) {
  const timestamp = Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now();
  return {
    id: cleanString(item.id, 120) || `${timestamp}`,
    timestamp,
    deviceId,
    userIdea: cleanString(item.userIdea, 8000),
    optimizedPrompt: cleanString(item.optimizedPrompt, 12000),
    targetModel: cleanString(item.targetModel, 180),
    generatorModels: cleanString(item.generatorModel, 500).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 8),
    language: item.language === "en" ? "en" : "zh",
    isFavorite: Boolean(item.isFavorite),
    source: "main-site-local-history",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = cleanDeviceId(req, body);
    const items: HistorySyncItem[] = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    const sanitized = items
      .map((item) => sanitizeHistoryItem(item, deviceId))
      .filter((item) => item.userIdea && item.optimizedPrompt && item.targetModel);

    const results = [];
    for (const item of sanitized) {
      results.push(await exportDatasetRow("prompt-history", item));
    }

    return NextResponse.json({
      ok: true,
      received: items.length,
      synced: results.length,
      githubSynced: results.some((result) => result.synced),
      targets: Array.from(new Set(results.map((result) => result.target))),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "History sync failed / 历史记录同步失败" },
      { status: 500 },
    );
  }
}
