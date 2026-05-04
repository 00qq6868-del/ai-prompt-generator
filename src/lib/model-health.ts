import { ModelInfo } from "@/lib/models-registry";

export type ModelCallKind = "generator" | "judge" | "simple";

export interface ModelHealthIssue {
  modelId: string;
  modelName?: string;
  apiProvider: string;
  failures: number;
  cooldownUntil: number;
  lastError: string;
  permanent: boolean;
}

export interface ModelHealthSuccess {
  modelId: string;
  modelName?: string;
  apiProvider: string;
  latencyMs: number;
}

export interface ModelHealthMeta {
  skippedCooling: ModelHealthIssue[];
  failed: ModelHealthIssue[];
  successful: ModelHealthSuccess[];
}

interface HealthRecord {
  failures: number;
  successes: number;
  cooldownUntil: number;
  lastError: string;
  permanent: boolean;
  lastLatencyMs?: number;
  updatedAt: number;
}

export interface ModelCallPlan {
  model: ModelInfo;
  apiProvider: string;
}

const MODEL_HEALTH = new Map<string, HealthRecord>();

const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const TRANSIENT_PATTERNS = [
  "timeout",
  "timed out",
  "etimedout",
  "econnreset",
  "econnrefused",
  "socket hang up",
  "fetch failed",
  "network",
  "rate limit",
  "too many requests",
  "overloaded",
  "capacity",
  "upstream",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "temporarily",
  "try again",
  "中转",
  "上游",
  "超时",
  "限流",
  "繁忙",
  "拥挤",
];

const PERMANENT_PATTERNS = [
  "invalid api key",
  "incorrect api key",
  "unauthorized",
  "authentication",
  "permission denied",
  "access denied",
  "model_not_found",
  "model not found",
  "does not exist",
  "not found",
  "invalid model",
  "insufficient_quota",
  "billing",
  "quota",
  "无权访问",
  "权限",
  "无效",
  "不存在",
  "欠费",
  "余额",
];

function key(modelId: string, apiProvider: string): string {
  return `${apiProvider.toLowerCase()}::${modelId.toLowerCase()}`;
}

function statusFromError(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as {
    status?: number;
    code?: number | string;
    response?: { status?: number };
  };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  if (typeof e.code === "number") return e.code;
  return undefined;
}

export function errorToMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown model error";
  }
}

