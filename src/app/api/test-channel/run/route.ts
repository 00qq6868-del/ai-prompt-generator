import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { callProvider } from "@/lib/providers";
import { getModels } from "@/lib/model-cache";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { mergeRelayModelIds, isRelayModelListed } from "@/lib/relay-models";
import { strictPromptScore, type StrictScoreResult } from "@/lib/strict-scoring";
import { exportDatasetRow } from "@/lib/server/github-dataset";
import { checkRateLimit, rateLimitResponse, readPositiveIntEnv } from "@/lib/rate-limit";
import { toUserFacingErrorMessage } from "@/lib/error-messages";
import {
  buildOptimizationFingerprint,
  buildAdaptiveTestPlan,
  buildStructuredOptimizationRules,
  legacyBacklogItemToErrorRecord,
  reconcileTestErrorRecords,
  reconcileOptimizationItems,
  normalizeOptimizationProjectItem,
  normalizeTestErrorRecord,
  normalizeOptimizationBacklogItem,
  type AdaptiveTestPlan,
  type OptimizationProjectItem,
  type OptimizationBacklogItem,
  type OptimizationBacklogPayload,
  type TestErrorRecord,
} from "@/lib/optimization-backlog";

export const runtime = "nodejs";
export const maxDuration = 60;

const TEST_CHANNEL_TOTAL_BUDGET_MS = 45_000;
const TEST_CHANNEL_MODEL_TIMEOUT_MS = 22_000;
const TEST_CHANNEL_MIN_REMAINING_MS = 4_000;
const TEST_CHANNEL_AUTO_MAX_TOKENS = 900;
const TEST_CHANNEL_AUTO_MAX_ATTEMPTS = 1;
const TEST_CHANNEL_AUTO_MAX_MODELS = 2;

interface TestChannelRequest {
  projectId?: string;
  userIdea?: string;
  targetModelId?: string;
  generatorModelId?: string;
  generatorModelIds?: string[];
  language?: "zh" | "en";
  maxTokens?: number;
  maxAttempts?: number;
  userKeys?: Record<string, string>;
  availableModelIds?: string[];
  deviceId?: string;
  qualityTargets?: {
    passTotal?: number;
    coreDimensionMin?: number;
  };
  referenceImage?: {
    dataUrl?: string;
    mimeType?: string;
    name?: string;
    size?: number;
  } | null;
  historicalErrors?: TestErrorRecord[];
  historicalOptimizations?: OptimizationProjectItem[];
  autoSuite?: boolean;
}

interface TestModelPlan {
  model: ModelInfo;
  apiProvider: string;
}

type TestCheckResult = {
  id: string;
  label: string;
  value: number;
  threshold: number;
  status: "pass" | "warn" | "fail";
};

const AUTO_TEST_CASES = [
  {
    id: "text_prompt_quality",
    label: "文本/代码提示词质量 / Text and code prompt quality",
    objective: "验证输出是否保留用户意图、角色、任务、上下文、约束、步骤、输出格式、边界条件和自检标准。",
  },
  {
    id: "image_prompt_quality",
    label: "图像与图生图提示词质量 / Image and image-to-image prompt quality",
    objective: "验证图像提示词是否包含主体、风格、构图、镜头、光影、色彩、材质、负面约束、参数建议和参考图一致性要求。",
  },
  {
    id: "hallucination_intent_guard",
    label: "幻觉与用户意图防护 / Hallucination and intent guard",
    objective: "验证提示词是否禁止编造事实，能处理汽车 vs 手机这类输入冲突，并要求不确定时追问。",
  },
  {
    id: "security_memory_gate",
    label: "密钥、记录和自动优化闭环 / Secret, logging, and optimization loop",
    objective: "验证密钥不泄露，错误类型会脱敏记录，失败项会进入待优化队列并影响下一轮自动优化。",
  },
];

