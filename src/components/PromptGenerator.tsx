"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, Sparkles, Languages, Clock, X } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { ResultPanel } from "./ResultPanel";
import { loadUserKeys } from "./KeysSettings";
import toast from "react-hot-toast";
import { ModelInfo, GENERATOR_AFFINITY } from "@/lib/models-registry";
import { isRelayModelListed, mergeRelayModelIds } from "@/lib/relay-models";
import { recommendModel } from "@/lib/model-recommender";
import { getHistory, saveHistory } from "@/lib/history";
import { buildPromptFeedbackMemory, findPreviousPrompt, saveIntentMemoryEvent, savePromptFeedback } from "@/lib/prompt-feedback";
import type { PromptPreference } from "@/lib/prompt-feedback";
import { HistoryPanel } from "./HistoryPanel";
import { trackApiCall, trackError, trackTTFT } from "@/lib/analytics";
import { normalizePromptPreference, preferenceToLegacy } from "@/lib/prompt-feedback";
import { analyzeUserIntent, applyClarificationChoice, type IntentAnalysis } from "@/lib/intent-router";
import {
  BEST_IMAGE_MODEL_ID,
  BEST_TARGET_MODEL_ID,
  chooseBestGeneratorIds,
  isLegacyAutoModelId,
  normalizeBestModelPreference,
  sortBestModels,
} from "@/lib/best-model-policy";
import {
  STREAM_INTERRUPTED_WITHOUT_OUTPUT,
  STREAM_INTERRUPTED_WITH_PARTIAL_OUTPUT,
  toUserFacingErrorMessage,
} from "@/lib/error-messages";

const DEFAULT_TARGET = BEST_TARGET_MODEL_ID;
const BEST_POLICY_VERSION = "2026-05-07-gpt55-first";
const BEST_POLICY_STORAGE_KEY = "ai_prompt_best_model_policy_version";
const PROBE_CACHE_KEY = "ai_prompt_probe_result";
const TARGET_STORAGE_KEY = "ai_prompt_target_model_id";
const TARGET_LOCK_STORAGE_KEY = "ai_prompt_target_model_locked";
const DEVICE_ID_STORAGE_KEY = "ai_prompt_device_id";
const GENERATOR_STORAGE_KEY = "ai_prompt_last_generator_model_ids";
const EVALUATOR_STORAGE_KEY = "ai_prompt_last_evaluator_model_ids";
const HISTORY_SYNC_STORAGE_KEY = "ai_prompt_history_last_sync_at";
const MAX_REFERENCE_IMAGE_BYTES = 7 * 1024 * 1024;

const PROVIDER_KEY_MAP: Record<string, string> = {
  custom:    "CUSTOM_API_KEY",
  aihubmix:  "AIHUBMIX_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai:    "OPENAI_API_KEY",
  google:    "GOOGLE_API_KEY",
  groq:      "GROQ_API_KEY",
  deepseek:  "DEEPSEEK_API_KEY",
  mistral:   "MISTRAL_API_KEY",
  xai:       "XAI_API_KEY",
  zhipu:     "ZHIPU_API_KEY",
  moonshot:  "MOONSHOT_API_KEY",
  qwen:      "QWEN_API_KEY",
  baidu:     "BAIDU_API_KEY",
};

const PROVIDER_PRIORITY = [
  { provider: "custom",    modelId: "gpt-5.5-pro" },
  { provider: "aihubmix",  modelId: "gpt-5.5-pro" },
  { provider: "openai",    modelId: "gpt-5.5-pro" },
  { provider: "anthropic", modelId: "claude-opus-4-7" },
  { provider: "google",    modelId: "gemini-3.1-pro-preview" },
  { provider: "groq",      modelId: "llama-3.1-8b-instant" },
  { provider: "deepseek",  modelId: "deepseek-v4-pro" },
  { provider: "mistral",   modelId: "mistral-small-latest" },
  { provider: "xai",       modelId: "grok-4" },
  { provider: "zhipu",     modelId: "glm-5" },
  { provider: "moonshot",  modelId: "kimi-k2" },
  { provider: "qwen",      modelId: "qwen3-235b-a22b" },
  { provider: "baidu",     modelId: "ernie-5.0" },
];

interface GenerateResult {
  promptId?: string;
  versionId?: string;
  versionNumber?: number;
  optimizedPrompt: string;
  strictScore?: {
    total: number;
    pass: boolean;
    scoreType: "prompt" | "image" | "combined";
    dimensionScores: Record<string, number>;
    deductions: Array<{ dimension: string; reason: string; score: number }>;
  };
  stats: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    tokensDelta: number;
    changePercent: number;
    estimatedCostUsd?: number;
  };
  meta: {
    generatorModel: string;
    targetModel: string;
    reviewSummary?: string;
    judgeModels?: string[];
    selectedStrategy?: string;
    modelHealth?: {
      skippedCooling?: Array<{ modelId: string; modelName?: string; cooldownUntil: number; lastError: string }>;
      failed?: Array<{ modelId: string; modelName?: string; lastError: string }>;
      successful?: Array<{ modelId: string; modelName?: string; latencyMs: number }>;
    };
    promptEvaluation?: {
      rubric?: Array<{
        id: string;
        label: string;
        labelZh?: string;
        weight: number;
        guide: string;
        guideZh?: string;
      }>;
      candidates: Array<{
        id: string;
        generatorModelId: string;
        generatorModelName: string;
        averageScore: number;
        rank: number;
        scores: Array<{ judgeModel: string; score: number; reason: string }>;
      }>;
      judgeModels: string[];
      selectedCandidateId: string;
      summary: string;
      sourceCommits?: string[];
    };
    strictScore?: GenerateResult["strictScore"];
    persistenceWarning?: string;
    referenceImage?: {
      enabled?: boolean;
      width?: number;
      height?: number;
      aspectRatio?: string;
      palette?: string[];
      averageColor?: string;
      brightness?: string;
      contrast?: string;
      saturation?: string;
      selectedSource?: string;
      internalBestScore?: number;
      qualityGate?: string;
      analysisChannels?: Array<{
        source: string;
        modelId: string;
        modelName: string;
        available: boolean;
        error?: string;
      }>;
    };
  };
  generatorModelCost: { input: number; output: number };
}

