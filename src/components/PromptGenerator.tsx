"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Languages } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { ResultPanel } from "./ResultPanel";
import { loadUserKeys } from "./KeysSettings";
import toast from "react-hot-toast";

const DEFAULT_TARGET = "gpt-4o";

// Map provider name → the env-key name stored in localStorage
const PROVIDER_KEY_MAP: Record<string, string> = {
  custom:   "CUSTOM_API_KEY",
  aihubmix: "AIHUBMIX_API_KEY",
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

// Priority list — first provider whose key is configured wins
const PROVIDER_PRIORITY = [
  { provider: "custom",   modelId: "gpt-4o-mini" },
  { provider: "aihubmix", modelId: "gpt-4o-mini" },
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

export function PromptGenerator() {
  const [idea, setIdea]           = useState("");
  const [language, setLanguage]   = useState<"zh" | "en">("zh");
  const [targetModelId, setTargetModelId]       = useState(DEFAULT_TARGET);
  const [generatorModelId, setGeneratorModelId] = useState<string>("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<null | {
    optimizedPrompt: string;
    stats: any;
    meta: any;
    generatorModelCost: { input: number; output: number };
  }>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto-select cheapest available generator based on user's stored API keys
  useEffect(() => {
    const userKeys = loadUserKeys();
    // If user has custom relay configured, use it (with aihubmix provider)
    if (userKeys["CUSTOM_API_KEY"]?.trim().length > 5 && userKeys["CUSTOM_BASE_URL"]?.trim()) {
      setGeneratorModelId("gpt-4o-mini");
      return;
    }
    for (const { provider, modelId } of PROVIDER_PRIORITY) {
      const keyName = PROVIDER_KEY_MAP[provider];
      if (keyName && userKeys[keyName]?.trim().length > 5) {
        setGeneratorModelId(modelId);
        return;
      }
    }
    // No keys found locally — fall back to server-side keys check
    fetch("/api/keys")
      .then((r) => r.json())
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

  const generate = async () => {
    if (!idea.trim()) {
      toast.error("请先输入你的想法或需求！");
      return;
    }
    if (!generatorModelId) {
      toast.error("请先点击右上角钥匙图标填入至少一个 API Key");
      return;
    }
    setLoading(true);
    setResult(null);
    const tid = toast.loading("AI 正在生成优化提示词…");
    try {
      const userKeys = loadUserKeys();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userIdea: idea,
          targetModelId,
          generatorModelId,
          language,
          maxTokens: 1200,
          userKeys,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setResult(data);
      toast.dismiss(tid);
      toast.success("提示词生成成功！");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      toast.dismiss(tid);
      toast.error(err.message ?? "生成失败，请检查 API Key");
    } finally {
      setLoading(false);
    }
  };

  const charCount    = idea.length;
  const approxTokens = Math.ceil(charCount / (language === "zh" ? 1.8 : 4));

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

      {/* [S7 FIX] AnimatePresence requires motion.* direct child with a key */}
      <AnimatePresence>
        {result && (
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
