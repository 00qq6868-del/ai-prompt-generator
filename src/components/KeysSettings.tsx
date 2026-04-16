"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, KeyRound, CheckCircle, ExternalLink, Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";

const PROVIDERS = [
  {
    id: "GOOGLE_API_KEY",
    name: "Gemini (Google)",
    placeholder: "AIza...",
    url: "https://aistudio.google.com/app/apikey",
    free: true,
    color: "text-blue-400",
    accent: "blue",
  },
  {
    id: "GROQ_API_KEY",
    name: "Groq (Llama)",
    placeholder: "gsk_...",
    url: "https://console.groq.com/keys",
    free: true,
    color: "text-purple-400",
    accent: "purple",
  },
  {
    id: "ANTHROPIC_API_KEY",
    name: "Claude (Anthropic)",
    placeholder: "sk-ant-api03-...",
    url: "https://console.anthropic.com/settings/keys",
    free: false,
    color: "text-orange-400",
    accent: "orange",
  },
  {
    id: "OPENAI_API_KEY",
    name: "ChatGPT (OpenAI)",
    placeholder: "sk-proj-...",
    url: "https://platform.openai.com/api-keys",
    free: false,
    color: "text-green-400",
    accent: "green",
  },
  {
    id: "DEEPSEEK_API_KEY",
    name: "DeepSeek",
    placeholder: "sk-...",
    url: "https://platform.deepseek.com/api_keys",
    free: false,
    color: "text-cyan-400",
    accent: "cyan",
  },
  {
    id: "XAI_API_KEY",
    name: "Grok (xAI)",
    placeholder: "xai-...",
    url: "https://console.x.ai/",
    free: false,
    color: "text-slate-300",
    accent: "slate",
  },
  {
    id: "MISTRAL_API_KEY",
    name: "Mistral AI",
    placeholder: "...",
    url: "https://console.mistral.ai/api-keys/",
    free: false,
    color: "text-orange-300",
    accent: "orange",
  },
  {
    id: "ZHIPU_API_KEY",
    name: "智谱 GLM",
    placeholder: "...",
    url: "https://open.bigmodel.cn/usercenter/apikeys",
    free: false,
    color: "text-red-400",
    accent: "red",
  },
  {
    id: "MOONSHOT_API_KEY",
    name: "Kimi (月之暗面)",
    placeholder: "sk-...",
    url: "https://platform.moonshot.cn/console/api-keys",
    free: false,
    color: "text-indigo-400",
    accent: "indigo",
  },
  {
    id: "QWEN_API_KEY",
    name: "通义千问 (阿里)",
    placeholder: "sk-...",
    url: "https://dashscope.console.aliyun.com/apiKey",
    free: false,
    color: "text-yellow-400",
    accent: "yellow",
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
    if (open) {
      setKeys(loadUserKeys());
      // prevent background scroll
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
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
  const freeProviders  = PROVIDERS.filter((p) => p.free);
  const paidProviders  = PROVIDERS.filter((p) => !p.free);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-[#08080f]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* ── Top bar ─────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25">
                <KeyRound size={16} className="text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">API Key 设置</h2>
                <p className="text-[11px] text-white/40">
                  {configured > 0
                    ? `已配置 ${configured} 个 · 至少 1 个即可使用`
                    : "填入后保存在此设备，不会发送给任何第三方"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/8 hover:text-white transition-all"
            >
              <X size={17} />
            </button>
          </div>

          {/* ── Scrollable body ─────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-6 py-6 space-y-8">

              {/* Tip */}
              <div className="flex items-center gap-3 rounded-2xl bg-violet-500/8 border border-violet-500/15 px-5 py-3.5">
                <Sparkles size={14} className="text-violet-400 shrink-0" />
                <p className="text-[12px] text-white/55 leading-relaxed">
                  标注 <span className="text-green-400 font-semibold">免费</span> 的平台注册即可免费获取，推荐先试这两个。
                  Key 仅保存在你的浏览器本地，不会上传到任何服务器。
                </p>
              </div>

              {/* ── Free providers ── 2 col grid */}
              <section>
                <SectionDivider label="免费平台（推荐先填）" accent="green" />
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {freeProviders.map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      value={keys[p.id] || ""}
                      show={!!visible[p.id]}
                      onChange={(v) => set(p.id, v)}
                      onToggleVisible={() => toggleVisible(p.id)}
                    />
                  ))}
                </div>
              </section>

              {/* ── Paid providers ── 2 col grid */}
              <section>
                <SectionDivider label="付费平台" accent="white" />
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {paidProviders.map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      value={keys[p.id] || ""}
                      show={!!visible[p.id]}
                      onChange={(v) => set(p.id, v)}
                      onToggleVisible={() => toggleVisible(p.id)}
                    />
                  ))}
                </div>
              </section>

              {/* Bottom spacing */}
              <div className="h-4" />
            </div>
          </div>

          {/* ── Fixed bottom bar ────────────────────────── */}
          <div className="border-t border-white/[0.07] bg-[#08080f] px-6 py-4 shrink-0">
            <div className="mx-auto max-w-4xl flex items-center gap-4">
              <motion.button
                onClick={handleSave}
                whileTap={{ scale: 0.98 }}
                className={`flex-1 rounded-2xl py-3.5 text-sm font-bold transition-all duration-300
                  ${saved
                    ? "bg-green-600 text-white"
                    : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90 shadow-lg shadow-violet-500/25"
                  }`}
              >
                {saved ? "✓  已保存" : "保存并关闭"}
              </motion.button>
              <p className="text-[11px] text-white/25 whitespace-nowrap">
                保存后重新选择模型即可生效
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Section divider ───────────────────────────────────────────
function SectionDivider({ label, accent }: { label: string; accent: "green" | "white" }) {
  const color = accent === "green"
    ? "text-green-500/70 border-green-500/15"
    : "text-white/30 border-white/[0.07]";
  return (
    <div className="flex items-center gap-3">
      <div className={`h-px flex-1 border-t ${color.split(" ")[1]}`} />
      <span className={`text-[10px] font-bold tracking-widest uppercase ${color.split(" ")[0]}`}>
        {label}
      </span>
      <div className={`h-px flex-1 border-t ${color.split(" ")[1]}`} />
    </div>
  );
}

// ── Provider card ─────────────────────────────────────────────
interface ProviderCardProps {
  provider: typeof PROVIDERS[number];
  value: string;
  show: boolean;
  onChange: (v: string) => void;
  onToggleVisible: () => void;
}

function ProviderCard({ provider: p, value, show, onChange, onToggleVisible }: ProviderCardProps) {
  const isSet = value.trim().length > 5;

  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-200
        ${isSet
          ? "border-green-500/25 bg-green-500/[0.04] shadow-sm shadow-green-500/10"
          : p.free
            ? "border-white/10 bg-white/[0.03] hover:border-white/15"
            : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
        }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-semibold ${p.color}`}>{p.name}</span>
          {p.free && (
            <span className="rounded-md bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400 tracking-wider uppercase">
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
                <CheckCircle size={13} className="text-green-400" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-white/25 hover:text-violet-400 transition-colors"
        >
          获取 Key <ArrowRight size={10} />
        </a>
      </div>

      {/* Input */}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={p.placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-white/8 bg-black/30 px-4 py-2.5 pr-10 text-[13px] text-white placeholder:text-white/15 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition-all"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors"
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  );
}