function isPermanentError(err: unknown, message: string): boolean {
  const status = statusFromError(err);
  if (status === 400 || status === 401 || status === 403 || status === 404) return true;
  const lower = message.toLowerCase();
  return PERMANENT_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isTransientError(err: unknown, message: string): boolean {
  const status = statusFromError(err);
  if (status && TRANSIENT_STATUS.has(status)) return true;
  const lower = message.toLowerCase();
  return TRANSIENT_PATTERNS.some((pattern) => lower.includes(pattern));
}

function cooldownMsFor(failures: number, permanent: boolean): number {
  if (permanent) return 30 * 60_000;
  if (failures <= 1) return 2 * 60_000;
  if (failures === 2) return 10 * 60_000;
  return 30 * 60_000;
}

function issueFromRecord(model: ModelInfo, apiProvider: string, record: HealthRecord): ModelHealthIssue {
  return {
    modelId: model.id,
    modelName: model.name,
    apiProvider,
    failures: record.failures,
    cooldownUntil: record.cooldownUntil,
    lastError: record.lastError,
    permanent: record.permanent,
  };
}

export function getModelCooldown(model: ModelInfo, apiProvider: string, now = Date.now()): ModelHealthIssue | null {
  const record = MODEL_HEALTH.get(key(model.id, apiProvider));
  if (!record || record.cooldownUntil <= now) return null;
  return issueFromRecord(model, apiProvider, record);
}

export function splitCoolingPlans<T extends ModelCallPlan>(
  plans: T[],
  now = Date.now(),
): { runnable: T[]; skippedCooling: ModelHealthIssue[] } {
  const runnable: T[] = [];
  const skippedCooling: ModelHealthIssue[] = [];

  for (const plan of plans) {
    const issue = getModelCooldown(plan.model, plan.apiProvider, now);
    if (issue) {
      skippedCooling.push(issue);
    } else {
      runnable.push(plan);
    }
  }

  return { runnable, skippedCooling };
}

export function recordModelSuccess(
  model: ModelInfo,
  apiProvider: string,
  latencyMs: number,
): ModelHealthSuccess {
  MODEL_HEALTH.set(key(model.id, apiProvider), {
    failures: 0,
    successes: 1,
    cooldownUntil: 0,
    lastError: "",
    permanent: false,
    lastLatencyMs: latencyMs,
    updatedAt: Date.now(),
  });

  return {
    modelId: model.id,
    modelName: model.name,
    apiProvider,
    latencyMs,
  };
}

export function recordModelFailure(
  model: ModelInfo,
  apiProvider: string,
  err: unknown,
): ModelHealthIssue {
  const message = errorToMessage(err);
  const existing = MODEL_HEALTH.get(key(model.id, apiProvider));
  const failures = (existing?.failures ?? 0) + 1;
  const permanent = isPermanentError(err, message);
  const transient = isTransientError(err, message);
  const cooldownUntil = Date.now() + cooldownMsFor(failures, permanent || !transient);
  const record: HealthRecord = {
    failures,
    successes: existing?.successes ?? 0,
    cooldownUntil,
    lastError: message,
    permanent,
    lastLatencyMs: existing?.lastLatencyMs,
    updatedAt: Date.now(),
  };

  MODEL_HEALTH.set(key(model.id, apiProvider), record);
  return issueFromRecord(model, apiProvider, record);
}

export function getTimeoutMs(kind: ModelCallKind): number {
  const envName =
    kind === "judge"
      ? "JUDGE_MODEL_TIMEOUT_MS"
      : kind === "generator"
        ? "GENERATOR_MODEL_TIMEOUT_MS"
        : "SIMPLE_MODEL_TIMEOUT_MS";
  const fallback = kind === "judge" ? 180_000 : kind === "generator" ? 180_000 : 180_000;
  const raw = Number(process.env[envName]);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : fallback;
}

function isLikelySlowModel(model: ModelInfo): boolean {
  const keyText = `${model.id} ${model.name} ${model.provider}`.toLowerCase();
  return (
    model.speed === "slow" ||
    model.accuracy === "supreme" ||
    keyText.includes("gpt-5") ||
    keyText.includes("gpt5") ||
    keyText.includes("claude") ||
    keyText.includes("opus") ||
    keyText.includes("sonnet") ||
    keyText.includes("gemini-3") ||
    keyText.includes("gemini-2.5") ||
    keyText.includes("deepseek-v4") ||
    keyText.includes("deepseek-r1") ||
    keyText.includes("reason")
  );
}

export function getModelTimeoutMs(
  model: ModelInfo,
  kind: ModelCallKind,
  opts?: { startedAt?: number; routeBudgetMs?: number; reserveMs?: number },
): number {
  const base = getTimeoutMs(kind);
  const slowBonus =
    isLikelySlowModel(model)
      ? kind === "judge"
        ? 45_000
        : 60_000
      : 0;
  const desired = Math.min(base + slowBonus, kind === "simple" ? 240_000 : 225_000);

  if (!opts?.startedAt) return desired;

  const routeBudgetMs = opts.routeBudgetMs ?? 285_000;
  const reserveMs = opts.reserveMs ?? 20_000;
  const remaining = routeBudgetMs - (Date.now() - opts.startedAt) - reserveMs;
  return Math.max(15_000, Math.min(desired, remaining));
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function formatCooldown(issue: ModelHealthIssue, now = Date.now()): string {
  const remainingSec = Math.max(1, Math.ceil((issue.cooldownUntil - now) / 1000));
  const remainingText = remainingSec >= 60
    ? `${Math.ceil(remainingSec / 60)} 分钟`
    : `${remainingSec} 秒`;
  return `${issue.modelName ?? issue.modelId} 暂时不稳定，已冷却 ${remainingText}`;
}
