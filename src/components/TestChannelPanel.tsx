"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2, FlaskConical, KeyRound, Loader2, ShieldCheck, X, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { loadUserKeys } from "./KeysSettings";
import { BEST_TARGET_MODEL_ID, normalizeBestModelPreference } from "@/lib/best-model-policy";
import {
  getOptimizationProjectItems,
  getPendingOptimizationItems,
  getTestErrorRecords,
  saveOptimizationProjectItems,
  savePendingOptimizationItems,
  saveTestErrorRecords,
} from "@/lib/prompt-feedback";
import type {
  AdaptiveTestPlan,
  OptimizationBacklogPayload,
  OptimizationProjectItem,
  TestErrorRecord,
} from "@/lib/optimization-backlog";

interface TestChannelPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenKeys?: () => void;
}

interface TestCheck {
  id: string;
  label: string;
  value: number;
  threshold: number;
  status: "pass" | "warn" | "fail";
}

interface TestChannelResult {
  ok: boolean;
  status: "pass" | "warn" | "fail";
  reportId: string;
  model: {
    id: string;
    name: string;
    provider: string;
    apiProvider: string;
    targetModelId: string;
    targetModelName: string;
  };
  strictScore: {
    total: number;
    pass: boolean;
    dimensionScores: Record<string, number>;
    deductions: Array<{ dimension: string; reason: string; score: number }>;
  };
  checks: TestCheck[];
  attempts: Array<{
    attempt: number;
    score: { total: number; pass: boolean; dimensionScores: Record<string, number> };
    latencyMs: number;
    preview: string;
    modelId?: string;
    apiProvider?: string;
  }>;
  modelDiagnostics?: Array<{
    modelId: string;
    modelName: string;
    apiProvider: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    attempts: number;
    bestScore?: number;
    latencyMs?: number;
  }>;
  modelPreflight?: {
    requestedModelIds?: string[];
    relayAvailableCount?: number;
    selectedStrongModels?: Array<{
      id: string;
      name: string;
      provider: string;
      apiProvider: string;
      score: number;
      strength: "flagship" | "strong" | "usable" | "risky";
      listedByRelay: boolean;
      requested: boolean;
      reasons: string[];
      riskFlags: string[];
    }>;
    standbyStrongModels?: Array<{
      id: string;
      name: string;
      provider: string;
      apiProvider: string;
      score: number;
      strength: "flagship" | "strong" | "usable" | "risky";
      listedByRelay: boolean;
      requested: boolean;
      reasons: string[];
      riskFlags: string[];
    }>;
    skippedWeakOrRiskyModels?: Array<{
      id: string;
      name: string;
      provider: string;
      apiProvider: string;
      score: number;
      strength: "flagship" | "strong" | "usable" | "risky";
      listedByRelay: boolean;
      requested: boolean;
      reasons: string[];
      riskFlags: string[];
    }>;
    routingPolicy?: string;
  };
  promptLanguage?: "en" | "zh";
  promptLanguageReason?: string;
  improvementPlan?: string[];
  testSuite?: {
    mode: string;
    caseCount: number;
    cases: Array<{ id: string; label: string }>;
    customObjectiveIncluded?: boolean;
  };
  optimizationBacklog?: OptimizationBacklogPayload;
  errorRecords?: TestErrorRecord[];
  optimizationItems?: OptimizationProjectItem[];
  adaptivePlan?: AdaptiveTestPlan;
  stats: {
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
  };
  providerStatus: {
    configured: string[];
    keys: Array<{ keyName: string; source: string; masked: string; hash: string }>;
  };
  bestPromptPreview: string;
  github: {
    synced: boolean;
    target: "github" | "local";
    filePath: string;
    repository?: string;
    branch?: string;
    reason?: string;
  };
  secretHandling: string;
}

const TARGET_STORAGE_KEY = "ai_prompt_target_model_id";
const GENERATOR_STORAGE_KEY = "ai_prompt_last_generator_model_ids";
const DEVICE_ID_STORAGE_KEY = "ai_prompt_device_id";
const PROBE_CACHE_KEY = "ai_prompt_probe_result";

