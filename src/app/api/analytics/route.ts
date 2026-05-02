import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { checkRateLimit, rateLimitResponse, readPositiveIntEnv } from "@/lib/rate-limit";

const DATA_DIR = join(process.cwd(), ".analytics");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const ALLOWED_METRICS = new Set(["LCP", "CLS", "TTFB", "INP", "api_call", "ttft", "error"]);

function getFilePath() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return join(DATA_DIR, `${date}.jsonl`);
}

function sanitizeMetric(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const metric = input as Record<string, unknown>;
  const name = typeof metric.name === "string" ? metric.name : "";
  const value = typeof metric.value === "number" && Number.isFinite(metric.value)
    ? metric.value
    : null;
  const ts = typeof metric.ts === "number" && Number.isFinite(metric.ts)
    ? metric.ts
    : Date.now();

  if (!ALLOWED_METRICS.has(name) || value === null) return null;

  const sanitized: Record<string, unknown> = {
    name,
    value,
    ts,
  };

  if (typeof metric.rating === "string") sanitized.rating = metric.rating.slice(0, 32);
  if (typeof metric.path === "string") sanitized.path = metric.path.slice(0, 160);

  if (metric.meta && typeof metric.meta === "object" && !Array.isArray(metric.meta)) {
    const meta: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(metric.meta as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        meta[key.slice(0, 64)] = value;
      } else if (typeof value === "string") {
        meta[key.slice(0, 64)] = value.slice(0, 300);
      }
    }
    sanitized.meta = meta;
  }

  return sanitized;
}

async function forwardToWebhook(metrics: Record<string, unknown>[]) {
  const webhookUrl = process.env.ANALYTICS_WEBHOOK_URL?.trim();
  if (!webhookUrl) return false;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metrics),
    signal: AbortSignal.timeout(3000),
  });

  return res.ok;
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, {
      keyPrefix: "analytics",
      limit: readPositiveIntEnv("ANALYTICS_RATE_LIMIT_MAX", 120),
      windowMs: readPositiveIntEnv("ANALYTICS_RATE_LIMIT_WINDOW_MS", 60_000),
    });
    if (!rate.ok) return rateLimitResponse(rate);

    const body = await req.json();
    if (!Array.isArray(body) || body.length === 0 || body.length > 50) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const metrics = body.map(sanitizeMetric).filter(Boolean) as Record<string, unknown>[];
    if (metrics.length === 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const webhookSent = await forwardToWebhook(metrics).catch(() => false);
    if (webhookSent) {
      return NextResponse.json({ ok: true, count: metrics.length, sink: "webhook" });
    }

    const isVercel = process.env.VERCEL === "1";
    if (isVercel) {
      console.info(`[analytics] accepted ${metrics.length} metric(s); no durable sink configured`);
      return NextResponse.json({ ok: true, count: metrics.length, sink: "stdout" });
    }

    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }

    const filePath = getFilePath();

    if (existsSync(filePath)) {
      const size = await stat(filePath).then(s => s.size).catch(() => 0);
      if (size > MAX_FILE_SIZE) {
        return NextResponse.json({ ok: true, skipped: true });
      }
    }

    const lines = metrics
      .map((m: Record<string, unknown>) => JSON.stringify(m))
      .join("\n") + "\n";

    await appendFile(filePath, lines);

    return NextResponse.json({ ok: true, count: metrics.length, sink: "jsonl" });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
