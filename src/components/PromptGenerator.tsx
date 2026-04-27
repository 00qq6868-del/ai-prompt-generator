"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Languages } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { ResultPanel } from "./ResultPanel";
import { loadUserKeys } from "./KeysSettings";
import toast from "react-hot-toast";
import { scoreModel, ModelInfo, OptimizationMode, GENERATOR_AFFINITY } from "@/lib/models-registry";

const DEFAULT_TARGET = "gpt-4o";
const PROBE_CACHE_KEY = "ai_prompt_probe_result";

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
  { provider: "custom",    modelId: "gpt-4o-mini" },
  { provider: "aihubmix",  modelId: "gpt-4o-mini" },
  { provider: "anthropic", modelId: "claude-3-5-haiku-20241022" },
  { provider: "openai",    modelId: "gpt-4o-mini" },
  { provider: "google",    modelId: "gemini-2.0-flash" },
  { provider: "groq",      modelId: "llama-3.1-8b-instant" },
  { provider: "deepseek",  modelId: "deepseek-chat" },
  { provider: "mistral",   modelId: "mistral-small-latest" },
  { provider: "xai",       modelId: "grok-3-mini" },
  { provider: "zhipu",     modelId: "glm-4-plus" },
  { provider: "moonshot",  modelId: "moonshot-v1-128k" },
  { provider: "qwen",      modelId: "qwen-turbo" },
  { provider: "baidu",     modelId: "ernie-4.0-8k" },
];

interface GenerateResult {
  optimizedPrompt: string;
  stats: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    tokensDelta: number;
    changePercent: number;
  };
  meta: { generatorModel: string; targetModel: string };
  generatorModelCost: { input: number; output: number };
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