const PROVIDER_KEY_MAP: Record<string, string[]> = {
  custom: ["CUSTOM_API_KEY", "CUSTOM_BASE_URL"],
  aihubmix: ["CUSTOM_API_KEY", "CUSTOM_BASE_URL", "AIHUBMIX_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  xai: ["XAI_API_KEY"],
  zhipu: ["ZHIPU_API_KEY"],
  moonshot: ["MOONSHOT_API_KEY"],
  qwen: ["QWEN_API_KEY"],
  baidu: ["BAIDU_API_KEY", "BAIDU_SECRET_KEY"],
};

function cleanString(value: unknown, max = 8000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safePreview(value: unknown, max = 1200): string {
  const text = cleanString(value, max);
  return text.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***");
}

function keyHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function maskKey(value: string): string {
  const key = value.trim();
  if (!key) return "";
  const prefix = key.startsWith("sk-") ? "sk-" : key.slice(0, Math.min(4, key.length));
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

function hasKey(name: string, userKeys: Record<string, string>): boolean {
  return Boolean(userKeys[name]?.trim() || process.env[name]?.trim());
}

function hasCustomRelay(userKeys: Record<string, string>): boolean {
  return hasKey("CUSTOM_API_KEY", userKeys) && Boolean(userKeys.CUSTOM_BASE_URL?.trim() || process.env.CUSTOM_BASE_URL?.trim());
}

function resolveRuntimeApiProviderForTest(
  model: ModelInfo,
  userKeys: Record<string, string>,
  availableModelIds?: string[],
): string {
  if (hasCustomRelay(userKeys) && isRelayModelListed(availableModelIds, model.id)) return "aihubmix";
  if (hasCustomRelay(userKeys) && (model.apiProvider === "custom" || model.apiProvider === "aihubmix")) return "aihubmix";
  return model.apiProvider;
}

function isProviderCallable(apiProvider: string, userKeys: Record<string, string>): boolean {
  switch (apiProvider) {
    case "custom":
      return hasCustomRelay(userKeys);
    case "aihubmix":
      return hasCustomRelay(userKeys) || hasKey("AIHUBMIX_API_KEY", userKeys);
    case "openai":
      return hasKey("OPENAI_API_KEY", userKeys);
    case "anthropic":
      return hasKey("ANTHROPIC_API_KEY", userKeys);
    case "google":
      return hasKey("GOOGLE_API_KEY", userKeys);
    case "groq":
      return hasKey("GROQ_API_KEY", userKeys);
    case "deepseek":
      return hasKey("DEEPSEEK_API_KEY", userKeys);
    case "mistral":
      return hasKey("MISTRAL_API_KEY", userKeys);
    case "xai":
      return hasKey("XAI_API_KEY", userKeys);
    case "zhipu":
      return hasKey("ZHIPU_API_KEY", userKeys);
    case "moonshot":
      return hasKey("MOONSHOT_API_KEY", userKeys);
    case "qwen":
      return hasKey("QWEN_API_KEY", userKeys);
    case "baidu":
      return hasKey("BAIDU_API_KEY", userKeys) && hasKey("BAIDU_SECRET_KEY", userKeys);
    case "ollama":
      return Boolean(process.env.OLLAMA_BASE_URL?.trim());
    default:
      return false;
  }
}

function configuredProviders(userKeys: Record<string, string>) {
  const providers = new Set<string>();
  const keyFingerprints: Array<{ keyName: string; source: "browser" | "server"; masked?: string; hash?: string }> = [];

  for (const [provider, keyNames] of Object.entries(PROVIDER_KEY_MAP)) {
    let configured = false;
    for (const keyName of keyNames) {
      const browserValue = userKeys[keyName]?.trim();
      const serverValue = process.env[keyName]?.trim();
      if (browserValue) {
        configured = true;
        keyFingerprints.push({
          keyName,
          source: "browser",
          masked: maskKey(browserValue),
          hash: keyHash(browserValue),
        });
      } else if (serverValue) {
        configured = true;
        keyFingerprints.push({
          keyName,
          source: "server",
          masked: "server-env-configured",
          hash: keyHash(`${keyName}:${serverValue}`),
        });
      }
    }
    if (configured) providers.add(provider);
  }

  return {
    configured: Array.from(providers),
    keyFingerprints,
  };
}

function resolveTestProvider(model: ModelInfo, userKeys: Record<string, string>, availableModelIds?: string[]): string {
  const runtimeProvider = resolveRuntimeApiProviderForTest(model, userKeys, availableModelIds);
  if (isProviderCallable(runtimeProvider, userKeys)) return runtimeProvider;
  if (hasCustomRelay(userKeys)) return "aihubmix";
  return runtimeProvider;
}

function buildGeneratorPlan(
  models: ModelInfo[],
  requestedIds: string[],
  userKeys: Record<string, string>,
  availableModelIds?: string[],
  limit = 8,
): TestModelPlan[] {
  const requested = requestedIds
    .map((id) => models.find((model) => model.id.toLowerCase() === id.toLowerCase()))
    .filter((model): model is ModelInfo => Boolean(model))
    .filter((model) => (model.category ?? "text") === "text");

  const fallbackCandidates = [...models]
    .filter((model) => (model.category ?? "text") === "text")
    .sort((a, b) => scoreModel(b, "accurate") - scoreModel(a, "accurate"));
  const seen = new Set<string>();
  const candidates = [...requested, ...fallbackCandidates].filter((model) => {
    const key = model.id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const plan: TestModelPlan[] = [];

  for (const model of candidates) {
    const apiProvider = resolveTestProvider(model, userKeys, availableModelIds);
    if (isProviderCallable(apiProvider, userKeys)) {
      plan.push({ model, apiProvider });
      continue;
    }
    if (hasCustomRelay(userKeys) && (!availableModelIds?.length || isRelayModelListed(availableModelIds, model.id))) {
      plan.push({ model, apiProvider: "aihubmix" });
    }
  }

  return plan.slice(0, Math.max(1, limit));
}

function buildChecks(args: {
  score: StrictScoreResult;
  latencyMs: number;
  outputText: string;
  githubTarget: string;
  hasReferenceImage: boolean;
  passTotal: number;
  coreDimensionMin: number;
}): TestCheckResult[] {
  const dimensions = args.score.dimensionScores;
  const check = (id: string, label: string, value: number, passAt: number) => {
    const status: "pass" | "warn" | "fail" =
      value >= passAt ? "pass" : value >= Math.max(6, passAt - 1.5) ? "warn" : "fail";
    return {
      id,
      label,
      value,
      threshold: passAt,
      status,
    };
  };

  const checks = [
    {
      id: "provider_connectivity",
      label: "真实模型连通性 / Provider connectivity",
      value: args.outputText.trim().length > 0 ? 10 : 0,
      threshold: 10,
      status: args.outputText.trim().length > 0 ? "pass" as const : "fail" as const,
    },
    {
      id: "strict_total",
      label: "严格总分 / Strict total score",
      value: args.score.total,
      threshold: args.passTotal,
      status: args.score.total >= args.passTotal ? "pass" as const : args.score.total >= 70 ? "warn" as const : "fail" as const,
    },
    check("intent_fidelity", "意图保真 / Intent fidelity", dimensions.intent_fidelity ?? 0, args.coreDimensionMin),
    check("target_model_fit", "目标模型适配 / Target model fit", dimensions.target_model_fit ?? 0, args.coreDimensionMin),
    check("hallucination_resistance", "幻觉防护 / Hallucination resistance", dimensions.hallucination_resistance ?? 0, args.coreDimensionMin),
    {
      id: "latency",
      label: "响应耗时 / Latency",
      value: args.latencyMs,
      threshold: 120000,
      status: args.latencyMs <= 120000 ? "pass" as const : "warn" as const,
    },
    {
      id: "secret_handling",
      label: "密钥防泄露 / Secret handling",
      value: 10,
      threshold: 10,
      status: "pass" as const,
    },
    {
      id: "sanitized_report",
      label: "脱敏报告写入 / Sanitized report",
      value: args.githubTarget === "github" || args.githubTarget === "local" ? 10 : 0,
      threshold: 10,
      status: args.githubTarget === "github" || args.githubTarget === "local" ? "pass" as const : "warn" as const,
    },
  ];

  if (args.hasReferenceImage) {
    checks.splice(5, 0, check(
      "reference_image_consistency",
      "参考图一致性 / Reference image consistency",
      dimensions.reference_image_consistency ?? 0,
      Math.max(8, args.coreDimensionMin - 1),
    ));
  }

  return checks;
}

function overallStatus(checks: Array<{ status: string }>, score: StrictScoreResult, passTotal: number): "pass" | "warn" | "fail" {
  if (checks.some((item) => item.status === "fail") || score.total < 60) return "fail";
  if (score.total >= passTotal && checks.every((item) => item.status === "pass")) return "pass";
  return "warn";
}

function cleanDeviceId(req: NextRequest, body: TestChannelRequest): string {
  return (
    cleanString(body.deviceId, 160) ||
    cleanString(req.headers.get("x-ai-prompt-device-id"), 160) ||
    cleanString(req.cookies.get("ai_prompt_device_id")?.value, 160) ||
    "anonymous-device"
  );
}

function buildAutoSuiteIdea(extraObjective: string): string {
  const lines = [
    "一键全流程测试：请生成一个可直接复制使用的高质量 AI 提示词，用于验证 AI 提示词生成器的完整能力。",
    "",
    "必须覆盖以下自动测试用例：",
    ...AUTO_TEST_CASES.map((item, index) => `${index + 1}. ${item.label}: ${item.objective}`),
    "",
    "输出要求：",
    "- 结果必须同时适合 AI 工作台和 AI 提示词生成器的质量门。",
    "- 必须包含角色、任务、上下文、约束、步骤、输出格式、失败规避、验收标准和自检标准。",
    "- 必须包含幻觉防护、用户意图对齐、目标模型适配、多模态扩展和安全边界。",
    "- 必须说明不合格候选要内部重试，不把失败候选返回给用户。",
    "- 必须避免任何真实密钥、隐私数据、日志敏感信息或 GitHub token 出现在输出中。",
  ];
  if (extraObjective.trim()) {
    lines.push("", "附加测试目标 / Extra test objective:", extraObjective.trim());
  }
  return lines.join("\n");
}

function normalizeHistoricalErrors(input: unknown, projectId: string): TestErrorRecord[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === "object" ? item as Partial<TestErrorRecord> : null)
    .filter((item): item is Partial<TestErrorRecord> => Boolean(item))
    .map((item) => normalizeTestErrorRecord({
      ...item,
      project_id: item.project_id || projectId,
    }, projectId))
    .slice(0, 200);
}

function normalizeHistoricalOptimizations(input: unknown, projectId: string): OptimizationProjectItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === "object" ? item as Partial<OptimizationProjectItem> : null)
    .filter((item): item is Partial<OptimizationProjectItem> => Boolean(item))
    .map((item) => normalizeOptimizationProjectItem({
      ...item,
      project_id: item.project_id || projectId,
    }, projectId))
    .slice(0, 200);
}

function backlogToStructuredErrors(
  items: OptimizationBacklogItem[],
  projectId: string,
  reportId: string,
  status: "open" | "fixing" | "resolved" | "regression",
): TestErrorRecord[] {
  return items.map((item) => legacyBacklogItemToErrorRecord(item, projectId, reportId, status));
}

function classifyErrorType(message: string): { title: string; severity: "red" | "yellow"; action: string } {
  const lower = message.toLowerCase();
  if (
    lower.includes("504") ||
    lower.includes("524") ||
    lower.includes("gateway timeout") ||
    lower.includes("gateway time-out") ||
    lower.includes("cloudflare")
  ) {
    return {
      title: "测试通道网关超时 / Test channel gateway timeout",
      severity: "red",
      action: "缩短测试通道模型调用、减少候选模型、检查中转站响应时间，并换用最近可稳定返回的健康模型。 / Shorten test-channel model calls, reduce candidate models, check relay latency, and switch to a recently healthy model.",
    };
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("未授权") || lower.includes("无效")) {
    return {
      title: "API Key 或权限失败 / API key or permission failure",
      severity: "red",
      action: "检查密钥是否有效、是否有权限调用所选模型；不要重复使用失败密钥消耗测试次数。 / Check key validity and model permissions; do not keep retrying a failing key.",
    };
  }
  if (lower.includes("empty") || lower.includes("choices") || lower.includes("非标准")) {
    return {
      title: "模型返回空 choices 或非标准响应 / Empty choices or non-standard model response",
      severity: "yellow",
      action: "刷新中转站模型列表，确认该模型支持 chat/completions；反复失败则从生成/评价模型中移除。 / Refresh relay models, confirm chat/completions support, and remove repeatedly failing models.",
    };
  }
  if (lower.includes("timeout") || lower.includes("超时")) {
    return {
      title: "模型响应超时 / Model timeout",
      severity: "yellow",
      action: "降低测试并发或换健康模型；慢模型只保留在确实能稳定返回时使用。 / Reduce pressure or switch to a healthy model; keep slow models only if they reliably respond.",
    };
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("限流")) {
    return {
      title: "接口限流或中转站繁忙 / Rate limit or relay overload",
      severity: "yellow",
      action: "等待冷却、切换模型或减少重复测试频率。 / Wait for cooldown, switch model, or reduce repeated test frequency.",
    };
  }
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("连接") || lower.includes("中断")) {
    return {
      title: "网络或中转站连接失败 / Network or relay connection failure",
      severity: "yellow",
      action: "重新探测中转站，优先使用最近成功的健康模型。 / Re-probe the relay and prefer recently successful healthy models.",
    };
  }
  return {
    title: "测试通道运行错误 / Test channel runtime error",
    severity: "yellow",
    action: "保留该错误作为待优化项，下次优先检查模型选择、提示词质量门和中转站响应。 / Keep this as a pending optimization item and check model selection, quality gates, and relay responses first.",
  };
}

function buildOptimizationBacklog(args: {
  reportId: string;
  status: "pass" | "warn" | "fail";
  checks: Array<{ id: string; label: string; value: number; threshold: number; status: "pass" | "warn" | "fail" }>;
  modelDiagnostics: Array<{
    modelId: string;
    modelName: string;
    apiProvider: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    attempts: number;
    bestScore?: number;
    latencyMs?: number;
  }>;
  score?: StrictScoreResult | null;
  coreDimensionMin: number;
  passTotal: number;
}): OptimizationBacklogPayload {
  const createdAt = Date.now();
  const items: OptimizationBacklogItem[] = [];
  const add = (input: Partial<OptimizationBacklogItem>) => {
    items.push(normalizeOptimizationBacklogItem({
      source: "test_channel",
      reportId: args.reportId,
      status: "pending",
      createdAt,
      lastSeenAt: createdAt,
      occurrences: 1,
      ...input,
    }));
  };

  for (const item of args.modelDiagnostics) {
    if (item.status !== "failed") continue;
    const error = safePreview(item.error || "Model failed without detailed error.", 700);
    const classified = classifyErrorType(error);
    add({
      type: "model_error",
      severity: classified.severity,
      title: classified.title,
      detail: `${item.modelName || item.modelId} / ${item.apiProvider}: ${error}`,
      action: classified.action,
      modelId: item.modelId,
      provider: item.apiProvider,
      fingerprint: buildOptimizationFingerprint(["test_channel", "model_error", item.modelId, item.apiProvider, classified.title]),
    });
  }

  for (const check of args.checks) {
    if (check.status === "pass") continue;
    add({
      type: "quality_gate",
      severity: check.status === "fail" ? "red" : "yellow",
      title: `质量门未达标：${check.label} / Quality gate below target`,
      detail: `value=${check.value}, threshold=${check.threshold}, status=${check.status}`,
      action: "下一轮自动优化必须优先补强该检查项，再返回最终提示词。 / Next optimization must strengthen this check before returning the final prompt.",
      checkId: check.id,
      fingerprint: buildOptimizationFingerprint(["test_channel", "quality_gate", check.id, check.status]),
    });
  }

  if (args.score) {
    for (const [dimension, value] of Object.entries(args.score.dimensionScores)) {
      if (Number(value) >= args.coreDimensionMin) continue;
      add({
        type: "low_dimension",
        severity: Number(value) < 7 ? "red" : "yellow",
        title: `低分维度：${dimension} / Low-score dimension`,
        detail: `${dimension}=${value}/10, target=${args.coreDimensionMin}/10`,
        action: "下一次生成前自动把该维度加入 feedback_memory，优先补强到 9.0 以上。 / Add this dimension to feedback_memory before the next run and improve it toward 9.0+.",
        dimension,
        fingerprint: buildOptimizationFingerprint(["test_channel", "low_dimension", dimension]),
      });
    }
    if (args.score.total < args.passTotal) {
      add({
        type: "quality_gate",
        severity: args.score.total < 70 ? "red" : "yellow",
        title: "严格总分未达标 / Strict total score below target",
        detail: `strict_total=${args.score.total}/100, target=${args.passTotal}/100`,
        action: "下次自动优化必须先提升总分，再处理体验类优化。 / Next auto-optimization must raise the total score before experience-level polish.",
        checkId: "strict_total",
        fingerprint: buildOptimizationFingerprint(["test_channel", "strict_total", Math.floor(args.score.total / 10)]),
      });
    }
  }

  const unique = new Map<string, OptimizationBacklogItem>();
  for (const item of items) unique.set(item.fingerprint, item);
  const deduped = [...unique.values()];
  return {
    status: deduped.length ? "pending" : "empty",
    itemCount: deduped.length,
    items: deduped,
    summary: deduped.length
      ? `已加入 ${deduped.length} 个待优化项目，下一次生成会进入 feedback_memory。 / Added ${deduped.length} pending optimization item(s); they will feed the next generation via feedback_memory.`
      : "未发现新的待优化项目。 / No new pending optimization item was found.",
  };
}

async function safeExportDatasetRow(kind: "test-channel-runs" | "optimization-backlog", row: Record<string, unknown>) {
  try {
    return await exportDatasetRow(kind, row);
  } catch (error) {
    return {
      synced: false,
      target: "local" as const,
      filePath: "not-written",
      reason: toUserFacingErrorMessage(error),
    };
  }
}

function normalizeTestError(error: unknown, modelId?: string): string {
  const message = toUserFacingErrorMessage(error);
  if (
    message.includes("reading '0'") ||
    message.includes("reading \"0\"") ||
    message.includes("Cannot read properties of undefined")
  ) {
    return `模型 ${modelId || ""} 返回了空 choices 或非标准响应。通常表示该模型不支持当前 chat/completions 调用、模型别名不可用，或中转站返回格式异常。请换一个生成/评价模型，或刷新中转站模型列表。 / Model ${modelId || ""} returned an empty or non-standard response. Switch model or refresh relay model availability.`;
  }
  return message;
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  try {
    const rate = checkRateLimit(req, {
      keyPrefix: "test-channel",
      limit: readPositiveIntEnv("TEST_CHANNEL_RATE_LIMIT_MAX", 10),
      windowMs: readPositiveIntEnv("TEST_CHANNEL_RATE_LIMIT_WINDOW_MS", 60_000),
    });
    if (!rate.ok) return rateLimitResponse(rate);

    const body: TestChannelRequest = await req.json().catch(() => ({}));
    const autoSuite = body.autoSuite !== false;
    const projectId = cleanString(body.projectId, 120) || "ai-prompt-generator";
    const historicalErrors = normalizeHistoricalErrors(body.historicalErrors, projectId);
    const historicalOptimizations = normalizeHistoricalOptimizations(body.historicalOptimizations, projectId);
    const initialAdaptivePlan = buildAdaptiveTestPlan({
      projectId,
      historicalErrors,
      historicalOptimizations,
    });
    const manualUserIdea = cleanString(body.userIdea, 6000);
    const userIdea = autoSuite
      ? buildAutoSuiteIdea([
          manualUserIdea,
          initialAdaptivePlan.summary,
          ...initialAdaptivePlan.mutation_hints.slice(0, 4),
        ].filter(Boolean).join("\n"))
      : manualUserIdea;
    if (!userIdea) {
      return NextResponse.json(
        { ok: false, error: "请输入测试目标 / Test objective is required" },
        { status: 400 },
      );
    }

    const userKeys = body.userKeys && typeof body.userKeys === "object" ? body.userKeys : {};
    const availableModelIds = Array.isArray(body.availableModelIds)
      ? body.availableModelIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : undefined;
    const models = mergeRelayModelIds(await getModels(), availableModelIds);
    const targetModel =
      models.find((model) => model.id.toLowerCase() === cleanString(body.targetModelId, 180).toLowerCase()) ||
      models.find((model) => model.id === "gpt-5.5-pro") ||
      models[0];
    if (!targetModel) {
      return NextResponse.json({ ok: false, error: "没有可用模型 / No model registry available" }, { status: 400 });
    }

    const requestedGeneratorIds = Array.from(new Set([
      ...(Array.isArray(body.generatorModelIds) ? body.generatorModelIds : []),
      body.generatorModelId,
    ].map((id) => cleanString(id, 180)).filter(Boolean))).slice(0, 6);
    const generatorPlan = buildGeneratorPlan(
      models,
      requestedGeneratorIds,
      userKeys,
      availableModelIds,
      autoSuite ? TEST_CHANNEL_AUTO_MAX_MODELS : TEST_CHANNEL_AUTO_MAX_MODELS,
    );
    if (!generatorPlan.length) {
      const noModelError = normalizeTestErrorRecord({
        project_id: projectId,
        error_type: "api",
        severity: "high",
        summary: "测试通道没有可调用的生成/评价模型 / No callable generation/evaluation model is available",
        detail: "未发现可使用当前密钥调用的文本模型。 / No text model callable with the current keys was found.",
        reproduction_path: [
          "打开 AI 提示词测试通道 / Open AI prompt test channel",
          "点击一键全流程测试 / Click one-click full-flow test",
          "系统自动选择生成/评价模型失败 / The system failed to auto-select a callable generation/evaluation model",
        ],
        test_case_id: "provider_connectivity",
        status: "open",
        optimization_suggestion: "保存有效 API Key、刷新中转站模型列表，并优先选择当前中转站明确支持的文本 chat 模型。 / Save a valid API key, refresh relay models, and choose a text chat model explicitly supported by the relay.",
        auto_optimized: false,
        optimization_history: [],
        fingerprint: buildOptimizationFingerprint([projectId, "api", "no_callable_model"]),
      }, projectId);
      const errorRecords = reconcileTestErrorRecords({
        historicalErrors,
        currentErrors: [noModelError],
        projectId,
        runId: `test_channel_no_model_${Date.now()}`,
        runStatus: "fail",
      });
      const optimizationItems = reconcileOptimizationItems(historicalOptimizations, errorRecords, projectId);
      const adaptivePlan = buildAdaptiveTestPlan({
        projectId,
        historicalErrors: errorRecords,
        historicalOptimizations: optimizationItems,
      });
      return NextResponse.json(
        {
          ok: false,
          status: "fail",
          error: "测试通道没有可调用的生成/评价模型。请先在右上角钥匙设置中保存 API Key，或配置服务器环境变量。 / No callable generation/evaluation model is available for the test channel.",
          providerStatus: configuredProviders(userKeys),
          errorRecords,
          optimizationItems,
          adaptivePlan,
          secretHandling: "原始密钥未保存；这里只检查了供应商是否已配置。 / Raw keys were not stored; only provider presence was inspected.",
        },
        { status: 200 },
      );
    }

    const language = body.language === "en" ? "en" : "zh";
    const targetCategory = targetModel.category ?? "text";
    const requestedMaxTokens = Math.min(Math.max(Number(body.maxTokens) || 1600, 512), 3000);
    const maxTokens = autoSuite
      ? Math.min(requestedMaxTokens, TEST_CHANNEL_AUTO_MAX_TOKENS)
      : Math.min(requestedMaxTokens, 1200);
    const maxAttempts = autoSuite
      ? TEST_CHANNEL_AUTO_MAX_ATTEMPTS
      : Math.min(Math.max(Number(body.maxAttempts) || 1, 1), 2);
    const passTotal = Math.min(Math.max(Number(body.qualityTargets?.passTotal) || 85, 70), 95);
    const coreDimensionMin = Math.min(Math.max(Number(body.qualityTargets?.coreDimensionMin) || 9, 7), 10);
    const hasReferenceImage = Boolean(body.referenceImage?.dataUrl);
    const providerStatus = configuredProviders(userKeys);
    let selected: TestModelPlan = generatorPlan[0];
    let bestPlan: TestModelPlan = selected;

    const feedbackMemory = [
      "Test channel quality policy:",
      `- Run real provider generation with selected model candidates, then score strict quality.`,
      "- Human feedback remains higher priority than AI scoring in normal optimization.",
      "- Do not leak API keys. Do not include secrets in prompt text, reports, logs, or GitHub datasets.",
      "- If any key quality dimension is below target, rewrite internally before returning the best candidate.",
      initialAdaptivePlan.summary,
      ...initialAdaptivePlan.mutation_hints.slice(0, 4),
      ...buildStructuredOptimizationRules(historicalErrors, historicalOptimizations, initialAdaptivePlan).slice(0, 6),
      hasReferenceImage
        ? "- Reference image mode: preserve visual style, composition, palette, lighting, subject relation, and user text goal."
        : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = buildSystemPrompt({
      userIdea,
      targetModel: targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
      feedbackMemory,
    });

    const baseUserPrompt = buildUserPrompt({
      userIdea,
      targetModel: targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
      feedbackMemory,
    });

    const attempts: Array<{
      attempt: number;
      score: StrictScoreResult;
      latencyMs: number;
      outputTokens: number;
      inputTokens: number;
      preview: string;
      modelId?: string;
      apiProvider?: string;
    }> = [];
    const modelDiagnostics: Array<{
      modelId: string;
      modelName: string;
      apiProvider: string;
      status: "success" | "failed" | "skipped";
      error?: string;
      attempts: number;
      bestScore?: number;
      latencyMs?: number;
    }> = [];
    let bestText = "";
    let bestScore: StrictScoreResult | null = null;
    let bestLatencyMs = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const startedAt = requestStartedAt;
    const reportId = `test_channel_${startedAt}_${createHash("sha1").update(`${userIdea}:${generatorPlan[0]?.model.id || "unknown"}`).digest("hex").slice(0, 8)}`;
    const testSuite = {
      mode: autoSuite ? "auto_full_flow" : "manual",
      caseCount: autoSuite ? AUTO_TEST_CASES.length : 1,
      cases: autoSuite ? AUTO_TEST_CASES.map((item) => ({ id: item.id, label: item.label })) : [],
      customObjectiveIncluded: Boolean(autoSuite && manualUserIdea),
    };
    let successfulModelSeen = false;
    let budgetExhausted = false;
    const remainingBudgetMs = () => TEST_CHANNEL_TOTAL_BUDGET_MS - (Date.now() - startedAt);

    for (const plan of generatorPlan) {
      selected = plan;
      const modelRemainingMs = remainingBudgetMs();
      if (modelRemainingMs <= TEST_CHANNEL_MIN_REMAINING_MS) {
        budgetExhausted = true;
        modelDiagnostics.push({
          modelId: plan.model.id,
          modelName: plan.model.name,
          apiProvider: plan.apiProvider,
          status: "failed",
          attempts: 0,
          error: "测试通道时间预算用尽，已主动停止，避免被 Cloudflare/网关截断成 HTML 504。 / Test channel time budget was exhausted, so the run stopped before Cloudflare/gateway could cut it off as an HTML 504.",
        });
        break;
      }
      let repairGuidance = "";
      let modelBestScore = 0;
      let modelLatencyMs = 0;
      let modelAttempts = 0;
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const attemptRemainingMs = remainingBudgetMs();
          if (attemptRemainingMs <= TEST_CHANNEL_MIN_REMAINING_MS) {
            budgetExhausted = true;
            throw new Error("测试通道时间预算用尽，已主动停止。 / Test channel time budget exhausted; stopped proactively.");
          }
          const callTimeoutMs = Math.min(
            TEST_CHANNEL_MODEL_TIMEOUT_MS,
            Math.max(1_000, attemptRemainingMs - TEST_CHANNEL_MIN_REMAINING_MS),
          );
          modelAttempts = attempt;
          const result = await callProvider({
            model: plan.model.id,
            apiProvider: plan.apiProvider,
            systemPrompt,
            userPrompt: [
              baseUserPrompt,
              repairGuidance,
              attempt > 1
                ? "Rewrite the previous weak dimensions. Output only the improved final prompt, with no explanation."
                : "",
            ].filter(Boolean).join("\n\n"),
            maxTokens,
            temperature: attempt === 1 ? 0.35 : 0.45,
            userKeys,
            timeoutMs: callTimeoutMs,
          });
          if (!result.text.trim()) {
            throw new Error(`Empty response from ${plan.apiProvider}/${plan.model.id}. 上游模型返回了空文本。`);
          }
          successfulModelSeen = true;
          totalInputTokens += result.inputTokens;
          totalOutputTokens += result.outputTokens;
          modelLatencyMs += result.latencyMs;
          const score = strictPromptScore({
            userIdea,
            promptText: result.text,
            targetModelId: targetModel.id,
            hasReferenceImage,
          });
          modelBestScore = Math.max(modelBestScore, score.total);
          attempts.push({
            attempt,
            score,
            latencyMs: result.latencyMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            preview: safePreview(result.text, 700),
            modelId: plan.model.id,
            apiProvider: plan.apiProvider,
          });
          if (!bestScore || score.total > bestScore.total) {
            bestText = result.text;
            bestScore = score;
            bestLatencyMs = result.latencyMs;
            bestPlan = plan;
          }

          const lowDimensions = Object.entries(score.dimensionScores)
            .filter(([, value]) => value < coreDimensionMin)
            .map(([dimension, value]) => `${dimension}=${value}/10`);
          if (score.total >= passTotal && lowDimensions.length === 0) break;
          repairGuidance = [
            "Quality gate failed. Improve these dimensions before returning:",
            `- strict total: ${score.total}/100, target ${passTotal}/100`,
            ...lowDimensions.map((item) => `- ${item}`),
            "- Add missing structure, anti-hallucination constraints, model-specific fit, acceptance criteria, and user-intent preservation.",
          ].join("\n");
        }
        modelDiagnostics.push({
          modelId: plan.model.id,
          modelName: plan.model.name,
          apiProvider: plan.apiProvider,
          status: "success",
          attempts: modelAttempts,
          bestScore: modelBestScore,
          latencyMs: modelLatencyMs,
        });
        if (bestScore && bestScore.total >= passTotal) break;
      } catch (error) {
        const normalizedError = normalizeTestError(error, plan.model.id);
        if (remainingBudgetMs() <= TEST_CHANNEL_MIN_REMAINING_MS) budgetExhausted = true;
        modelDiagnostics.push({
          modelId: plan.model.id,
          modelName: plan.model.name,
          apiProvider: plan.apiProvider,
          status: "failed",
          attempts: Math.max(modelAttempts, 1),
          error: normalizedError,
        });
        continue;
      }
    }

    if (!bestScore) {
      const failedChecks = [
        {
          id: "provider_connectivity",
          label: "真实模型连通性 / Provider connectivity",
          value: 0,
          threshold: 10,
          status: "fail" as const,
        },
        ...(budgetExhausted
          ? [{
              id: "test_channel_time_budget",
              label: "测试通道时间预算 / Test channel time budget",
              value: Math.max(0, remainingBudgetMs()),
              threshold: TEST_CHANNEL_MIN_REMAINING_MS,
              status: "fail" as const,
            }]
          : []),
      ];
      const optimizationBacklog = buildOptimizationBacklog({
        reportId,
        status: "fail",
        checks: failedChecks,
        modelDiagnostics,
        score: null,
        coreDimensionMin,
        passTotal,
      });
      const currentErrorRecords = backlogToStructuredErrors(optimizationBacklog.items, projectId, reportId, "open");
      const errorRecords = reconcileTestErrorRecords({
        historicalErrors,
        currentErrors: currentErrorRecords,
        projectId,
        runId: reportId,
        runStatus: "fail",
      });
      const optimizationItems = reconcileOptimizationItems(
        historicalOptimizations,
        errorRecords,
        projectId,
      );
      const adaptivePlan = buildAdaptiveTestPlan({
        projectId,
        historicalErrors: errorRecords,
        historicalOptimizations: optimizationItems,
      });
      const github = await safeExportDatasetRow("test-channel-runs", {
        id: reportId,
        timestamp: startedAt,
        deviceId: cleanDeviceId(req, body),
        userIdea: safePreview(userIdea, 600),
        targetModel: targetModel.id,
        optimizedPrompt: "",
        aiPromptScore: null,
        strictScore: null,
        failedDimensions: failedChecks.map((item) => item.id),
        testScores: {
          status: "fail",
          attempts: attempts.length,
          successfulModelSeen,
          modelDiagnostics,
          passTotal,
          coreDimensionMin,
          testSuite,
          adaptivePlan,
        },
        testChannel: {
          status: "fail",
          provider: selected.apiProvider,
          model_id: selected.model.id,
          model_name: selected.model.name,
          target_model_id: targetModel.id,
          latency_ms: Date.now() - startedAt,
          attempts: attempts.length,
          model_diagnostics: modelDiagnostics.map((item) => ({
            model_id: item.modelId,
            provider: item.apiProvider,
            status: item.status,
            error: item.error ? safePreview(item.error, 280) : "",
            best_score: item.bestScore ?? null,
          })),
          key_fingerprints: providerStatus.keyFingerprints.map((item) => ({
            key_name: item.keyName,
            source: item.source,
            hash: item.hash,
          })),
          secret_handling: "原始 API Key 只在本次请求内存中使用；脱敏报告排除完整密钥值。 / Raw API keys are used only in-memory for this request; sanitized reports exclude key values.",
        },
        optimizationBacklog,
        errorRecords,
        optimizationItems,
        adaptivePlan,
      });
      if (optimizationBacklog.itemCount > 0) {
        await safeExportDatasetRow("optimization-backlog", {
          id: `${reportId}_optimization_backlog`,
          timestamp: startedAt,
          deviceId: cleanDeviceId(req, body),
          userIdea: safePreview(userIdea, 600),
          targetModel: targetModel.id,
          failedDimensions: failedChecks.map((item) => item.id),
          testChannel: {
            status: "fail",
            provider: selected.apiProvider,
            model_id: selected.model.id,
            model_name: selected.model.name,
            target_model_id: targetModel.id,
            latency_ms: Date.now() - startedAt,
            attempts: attempts.length,
            model_diagnostics: modelDiagnostics.map((item) => ({
              model_id: item.modelId,
              provider: item.apiProvider,
              status: item.status,
              error: item.error ? safePreview(item.error, 280) : "",
              best_score: item.bestScore ?? null,
            })),
            key_fingerprints: [],
            secret_handling: "脱敏待优化队列不保存原始密钥。 / Sanitized optimization backlog does not store raw keys.",
          },
          optimizationBacklog,
          errorRecords,
          optimizationItems,
          adaptivePlan,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          status: "fail",
          reportId,
          error: budgetExhausted
            ? "测试通道已在 45 秒预算内主动停止；慢模型或中转站无响应已被分类保存，不再等待到 Cloudflare/网关 504。 / Test channel stopped within the 45s budget; slow or unresponsive upstream calls were classified and saved instead of waiting for Cloudflare/gateway 504."
            : "测试通道没有收到任何可评分的模型输出。已尝试可用模型，但都失败或返回空内容。请先换一个生成/评价模型，或打开密钥设置刷新中转站模型列表。 / No scorable output was received. Switch model or refresh relay model availability.",
          providerStatus: {
            configured: providerStatus.configured,
            keys: providerStatus.keyFingerprints.map((item) => ({
              keyName: item.keyName,
              source: item.source,
              masked: item.masked,
              hash: item.hash,
            })),
          },
          modelDiagnostics,
          checks: failedChecks,
          testSuite,
          optimizationBacklog,
          errorRecords,
          optimizationItems,
          adaptivePlan,
          improvementPlan: [
            "测试通道现在有 45 秒硬预算和 22 秒单模型超时；慢模型会被主动中断并进入待优化项，不再等待到网关 504。 / The test channel now has a 45s hard budget and a 22s per-model timeout; slow models are interrupted and saved to the optimization backlog instead of waiting for gateway 504.",
            "点击右上角模型选择，把生成/评价模型换成该中转站明确支持的 chat 文本模型。 / Open the model picker and choose a chat text model that the relay explicitly supports.",
            "打开密钥设置并保存一次，让系统重新探测中转站模型列表。 / Open key settings and save once so the app re-probes the relay model list.",
            "如果使用的是 gpt-5.5 这类别名，确认中转站是否真实支持该别名；不支持就换成列表里存在的模型。 / If you are using an alias such as gpt-5.5, confirm the relay really supports it; otherwise choose a listed model.",
            "如果某个模型反复返回空 choices，把它从测试模型选择中移除。 / If a model repeatedly returns empty choices, remove it from the test model selection.",
          ],
          secretHandling: "原始密钥不会出现在诊断或报告中。 / Raw keys are not included in diagnostics or reports.",
          github,
        },
        { status: 200 },
      );
    }
    selected = bestPlan;

    const checks = buildChecks({
      score: bestScore,
      latencyMs: bestLatencyMs,
      outputText: bestText,
      githubTarget: "pending",
      hasReferenceImage,
      passTotal,
      coreDimensionMin,
    });
    const failedDimensions = checks
      .filter((item) => item.status !== "pass")
      .map((item) => item.id);
    const statusBeforeReport = overallStatus(checks, bestScore, passTotal);

    const optimizationBacklog = buildOptimizationBacklog({
      reportId,
      status: statusBeforeReport,
      checks,
      modelDiagnostics,
      score: bestScore,
      coreDimensionMin,
      passTotal,
    });
    const currentErrorRecords = backlogToStructuredErrors(optimizationBacklog.items, projectId, reportId, "open");
    const errorRecords = reconcileTestErrorRecords({
      historicalErrors,
      currentErrors: currentErrorRecords,
      projectId,
      runId: reportId,
      runStatus: statusBeforeReport,
    });
    const optimizationItems = reconcileOptimizationItems(
      historicalOptimizations,
      errorRecords,
      projectId,
    );
    const adaptivePlan = buildAdaptiveTestPlan({
      projectId,
      historicalErrors: errorRecords,
      historicalOptimizations: optimizationItems,
    });

    const github = await safeExportDatasetRow("test-channel-runs", {
      id: reportId,
      timestamp: startedAt,
      deviceId: cleanDeviceId(req, body),
      userIdea: safePreview(userIdea, 600),
      targetModel: targetModel.id,
      optimizedPrompt: safePreview(bestText, 1200),
      aiPromptScore: bestScore.total,
      strictScore: bestScore,
      failedDimensions,
      testScores: {
        status: statusBeforeReport,
        attempts: attempts.length,
        successfulModelSeen,
        modelDiagnostics,
        passTotal,
        coreDimensionMin,
        testSuite,
        adaptivePlan,
      },
      testChannel: {
        status: statusBeforeReport,
        provider: selected.apiProvider,
        model_id: selected.model.id,
        model_name: selected.model.name,
        target_model_id: targetModel.id,
        latency_ms: Date.now() - startedAt,
        attempts: attempts.length,
        model_diagnostics: modelDiagnostics.map((item) => ({
          model_id: item.modelId,
          provider: item.apiProvider,
          status: item.status,
          error: item.error ? safePreview(item.error, 280) : "",
          best_score: item.bestScore ?? null,
        })),
        key_fingerprints: providerStatus.keyFingerprints.map((item) => ({
          key_name: item.keyName,
          source: item.source,
          hash: item.hash,
        })),
        secret_handling: "原始 API Key 只在本次请求内存中使用；脱敏报告排除完整密钥值。 / Raw API keys are used only in-memory for this request; sanitized reports exclude key values.",
      },
      optimizationBacklog,
      errorRecords,
      optimizationItems,
      adaptivePlan,
    });
    if (optimizationBacklog.itemCount > 0) {
      await safeExportDatasetRow("optimization-backlog", {
        id: `${reportId}_optimization_backlog`,
        timestamp: startedAt,
        deviceId: cleanDeviceId(req, body),
        userIdea: safePreview(userIdea, 600),
        targetModel: targetModel.id,
        aiPromptScore: bestScore.total,
        strictScore: bestScore,
        failedDimensions,
        testScores: {
          status: statusBeforeReport,
          attempts: attempts.length,
          successfulModelSeen,
          modelDiagnostics,
          passTotal,
          coreDimensionMin,
          testSuite,
          adaptivePlan,
        },
        testChannel: {
          status: statusBeforeReport,
          provider: selected.apiProvider,
          model_id: selected.model.id,
          model_name: selected.model.name,
          target_model_id: targetModel.id,
          latency_ms: Date.now() - startedAt,
          attempts: attempts.length,
          model_diagnostics: modelDiagnostics.map((item) => ({
            model_id: item.modelId,
            provider: item.apiProvider,
            status: item.status,
            error: item.error ? safePreview(item.error, 280) : "",
            best_score: item.bestScore ?? null,
          })),
          key_fingerprints: [],
          secret_handling: "脱敏待优化队列不保存原始密钥。 / Sanitized optimization backlog does not store raw keys.",
        },
        optimizationBacklog,
        errorRecords,
        optimizationItems,
        adaptivePlan,
      });
    }

    const finalChecks = buildChecks({
      score: bestScore,
      latencyMs: bestLatencyMs,
      outputText: bestText,
      githubTarget: github.target,
      hasReferenceImage,
      passTotal,
      coreDimensionMin,
    });
    const status = overallStatus(finalChecks, bestScore, passTotal);

    return NextResponse.json({
      ok: true,
      status,
      reportId,
      model: {
        id: selected.model.id,
        name: selected.model.name,
        provider: selected.model.provider,
        apiProvider: selected.apiProvider,
        targetModelId: targetModel.id,
        targetModelName: targetModel.name,
      },
      strictScore: bestScore,
      checks: finalChecks,
      attempts,
      modelDiagnostics,
      testSuite,
      optimizationBacklog,
      errorRecords,
      optimizationItems,
      adaptivePlan,
      improvementPlan: [
        status === "pass"
          ? "本次测试已通过，可把最佳提示词预览作为质量样例进入后续优化。 / This test passed; the best prompt preview can be used as a quality sample for future optimization."
          : "优先查看未通过/警告检查项，对应补强测试目标或提示词模板。 / First inspect failed or warning checks, then strengthen the test objective or prompt template accordingly.",
        "如果模型诊断中有 failed，优先换掉失败模型或刷新中转站模型列表。 / If model diagnostics contains failed items, replace the failed model or refresh the relay model list first.",
        "如果 strict total 未到 85，优先补强意图保真、目标模型适配、幻觉防护三个维度。 / If strict total is below 85, strengthen intent fidelity, target model fit, and hallucination resistance first.",
        "如果生成/评价模型显示的是旧别名，重新打开模型选择器选择当前可用的高质量文本模型。 / If the generation/evaluation model is an old alias, reopen the model picker and choose a currently callable high-quality text model.",
      ],
      stats: {
        latencyMs: Date.now() - startedAt,
        bestModelLatencyMs: bestLatencyMs,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        tokensDelta: comparePrompts(userIdea, bestText).delta,
        changePercent: comparePrompts(userIdea, bestText).ratio,
      },
      providerStatus: {
        configured: providerStatus.configured,
        keys: providerStatus.keyFingerprints.map((item) => ({
          keyName: item.keyName,
          source: item.source,
          masked: item.masked,
          hash: item.hash,
        })),
      },
      bestPromptPreview: safePreview(bestText, 1800),
      github: {
        synced: github.synced,
        target: github.target,
        filePath: github.filePath,
        repository: github.repository,
        branch: github.branch,
        reason: github.reason,
      },
      secretHandling: "浏览器密钥只会随本次请求发送到 /api/test-channel/run；原始密钥永不返回、写日志或写入 GitHub 数据集。 / Browser keys are sent only to /api/test-channel/run for this run; raw keys are never returned, logged, or written to GitHub datasets.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "fail",
        error: toUserFacingErrorMessage(error),
        secretHandling: "原始密钥不会出现在错误或报告中。 / Raw keys are not included in errors or reports.",
      },
      { status: 200 },
    );
  }
}
