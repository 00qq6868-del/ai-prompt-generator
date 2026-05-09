export type OptimizationBacklogType =
  | "model_error"
  | "quality_gate"
  | "low_dimension"
  | "test_channel_runtime";

export type OptimizationBacklogSeverity = "red" | "yellow" | "green";

export interface OptimizationBacklogItem {
  id: string;
  fingerprint: string;
  source: "test_channel" | "human_feedback" | "regression";
  reportId?: string;
  type: OptimizationBacklogType;
  severity: OptimizationBacklogSeverity;
  status: "pending" | "in_progress" | "resolved";
  title: string;
  detail: string;
  action: string;
  modelId?: string;
  provider?: string;
  dimension?: string;
  checkId?: string;
  createdAt: number;
  lastSeenAt: number;
  occurrences: number;
}

export interface OptimizationBacklogPayload {
  status: "empty" | "pending";
  itemCount: number;
  items: OptimizationBacklogItem[];
  summary: string;
}

export const PENDING_OPTIMIZATION_STORAGE_KEY = "ai_prompt_pending_optimizations";

function cleanText(value: unknown, max = 800): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function buildOptimizationFingerprint(parts: unknown[]): string {
  const text = parts.map((part) => cleanText(String(part ?? ""), 180).toLowerCase()).join("|");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `opt_${(hash >>> 0).toString(16)}`;
}

export function normalizeOptimizationBacklogItem(
  input: Partial<OptimizationBacklogItem>,
): OptimizationBacklogItem {
  const now = Number.isFinite(Number(input.lastSeenAt || input.createdAt))
    ? Number(input.lastSeenAt || input.createdAt)
    : Date.now();
  const type: OptimizationBacklogType = input.type || "test_channel_runtime";
  const severity: OptimizationBacklogSeverity = input.severity || "yellow";
  const fingerprint = input.fingerprint || buildOptimizationFingerprint([
    input.source || "test_channel",
    type,
    input.modelId,
    input.provider,
    input.dimension,
    input.checkId,
    input.title,
  ]);

  return {
    id: input.id || fingerprint,
    fingerprint,
    source: input.source || "test_channel",
    reportId: cleanText(input.reportId, 160) || undefined,
    type,
    severity,
    status: input.status || "pending",
    title: cleanText(input.title, 240) || "待优化项 / Pending optimization item",
    detail: cleanText(input.detail, 1000),
    action: cleanText(input.action, 1000) || "下次生成前优先修复这个失败模式。 / Prioritize this failure pattern before the next generation.",
    modelId: cleanText(input.modelId, 180) || undefined,
    provider: cleanText(input.provider, 80) || undefined,
    dimension: cleanText(input.dimension, 120) || undefined,
    checkId: cleanText(input.checkId, 120) || undefined,
    createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : now,
    lastSeenAt: now,
    occurrences: Math.max(1, Math.round(Number(input.occurrences) || 1)),
  };
}

export function mergeOptimizationBacklogItems(
  existing: OptimizationBacklogItem[],
  incoming: OptimizationBacklogItem[],
  maxItems = 200,
): OptimizationBacklogItem[] {
  const byFingerprint = new Map<string, OptimizationBacklogItem>();
  for (const item of existing.map((entry) => normalizeOptimizationBacklogItem(entry))) {
    byFingerprint.set(item.fingerprint, item);
  }
  for (const rawItem of incoming) {
    const item = normalizeOptimizationBacklogItem(rawItem);
    const previous = byFingerprint.get(item.fingerprint);
    if (previous) {
      byFingerprint.set(item.fingerprint, {
        ...previous,
        ...item,
        id: previous.id,
        createdAt: Math.min(previous.createdAt, item.createdAt),
        lastSeenAt: Math.max(previous.lastSeenAt, item.lastSeenAt),
        occurrences: previous.occurrences + 1,
        status: previous.status === "resolved" ? "pending" : previous.status,
      });
    } else {
      byFingerprint.set(item.fingerprint, item);
    }
  }

  return [...byFingerprint.values()]
    .sort((a, b) => {
      const severityOrder = { red: 0, yellow: 1, green: 2 };
      const bySeverity = severityOrder[a.severity] - severityOrder[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return b.lastSeenAt - a.lastSeenAt;
    })
    .slice(0, maxItems);
}

export function buildOptimizationBacklogRules(items: OptimizationBacklogItem[]): string[] {
  return items
    .filter((item) => item.status !== "resolved")
    .slice(0, 20)
    .map((item) => [
      `待优化项 / Pending optimization: ${item.title}`,
      `severity=${item.severity}`,
      `type=${item.type}`,
      item.modelId ? `model=${item.modelId}` : "",
      item.provider ? `provider=${item.provider}` : "",
      item.dimension ? `dimension=${item.dimension}` : "",
      `action=${item.action}`,
    ].filter(Boolean).join("; "));
}