interface GenerationProgress {
  phase: string;
  current?: number;
  total?: number;
  etaSec?: number;
  elapsedSec?: number;
  message?: string;
}

function loadProbeCache(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROBE_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - (data.timestamp ?? 0) > 3_600_000) return null;
    return data.models ?? null;
  } catch {
    return null;
  }
}

function formatDuration(sec: number): string {
  const safeSec = Math.max(0, Math.round(sec));
  if (safeSec < 60) return `${safeSec} 秒`;
  const minutes = Math.floor(safeSec / 60);
  const seconds = safeSec % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

function estimateTotalSeconds(targetModelId: string, generatorCount: number, evaluatorCount: number): number {
  const target = targetModelId.toLowerCase();
  if (target.includes("gpt-image-2") || target.includes("gpt image 2")) {
    return Math.min(260, 95 + Math.max(generatorCount, 1) * 25 + Math.max(evaluatorCount, 1) * 18);
  }
  if (generatorCount > 1 || evaluatorCount > 0) {
    return Math.min(220, 55 + Math.max(generatorCount, 1) * 20 + Math.max(evaluatorCount, 0) * 15);
  }
  return 35;
}

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

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6) : [];
  } catch {
    return [];
  }
}

interface ReferenceImageDraft {
  dataUrl: string;
  name: string;
  size: number;
  mimeType: string;
}

