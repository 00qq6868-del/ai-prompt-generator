"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Key, CheckCircle, ExternalLink, Eye, EyeOff } from "lucide-react";

const PROVIDERS = [
  {
    id: "ANTHROPIC_API_KEY",
    name: "Claude (Anthropic)",
    placeholder: "sk-ant-api03-...",
    url: "https://console.anthropic.com/settings/keys",
    free: false,
    color: "text-orange-400",
  },
  {
    id: "OPENAI_API_KEY",
    name: "ChatGPT (OpenAI)",
    placeholder: "sk-proj-...",
    url: "https://platform.openai.com/api-keys",
    free: false,
    color: "text-green-400",
  },
  {
    id: "GOOGLE_API_KEY",
    name: "Gemini (Google)",
    placeholder: "AIza...",
    url: "https://aistudio.google.com/app/apikey",
    free: true,
    color: "text-blue-400",
  },
  {
    id: "GROQ_API_KEY",
    name: "Groq (Llama)",
    placeholder: "gsk_...",
    url: "https://console.groq.com/keys",
    free: true,
    color: "text-purple-400",
  },
  {
    id: "DEEPSEEK_API_KEY",
    name: "DeepSeek",
    placeholder: "sk-...",
    url: "https://platform.deepseek.com/api_keys",
    free: false,
    color: "text-cyan-400",
  },
  {
    id: "XAI_API_KEY",
    name: "Grok (xAI)",
    placeholder: "xai-...",
    url: "https://console.x.ai/",
    free: false,
    color: "text-gray-300",
  },
  {
    id: "MISTRAL_API_KEY",
    name: "Mistral AI",
    placeholder: "...",
    url: "https://console.mistral.ai/api-keys/",
    free: false,
    color: "text-orange-300",
  },
  {
    id: "ZHIPU_API_KEY",
    name: "智谱 GLM",
    placeholder: "...",
    url: "https://open.bigmodel.cn/usercenter/apikeys",
    free: false,
    color: "text-red-400",
  },
  {
    id: "MOONSHOT_API_KEY",
    name: "Kimi (月之暗面)",
    placeholder: "sk-...",
    url: "https://platform.moonshot.cn/console/api-keys",
    free: false,
    color: "text-indigo-400",
  },
  {
    id: "QWEN_API_KEY",
    name: "通义千问 (阿里)",
    placeholder: "sk-...",
    url: "https://dashscope.console.aliyun.com/apiKey",
    free: false,
    color: "text-yellow-400",
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
    // 只保存非空的 Key
    const cleaned = Object.fromEntries(
      Object.entries(keys).filter(([, v]) => v.trim().length > 0)
    );
    saveUserKeys(cleaned);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  };

  const configured = Object.values(keys).filter((v) => v.trim().length > 5).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩 */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 弹窗 */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d1a] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 标题栏 */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#0d0d1a] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
                    <Key size={16} className="text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">API Key 设置</h2>
                    <p className="text-[11px] text-white/40">
                      {configured > 0 ? `已配置 ${configured} 个` : "填入后保存在此设备，不会上传"}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Key 列表 */}
              <div className="px-6 py-4 space-y-3">
                {/* 提示 */}
                <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-[12px] text-white/60 leading-relaxed">
                  <span className="text-violet-400 font-medium">至少填一个</span> 即可使用。
                  标注 <span className="text-green-400">免费</span> 的平台注册即可免费获取。
                  Key 保存在你的浏览器本地，不会发送给第三方。
                </div>

                {PROVIDERS.map((p) => {
                  const val = keys[p.id] || "";
                  const isSet = val.trim().length > 5;
                  const show = visible[p.id];
                  return (
                    <div key={p.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-medium ${p.color}`}>{p.name}</span>
                          {p.free && (
                            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-400">
                              免费
                            </span>
                          )}
                          {isSet && <CheckCircle size={13} className="text-green-400" />}
                        </div>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-white/30 hover:text-violet-400 transition-colors"
                        >
                          获取 Key <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="relative">
                        <input
                          type={show ? "text" : "password"}
                          value={val}
                          onChange={(e) => set(p.id, e.target.value)}
                          placeholder={p.placeholder}
                          className="w-full rounded-lg border border-white/8 bg-white/6 px-3 py-2 pr-9 text-[12px] text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 transition-colors"
                        />
                        <button
                          onClick={() => toggleVisible(p.id)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                        >
                          {show ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部按钮 */}
              <div className="sticky bottom-0 border-t border-white/8 bg-[#0d0d1a] px-6 py-4">
                <button
                  onClick={handleSave}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  {saved ? "✓ 已保存" : "保存并关闭"}
                </button>
                <p className="mt-2 text-center text-[11px] text-white/25">
                  保存后重新选择模型即可生效
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
