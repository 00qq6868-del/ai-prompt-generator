"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, KeyRound, CheckCircle, ExternalLink, Eye, EyeOff, Sparkles } from "lucide-react";

// Free providers shown first with priority
const PROVIDERS = [
  {
    id: "GOOGLE_API_KEY",
    name: "Gemini (Google)",
    placeholder: "AIza...",
    url: "https://aistudio.google.com/app/apikey",
    free: true,
    color: "text-blue-400",
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
  },
  {
    id: "GROQ_API_KEY",
    name: "Groq (Llama)",
    placeholder: "gsk_...",
    url: "https://console.groq.com/keys",
    free: true,
    color: "text-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
  },
  {
    id: "ANTHROPIC_API_KEY",
    name: "Claude (Anthropic)",
    placeholder: "sk-ant-api03-...",
    url: "https://console.anthropic.com/settings/keys",
    free: false,
    color: "text-orange-400",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "OPENAI_API_KEY",
    name: "ChatGPT (OpenAI)",
    placeholder: "sk-proj-...",
    url: "https://platform.openai.com/api-keys",
    free: false,
    color: "text-green-400",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "DEEPSEEK_API_KEY",
    name: "DeepSeek",
    placeholder: "sk-...",
    url: "https://platform.deepseek.com/api_keys",
    free: false,
    color: "text-cyan-400",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "XAI_API_KEY",
    name: "Grok (xAI)",
    placeholder: "xai-...",
    url: "https://console.x.ai/",
    free: false,
    color: "text-gray-300",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "MISTRAL_API_KEY",
    name: "Mistral AI",
    placeholder: "...",
    url: "https://console.mistral.ai/api-keys/",
    free: false,
    color: "text-orange-300",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "ZHIPU_API_KEY",
    name: "智谱 GLM",
    placeholder: "...",
    url: "https://open.bigmodel.cn/usercenter/apikeys",
    free: false,
    color: "text-red-400",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "MOONSHOT_API_KEY",
    name: "Kimi (月之暗面)",
    placeholder: "sk-...",
    url: "https://platform.moonshot.cn/console/api-keys",
    free: false,
    color: "text-indigo-400",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
  {
    id: "QWEN_API_KEY",
    name: "通义千问 (阿里)",
    placeholder: "sk-...",
    url: "https://dashscope.console.aliyun.com/apiKey",
    free: false,
    color: "text-yellow-400",
    border: "border-white/8",
    bg: "bg-white/[0.03]",
  },
];

const STORAGE_KEY = "ai_prompt_user_keys";

export function loadUserKeys(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveUserKeys(keys: Record<string, string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeysSettings({ open, onClose }: Props) {
  const [keys, setKeys]       = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    if (open) setKeys(loadUserKeys());
  }, [open]);

  const set = (id: string, val: string) => setKeys((k) => ({ ...k, [id]: val }));
  const toggleVisible = (id: string) => setVisible((v) => ({ ...v, [id]: !v[id] }));

  const handleSave = () => {
    const cleaned = Object.fromEntries(
      Object.entries(keys).filter(([, v]) => v.trim().length > 0)
    );
    saveUserKeys(cleaned);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  };

  const configured = Object.values(keys).filter((v) => v.trim().length > 5).length;
  const freeProviders = PROVIDERS.filter((p) => p.free);
  const paidProviders = PROVIDERS.filter((p) => !p.free);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Right-side drawer — VSCode / Linear style */}
          <motion.div
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-[#0a0a18] border-l border-white/10 shadow-2xl shadow-black/60"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* ── Header (fixed) ─────────────────────────────── */}
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30">
                  <KeyRound size={15} className="text-violet-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">API Key 设置</h2>
                  <p className="text-[11px] text-white/40">
                    {configured > 0 ? `已配置 ${configured} 个` : "填入后保存在此设备，不会上传"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/8 hover:text-white transition-all"
              >
                <X size={15} />
              </button>
            </div>

            {/* ── Scrollable content ──────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Tip banner */}
              <div className="flex items-start gap-3 rounded-xl bg-violet-500/8 border border-violet-500/15 px-3.5 py-3">
                <Sparkles size={13} className="text-violet-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-white/50 leading-relaxed">
                  至少填一个即可使用。标注{" "}
                  <span className="text-green-400 font-medium">免费</span>{" "}
                  的平台注册即可获取，无需付费。Key 仅保存在你的浏览器本地。
                </p>
              </div>

              {/* ── Free providers first ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="h-px flex-1 bg-green-500/15" />
                  <span className="text-[10px] font-semibold text-green-500/60 tracking-wider uppercase">免费平台</span>
                  <div className="h-px flex-1 bg-green-500/15" />
                </div>
                <div className="space-y-2">
                  {freeProviders.map((p) => (
                    <ProviderRow
                      key={p.id}
                      provider={p}
                      value={keys[p.id] || ""}
                      show={!!visible[p.id]}
                      onChange={(v) => set(p.id, v)}
                      onToggleVisible={() => toggleVisible(p.id)}
                    />
                  ))}
                </div>
              </div>

              {/* ── Paid providers ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="h-px flex-1 bg-white/8" />
                  <span className="text-[10px] font-semibold text-white/25 tracking-wider uppercase">付费平台</span>
                  <div className="h-px flex-1 bg-white/8" />
                </div>
                <div className="space-y-2">
                  {paidProviders.map((p) => (
                    <ProviderRow
                      key={p.id}
                      provider={p}
                      value={keys[p.id] || ""}
                      show={!!visible[p.id]}
                      onChange={(v) => set(p.id, v)}
                      onToggleVisible={() => toggleVisible(p.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Footer (fixed) ─────────────────────────────── */}
            <div className="border-t border-white/8 px-5 py-4 shrink-0">
              <motion.button
                onClick={handleSave}
                whileTap={{ scale: 0.98 }}
                className={`w-full rounded-xl py-3 text-sm font-semibold transition-all duration-300
                  ${saved
                    ? "bg-green-600 text-white"
                    : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90"
                  }`}
              >
                {saved ? "✓  已保存" : "保存并关闭"}
              </motion.button>
              <p className="mt-2 text-center text-[11px] text-white/25">
                保存后重新选择模型即可生效
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Provider row sub-component ────────────────────────────────
interface ProviderRowProps {
  provider: typeof PROVIDERS[number];
  value: string;
  show: boolean;
  onChange: (v: string) => void;
  onToggleVisible: () => void;
}

function ProviderRow({ provider: p, value, show, onChange, onToggleVisible }: ProviderRowProps) {
  const isSet = value.trim().length > 5;

  return (
    <div className={`rounded-xl border ${p.border} ${p.bg} p-3 transition-all ${isSet ? "ring-1 ring-green-500/20" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-semibold ${p.color}`}>{p.name}</span>
          {p.free && (
            <span className="rounded-full bg-green-500/12 px-1.5 py-0.5 text-[9px] font-bold text-green-400 tracking-wider uppercase border border-green-500/20">
              FREE
            </span>
          )}
          <AnimatePresence>
            {isSet && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <CheckCircle size={12} className="text-green-400" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-white/25 hover:text-violet-400 transition-colors"
        >
          获取 Key <ExternalLink size={9} />
        </a>
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={p.placeholder}
          className="w-full rounded-lg border border-white/8 bg-black/20 px-3 py-2 pr-9 text-[12px] text-white placeholder:text-white/15 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all"
        />
        <button
          onClick={onToggleVisible}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
        >
          {show ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>
    </div>
  );
}