function mirrorEvaluatorIds(generatorIds: string[]): string[] {
  return generatorIds.filter(Boolean).slice(0, 6);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PromptGenerator() {
  const [idea, setIdea]           = useState("");
  const [language, setLanguage]   = useState<"zh" | "en">("zh");
  const [targetModelId, setTargetModelId]       = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TARGET;
    const stored = localStorage.getItem(TARGET_STORAGE_KEY) || DEFAULT_TARGET;
    const policyVersion = localStorage.getItem(BEST_POLICY_STORAGE_KEY);
    if (policyVersion !== BEST_POLICY_VERSION && isLegacyAutoModelId(stored)) {
      localStorage.setItem(TARGET_STORAGE_KEY, DEFAULT_TARGET);
      localStorage.setItem(TARGET_LOCK_STORAGE_KEY, "0");
      localStorage.setItem(BEST_POLICY_STORAGE_KEY, BEST_POLICY_VERSION);
      localStorage.removeItem(PROBE_CACHE_KEY);
      return DEFAULT_TARGET;
    }
    return stored;
  });
  const [targetManuallyLocked, setTargetManuallyLocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(TARGET_LOCK_STORAGE_KEY) === "1";
  });
  const [generatorModelIds, setGeneratorModelIds] = useState<string[]>([]);
  const [evaluatorModelIds, setEvaluatorModelIds] = useState<string[]>([]);
  const [loading, setLoading]     = useState(false);
  const [availableModelIds, setAvailableModelIds] = useState<string[] | undefined>(undefined);
  const [streamingText, setStreamingText] = useState("");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [result, setResult]       = useState<GenerateResult | null>(null);
  const [previousPromptForResult, setPreviousPromptForResult] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState(() => ensureDeviceId());
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const [referenceImage, setReferenceImage] = useState<ReferenceImageDraft | null>(null);
  const [intentAnalysis, setIntentAnalysis] = useState<IntentAnalysis | null>(null);
  const [clarificationChoice, setClarificationChoice] = useState("");
  const [acceptedCorrection, setAcceptedCorrection] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const setTargetModel = (id: string, source: "manual" | "auto" | "history" = "manual") => {
    setTargetModelId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(TARGET_STORAGE_KEY, id);
      if (source !== "auto") {
        localStorage.setItem(TARGET_LOCK_STORAGE_KEY, "1");
      } else {
        localStorage.setItem(TARGET_LOCK_STORAGE_KEY, "0");
      }
    }
    setTargetManuallyLocked(source !== "auto");
    void persistModelPreference({
      targetModelId: id,
      generatorIds: generatorModelIds,
      evaluatorIds: mirrorEvaluatorIds(generatorModelIds),
      isLocked: source !== "auto",
      source,
    });
  };

  const persistModelPreference = async (input?: {
    targetModelId?: string;
    generatorIds?: string[];
    evaluatorIds?: string[];
    isLocked?: boolean;
    source?: "manual" | "auto" | "history";
  }) => {
    if (typeof window === "undefined") return;
    const tid = input?.targetModelId ?? targetModelId;
    const gids = input?.generatorIds ?? generatorModelIds;
    const eids = mirrorEvaluatorIds(input?.evaluatorIds ?? input?.generatorIds ?? gids);
    const targetModelCategory = tid === BEST_IMAGE_MODEL_ID ? "image" : "text";
    localStorage.setItem(TARGET_STORAGE_KEY, tid);
    localStorage.setItem(TARGET_LOCK_STORAGE_KEY, (input?.isLocked ?? targetManuallyLocked) ? "1" : "0");
    localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(gids.slice(0, 6)));
    localStorage.setItem(EVALUATOR_STORAGE_KEY, JSON.stringify(eids.slice(0, 6)));
    fetch("/api/model-preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ai-prompt-device-id": deviceId,
      },
      body: JSON.stringify({
        deviceId,
        targetModelId: tid,
        generatorModelIds: gids.slice(0, 6),
        evaluatorModelIds: eids.slice(0, 6),
        targetModelCategory,
        isLocked: input?.isLocked ?? targetManuallyLocked,
        source: input?.source ?? "manual",
      }),
    }).catch(() => {});
  };

  const applyBestPolicyPreference = (input: {
    targetModelId?: string | null;
    generatorModelIds?: string[];
    evaluatorModelIds?: string[];
    isLocked?: boolean;
    source?: string;
  }) => {
    if (input.targetModelId === BEST_IMAGE_MODEL_ID) {
      const nextGeneratorModelIds = (input.generatorModelIds ?? []).filter(Boolean).slice(0, 6);
      const nextEvaluatorModelIds = mirrorEvaluatorIds(nextGeneratorModelIds);
      if (targetModelId !== BEST_IMAGE_MODEL_ID) setTargetModelId(BEST_IMAGE_MODEL_ID);
      if (nextGeneratorModelIds.length && nextGeneratorModelIds.join(",") !== generatorModelIds.join(",")) {
        setGeneratorModelIds(nextGeneratorModelIds);
      }
      if (nextEvaluatorModelIds.length && nextEvaluatorModelIds.join(",") !== evaluatorModelIds.join(",")) {
        setEvaluatorModelIds(nextEvaluatorModelIds);
      }
      return {
        targetModelId: BEST_IMAGE_MODEL_ID,
        generatorModelIds: nextGeneratorModelIds,
        evaluatorModelIds: nextEvaluatorModelIds,
        upgraded: false,
      };
    }
    const normalized = normalizeBestModelPreference(input);
    if (normalized.targetModelId !== targetModelId) setTargetModelId(normalized.targetModelId);
    if (normalized.generatorModelIds.join(",") !== generatorModelIds.join(",")) {
      setGeneratorModelIds(normalized.generatorModelIds);
    }
    if (normalized.evaluatorModelIds.join(",") !== evaluatorModelIds.join(",")) {
      setEvaluatorModelIds(normalized.evaluatorModelIds);
    }
    if (normalized.upgraded && typeof window !== "undefined") {
      localStorage.setItem(TARGET_STORAGE_KEY, normalized.targetModelId);
      localStorage.setItem(TARGET_LOCK_STORAGE_KEY, "0");
      localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(normalized.generatorModelIds.slice(0, 6)));
      localStorage.setItem(EVALUATOR_STORAGE_KEY, JSON.stringify(normalized.evaluatorModelIds.slice(0, 6)));
      localStorage.setItem(BEST_POLICY_STORAGE_KEY, BEST_POLICY_VERSION);
      void persistModelPreference({
        targetModelId: normalized.targetModelId,
        generatorIds: normalized.generatorModelIds,
        evaluatorIds: mirrorEvaluatorIds(normalized.generatorModelIds),
        isLocked: false,
        source: "auto",
      });
    }
    return normalized;
  };

  useEffect(() => {
    const id = ensureDeviceId();
    setDeviceId(id);
    fetch("/api/model-preferences", {
      headers: { "x-ai-prompt-device-id": id },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const pref = data?.preference;
        if (!pref?.targetModelId) {
          const storedGenerators = readStoredIds(GENERATOR_STORAGE_KEY);
          const storedEvaluators = mirrorEvaluatorIds(storedGenerators);
          const normalized = applyBestPolicyPreference({
            targetModelId: localStorage.getItem(TARGET_STORAGE_KEY) || DEFAULT_TARGET,
            generatorModelIds: storedGenerators,
            evaluatorModelIds: storedEvaluators,
            isLocked: localStorage.getItem(TARGET_LOCK_STORAGE_KEY) === "1",
            source: localStorage.getItem(TARGET_LOCK_STORAGE_KEY) === "1" ? "manual" : "auto",
          });
          setTargetManuallyLocked(false);
          localStorage.setItem(TARGET_STORAGE_KEY, normalized.targetModelId);
          localStorage.setItem(TARGET_LOCK_STORAGE_KEY, "0");
          setPreferenceHydrated(true);
          return;
        }
        const normalized = applyBestPolicyPreference({
          targetModelId: pref.targetModelId,
          generatorModelIds: Array.isArray(pref.generatorModelIds) ? pref.generatorModelIds : [],
          evaluatorModelIds: mirrorEvaluatorIds(Array.isArray(pref.generatorModelIds) ? pref.generatorModelIds : []),
          isLocked: Boolean(pref.isLocked),
          source: pref.source,
        });
        setTargetManuallyLocked(Boolean(pref.isLocked) && !normalized.upgraded);
        localStorage.setItem(TARGET_STORAGE_KEY, normalized.targetModelId);
        localStorage.setItem(TARGET_LOCK_STORAGE_KEY, Boolean(pref.isLocked) && !normalized.upgraded ? "1" : "0");
        localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(normalized.generatorModelIds.slice(0, 6)));
        localStorage.setItem(EVALUATOR_STORAGE_KEY, JSON.stringify(normalized.evaluatorModelIds.slice(0, 6)));
        setPreferenceHydrated(true);
      })
      .catch(() => {
        const storedGenerators = readStoredIds(GENERATOR_STORAGE_KEY);
        const storedEvaluators = mirrorEvaluatorIds(storedGenerators);
        const normalized = applyBestPolicyPreference({
          targetModelId: localStorage.getItem(TARGET_STORAGE_KEY) || DEFAULT_TARGET,
          generatorModelIds: storedGenerators,
          evaluatorModelIds: storedEvaluators,
          isLocked: localStorage.getItem(TARGET_LOCK_STORAGE_KEY) === "1",
          source: localStorage.getItem(TARGET_LOCK_STORAGE_KEY) === "1" ? "manual" : "auto",
        });
        setTargetManuallyLocked(false);
        localStorage.setItem(TARGET_STORAGE_KEY, normalized.targetModelId);
        localStorage.setItem(TARGET_LOCK_STORAGE_KEY, "0");
        setPreferenceHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    setElapsedSec(0);
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    const userKeys = loadUserKeys();
    const hasCustomRelay = userKeys["CUSTOM_API_KEY"]?.trim().length > 5 && userKeys["CUSTOM_BASE_URL"]?.trim();

    if (hasCustomRelay) {
      const cachedProbe = loadProbeCache();
      if (cachedProbe) {
        setAvailableModelIds(cachedProbe);
        selectBestFromProbe(cachedProbe);
        return;
      }

      fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: userKeys["CUSTOM_BASE_URL"],
          apiKey: userKeys["CUSTOM_API_KEY"],
        }),
      })
        .then(r => {
          if (!r.ok) throw new Error(`探测失败 Probe failed (${r.status})`);
          return r.json();
        })
        .then(data => {
          if (data.models?.length > 0) {
            setAvailableModelIds(data.models);
            localStorage.setItem(PROBE_CACHE_KEY, JSON.stringify({
              models: data.models,
              timestamp: Date.now(),
            }));
            if (!readStoredIds(GENERATOR_STORAGE_KEY).length || generatorModelIds.every(isLegacyAutoModelId)) selectBestFromProbe(data.models);
          } else {
            setGeneratorModelIds([BEST_TARGET_MODEL_ID]);
            setEvaluatorModelIds([BEST_TARGET_MODEL_ID]);
          }
        })
        .catch(() => {
          toast.error("探测中转站失败，使用默认模型 / Probe failed, using default model");
          setGeneratorModelIds([BEST_TARGET_MODEL_ID]);
          setEvaluatorModelIds([BEST_TARGET_MODEL_ID]);
        });
      return;
    }

    for (const { provider, modelId } of PROVIDER_PRIORITY) {
      const keyName = PROVIDER_KEY_MAP[provider];
      if (keyName && userKeys[keyName]?.trim().length > 5) {
        setGeneratorModelIds((prev) => {
          const next = prev.length && !prev.every(isLegacyAutoModelId) ? prev : [modelId];
          setEvaluatorModelIds(mirrorEvaluatorIds(next));
          return next;
        });
        return;
      }
    }

    fetch("/api/keys")
      .then((r) => {
        if (!r.ok) throw new Error(`获取密钥状态失败 Failed to fetch key status (${r.status})`);
        return r.json();
      })
      .then((data: { configured: string[] }) => {
        for (const { provider, modelId } of PROVIDER_PRIORITY) {
          if (data.configured.includes(provider)) {
            setGeneratorModelIds((prev) => {
              const next = prev.length && !prev.every(isLegacyAutoModelId) ? prev : [modelId];
              setEvaluatorModelIds(mirrorEvaluatorIds(next));
              return next;
            });
            return;
          }
        }
        setGeneratorModelIds((prev) => {
          const next = prev.length && !prev.every(isLegacyAutoModelId) ? prev : [PROVIDER_PRIORITY[0].modelId];
          setEvaluatorModelIds(mirrorEvaluatorIds(next));
          return next;
        });
      })
      .catch(() => {
        setGeneratorModelIds((prev) => {
          const next = prev.length && !prev.every(isLegacyAutoModelId) ? prev : [PROVIDER_PRIORITY[0].modelId];
          setEvaluatorModelIds(mirrorEvaluatorIds(next));
          return next;
        });
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceId) return;
    const lastSync = Number(localStorage.getItem(HISTORY_SYNC_STORAGE_KEY) || "0");
    if (Date.now() - lastSync < 6 * 60 * 60 * 1000) return;
    const items = getHistory().slice(0, 50);
    if (!items.length) return;
    fetch("/api/history/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-prompt-device-id": deviceId,
      },
      body: JSON.stringify({ deviceId, items }),
    })
      .then((res) => {
        if (res.ok) localStorage.setItem(HISTORY_SYNC_STORAGE_KEY, String(Date.now()));
      })
      .catch(() => {});
  }, [deviceId]);

  useEffect(() => {
    const mirrored = mirrorEvaluatorIds(generatorModelIds);
    if (mirrored.join(",") !== evaluatorModelIds.join(",")) {
      setEvaluatorModelIds(mirrored);
    }
  }, [generatorModelIds.join(","), evaluatorModelIds.join(",")]);

  useEffect(() => {
    if (!preferenceHydrated) return;
    if (!generatorModelIds.length) return;
    void persistModelPreference({ source: targetManuallyLocked ? "manual" : "auto" });
  }, [generatorModelIds.join(","), evaluatorModelIds.join(","), targetModelId, targetManuallyLocked, deviceId, preferenceHydrated]);

  const selectBestFromProbe = (probeModelIds: string[], targetId?: string) => {
    fetch("/api/models?mode=accurate")
      .then(r => {
        if (!r.ok) throw new Error(`获取模型列表失败 Failed to load models (${r.status})`);
        return r.json();
      })
      .then(data => {
        const allModels: ModelInfo[] = mergeRelayModelIds(data.models ?? [], probeModelIds);
        const available = allModels.filter(
          m => isRelayModelListed(probeModelIds, m.id) && (m.category ?? "text") === "text"
        );
        if (available.length === 0) {
          const allTextModels = allModels.filter((m) => (m.category ?? "text") === "text");
          const chosen = chooseBestGeneratorIds(allTextModels, 1);
          setGeneratorModelIds(chosen);
          setEvaluatorModelIds(mirrorEvaluatorIds(chosen));
          return;
        }

        const tid = targetId ?? targetModelId;
        const targetKey = tid.toLowerCase();
        const affinity = GENERATOR_AFFINITY.find(a => targetKey.startsWith(a.prefix.toLowerCase()));
        if (affinity) {
          const match = affinity.recommended.find(id => available.some(model => model.id.toLowerCase() === id.toLowerCase()));
          if (match) {
            setGeneratorModelIds([match]);
            setEvaluatorModelIds([match]);
            return;
          }
        }

        const best = sortBestModels(available, "generator")[0];
        if (!best) return;
        setGeneratorModelIds([best.id]);
        setEvaluatorModelIds([best.id]);
      })
      .catch(() => {
        setGeneratorModelIds([BEST_TARGET_MODEL_ID]);
        setEvaluatorModelIds([BEST_TARGET_MODEL_ID]);
      });
  };

  useEffect(() => {
    if (!availableModelIds?.length) return;
    selectBestFromProbe(availableModelIds, targetModelId);
  }, [targetModelId]);

  const applyReferenceImageFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件 / Please upload an image file");
      return;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      toast.error(`参考图最大 ${formatBytes(MAX_REFERENCE_IMAGE_BYTES)} / Reference image max ${formatBytes(MAX_REFERENCE_IMAGE_BYTES)}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) {
        toast.error("参考图读取失败 / Failed to read reference image");
        return;
      }
      setReferenceImage({
        dataUrl,
        name: file.name || "reference-image",
        size: file.size,
        mimeType: file.type || "image/jpeg",
      });
      if (!targetManuallyLocked && targetModelId !== BEST_IMAGE_MODEL_ID) {
        setTargetModel(BEST_IMAGE_MODEL_ID, "auto");
      }
      toast.success("参考图已加入，将自动启用图生图优化 / Reference image added");
    };
    reader.onerror = () => toast.error("参考图读取失败 / Failed to read reference image");
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!idea.trim()) {
      toast.error("请先输入你的想法或需求！/ Please enter your idea first!");
      return;
    }
    const nextIntentAnalysis = analyzeUserIntent(idea, language);
    if (nextIntentAnalysis.status === "needs_clarification" && !clarificationChoice.trim()) {
      setIntentAnalysis(nextIntentAnalysis);
      toast.error("检测到意图冲突，请先确认方向 / Please clarify the main intent first");
      return;
    }
    if (nextIntentAnalysis.status === "suggest_correction" && !acceptedCorrection) {
      setIntentAnalysis(nextIntentAnalysis);
      toast.error("检测到可能的输入错误，请确认是否纠正 / Please confirm the suggested correction");
      return;
    }
    const primaryGeneratorModelId = generatorModelIds[0] ?? "";
    if (!primaryGeneratorModelId) {
      toast.error("请先点击右上角钥匙图标填入至少一个 API Key / Please set at least one API Key first");
      return;
    }
    setLoading(true);
    setResult(null);
    setStreamingText("");
    setPreviousPromptForResult(findPreviousPrompt(idea, targetModelId));
    const estimatedTotalSec = referenceImage
      ? Math.max(90, estimateTotalSeconds(targetModelId, generatorModelIds.length, evaluatorModelIds.length))
      : estimateTotalSeconds(targetModelId, generatorModelIds.length, evaluatorModelIds.length);
    setElapsedSec(0);
    setGenerationProgress({
      phase: "准备生成",
      current: 0,
      total: 1,
      etaSec: estimatedTotalSec,
      elapsedSec: 0,
      message: referenceImage
        ? "正在增强图片理解并生成图生图提示词；不合格候选会在内部自动重试。 Enhancing image understanding; weak candidates are retried internally."
        : "正在判断模型是否可用；可输出的慢模型会继续等待，持续失败的模型才会跳过。 Checking model health; slow responsive models will be waited for.",
    });
    const tid = toast.loading(referenceImage
      ? `AI 正在理解参考图并生成最佳提示词…预计 ${formatDuration(estimatedTotalSec)} 内完成`
      : `AI 正在生成优化提示词…预计 ${formatDuration(estimatedTotalSec)} 内完成`);
    const requestStartedAt = performance.now();
    let responseStatus = 0;
    let apiCallTracked = false;
    let firstTokenTracked = false;

    const trackGenerateCall = (success: boolean, status = responseStatus) => {
      if (apiCallTracked) return;
      apiCallTracked = true;
      trackApiCall({
        endpoint: "/api/generate",
        latencyMs: Math.round(performance.now() - requestStartedAt),
        success,
        status,
      });
    };

    const trackFirstToken = () => {
      if (firstTokenTracked) return;
      firstTokenTracked = true;
      trackTTFT(performance.now() - requestStartedAt, primaryGeneratorModelId);
    };

    try {
      const userKeys = loadUserKeys();
      const effectiveIdea =
        intentAnalysis?.status === "suggest_correction" && acceptedCorrection && intentAnalysis.suggestedInput
          ? intentAnalysis.suggestedInput
          : clarificationChoice.trim()
            ? applyClarificationChoice(idea, clarificationChoice)
            : idea;
      if (clarificationChoice.trim() || acceptedCorrection) {
        setIntentAnalysis(null);
      }
      const effectiveIntentAnalysis = analyzeUserIntent(effectiveIdea, language);
      const feedbackMemory = buildPromptFeedbackMemory(effectiveIdea, targetModelId);
      feedbackMemory.rules = [
        ...effectiveIntentAnalysis.feedbackMemoryHints.map((hint) => `内部意图路由提示：${hint}`),
        ...feedbackMemory.rules,
      ].slice(0, 16);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdea: effectiveIdea,
          targetModelId,
          generatorModelId: primaryGeneratorModelId,
          generatorModelIds,
          evaluatorModelIds,
          language,
          maxTokens: 4096,
          userKeys,
          availableModelIds,
          deviceId,
          feedbackMemory,
          intentAnalysis: effectiveIntentAnalysis,
          referenceImage: referenceImage
            ? {
                dataUrl: referenceImage.dataUrl,
                mimeType: referenceImage.mimeType,
                name: referenceImage.name,
                size: referenceImage.size,
              }
            : null,
          stream: true,
        }),
      });
      responseStatus = res.status;

      if (!res.ok) {
        trackGenerateCall(false, res.status);
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "生成失败，请重试 Generation failed, please retry");
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let scrolledOnce = false;
        let receivedDoneEvent = false;
        let shouldStopReading = false;

        readLoop: while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const event = JSON.parse(jsonStr);
              if (event.t === "progress") {
                const nextProgress: GenerationProgress = {
                  phase: typeof event.phase === "string" ? event.phase : "正在生成",
                  current: typeof event.current === "number" ? event.current : undefined,
                  total: typeof event.total === "number" ? event.total : undefined,
                  etaSec: typeof event.etaSec === "number" ? event.etaSec : undefined,
                  elapsedSec: typeof event.elapsedSec === "number" ? event.elapsedSec : undefined,
                  message: typeof event.message === "string" ? event.message : undefined,
                };
                setGenerationProgress(nextProgress);
                toast.loading(
                  `${nextProgress.phase}…${typeof nextProgress.etaSec === "number" ? `预计还需 ${formatDuration(nextProgress.etaSec)}` : ""}`,
                  { id: tid },
                );
              } else if (event.t === "chunk") {
                trackFirstToken();
                accumulated += typeof event.c === "string" ? event.c : "";
                setStreamingText(accumulated);
                if (!scrolledOnce) {
                  scrolledOnce = true;
                  setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                }
              } else if (event.t === "ping") {
                if (typeof event.elapsedSec === "number") setElapsedSec(event.elapsedSec);
                if (typeof event.message === "string") {
                  setGenerationProgress(prev => ({
                    phase: prev?.phase ?? "等待模型返回",
                    current: prev?.current,
                    total: prev?.total,
                    etaSec: prev?.etaSec,
                    elapsedSec: event.elapsedSec,
                    message: event.message,
                  }));
                }
              } else if (event.t === "done" && event.data) {
                receivedDoneEvent = true;
                trackGenerateCall(true, res.status);
                setResult(event.data);
                setStreamingText("");
                setGenerationProgress(null);
                toast.dismiss(tid);
                toast.success("提示词生成成功！/ Prompt generated!");
                if (event.data.meta?.persistenceWarning) {
                  toast.error(event.data.meta.persistenceWarning);
                }
                saveHistory({ userIdea: idea, optimizedPrompt: event.data.optimizedPrompt, targetModel: targetModelId, generatorModel: generatorModelIds.join(","), language });
              } else if (event.t === "error") {
                const message = toUserFacingErrorMessage(event.error);
                if (accumulated.trim()) {
                  receivedDoneEvent = true;
                  shouldStopReading = true;
                  trackGenerateCall(true, res.status);
                  setResult({
                    optimizedPrompt: accumulated,
                    stats: { inputTokens: 0, outputTokens: 0, latencyMs: 0, tokensDelta: 0, changePercent: 0 },
                    meta: {
                      generatorModel: primaryGeneratorModelId,
                      targetModel: targetModelId,
                      reviewSummary: STREAM_INTERRUPTED_WITH_PARTIAL_OUTPUT,
                    },
                    generatorModelCost: { input: 0, output: 0 },
                  });
                  setStreamingText("");
                  setGenerationProgress(null);
                  toast.dismiss(tid);
                  toast.error(`${STREAM_INTERRUPTED_WITH_PARTIAL_OUTPUT} ${message}`);
                  saveHistory({ userIdea: effectiveIdea, optimizedPrompt: accumulated, targetModel: targetModelId, generatorModel: generatorModelIds.join(","), language });
                  await reader.cancel().catch(() => {});
                  break readLoop;
                }
                trackGenerateCall(false, res.status);
                throw new Error(message);
              }
            } catch (parseErr: any) {
              if (parseErr?.message && !parseErr.message.includes("JSON")) {
                throw parseErr;
              }
            }
            if (shouldStopReading) break readLoop;
          }
        }

        if (!receivedDoneEvent && accumulated) {
          trackGenerateCall(true, res.status);
          setResult({
            optimizedPrompt: accumulated,
            stats: { inputTokens: 0, outputTokens: 0, latencyMs: 0, tokensDelta: 0, changePercent: 0 },
            meta: { generatorModel: primaryGeneratorModelId, targetModel: targetModelId },
            generatorModelCost: { input: 0, output: 0 },
          });
          setStreamingText("");
          setGenerationProgress(null);
          toast.dismiss(tid);
          toast.error(STREAM_INTERRUPTED_WITH_PARTIAL_OUTPUT);
          saveHistory({ userIdea: effectiveIdea, optimizedPrompt: accumulated, targetModel: targetModelId, generatorModel: generatorModelIds.join(","), language });
        } else if (!receivedDoneEvent) {
          trackGenerateCall(false, res.status);
          throw new Error(STREAM_INTERRUPTED_WITHOUT_OUTPUT);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (!data.optimizedPrompt) throw new Error("返回数据异常 Invalid response data");
        trackGenerateCall(true, res.status);
        setResult(data);
        setGenerationProgress(null);
        toast.dismiss(tid);
        toast.success("提示词生成成功！/ Prompt generated!");
        saveHistory({ userIdea: effectiveIdea, optimizedPrompt: data.optimizedPrompt, targetModel: targetModelId, generatorModel: generatorModelIds.join(","), language });
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (err: any) {
      trackGenerateCall(false);
      const message = toUserFacingErrorMessage(err);
      trackError(message);
      setGenerationProgress(null);
      toast.dismiss(tid);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const charCount    = idea.length;
  const approxTokens = Math.ceil(charCount / (language === "zh" ? 1.8 : 4));
  const recommendation = recommendModel(idea);

  useEffect(() => {
    if (!recommendation || targetManuallyLocked) return;
    if (targetModelId === recommendation.modelId) return;
    setTargetModel(recommendation.modelId, "auto");
  }, [recommendation?.modelId, targetManuallyLocked, targetModelId]);

  const submitPromptFeedback = async (payload: {
    userScore: number;
    starRating?: number;
    userNotes: string;
    preference: PromptPreference;
    selectedPrompt: string;
  }) => {
    if (!result) return;
    const item = savePromptFeedback({
      userIdea: idea,
      originalPrompt: idea,
      previousPrompt: previousPromptForResult || undefined,
      optimizedPrompt: result.optimizedPrompt,
      selectedPrompt: payload.selectedPrompt,
      targetModel: targetModelId,
      generatorModels: generatorModelIds,
      evaluatorModels: evaluatorModelIds,
      language,
      userScore: payload.userScore,
      starRating: payload.starRating,
      userNotes: payload.userNotes,
      preference: normalizePromptPreference(payload.preference),
      aiPromptScore: result.meta.promptEvaluation?.candidates.find(
        candidate => candidate.id === result.meta.promptEvaluation?.selectedCandidateId,
      )?.averageScore ?? null,
      aiSummary: result.meta.promptEvaluation?.summary || result.meta.reviewSummary,
      sourceCommits: result.meta.promptEvaluation?.sourceCommits,
    });

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "GitHub feedback sync failed");
      if (data.github?.synced) {
        toast.success("反馈已保存并同步到 GitHub / Feedback saved and synced");
      } else {
        toast.success("反馈已保存到本机；GitHub 未配置同步令牌 / Saved locally; GitHub sync not configured");
      }
      if (typeof data.syntheticPrompt === "string" && data.syntheticPrompt.trim()) {
        setResult({
          ...result,
          versionId: data.syntheticVersionId || result.versionId,
          optimizedPrompt: data.syntheticPrompt,
          meta: {
            ...result.meta,
            selectedStrategy: "反馈融合版 / Synthetic blend from user feedback",
          },
        });
        setPreviousPromptForResult(result.optimizedPrompt);
        toast.success("已生成折中优化版 / Synthetic blend generated");
      }
    } catch (error: any) {
      toast.success("反馈已保存到本机 / Feedback saved locally");
      toast.error(error?.message || "GitHub 同步失败，稍后可再导出 / GitHub sync failed");
    }

    if (preferenceToLegacy(payload.preference) === "old" && previousPromptForResult) {
      setResult({
        ...result,
        optimizedPrompt: previousPromptForResult,
        meta: {
          ...result.meta,
          selectedStrategy: "用户选择旧版 / User preferred previous prompt",
        },
      });
    }
  };

  const renderEstimatedTotalSec = estimateTotalSeconds(targetModelId, generatorModelIds.length, evaluatorModelIds.length);
  const remainingSec =
    typeof generationProgress?.etaSec === "number"
      ? generationProgress.etaSec
      : Math.max(0, renderEstimatedTotalSec - elapsedSec);
  const progressPhase = generationProgress?.phase ?? "正在生成优化提示词";
  const progressCount =
    typeof generationProgress?.current === "number" && typeof generationProgress?.total === "number" && generationProgress.total > 0
      ? `${generationProgress.current}/${generationProgress.total}`
      : "";
  const showStreamingPreview = loading && (streamingText.length > 0 || Boolean(generationProgress));

  return (
    <div className="space-y-6">
      {/* Idea input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-white/60">输入你的想法或需求</h2>
          <div className="flex items-center gap-3">
            <HistoryPanel
              onReuse={(item) => {
                setIdea(item.userIdea);
                setIntentAnalysis(null);
                setClarificationChoice("");
                setAcceptedCorrection(false);
                setTargetModel(item.targetModel, "history");
                const restoredGeneratorIds = item.generatorModel.split(",").map(id => id.trim()).filter(Boolean);
                setGeneratorModelIds(restoredGeneratorIds);
                setEvaluatorModelIds(mirrorEvaluatorIds(restoredGeneratorIds));
                setLanguage(item.language);
      }}
            />
            <button
              onClick={() => setLanguage((l) => (l === "zh" ? "en" : "zh"))}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
              aria-label={language === "zh" ? "切换为英文输出" : "Switch to Chinese output"}
            >
              <Languages size={12} />
              {language === "zh" ? "中文输出" : "English output"}
            </button>
            <span className="text-xs text-white/70">~{approxTokens} tokens</span>
          </div>
        </div>
        <div className="relative">
          <textarea
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value);
              setIntentAnalysis(null);
              setClarificationChoice("");
              setAcceptedCorrection(false);
            }}
            placeholder="例如：写一首关于秋天的古风诗 / Write a function that validates email addresses / 帮我分析这段代码的时间复杂度…"
            rows={5}
            aria-label="输入你的想法或需求 Enter your idea or requirement"
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder-white/25 focus:border-indigo-500/50 focus:outline-none transition-all leading-relaxed"
          />
          {charCount > 0 && (
            <span className="absolute bottom-3 right-4 text-xs text-white/60">{charCount}</span>
          )}
        </div>

        {intentAnalysis && intentAnalysis.status !== "ready" && (
          <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-3">
            <div className="text-sm font-semibold text-amber-100">
              {intentAnalysis.status === "needs_clarification" ? "需要确认主方向" : "检测到可能的输入错误"}
            </div>
            <div className="mt-1 text-xs leading-5 text-amber-50/75">
              {intentAnalysis.clarificationQuestion}
            </div>
            {intentAnalysis.conflicts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {intentAnalysis.conflicts[0].options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setClarificationChoice(option);
                      setAcceptedCorrection(false);
                      saveIntentMemoryEvent({
                        userIdea: idea,
                        decision: "clarified",
                        selectedDirection: option,
                        reason: intentAnalysis.conflicts[0]?.message,
                      });
                      toast.success(`已确认主方向：${option}`);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      clarificationChoice === option
                        ? "border-amber-200/60 bg-amber-300/20 text-white"
                        : "border-white/10 bg-white/[0.04] text-amber-50/75 hover:bg-white/[0.08]"
                    }`}
                  >
                    按「{option}」优化
                  </button>
                ))}
              </div>
            )}
            {intentAnalysis.suggestedInput && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIdea(intentAnalysis.suggestedInput || idea);
                    setAcceptedCorrection(true);
                    setClarificationChoice("");
                    saveIntentMemoryEvent({
                      userIdea: idea,
                      decision: "correction_accepted",
                      suggestedInput: intentAnalysis.suggestedInput,
                      reason: intentAnalysis.clarificationQuestion,
                    });
                    setIntentAnalysis(null);
                    toast.success("已使用纠正后的输入 / Correction applied");
                  }}
                  className="rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-50 transition hover:bg-emerald-500/25"
                >
                  使用纠正版本
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAcceptedCorrection(true);
                    saveIntentMemoryEvent({
                      userIdea: idea,
                      decision: "correction_rejected",
                      suggestedInput: intentAnalysis.suggestedInput,
                      reason: intentAnalysis.clarificationQuestion,
                    });
                    setIntentAnalysis(null);
                    toast.success("已保留原文继续 / Original input kept");
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.08]"
                >
                  保留原文继续
                </button>
              </div>
            )}
            {clarificationChoice && (
              <div className="mt-2 text-xs text-amber-50/65">
                已选择：{clarificationChoice}。再次点击生成会按这个方向继续，不会把冲突词当成主目标。
              </div>
            )}
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <input
            ref={referenceInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            data-testid="reference-image-input"
            aria-label="上传参考图 Upload reference image"
            onChange={(event) => {
              applyReferenceImageFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          {referenceImage ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative h-24 w-full overflow-hidden rounded-xl border border-indigo-400/25 bg-black/20 sm:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referenceImage.dataUrl}
                  alt="参考图预览 Reference preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white/85">已启用参考图图生图优化</div>
                <div className="mt-1 truncate text-xs text-white/50">
                  {referenceImage.name} · {formatBytes(referenceImage.size)}
                </div>
                <div className="mt-1 text-xs leading-5 text-white/45">
                  系统会先尝试原 API 识图，再使用增强视觉分析，内部评分择优后只返回最佳提示词。
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.1] hover:text-white"
                >
                  更换
                </button>
                <button
                  type="button"
                  onClick={() => setReferenceImage(null)}
                  className="flex items-center gap-1 rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-100/80 transition hover:bg-rose-500/20"
                  aria-label="移除参考图 Remove reference image"
                >
                  <X size={13} />
                  移除
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => referenceInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                applyReferenceImageFile(event.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-5 text-center transition hover:border-indigo-400/50 hover:bg-indigo-500/10 sm:flex-row sm:text-left"
              aria-label="上传参考图生成图生图提示词 Upload reference image for image-to-image prompt"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-200">
                <ImagePlus size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white/80">上传参考图（可选）</span>
                <span className="mt-0.5 block text-xs leading-5 text-white/45">
                  上传你喜欢的图，系统会结合图片识别和文字需求生成更精准的图生图提示词。
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Smart model recommendation */}
      {recommendation && recommendation.modelId !== targetModelId && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <span className="text-xs text-white/65">推荐模型 Suggested:</span>
          <button
            onClick={() => setTargetModel(recommendation.modelId, "manual")}
            className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/25 transition-all"
          >
            {recommendation.label} →
          </button>
        </motion.div>
      )}

      {/* Model selector */}
      <ModelSelector
        selectedTargetId={targetModelId}
        selectedGeneratorIds={generatorModelIds}
        onTargetChange={(id) => setTargetModel(id, "manual")}
        onGeneratorChange={(ids) => {
          setGeneratorModelIds(ids);
          setEvaluatorModelIds(mirrorEvaluatorIds(ids));
          void persistModelPreference({
            generatorIds: ids,
            evaluatorIds: mirrorEvaluatorIds(ids),
            source: "manual",
            isLocked: targetManuallyLocked,
          });
        }}
        availableModelIds={availableModelIds}
      />

      {/* Generate button */}
      <motion.button
        onClick={generate}
        disabled={loading || !idea.trim()}
        whileTap={{ scale: 0.98 }}
        aria-busy={loading}
        aria-label={loading ? "正在生成中 Generating..." : "生成优化提示词 Generate optimized prompt"}
        className={`relative w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-base font-semibold transition-all duration-300
          ${loading || !idea.trim()
            ? "bg-white/5 border border-white/10 text-white/70 cursor-not-allowed"
            : "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.01]"
          }`}
      >
        {loading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full"
            />
            <span className="min-w-0 max-w-full truncate">
              {progressPhase} · 已等 {formatDuration(elapsedSec)} · 预计还需 {formatDuration(remainingSec)}
            </span>
          </>
        ) : (
          <>
            <Sparkles size={20} />
            {referenceImage ? "生成图生图提示词" : "生成优化提示词"}
          </>
        )}

        {/* Shimmer effect */}
        {!loading && idea.trim() && (
          <motion.div className="absolute inset-0 rounded-2xl overflow-hidden" initial={false}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
          </motion.div>
        )}
      </motion.button>

      {/* Streaming preview */}
      <AnimatePresence>
        {showStreamingPreview && (
          <motion.div
            key="streaming"
            ref={resultRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
          >
            <div className="relative rounded-2xl border border-indigo-500/20 bg-indigo-950/40 overflow-hidden">
              <div className="flex flex-col gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2 text-xs text-white/50">
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-indigo-400"
                  />
                  <span className="truncate text-indigo-400 font-medium">
                    {progressPhase}{progressCount ? ` ${progressCount}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-white/55">
                  <Clock size={12} />
                  <span>已等 {formatDuration(elapsedSec)}</span>
                  <span>·</span>
                  <span>预计还需 {formatDuration(remainingSec)}</span>
                </div>
              </div>
              <pre
                role="status"
                aria-live="polite"
                aria-label="流式生成预览 Streaming preview"
                className="whitespace-pre-wrap font-sans text-sm text-white/85 leading-relaxed p-5 max-h-80 overflow-y-auto"
              >
                {streamingText || generationProgress?.message || "正在等待模型返回结果；慢但能输出的模型会继续等待，持续失败或已冷却的模型才会跳过。 Waiting for model output; slow responsive models are not skipped."}
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 align-text-bottom"
                />
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Final result */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            key="result"
            ref={resultRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
          >
            <ResultPanel
              prompt={result.optimizedPrompt}
              promptId={result.promptId}
              versionId={result.versionId}
              stats={result.stats}
              meta={result.meta}
              strictScore={result.strictScore ?? result.meta.strictScore}
              generatorModelCost={result.generatorModelCost}
              originalPrompt={idea}
              previousPrompt={previousPromptForResult || undefined}
              onSubmitFeedback={submitPromptFeedback}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