const DEFAULT_TEST_IDEA =
  "额外关注：AI 提示词生成器要自动识别错误类型、自动保存待优化项，并在下一轮生成前主动优化。";

function ensureDeviceId(): string {
  if (typeof window === "undefined") return "anonymous-device";
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

function readJsonArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function readStoredTestModels(): { targetModelId: string; generatorModelIds: string[]; upgraded: boolean } {
  if (typeof window === "undefined") {
    return { targetModelId: BEST_TARGET_MODEL_ID, generatorModelIds: [BEST_TARGET_MODEL_ID], upgraded: false };
  }
  const normalized = normalizeBestModelPreference({
    targetModelId: localStorage.getItem(TARGET_STORAGE_KEY) || BEST_TARGET_MODEL_ID,
    generatorModelIds: readJsonArray(GENERATOR_STORAGE_KEY),
    evaluatorModelIds: readJsonArray("ai_prompt_last_evaluator_model_ids"),
    source: "auto",
  });
  if (normalized.upgraded) {
    localStorage.setItem(TARGET_STORAGE_KEY, normalized.targetModelId);
    localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(normalized.generatorModelIds));
    localStorage.setItem("ai_prompt_last_evaluator_model_ids", JSON.stringify(normalized.evaluatorModelIds));
  }
  return {
    targetModelId: normalized.targetModelId,
    generatorModelIds: normalized.generatorModelIds.length ? normalized.generatorModelIds : [BEST_TARGET_MODEL_ID],
    upgraded: normalized.upgraded,
  };
}

function readProbeModels(): string[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(localStorage.getItem(PROBE_CACHE_KEY) || "{}");
    return Array.isArray(parsed.models) ? parsed.models.filter((item: unknown): item is string => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}

function countConfiguredKeys(keys: Record<string, string>): number {
  return Object.entries(keys).filter(([name, value]) => name.endsWith("_KEY") && value.trim().length > 5).length;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 100) / 10;
  return `${sec}s`;
}

function statusCopy(status?: "pass" | "warn" | "fail") {
  if (status === "pass") return { text: "通过 / Passed", tone: "text-emerald-300", border: "border-emerald-300/25", bg: "bg-emerald-500/10", Icon: CheckCircle2 };
  if (status === "warn") return { text: "需关注 / Needs attention", tone: "text-amber-200", border: "border-amber-300/25", bg: "bg-amber-500/10", Icon: AlertTriangle };
  return { text: "未通过 / Failed", tone: "text-rose-200", border: "border-rose-300/25", bg: "bg-rose-500/10", Icon: XCircle };
}

function isBilingualText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value) && (
    /\s\/\s[A-Z][A-Za-z]/.test(value) ||
    /\b(Test|Generation|Model|Network|API Key|Raw keys|Provider|Switch|Open|Save|No |The |This )\b/.test(value)
  );
}

