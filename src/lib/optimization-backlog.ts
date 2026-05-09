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

export type TestErrorType =
  | "functional"
  | "performance"
  | "ui"
  | "api"
  | "logic"
  | "boundary"
  | "security"
  | "other";

export type TestErrorSeverity = "critical" | "high" | "medium" | "low";
export type TestErrorStatus = "open" | "fixing" | "resolved" | "regression";
export type OptimizationPriority = "P0" | "P1" | "P2" | "P3";

export interface TestErrorRecord {
  error_id: string;
  project_id: string;
  error_type: TestErrorType;
  severity: TestErrorSeverity;
  summary: string;
  detail: string;
  reproduction_path: string[];
  test_case_id: string;
  discovered_at: string;
  status: TestErrorStatus;
  optimization_suggestion: string;
  auto_optimized: boolean;
  optimization_history: Array<{
    timestamp: string;
    action: string;
    result?: string;
    run_id?: string;
  }>;
  fingerprint?: string;
  occurrences?: number;
  last_seen_at?: string;
  resolved_at?: string | null;
}

export interface OptimizationProjectItem {
  optimization_id: string;
  project_id: string;
  linked_error_ids: string[];
  priority: OptimizationPriority;
  description: string;
  suggested_actions: string[];
  created_at: string;
  resolved_at: string | null;
  auto_applied: boolean;
  fingerprint?: string;
}

export interface AdaptiveRegressionCase {
  id: string;
  label: string;
  objective: string;
  source_error_id: string;
  error_type: TestErrorType;
  severity: TestErrorSeverity;
  reproduction_path: string[];
}

export interface AdaptiveTestPlan {
  project_id: string;
  unresolved_error_count: number;
  regression_case_count: number;
  historical_type_distribution: Partial<Record<TestErrorType, number>>;
  focus_error_types: TestErrorType[];
  strategy_weights: Partial<Record<TestErrorType, number>>;
  regression_cases: AdaptiveRegressionCase[];
  mutation_hints: string[];
  resolved_candidate_error_ids: string[];
  summary: string;
}

export const PENDING_OPTIMIZATION_STORAGE_KEY = "ai_prompt_pending_optimizations";
export const TEST_ERROR_STORAGE_KEY = "ai_prompt_test_errors";
export const OPTIMIZATION_ITEMS_STORAGE_KEY = "ai_prompt_optimization_items";

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

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createUuid(): string {
  const cryptoLike = globalThis.crypto as Crypto | undefined;
  if (cryptoLike && typeof cryptoLike.randomUUID === "function") {
    return cryptoLike.randomUUID();
  }
  const seed = `${Date.now()}-${Math.random()}-${Math.random()}`;
  const hash = buildOptimizationFingerprint([seed]).replace(/^opt_/, "").padEnd(12, "0");
  return `${hash.slice(0, 8)}-${hash.slice(0, 4)}-4${hash.slice(1, 4)}-a${hash.slice(0, 3)}-${hash.slice(0, 12)}`;
}

function normalizeErrorType(value: unknown): TestErrorType {
  const allowed: TestErrorType[] = ["functional", "performance", "ui", "api", "logic", "boundary", "security", "other"];
  return allowed.includes(value as TestErrorType) ? value as TestErrorType : "other";
}

function normalizeErrorSeverity(value: unknown): TestErrorSeverity {
  const allowed: TestErrorSeverity[] = ["critical", "high", "medium", "low"];
  return allowed.includes(value as TestErrorSeverity) ? value as TestErrorSeverity : "medium";
}

function normalizeErrorStatus(value: unknown): TestErrorStatus {
  const allowed: TestErrorStatus[] = ["open", "fixing", "resolved", "regression"];
  return allowed.includes(value as TestErrorStatus) ? value as TestErrorStatus : "open";
}

function normalizePriority(value: unknown): OptimizationPriority {
  const allowed: OptimizationPriority[] = ["P0", "P1", "P2", "P3"];
  return allowed.includes(value as OptimizationPriority) ? value as OptimizationPriority : "P2";
}