export function PromptGenerator() {
  const [idea, setIdea]           = useState("");
  const [language, setLanguage]   = useState<"zh" | "en">("zh");
  const [targetModelId, setTargetModelId]       = useState(DEFAULT_TARGET);
  const [generatorModelId, setGeneratorModelId] = useState<string>("");
  const [loading, setLoading]     = useState(false);
  const [availableModelIds, setAvailableModelIds] = useState<string[] | undefined>(undefined);
  const [streamingText, setStreamingText] = useState("");
  const [result, setResult]       = useState<GenerateResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
            selectBestFromProbe(data.models);
          } else {
            setGeneratorModelId("gpt-4o-mini");
          }
        })
        .catch(() => {
          toast.error("探测中转站失败，使用默认模型 / Probe failed, using default model");
          setGeneratorModelId("gpt-4o-mini");
        });
      return;
    }

    for (const { provider, modelId } of PROVIDER_PRIORITY) {
      const keyName = PROVIDER_KEY_MAP[provider];
      if (keyName && userKeys[keyName]?.trim().length > 5) {
        setGeneratorModelId(modelId);
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
            setGeneratorModelId(modelId);
            return;
          }
        }
        setGeneratorModelId(PROVIDER_PRIORITY[0].modelId);
      })
      .catch(() => setGeneratorModelId(PROVIDER_PRIORITY[0].modelId));
  }, []);

  const selectBestFromProbe = (probeModelIds: string[], targetId?: string, targetCategory?: string) => {
    fetch("/api/models?mode=accurate")
      .then(r => {
        if (!r.ok) throw new Error(`获取模型列表失败 Failed to load models (${r.status})`);
        return r.json();
      })
      .then(data => {
        const allModels: ModelInfo[] = data.models ?? [];
        const available = allModels.filter(
          m => probeModelIds.includes(m.id) && (m.category ?? "text") === "text"
        );
        if (available.length === 0) {
          setGeneratorModelId("gpt-4o-mini");
          return;
        }

        const tid = targetId ?? targetModelId;
        const affinity = GENERATOR_AFFINITY.find(a => tid.startsWith(a.prefix));
        if (affinity) {
          const availableIds = new Set(available.map(m => m.id));
          const match = affinity.recommended.find(id => availableIds.has(id));
          if (match) {
            setGeneratorModelId(match);
            return;
          }
        }

        const generatorMode: OptimizationMode =
          (targetCategory === "image" || targetCategory === "video") ? "accurate" : "accurate";
        const best = available.reduce((a, b) =>
          scoreModel(b, generatorMode) > scoreModel(a, generatorMode) ? b : a
        );
        setGeneratorModelId(best.id);
      })
      .catch(() => setGeneratorModelId("gpt-4o-mini"));
  };

  useEffect(() => {
    if (!availableModelIds?.length) return;
    fetch("/api/models")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        const target = (data.models ?? []).find((m: ModelInfo) => m.id === targetModelId);
        const category = target?.category ?? "text";
        selectBestFromProbe(availableModelIds, targetModelId, category);
      })
      .catch(() => {});
  }, [targetModelId]);

  const generate = async () => {
    if (!idea.trim()) {
      toast.error("请先输入你的想法或需求！/ Please enter your idea first!");
      return;
    }
    if (!generatorModelId) {
      toast.error("请先点击右上角钥匙图标填入至少一个 API Key / Please set at least one API Key first");
      return;
    }
    setLoading(true);
    setResult(null);
    setStreamingText("");
    const tid = toast.loading("AI 正在生成优化提示词…");

    try {
      const userKeys = loadUserKeys();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdea: idea,
          targetModelId,
          generatorModelId,
          language,
          maxTokens: 4096,
          userKeys,
          stream: true,
        }),
      });

      if (!res.ok) {
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

        while (true) {
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
              if (event.t === "chunk") {
                accumulated += event.c;
                setStreamingText(accumulated);
                if (!scrolledOnce) {
                  scrolledOnce = true;
                  setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                }
              } else if (event.t === "done" && event.data) {
                setResult(event.data);
                setStreamingText("");
                toast.dismiss(tid);
                toast.success("提示词生成成功！/ Prompt generated!");
              } else if (event.t === "error") {
                throw new Error(event.error);
              }
            } catch (parseErr: any) {
              if (parseErr?.message && !parseErr.message.includes("JSON")) {
                throw parseErr;
              }
            }
          }
        }

        if (!result && accumulated) {
          setResult({
            optimizedPrompt: accumulated,
            stats: { inputTokens: 0, outputTokens: 0, latencyMs: 0, tokensDelta: 0, changePercent: 0 },
            meta: { generatorModel: generatorModelId, targetModel: targetModelId },
            generatorModelCost: { input: 0, output: 0 },
          });
          setStreamingText("");
          toast.dismiss(tid);
          toast.success("提示词生成成功！/ Prompt generated!");
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (!data.optimizedPrompt) throw new Error("返回数据异常 Invalid response data");
        setResult(data);
        toast.dismiss(tid);
        toast.success("提示词生成成功！/ Prompt generated!");
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (err: any) {
      toast.dismiss(tid);
      toast.error(err.message ?? "生成失败，请检查 API Key / Generation failed, check your API Key");
    } finally {
      setLoading(false);
    }
  };

  const charCount    = idea.length;
  const approxTokens = Math.ceil(charCount / (language === "zh" ? 1.8 : 4));

  const showStreamingPreview = loading && streamingText.length > 0;

  return (
    <div className="space-y-6">
      {/* Idea input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-white/60">输入你的想法或需求</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage((l) => (l === "zh" ? "en" : "zh"))}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
            >
              <Languages size={12} />
              {language === "zh" ? "中文输出" : "English output"}
            </button>
            <span className="text-xs text-white/30">~{approxTokens} tokens</span>
          </div>
        </div>
        <div className="relative">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="例如：写一首关于秋天的古风诗 / Write a function that validates email addresses / 帮我分析这段代码的时间复杂度…"
            rows={5}
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder-white/25 focus:border-indigo-500/50 focus:outline-none transition-all leading-relaxed"
          />
          {charCount > 0 && (
            <span className="absolute bottom-3 right-4 text-xs text-white/20">{charCount}</span>
          )}
        </div>
      </div>

      {/* Model selector */}
      <ModelSelector
        selectedTargetId={targetModelId}
        selectedGeneratorId={generatorModelId}
        onTargetChange={setTargetModelId}
        onGeneratorChange={setGeneratorModelId}
        availableModelIds={availableModelIds}
      />

      {/* Generate button */}
      <motion.button
        onClick={generate}
        disabled={loading || !idea.trim()}
        whileTap={{ scale: 0.98 }}
        className={`relative w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-base font-semibold transition-all duration-300
          ${loading || !idea.trim()
            ? "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
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
            AI 正在生成优化提示词…
          </>
        ) : (
          <>
            <Sparkles size={20} />
            生成优化提示词
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
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-indigo-400"
                  />
                  <span className="text-indigo-400 font-medium">正在生成中 Streaming...</span>
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-white/85 leading-relaxed p-5 max-h-80 overflow-y-auto">
                {streamingText}
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
              stats={result.stats}
              meta={result.meta}
              generatorModelCost={result.generatorModelCost}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