function normalizeTestChannelError(value: unknown): string {
  const message = typeof value === "string" && value.trim()
    ? value.trim()
    : "测试通道运行失败 / Test channel failed";
  if (isBilingualText(message)) return message;
  return `测试通道运行失败：${message} / Test channel failed: ${message}`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeNonJsonResponse(text: string, status: number, statusText: string): string {
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const normalizedTitle = title ? stripHtml(title).slice(0, 160) : "";
  const lower = `${text} ${normalizedTitle} ${status} ${statusText}`.toLowerCase();
  if (
    status === 504 ||
    lower.includes("504") ||
    lower.includes("gateway time-out") ||
    lower.includes("gateway timeout") ||
    lower.includes("cf-error-details") ||
    lower.includes("cloudflare")
  ) {
    const suffix = normalizedTitle ? ` (${normalizedTitle})` : "";
    return `测试通道接口超过网关时间限制 / Test channel exceeded gateway timeout${suffix}`;
  }
  if (status === 502 || lower.includes("502") || lower.includes("bad gateway")) {
    const compact = stripHtml(text).slice(0, 120);
    const suffix = normalizedTitle ? ` (${normalizedTitle})` : compact ? ` (${compact})` : "";
    return `测试通道接口返回网关错误 / Test channel returned a gateway error${suffix}`;
  }
  return stripHtml(text).slice(0, 260) || `${status} ${statusText}`;
}

function isGatewayTimeoutMessage(value: unknown): boolean {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  return (
    text.includes("504") ||
    text.includes("gateway timeout") ||
    text.includes("gateway time-out") ||
    text.includes("exceeded gateway timeout") ||
    text.includes("超过网关时间限制") ||
    text.includes("cloudflare")
  );
}

async function readTestChannelResponse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text().catch(() => "");
  if (contentType.includes("application/json") && text.trim()) {
    try {
      return JSON.parse(text);
    } catch {
      const summary = summarizeNonJsonResponse(text, res.status, res.statusText);
      return {
        ok: false,
        error: `测试通道返回了无法解析的 JSON。HTTP ${res.status} ${res.statusText}. 响应摘要：${summary} / Test channel returned invalid JSON. HTTP ${res.status} ${res.statusText}. Response summary: ${summary}`,
        rawResponseText: summary,
      };
    }
  }
  if (text.trim()) {
    const summary = summarizeNonJsonResponse(text, res.status, res.statusText);
    return {
      ok: false,
      error: `测试通道接口返回非 JSON 响应。HTTP ${res.status} ${res.statusText}. 响应摘要：${summary} / Test channel API returned a non-JSON response. HTTP ${res.status} ${res.statusText}. Response summary: ${summary}`,
      rawResponseText: summary,
    };
  }
  return {
    ok: false,
    error: `测试通道接口没有返回响应体。HTTP ${res.status} ${res.statusText} / Test channel API returned an empty response body. HTTP ${res.status} ${res.statusText}`,
  };
}