function severityRank(severity: TestErrorSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function priorityRank(priority: OptimizationPriority): number {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[priority];
}

export function severityToPriority(severity: TestErrorSeverity, status?: TestErrorStatus): OptimizationPriority {
  const base: OptimizationPriority =
    severity === "critical" ? "P0" :
      severity === "high" ? "P1" :
        severity === "medium" ? "P2" : "P3";
  if (status !== "regression") return base;
  if (base === "P3") return "P2";
  if (base === "P2") return "P1";
  return "P0";
}

export function mapLegacySeverity(severity: OptimizationBacklogSeverity, title = "", type?: OptimizationBacklogType): TestErrorSeverity {
  const lower = title.toLowerCase();
  if (lower.includes("secret") || lower.includes("密钥") || lower.includes("leak") || type === "test_channel_runtime") {
    return severity === "red" ? "critical" : "high";
  }
  if (severity === "red") return "high";
  if (severity === "green") return "low";
  return "medium";
}

export function inferErrorTypeFromLegacy(item: Partial<OptimizationBacklogItem>): TestErrorType {
  const haystack = `${item.type || ""} ${item.title || ""} ${item.detail || ""} ${item.checkId || ""} ${item.dimension || ""}`.toLowerCase();
  if (item.type === "model_error") return "api";
  if (haystack.includes("api") || haystack.includes("key") || haystack.includes("choices") || haystack.includes("provider") || haystack.includes("模型返回")) {
    return "api";
  }
  if (haystack.includes("latency") || haystack.includes("timeout") || haystack.includes("超时") || haystack.includes("性能")) {
    return "performance";
  }
  if (haystack.includes("secret") || haystack.includes("密钥") || haystack.includes("leak") || haystack.includes("安全")) {
    return "security";
  }
  if (haystack.includes("ui") || haystack.includes("display") || haystack.includes("显示")) {
    return "ui";
  }
  if (haystack.includes("boundary") || haystack.includes("边界")) {
    return "boundary";
  }
  if (item.type === "quality_gate" || item.type === "low_dimension") {
    return item.dimension === "hallucination_resistance" ? "security" : "logic";
  }
  return "functional";
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

export function normalizeTestErrorRecord(input: Partial<TestErrorRecord>, projectId = "ai-prompt-generator"): TestErrorRecord {
  const discovered = isIsoDate(input.discovered_at) ? input.discovered_at : nowIso();
  const status = normalizeErrorStatus(input.status);
  const errorType = normalizeErrorType(input.error_type);
  const severity = normalizeErrorSeverity(input.severity);
  const summary = cleanText(input.summary, 240) || "测试通道发现错误 / Test channel detected an error";
  const testCaseId = cleanText(input.test_case_id, 160) || "one_click_full_flow";
  const fingerprint = cleanText(input.fingerprint, 180) || buildOptimizationFingerprint([
    projectId,
    errorType,
    severity,
    summary,
    testCaseId,
  ]);
  const reproduction = Array.isArray(input.reproduction_path)
    ? input.reproduction_path.map((step) => cleanText(step, 280)).filter(Boolean).slice(0, 12)
    : [];

  return {
    error_id: cleanText(input.error_id, 80) || createUuid(),
    project_id: cleanText(input.project_id, 120) || projectId,
    error_type: errorType,
    severity,
    summary,
    detail: cleanText(input.detail, 2000),
    reproduction_path: reproduction.length
      ? reproduction
      : [
          "打开 AI 提示词测试通道 / Open the AI prompt test channel",
          "点击一键全流程测试 / Click one-click full-flow test",
          "查看自动错误分类与待优化项目 / Review automatic error classification and optimization backlog",
        ],
    test_case_id: testCaseId,
    discovered_at: discovered,
    status,
    optimization_suggestion: cleanText(input.optimization_suggestion, 1000) ||
      "下次一键测试前自动把该错误加入回归验证，并优先补强对应生成策略。 / Before the next one-click test, automatically add this error to regression validation and strengthen the related generation strategy.",
    auto_optimized: Boolean(input.auto_optimized),
    optimization_history: Array.isArray(input.optimization_history)
      ? input.optimization_history.map((entry) => ({
          timestamp: isIsoDate(entry?.timestamp) ? entry.timestamp : discovered,
          action: cleanText(entry?.action, 500),
          result: cleanText(entry?.result, 500) || undefined,
          run_id: cleanText(entry?.run_id, 160) || undefined,
        })).filter((entry) => entry.action).slice(0, 30)
      : [],
    fingerprint,
    occurrences: Math.max(1, Math.round(Number(input.occurrences) || 1)),
    last_seen_at: isIsoDate(input.last_seen_at) ? input.last_seen_at : discovered,
    resolved_at: status === "resolved"
      ? (isIsoDate(input.resolved_at) ? input.resolved_at : discovered)
      : null,
  };
}

export function normalizeOptimizationProjectItem(
  input: Partial<OptimizationProjectItem>,
  projectId = "ai-prompt-generator",
): OptimizationProjectItem {
  const created = isIsoDate(input.created_at) ? input.created_at : nowIso();
  const linked = Array.isArray(input.linked_error_ids)
    ? input.linked_error_ids.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 20)
    : [];
  const description = cleanText(input.description, 800) || "待优化项目 / Pending optimization item";
  const fingerprint = cleanText(input.fingerprint, 180) || buildOptimizationFingerprint([
    projectId,
    description,
    linked.join(","),
  ]);

  return {
    optimization_id: cleanText(input.optimization_id, 80) || createUuid(),
    project_id: cleanText(input.project_id, 120) || projectId,
    linked_error_ids: linked,
    priority: normalizePriority(input.priority),
    description,
    suggested_actions: Array.isArray(input.suggested_actions)
      ? input.suggested_actions.map((action) => cleanText(action, 500)).filter(Boolean).slice(0, 12)
      : [
          "读取关联错误上下文并生成针对性回归用例。 / Read linked error context and generate targeted regression cases.",
          "自动补强低分维度，然后重新运行一键测试。 / Strengthen low-score dimensions automatically, then rerun one-click testing.",
        ],
    created_at: created,
    resolved_at: isIsoDate(input.resolved_at) ? input.resolved_at : null,
    auto_applied: Boolean(input.auto_applied),
    fingerprint,
  };
}

export function mergeOptimizationProjectItems(
  existing: OptimizationProjectItem[],
  incoming: OptimizationProjectItem[],
  projectId = "ai-prompt-generator",
  maxItems = 500,
): OptimizationProjectItem[] {
  const byFingerprint = new Map<string, OptimizationProjectItem>();
  for (const raw of existing) {
    const item = normalizeOptimizationProjectItem(raw, raw.project_id || projectId);
    byFingerprint.set(item.fingerprint || item.optimization_id, item);
  }
  for (const raw of incoming) {
    const item = normalizeOptimizationProjectItem(raw, raw.project_id || projectId);
    const key = item.fingerprint || item.optimization_id;
    const previous = byFingerprint.get(key);
    if (!previous) {
      byFingerprint.set(key, item);
      continue;
    }
    byFingerprint.set(key, {
      ...previous,
      ...item,
      optimization_id: previous.optimization_id,
      linked_error_ids: Array.from(new Set([...previous.linked_error_ids, ...item.linked_error_ids])).slice(0, 20),
      priority: priorityRank(item.priority) < priorityRank(previous.priority) ? item.priority : previous.priority,
      suggested_actions: Array.from(new Set([...item.suggested_actions, ...previous.suggested_actions])).slice(0, 12),
      created_at: previous.created_at,
      resolved_at: item.resolved_at,
      auto_applied: previous.auto_applied || item.auto_applied,
    });
  }
  return [...byFingerprint.values()]
    .sort((a, b) => {
      if (Boolean(a.resolved_at) !== Boolean(b.resolved_at)) return a.resolved_at ? 1 : -1;
      const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
      if (byPriority !== 0) return byPriority;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    })
    .slice(0, maxItems);
}

export function legacyBacklogItemToErrorRecord(
  item: OptimizationBacklogItem,
  projectId: string,
  reportId?: string,
  status: TestErrorStatus = "open",
): TestErrorRecord {
  const normalized = normalizeOptimizationBacklogItem(item);
  const errorType = inferErrorTypeFromLegacy(normalized);
  const severity = mapLegacySeverity(normalized.severity, normalized.title, normalized.type);
  return normalizeTestErrorRecord({
    project_id: projectId,
    error_type: errorType,
    severity,
    summary: normalized.title,
    detail: normalized.detail,
    reproduction_path: [
      "打开 AI 提示词测试通道 / Open the AI prompt test channel",
      "点击一键全流程测试 / Click one-click full-flow test",
      normalized.modelId ? `调用模型 ${normalized.modelId} / Call model ${normalized.modelId}` : "",
      normalized.checkId ? `触发质量检查 ${normalized.checkId} / Trigger quality check ${normalized.checkId}` : "",
      normalized.dimension ? `发现低分维度 ${normalized.dimension} / Detect low-score dimension ${normalized.dimension}` : "",
    ].filter(Boolean),
    test_case_id: normalized.checkId || normalized.dimension || normalized.modelId || "one_click_full_flow",
    discovered_at: new Date(normalized.lastSeenAt || normalized.createdAt || Date.now()).toISOString(),
    status,
    optimization_suggestion: normalized.action,
    auto_optimized: false,
    optimization_history: reportId ? [{
      timestamp: nowIso(),
      action: "由一键测试自动分类并加入待优化项目 / Automatically classified by one-click test and added to optimization backlog",
      run_id: reportId,
    }] : [],
    fingerprint: normalized.fingerprint,
    occurrences: normalized.occurrences,
    last_seen_at: new Date(normalized.lastSeenAt || Date.now()).toISOString(),
  }, projectId);
}

export function mergeTestErrorRecords(
  existing: TestErrorRecord[],
  incoming: TestErrorRecord[],
  maxItems = 500,
): TestErrorRecord[] {
  const byFingerprint = new Map<string, TestErrorRecord>();
  for (const raw of existing) {
    const item = normalizeTestErrorRecord(raw, raw.project_id || "ai-prompt-generator");
    byFingerprint.set(item.fingerprint || item.error_id, item);
  }

  for (const raw of incoming) {
    const item = normalizeTestErrorRecord(raw, raw.project_id || "ai-prompt-generator");
    const key = item.fingerprint || item.error_id;
    const previous = byFingerprint.get(key);
    if (!previous) {
      byFingerprint.set(key, item);
      continue;
    }
    const repeatedStatus: TestErrorStatus =
      previous.status !== "resolved" && item.status !== "resolved" ? "regression" : item.status;
    byFingerprint.set(key, {
      ...previous,
      ...item,
      error_id: previous.error_id,
      discovered_at: previous.discovered_at,
      status: repeatedStatus,
      severity: severityRank(item.severity) < severityRank(previous.severity) ? item.severity : previous.severity,
      occurrences: (previous.occurrences || 1) + (item.occurrences || 1),
      optimization_history: [
        ...previous.optimization_history,
        ...item.optimization_history,
        {
          timestamp: item.last_seen_at || nowIso(),
          action: repeatedStatus === "regression"
            ? "历史缺陷再次出现，自动标记为 regression / Historical defect recurred and was marked as regression"
            : "错误状态已更新 / Error status updated",
          result: `status=${repeatedStatus}`,
        },
      ].slice(-30),
      last_seen_at: item.last_seen_at || nowIso(),
      resolved_at: repeatedStatus === "resolved" ? (item.resolved_at || nowIso()) : null,
    });
  }

  return [...byFingerprint.values()]
    .sort((a, b) => {
      if (a.status !== b.status) {
        const statusOrder = { regression: 0, open: 1, fixing: 2, resolved: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;
      return Date.parse(b.last_seen_at || b.discovered_at) - Date.parse(a.last_seen_at || a.discovered_at);
    })
    .slice(0, maxItems);
}

export function reconcileTestErrorRecords(args: {
  historicalErrors: TestErrorRecord[];
  currentErrors: TestErrorRecord[];
  projectId: string;
  runId: string;
  runStatus: "pass" | "warn" | "fail";
}): TestErrorRecord[] {
  const projectHistorical = args.historicalErrors
    .map((item) => normalizeTestErrorRecord(item, args.projectId))
    .filter((item) => item.project_id === args.projectId);
  const current = args.currentErrors.map((item) => {
    const normalized = normalizeTestErrorRecord(item, args.projectId);
    const previouslyOpen = projectHistorical.some((historical) =>
      historical.status !== "resolved" &&
      (historical.fingerprint === normalized.fingerprint || historical.summary === normalized.summary)
    );
    return previouslyOpen ? { ...normalized, status: "regression" as const } : normalized;
  });

  const currentKeys = new Set(current.map((item) => item.fingerprint || item.error_id));
  const resolvedUpdates = projectHistorical
    .filter((item) => item.status !== "resolved")
    .filter((item) => args.runStatus === "pass" && !currentKeys.has(item.fingerprint || item.error_id))
    .map((item) => normalizeTestErrorRecord({
      ...item,
      status: "resolved",
      resolved_at: nowIso(),
      optimization_history: [
        ...item.optimization_history,
        {
          timestamp: nowIso(),
          action: "一键回归测试通过，自动标记为 resolved / One-click regression passed and was marked as resolved",
          result: "pass",
          run_id: args.runId,
        },
      ],
    }, args.projectId));

  return mergeTestErrorRecords(projectHistorical, [...current, ...resolvedUpdates]);
}

export function optimizationItemFromError(error: TestErrorRecord): OptimizationProjectItem {
  const priority = severityToPriority(error.severity, error.status);
  return normalizeOptimizationProjectItem({
    project_id: error.project_id,
    linked_error_ids: [error.error_id],
    priority,
    description: error.status === "regression"
      ? `回归缺陷：${error.summary} / Regression defect: ${error.summary}`
      : `修复待优化项：${error.summary} / Fix optimization item: ${error.summary}`,
    suggested_actions: [
      error.optimization_suggestion,
      `复现路径：${error.reproduction_path.join(" -> ")} / Reproduction path: ${error.reproduction_path.join(" -> ")}`,
      "下次点击测试时优先生成针对性回归用例并验证是否修复。 / On the next test click, prioritize targeted regression cases and verify the fix.",
    ],
    created_at: error.discovered_at,
    resolved_at: error.status === "resolved" ? (error.resolved_at || error.last_seen_at || nowIso()) : null,
    auto_applied: error.auto_optimized,
    fingerprint: error.fingerprint,
  }, error.project_id);
}

export function reconcileOptimizationItems(
  historicalItems: OptimizationProjectItem[],
  errors: TestErrorRecord[],
  projectId: string,
  maxItems = 500,
): OptimizationProjectItem[] {
  const byFingerprint = new Map<string, OptimizationProjectItem>();
  for (const raw of historicalItems) {
    const item = normalizeOptimizationProjectItem(raw, projectId);
    byFingerprint.set(item.fingerprint || item.optimization_id, item);
  }
  for (const error of errors) {
    const next = optimizationItemFromError(error);
    const key = next.fingerprint || next.optimization_id;
    const previous = byFingerprint.get(key);
    if (!previous) {
      byFingerprint.set(key, next);
      continue;
    }
    byFingerprint.set(key, {
      ...previous,
      ...next,
      optimization_id: previous.optimization_id,
      linked_error_ids: Array.from(new Set([...previous.linked_error_ids, ...next.linked_error_ids])).slice(0, 20),
      priority: priorityRank(next.priority) < priorityRank(previous.priority) ? next.priority : previous.priority,
      suggested_actions: Array.from(new Set([...next.suggested_actions, ...previous.suggested_actions])).slice(0, 12),
      created_at: previous.created_at,
      resolved_at: next.resolved_at,
      auto_applied: previous.auto_applied || next.auto_applied,
    });
  }

  return [...byFingerprint.values()]
    .sort((a, b) => {
      if (Boolean(a.resolved_at) !== Boolean(b.resolved_at)) return a.resolved_at ? 1 : -1;
      const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
      if (byPriority !== 0) return byPriority;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    })
    .slice(0, maxItems);
}

export function buildAdaptiveTestPlan(args: {
  projectId: string;
  historicalErrors: TestErrorRecord[];
  historicalOptimizations?: OptimizationProjectItem[];
}): AdaptiveTestPlan {
  const unresolved = args.historicalErrors
    .map((item) => normalizeTestErrorRecord(item, args.projectId))
    .filter((item) => item.project_id === args.projectId && item.status !== "resolved");
  const distribution: Partial<Record<TestErrorType, number>> = {};
  for (const item of unresolved) {
    distribution[item.error_type] = (distribution[item.error_type] || 0) + 1;
  }
  const focusErrorTypes = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type as TestErrorType)
    .slice(0, 3);
  const strategyWeights = Object.fromEntries(
    Object.entries(distribution).map(([type, count]) => [type, Math.round((1 + count / Math.max(1, unresolved.length) * 2) * 100) / 100]),
  ) as Partial<Record<TestErrorType, number>>;
  const regressionCases = unresolved.slice(0, 8).map((item, index) => ({
    id: `regression_${index + 1}_${item.error_id.slice(0, 8)}`,
    label: `历史缺陷回归：${item.summary} / Historical regression: ${item.summary}`,
    objective: [
      `验证历史 ${item.error_type} 错误是否已修复。 / Verify whether the historical ${item.error_type} error is fixed.`,
      `严重程度 / Severity: ${item.severity}`,
      `修复建议 / Suggested fix: ${item.optimization_suggestion}`,
    ].join(" "),
    source_error_id: item.error_id,
    error_type: item.error_type,
    severity: item.severity,
    reproduction_path: item.reproduction_path,
  }));
  const mutationHints = unresolved.slice(0, 8).map((item) =>
    `基于复现路径生成变异用例：${item.reproduction_path.join(" -> ")} / Generate mutated cases from reproduction path: ${item.reproduction_path.join(" -> ")}`
  );
  return {
    project_id: args.projectId,
    unresolved_error_count: unresolved.length,
    regression_case_count: regressionCases.length,
    historical_type_distribution: distribution,
    focus_error_types: focusErrorTypes,
    strategy_weights: strategyWeights,
    regression_cases: regressionCases,
    mutation_hints: mutationHints,
    resolved_candidate_error_ids: unresolved.map((item) => item.error_id),
    summary: unresolved.length
      ? `已读取 ${unresolved.length} 个历史未解决错误；本次一键测试会优先回归 ${focusErrorTypes.join(", ") || "general"}。 / Loaded ${unresolved.length} unresolved historical error(s); this run prioritizes ${focusErrorTypes.join(", ") || "general"} regression.`
      : "未发现历史未解决错误；本次执行标准全流程测试。 / No unresolved historical errors found; this run executes the standard full-flow test.",
  };
}

export function buildStructuredOptimizationRules(
  errors: TestErrorRecord[],
  optimizationItems: OptimizationProjectItem[],
  adaptivePlan?: AdaptiveTestPlan,
): string[] {
  const rules: string[] = [];
  const unresolved = errors
    .map((item) => normalizeTestErrorRecord(item, item.project_id || "ai-prompt-generator"))
    .filter((item) => item.status !== "resolved")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "regression" ? -1 : b.status === "regression" ? 1 : 0;
      return severityRank(a.severity) - severityRank(b.severity);
    })
    .slice(0, 12);
  for (const item of unresolved) {
    rules.push([
      `历史测试错误 / Historical test error: ${item.summary}`,
      `type=${item.error_type}`,
      `severity=${item.severity}`,
      `status=${item.status}`,
      `test_case=${item.test_case_id}`,
      `suggestion=${item.optimization_suggestion}`,
    ].join("; "));
  }
  for (const item of optimizationItems
    .map((entry) => normalizeOptimizationProjectItem(entry, entry.project_id || "ai-prompt-generator"))
    .filter((entry) => !entry.resolved_at)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 8)) {
    rules.push([
      `待优化项目 / Optimization backlog item: ${item.description}`,
      `priority=${item.priority}`,
      `actions=${item.suggested_actions.join(" | ")}`,
    ].join("; "));
  }
  if (adaptivePlan?.unresolved_error_count) {
    rules.push(`一键测试自适应计划 / Adaptive test plan: ${adaptivePlan.summary}`);
    if (adaptivePlan.focus_error_types.length) {
      rules.push(`优先回归错误类型 / Prioritize regression error types: ${adaptivePlan.focus_error_types.join(", ")}`);
    }
  }
  return Array.from(new Set(rules)).slice(0, 20);
}
