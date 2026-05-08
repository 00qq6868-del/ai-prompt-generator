"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2, FlaskConical, KeyRound, Loader2, ShieldCheck, X, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { loadUserKeys } from "./KeysSettings";

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
  }>;
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
  "请把这个测试目标优化成可直接复制使用的高质量 AI 提示词：为 AI 提示词生成器验证输出是否完整保留用户意图、适配目标模型、包含边界条件、幻觉防护和可验收标准。";

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
  if (status === "pass") return { text: "通过", tone: "text-emerald-300", border: "border-emerald-300/25", bg: "bg-emerald-500/10", Icon: CheckCircle2 };
  if (status === "warn") return { text: "需关注", tone: "text-amber-200", border: "border-amber-300/25", bg: "bg-amber-500/10", Icon: AlertTriangle };
  return { text: "未通过", tone: "text-rose-200", border: "border-rose-300/25", bg: "bg-rose-500/10", Icon: XCircle };
}

export function TestChannelPanel({ open, onClose, onOpenKeys }: TestChannelPanelProps) {
  const [testIdea, setTestIdea] = useState(DEFAULT_TEST_IDEA);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestChannelResult | null>(null);
  const [error, setError] = useState("");
  const [keyCount, setKeyCount] = useState(0);
  const [storedTarget, setStoredTarget] = useState("gpt-5.5-pro");
  const [storedGenerators, setStoredGenerators] = useState<string[]>(["gpt-5.5-pro"]);

  useEffect(() => {
    if (!open) return;
    setKeyCount(countConfiguredKeys(loadUserKeys()));
    setStoredTarget(localStorage.getItem(TARGET_STORAGE_KEY) || "gpt-5.5-pro");
    const generators = readJsonArray(GENERATOR_STORAGE_KEY);
    setStoredGenerators(generators.length ? generators : ["gpt-5.5-pro"]);
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
    const tid = toast.loading("测试通道正在真实调用模型并检查质量…");
    try {
      const res = await fetch("/api/test-channel/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-prompt-device-id": ensureDeviceId(),
        },
        body: JSON.stringify({
          userIdea: testIdea,
          targetModelId: storedTarget,
          generatorModelId: storedGenerators[0] || "gpt-5.5-pro",
          generatorModelIds: storedGenerators,
          language: "zh",
          maxTokens: 1800,
          maxAttempts: 2,
          userKeys,
          availableModelIds: readProbeModels(),
          deviceId: ensureDeviceId(),
          qualityTargets: {
            passTotal: 85,
            coreDimensionMin: 9,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "测试通道运行失败 / Test channel failed");
      }
      setResult(data);
      toast.success(data.status === "pass" ? "测试通过 / Test passed" : "测试完成，需要继续优化 / Test completed with warnings");
    } catch (err: any) {
      const message = String(err?.message || "测试通道运行失败 / Test channel failed");
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
                  真实验证模型连通、质量门、目标达成和密钥防泄露
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
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <KeyRound size={15} className="text-violet-300" />
                    密钥状态
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">{keyCount}</div>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    已保存到本浏览器。测试报告只写入脱敏指纹，不写完整 Key。
                  </p>
                  <button
                    type="button"
                    onClick={onOpenKeys}
                    className="mt-3 rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100 transition hover:bg-violet-500/20"
                  >
                    打开密钥设置
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <Activity size={15} className="text-cyan-300" />
                    当前测试模型
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{storedGenerators[0] || "gpt-5.5-pro"}</div>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    目标模型：{storedTarget || "gpt-5.5-pro"}。生成/评价模型保持合并，不单独选择评价模型。
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <ShieldCheck size={15} className="text-emerald-300" />
                    防泄露规则
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    原始密钥只随本次请求发送到测试接口；不返回前端结果、不写日志、不进入 GitHub JSONL、不进入项目记忆。
                  </p>
                </div>
              </div>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="test-channel-idea" className="text-sm font-semibold text-white/85">
                    测试目标
                  </label>
                  <span className="text-xs text-white/45">运行后会自动评分，不合格会内部重试一次</span>
                </div>
                <textarea
                  id="test-channel-idea"
                  value={testIdea}
                  onChange={(event) => setTestIdea(event.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-cyan-400/45"
                />
                <motion.button
                  type="button"
                  onClick={runTest}
                  disabled={running || !testIdea.trim()}
                  whileTap={{ scale: 0.98 }}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                    running || !testIdea.trim()
                      ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/50"
                      : "bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/20 hover:opacity-95"
                  }`}
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
                  {running ? "正在运行真实验证" : "运行真实验证"}
                </motion.button>
              </section>

              {error && (
                <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm leading-6 text-rose-50/85">
                  {error}
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
                          {result.model.name} · {formatDuration(result.stats.latencyMs)} · 报告 {result.reportId}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-right">
                      <div className="text-2xl font-bold text-white">{Math.round(result.strictScore.total)}</div>
                      <div className="text-[11px] text-white/50">严格质量分</div>
                    </div>
                  </div>

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
                            值：{Math.round(check.value * 100) / 100} · 目标：{check.threshold}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-white/80">
                      查看最佳提示词预览与脱敏同步状态
                    </summary>
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs leading-5 text-white/70">
                      {result.bestPromptPreview}
                    </pre>
                    <div className="mt-3 grid gap-2 text-xs text-white/55 md:grid-cols-2">
                      <div>GitHub/本地报告：{result.github.target} · {result.github.filePath}</div>
                      <div>同步状态：{result.github.synced ? "已同步 GitHub" : "本地脱敏保存或等待服务器令牌"}</div>
                      <div>输入 tokens：{result.stats.inputTokens}</div>
                      <div>输出 tokens：{result.stats.outputTokens}</div>
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