function buildFallbackFailureResult(args: {
  data: any;
  storedTarget: string;
  storedGenerator: string;
  message: string;
}): TestChannelResult {
  const firstError = Array.isArray(args.data?.errorRecords) ? args.data.errorRecords[0] : null;
  const classifiedDetail = firstError?.detail || firstError?.summary || args.data?.rawResponseText || args.message;
  const gatewayTimeout = isGatewayTimeoutMessage(classifiedDetail) || isGatewayTimeoutMessage(args.message);
  const fallbackErrorRecord: TestErrorRecord = firstError || {
    error_id: `frontend_fallback_${Date.now()}`,
    project_id: "ai-prompt-generator",
    error_type: "api",
    severity: "high",
    summary: gatewayTimeout
      ? "测试通道网关超时 / Test channel gateway timeout"
      : "测试通道接口失败 / Test channel API failed",
    detail: classifiedDetail,
    reproduction_path: [
      "打开 AI 提示词测试通道 / Open AI prompt test channel",
      "点击一键全流程测试 / Click one-click full-flow test",
      "接口返回非结构化失败或网关错误 / API returned an unstructured failure or gateway error",
    ],
    test_case_id: "test_channel_runtime",
    discovered_at: new Date().toISOString(),
    status: "open",
    optimization_suggestion: gatewayTimeout
      ? "缩短测试通道模型调用、减少候选模型、检查中转站响应时间、换用健康模型，并优先回归 gateway-timeout 问题。 / Shorten test-channel model calls, reduce candidate models, check relay response time, switch to a healthy model, and prioritize gateway-timeout regression."
      : "优先检查 /api/test-channel/run 生产函数、网关 502/504、密钥配置和模型可调用性，并保持前端显示 HTTP 状态与响应摘要。 / Check the /api/test-channel/run production function, gateway 502/504, key configuration, and model callability first; keep HTTP status and response summary visible.",
    auto_optimized: false,
    optimization_history: [],
    fingerprint: gatewayTimeout ? "frontend_test_channel_gateway_timeout" : "frontend_test_channel_api_failure",
    occurrences: 1,
    last_seen_at: new Date().toISOString(),
    resolved_at: null,
  };
  return {
    ok: false,
    status: "fail",
    reportId: args.data?.reportId || "failed-test-channel-run",
    model: args.data?.model || {
      id: args.storedGenerator || "unknown",
      name: args.storedGenerator || "unknown",
      provider: "unknown",
      apiProvider: "unknown",
      targetModelId: args.storedTarget || "unknown",
      targetModelName: args.storedTarget || "unknown",
    },
    strictScore: args.data?.strictScore || {
      total: 0,
      pass: false,
      dimensionScores: {},
      deductions: [],
    },
    checks: args.data?.checks || [
      {
        id: "test_channel_runtime",
        label: "测试通道运行失败 / Test channel runtime failed",
        value: 0,
        threshold: 10,
        status: "fail",
      },
    ],
    attempts: args.data?.attempts || [],
    stats: args.data?.stats || {
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
    providerStatus: args.data?.providerStatus || { configured: [], keys: [] },
    bestPromptPreview: args.data?.bestPromptPreview || "",
    github: args.data?.github || {
      synced: false,
      target: "local",
      filePath: "not-written",
    },
    modelDiagnostics: args.data?.modelDiagnostics || [
      {
        modelId: args.storedGenerator || "unknown",
        modelName: args.storedGenerator || "unknown",
        apiProvider: "unknown",
        status: "failed",
        attempts: 1,
        error: classifiedDetail,
      },
    ],
    modelPreflight: args.data?.modelPreflight,
    promptLanguage: args.data?.promptLanguage,
    promptLanguageReason: args.data?.promptLanguageReason,
    improvementPlan: args.data?.improvementPlan || [
      "已保存本次失败详情到错误分类和待优化项目；下一次测试会优先回归该问题。 / This failure was saved to error classification and the optimization backlog; the next test will prioritize it.",
      "如果失败详情包含 HTTP 502/504 或非 JSON 响应，优先检查生产函数部署、Cloudflare/Vercel 网关、密钥配置和接口运行日志。 / If the failure detail contains HTTP 502/504 or a non-JSON response, check the production function deployment, Cloudflare/Vercel gateway, key configuration, and API runtime logs first.",
      "如果是 504 网关超时，下一次会优先回归 gateway-timeout，并检查是否已缩短模型调用和减少候选模型。 / If this is a 504 gateway timeout, the next run prioritizes gateway-timeout regression and verifies shorter model calls with fewer candidates.",
      "如果当前测试模型是旧别名，系统会自动升级到 GPT-5.5 Pro 后再测试。 / If the current test model is an old alias, the system upgrades it to GPT-5.5 Pro before testing.",
    ],
    testSuite: args.data?.testSuite,
    optimizationBacklog: args.data?.optimizationBacklog,
    errorRecords: args.data?.errorRecords || [fallbackErrorRecord],
    optimizationItems: args.data?.optimizationItems || [],
    adaptivePlan: args.data?.adaptivePlan,
    secretHandling: args.data?.secretHandling || "原始密钥不会出现在诊断或报告中 / Raw keys are not included in diagnostics or reports",
  };
}

function persistOptimizationBacklog(backlog?: OptimizationBacklogPayload | null): number {
  if (!backlog?.items?.length) return getPendingOptimizationItems().length;
  return savePendingOptimizationItems(backlog.items).filter((item) => item.status !== "resolved").length;
}

function countPendingOptimizations(): number {
  const legacyCount = getPendingOptimizationItems().filter((item) => item.status !== "resolved").length;
  const structuredCount = getOptimizationProjectItems().filter((item) => !item.resolved_at).length;
  const unresolvedErrorCount = getTestErrorRecords().filter((item) => item.status !== "resolved").length;
  return Math.max(legacyCount, structuredCount, unresolvedErrorCount);
}

function persistStructuredTestData(data: Partial<TestChannelResult>): number {
  if (Array.isArray(data.errorRecords) && data.errorRecords.length > 0) {
    saveTestErrorRecords(data.errorRecords);
  }
  if (Array.isArray(data.optimizationItems) && data.optimizationItems.length > 0) {
    saveOptimizationProjectItems(data.optimizationItems);
  }
  persistOptimizationBacklog(data.optimizationBacklog);
  return countPendingOptimizations();
}

export function TestChannelPanel({ open, onClose, onOpenKeys }: TestChannelPanelProps) {
  const [testIdea, setTestIdea] = useState(DEFAULT_TEST_IDEA);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestChannelResult | null>(null);
  const [error, setError] = useState("");
  const [keyCount, setKeyCount] = useState(0);
  const [pendingOptimizationCount, setPendingOptimizationCount] = useState(0);
  const [storedTarget, setStoredTarget] = useState("gpt-5.5-pro");
  const [storedGenerators, setStoredGenerators] = useState<string[]>(["gpt-5.5-pro"]);

  useEffect(() => {
    if (!open) return;
    setKeyCount(countConfiguredKeys(loadUserKeys()));
    setPendingOptimizationCount(countPendingOptimizations());
    const normalized = readStoredTestModels();
    setStoredTarget(normalized.targetModelId);
    setStoredGenerators(normalized.generatorModelIds);
    if (normalized.upgraded) {
      toast.success("测试模型已自动升级到最新版 / Test model upgraded to the latest version");
    }
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const status = useMemo(() => statusCopy(result?.status), [result?.status]);

  const runTest = async () => {
    const userKeys = loadUserKeys();
    const configured = countConfiguredKeys(userKeys);
    setKeyCount(configured);
    if (!configured && !userKeys.CUSTOM_API_KEY?.trim()) {
      toast.error("请先保存至少一个 API Key，再运行测试通道 / Save at least one API key first");
      onOpenKeys?.();
      return;
    }

    setRunning(true);
    setError("");
    setResult(null);
    const normalizedModels = readStoredTestModels();
    setStoredTarget(normalizedModels.targetModelId);
    setStoredGenerators(normalizedModels.generatorModelIds);
    const tid = toast.loading("测试通道正在真实调用模型并检查质量… / Calling the model and checking quality...");
    try {
      const res = await fetch("/api/test-channel/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-prompt-device-id": ensureDeviceId(),
        },
        body: JSON.stringify({
          userIdea: testIdea,
          autoSuite: true,
          targetModelId: normalizedModels.targetModelId,
          generatorModelId: normalizedModels.generatorModelIds[0] || BEST_TARGET_MODEL_ID,
          generatorModelIds: normalizedModels.generatorModelIds,
          language: "zh",
          maxTokens: 900,
          maxAttempts: 1,
          userKeys,
          availableModelIds: readProbeModels(),
          deviceId: ensureDeviceId(),
          projectId: "ai-prompt-generator",
          historicalErrors: getTestErrorRecords().filter((item) => item.project_id === "ai-prompt-generator").slice(0, 200),
          historicalOptimizations: getOptimizationProjectItems().filter((item) => item.project_id === "ai-prompt-generator").slice(0, 200),
          qualityTargets: {
            passTotal: 85,
            coreDimensionMin: 9,
          },
        }),
      });
      const data = await readTestChannelResponse(res);
      if (!res.ok || !data.ok) {
        const message = normalizeTestChannelError(data.error);
        const failureResult = buildFallbackFailureResult({
          data,
          storedTarget: normalizedModels.targetModelId,
          storedGenerator: normalizedModels.generatorModelIds[0] || BEST_TARGET_MODEL_ID,
          message,
        });
        setResult(failureResult);
        const pendingCount = persistStructuredTestData(failureResult);
        setPendingOptimizationCount(pendingCount);
        throw new Error(message);
      }
      setResult(data);
      const pendingCount = persistStructuredTestData(data);
      setPendingOptimizationCount(pendingCount);
      toast.success(data.status === "pass" ? "测试通过 / Test passed" : "测试完成，需要继续优化 / Test completed with warnings");
      if (data.optimizationBacklog?.itemCount > 0) {
        toast.success(`已加入 ${data.optimizationBacklog.itemCount} 个待优化项 / Added ${data.optimizationBacklog.itemCount} pending item(s)`);
      }
    } catch (err: any) {
      const message = normalizeTestChannelError(err?.message);
      setError(message);
      toast.error(message);
    } finally {
      toast.dismiss(tid);
      setRunning(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="AI 提示词测试通道"
          className="fixed inset-0 z-50 flex flex-col bg-[#08080f]"
          style={{ height: "100dvh" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/25">
                <FlaskConical size={16} className="text-cyan-300" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">AI 提示词测试通道</h2>
                <p className="text-[11px] text-white/60">
                  真实验证模型连通、质量门、目标达成和密钥防泄露 / Verify connectivity, quality gates, target fit, and key safety
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭测试通道 Close test channel"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/65 transition-all hover:bg-white/8 hover:text-white"
            >
              <X size={17} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <KeyRound size={15} className="text-violet-300" />
                    密钥状态 / Key status
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">{keyCount}</div>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    已保存到本浏览器。测试报告只写入脱敏指纹，不写完整 Key。 / Stored in this browser. Reports write only masked fingerprints, never full keys.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenKeys}
                    className="mt-3 rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100 transition hover:bg-violet-500/20"
                  >
                    打开密钥设置 / Open key settings
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <Activity size={15} className="text-cyan-300" />
                    当前测试模型 / Current test model
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{storedGenerators[0] || "gpt-5.5-pro"}</div>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    目标模型：{storedTarget || "gpt-5.5-pro"}。生成/评价模型保持合并，不单独选择评价模型。 / Target model: {storedTarget || "gpt-5.5-pro"}. Generation and evaluation stay unified.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <ShieldCheck size={15} className="text-emerald-300" />
                    防泄露规则 / Secret leak prevention
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    原始密钥只随本次请求发送到测试接口；不返回前端结果、不写日志、不进入 GitHub JSONL、不进入项目记忆。 / Raw keys are sent only for this test request; they are not returned, logged, written to GitHub JSONL, or saved in memory.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <AlertTriangle size={15} className="text-amber-200" />
                    待优化项 / Pending fixes
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">{pendingOptimizationCount}</div>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    测试发现的失败类型会自动进入本地 feedback_memory，下次生成前优先优化。 / Failed test patterns are saved into local feedback_memory for the next run.
                  </p>
                </div>
              </div>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white/85">
                      一键全流程测试 / One-click full-flow test
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/50">
                      点击一次即可自动测试模型连通、生成/评价、质量门、错误分类、脱敏记录和待优化队列。 / One click tests connectivity, generation/evaluation, quality gates, error classification, sanitized logging, and the pending optimization queue.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-50/75">
                    内置 4 项测试 / 4 built-in cases
                  </span>
                </div>
                <div className="grid gap-2 text-xs leading-5 text-white/55 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">模型连通与中转站响应 / Model and relay connectivity</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">提示词质量门与低分维度 / Prompt quality gates and low dimensions</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">幻觉、意图、图生图一致性 / Hallucination, intent, and image-to-image consistency</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">错误类型保存到待优化项 / Error types saved to pending fixes</div>
                </div>
                <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-white/65">
                    高级：附加测试关注点 / Advanced: extra test focus
                  </summary>
                  <label htmlFor="test-channel-idea" className="sr-only">
                    附加测试关注点 / Extra test focus
                  </label>
                  <textarea
                    id="test-channel-idea"
                    value={testIdea}
                    onChange={(event) => setTestIdea(event.target.value)}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-cyan-400/45"
                  />
                </details>
                <motion.button
                  type="button"
                  onClick={runTest}
                  disabled={running}
                  whileTap={{ scale: 0.98 }}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                    running
                      ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/50"
                      : "bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/20 hover:opacity-95"
                  }`}
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
                  {running ? "正在运行全流程测试 / Running full-flow test" : "一键全流程测试 / Run full-flow test"}
                </motion.button>
              </section>

              {error && (
                <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm leading-6 text-rose-50/85">
                  <div className="font-semibold">测试未通过 / Test failed</div>
                  <div className="mt-1">{error}</div>
                </div>
              )}

              {result && (
                <section className={`rounded-2xl border ${status.border} ${status.bg} p-4`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <status.Icon size={24} className={status.tone} />
                      <div>
                        <div className={`text-lg font-bold ${status.tone}`}>测试{status.text}</div>
                        <p className="text-xs text-white/55">
                          {result.model.name} · {formatDuration(result.stats.latencyMs)} · 报告 / Report {result.reportId}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-right">
                      <div className="text-2xl font-bold text-white">{Math.round(result.strictScore.total)}</div>
                      <div className="text-[11px] text-white/50">严格质量分 / Strict quality score</div>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3 text-sm leading-6 text-rose-50/85">
                      <div className="font-semibold">失败详情 / Failure detail</div>
                      <div className="mt-1">{error}</div>
                    </div>
                  )}

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {result.checks.map((check) => {
                      const itemStatus = statusCopy(check.status);
                      return (
                        <div key={check.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-white/75">{check.label}</span>
                            <span className={`text-xs font-bold ${itemStatus.tone}`}>{itemStatus.text}</span>
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            值 / Value：{Math.round(check.value * 100) / 100} · 目标 / Target：{check.threshold}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {result.modelPreflight && (
                    <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-500/10 p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-semibold text-violet-50/90">强模型预检 / Strong model preflight</div>
                        <div className="text-xs text-violet-50/65">
                          中转站可见 / Relay visible：{result.modelPreflight.relayAvailableCount ?? 0}
                        </div>
                      </div>
                      {result.promptLanguageReason && (
                        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-violet-50/75">
                          真正提示词语言 / True prompt language：{result.promptLanguage === "zh" ? "中文" : "English"} · {result.promptLanguageReason}
                        </div>
                      )}
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {(result.modelPreflight.selectedStrongModels || []).slice(0, 4).map((item) => (
                          <div key={`selected-${item.id}`} className="rounded-xl border border-emerald-300/15 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-50/75">
                            <div className="font-semibold text-emerald-50">{item.name || item.id}</div>
                            <div>{item.apiProvider} · {item.strength} · score {item.score}</div>
                            {item.reasons?.[0] && <div className="mt-1 text-emerald-50/60">{item.reasons[0]}</div>}
                          </div>
                        ))}
                        {(result.modelPreflight.standbyStrongModels || []).slice(0, 2).map((item) => (
                          <div key={`standby-${item.id}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/60">
                            <div className="font-semibold text-white/80">备用 / Standby：{item.name || item.id}</div>
                            <div>{item.apiProvider} · {item.strength} · score {item.score}</div>
                          </div>
                        ))}
                      </div>
                      {(result.modelPreflight.skippedWeakOrRiskyModels || []).length > 0 && (
                        <details className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
                          <summary className="cursor-pointer text-xs font-semibold text-white/65">
                            已降级或跳过的弱/风险模型 / Downgraded or skipped weak/risky models
                          </summary>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/55">
                            {(result.modelPreflight.skippedWeakOrRiskyModels || []).slice(0, 8).map((item) => (
                              <span key={`skipped-${item.id}`} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                                {item.id} · {item.riskFlags.join(", ") || item.strength}
                              </span>
                            ))}
                          </div>
                        </details>
                      )}
                      {result.modelPreflight.routingPolicy && (
                        <div className="mt-2 text-[11px] leading-5 text-violet-50/55">{result.modelPreflight.routingPolicy}</div>
                      )}
                    </div>
                  )}

                  {Array.isArray(result.modelDiagnostics) && result.modelDiagnostics.length > 0 && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-sm font-semibold text-white/80">模型诊断 / Model diagnostics</div>
                      <div className="mt-2 space-y-2">
                        {result.modelDiagnostics.map((item) => {
                          const diagStatus = statusCopy(item.status === "success" ? "pass" : "fail");
                          return (
                            <div key={`${item.modelId}-${item.apiProvider}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs font-semibold text-white/75">
                                  {item.modelName || item.modelId} · {item.apiProvider}
                                </div>
                                <div className={`text-xs font-bold ${diagStatus.tone}`}>
                                  {item.status === "success" ? "可用 / Available" : "失败 / Failed"}
                                </div>
                              </div>
                              {typeof item.bestScore === "number" && (
                                <div className="mt-1 text-xs text-white/50">最佳分 / Best score：{Math.round(item.bestScore)}</div>
                              )}
                              {item.error && (
                                <div className="mt-2 text-xs leading-5 text-rose-100/75">{normalizeTestChannelError(item.error)}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {Array.isArray(result.improvementPlan) && result.improvementPlan.length > 0 && (
                    <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-500/10 p-3">
                      <div className="text-sm font-semibold text-cyan-50/90">下一步改进 / Next improvements</div>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-cyan-50/75">
                        {result.improvementPlan.map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.optimizationBacklog && (
                    <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3">
                      <div className="text-sm font-semibold text-amber-50/90">已加入待优化项目 / Added to pending optimization</div>
                      <div className="mt-1 text-xs leading-5 text-amber-50/70">{result.optimizationBacklog.summary}</div>
                      {result.optimizationBacklog.items.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {result.optimizationBacklog.items.slice(0, 5).map((item) => (
                            <div key={item.fingerprint} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65">
                              <div className="font-semibold text-white/80">{item.title}</div>
                              <div className="mt-1">{item.action}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {result.adaptivePlan && (
                    <div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-500/10 p-3">
                      <div className="text-sm font-semibold text-sky-50/90">历史缺陷回归 / Historical regression</div>
                      <div className="mt-1 text-xs leading-5 text-sky-50/75">{result.adaptivePlan.summary}</div>
                      <div className="mt-2 grid gap-2 text-xs text-sky-50/65 md:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                          未解决错误 / Unresolved errors：{result.adaptivePlan.unresolved_error_count}
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                          回归用例 / Regression cases：{result.adaptivePlan.regression_case_count}
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                          重点类型 / Focus：{result.adaptivePlan.focus_error_types.join(", ") || "standard"}
                        </div>
                      </div>
                      {result.adaptivePlan.regression_cases.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {result.adaptivePlan.regression_cases.slice(0, 3).map((item) => (
                            <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65">
                              <div className="font-semibold text-white/80">{item.label}</div>
                              <div className="mt-1">{item.objective}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {Array.isArray(result.errorRecords) && result.errorRecords.length > 0 && (
                    <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-500/10 p-3">
                      <div className="text-sm font-semibold text-rose-50/90">错误分类 / Error classification</div>
                      <div className="mt-2 space-y-2">
                        {result.errorRecords.slice(0, 5).map((item) => (
                          <div key={item.error_id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div className="font-semibold text-white/80">{item.summary}</div>
                              <div className="text-rose-100/80">
                                {item.error_type} · {item.severity} · {item.status}
                              </div>
                            </div>
                            <div className="mt-1">{item.optimization_suggestion}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(result.optimizationItems) && result.optimizationItems.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3">
                      <div className="text-sm font-semibold text-amber-50/90">结构化待优化项目 / Structured optimization backlog</div>
                      <div className="mt-2 space-y-2">
                        {result.optimizationItems.filter((item) => !item.resolved_at).slice(0, 5).map((item) => (
                          <div key={item.optimization_id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div className="font-semibold text-white/80">{item.description}</div>
                              <div className="text-amber-100/80">{item.priority}</div>
                            </div>
                            {item.suggested_actions[0] && <div className="mt-1">{item.suggested_actions[0]}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-white/80">
                      查看最佳提示词预览与脱敏同步状态 / View best prompt preview and sanitized sync status
                    </summary>
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs leading-5 text-white/70">
                      {result.bestPromptPreview}
                    </pre>
                    <div className="mt-3 grid gap-2 text-xs text-white/55 md:grid-cols-2">
                      <div>GitHub/本地报告 / GitHub/local report：{result.github.target} · {result.github.filePath}</div>
                      <div>同步状态 / Sync status：{result.github.synced ? "已同步 GitHub / Synced to GitHub" : "本地脱敏保存或等待服务器令牌 / Saved locally after sanitization or waiting for server token"}</div>
                      <div>输入 tokens / Input tokens：{result.stats.inputTokens}</div>
                      <div>输出 tokens / Output tokens：{result.stats.outputTokens}</div>
                    </div>
                    <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-50/75">
                      {result.secretHandling}
                    </div>
                  </details>
                </section>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
