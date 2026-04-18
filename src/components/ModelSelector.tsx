"use client";

import { ModelInfo, ModelCategory } from "@/lib/models-registry";
import { useModels } from "@/hooks/useModels";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, RefreshCw, Cpu, Type, Image, Film, Mic, Headphones, Database, ScanSearch } from "lucide-react";
import { useState, useMemo } from "react";

interface Props {
  selectedTargetId: string;
  selectedGeneratorId: string;
  onTargetChange: (id: string) => void;
  onGeneratorChange: (id: string) => void;
}

// ── Category config ──────────────────────────────────────────
const CATEGORIES: { id: ModelCategory | "all"; label: string; icon: React.ReactNode }[] = [
  { id: "all",       label: "全部",     icon: <Cpu size={11} /> },
  { id: "text",      label: "文本生成",  icon: <Type size={11} /> },
  { id: "image",     label: "文生图",    icon: <Image size={11} /> },
  { id: "video",     label: "视频生成",  icon: <Film size={11} /> },
  { id: "tts",       label: "文转音",    icon: <Mic size={11} /> },
  { id: "stt",       label: "音转文",    icon: <Headphones size={11} /> },
  { id: "embedding", label: "嵌入",     icon: <Database size={11} /> },
  { id: "ocr",       label: "OCR",      icon: <ScanSearch size={11} /> },
];

// ── Provider tabs ────────────────────────────────────────────
const PROVIDER_TABS = [
  "全部", "OpenAI", "Anthropic", "Google", "DeepSeek",
  "Meta", "xAI", "Mistral AI", "智谱AI", "阿里巴巴",
  "MiniMax", "Cohere", "阶跃星辰", "月之暗面", "百度", "Other",
];

const SPEED_COLOR: Record<string, string> = {
  ultrafast: "text-emerald-400", fast: "text-blue-400",
  medium: "text-amber-400", slow: "text-red-400",
};
const SPEED_LABEL: Record<string, string> = {
  ultrafast: "极速", fast: "快", medium: "中", slow: "慢",
};
const ACC_BADGE: Record<string, string> = {
  supreme: "bg-violet-500/20 text-violet-300", high: "bg-blue-500/20 text-blue-300",
  medium: "bg-amber-500/20 text-amber-300", low: "bg-gray-500/20 text-gray-300",
};
const ACC_LABEL: Record<string, string> = {
  supreme: "卓越", high: "优秀", medium: "良好", low: "基础",
};

export function ModelSelector({
  selectedTargetId,
  selectedGeneratorId,
  onTargetChange,
  onGeneratorChange,
}: Props) {
  const { models, loading, source, updatedAt, refresh } = useModels("accurate");
  const [category, setCategory] = useState<ModelCategory | "all">("text");
  const [provider, setProvider] = useState("全部");

  // Filter + sort: latest first
  const filtered = useMemo(() => {
    let list = models;
    if (category !== "all") {
      list = list.filter((m) => (m.category ?? "text") === category);
    }
    if (provider !== "全部") {
      list = list.filter((m) => m.provider === provider);
    }
    // Sort: latest release date first, then by name
    return list.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  }, [models, category, provider]);

  // Category counts
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: models.length };
    for (const m of models) {
      const c = m.category ?? "text";
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [models]);

  // Provider counts (within selected category)
  const provCounts = useMemo(() => {
    let list = models;
    if (category !== "all") {
      list = list.filter((m) => (m.category ?? "text") === category);
    }
    const counts: Record<string, number> = { "全部": list.length };
    for (const m of list) {
      counts[m.provider] = (counts[m.provider] ?? 0) + 1;
    }
    return counts;
  }, [models, category]);

  return (
    <div className="space-y-5">
      {/* Generator model picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/60 flex items-center gap-1.5">
            <Cpu size={13} />
            生成器模型
            <span className="text-xs text-white/30">（用来写提示词的 AI）</span>
          </h3>
        </div>
        <ModelDropdown
          models={models.filter((m) => (m.category ?? "text") === "text")}
          selectedId={selectedGeneratorId}
          onChange={onGeneratorChange}
          label="选择生成器"
        />
      </div>

      {/* Target model picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/60">
            目标模型
            <span className="text-xs text-white/30 ml-2">（最终运行提示词的 AI）</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30">
              {source === "remote" ? "🌐 远程" : "📦 内置"}
              {updatedAt && ` · ${new Date(updatedAt).toLocaleDateString()}`}
            </span>
            <button onClick={refresh} title="刷新模型列表" className="text-white/40 hover:text-white transition-colors">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── Category tabs (horizontal scroll) ── */}
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map((c) => {
            const count = catCounts[c.id] ?? 0;
            if (c.id !== "all" && count === 0) return null;
            return (
              <button
                key={c.id}
                onClick={() => { setCategory(c.id); setProvider("全部"); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all shrink-0
                  ${category === c.id
                    ? "bg-indigo-500/25 text-indigo-300 border border-indigo-500/40"
                    : "text-white/40 hover:text-white/60 border border-transparent"
                  }`}
              >
                {c.icon}
                {c.label}
                <span className="text-[9px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Provider filter (horizontal scroll) ── */}
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {PROVIDER_TABS.map((p) => {
            const count = provCounts[p] ?? 0;
            if (p !== "全部" && count === 0) return null;
            return (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all shrink-0
                  ${provider === p
                    ? "bg-white/15 text-white border border-white/20"
                    : "text-white/30 hover:text-white/50 border border-transparent"
                  }`}
              >
                {p} {count > 0 && <span className="opacity-50">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Model grid ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${category}-${provider}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-[400px] overflow-y-auto pr-1"
          >
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                ))
              : filtered.length === 0
                ? <div className="col-span-2 text-center text-white/30 text-sm py-8">暂无此类模型</div>
                : filtered.slice(0, 50).map((m) => (
                    <ModelCard
                      key={m.id}
                      model={m}
                      selected={selectedTargetId === m.id}
                      onClick={() => onTargetChange(m.id)}
                    />
                  ))}
          </motion.div>
        </AnimatePresence>
        {filtered.length > 50 && (
          <p className="text-[11px] text-white/25 text-center mt-2">
            显示前 50 个（共 {filtered.length} 个）
          </p>
        )}
      </div>
    </div>
  );
}

// ── Dropdown (for generator model) ────────────────────────────
function ModelDropdown({
  models, selectedId, onChange, label,
}: {
  models: ModelInfo[]; selectedId: string; onChange: (id: string) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 text-sm text-white transition-all"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="text-white/70">{selected.provider}</span>
            <span className="font-medium">{selected.name}</span>
            {selected.isLatest && (
              <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">最新</span>
            )}
          </span>
        ) : (
          <span className="text-white/40">{label}</span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 w-full mt-1 rounded-xl bg-gray-900 border border-white/10 shadow-2xl max-h-60 overflow-y-auto"
            >
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/5 transition-colors
                    ${m.id === selectedId ? "bg-indigo-500/10 text-indigo-300" : "text-white/70"}`}
                >
                  <span>{m.provider} — {m.name}</span>
                  {m.isLatest && <span className="text-[10px] text-indigo-400">最新</span>}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Model Card ────────────────────────────────────────────────
function ModelCard({
  model: m, selected, onClick,
}: {
  model: ModelInfo; selected: boolean; onClick: () => void;
}) {
  const avgCost = ((m.inputCostPer1M + m.outputCostPer1M) / 2).toFixed(2);
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative text-left rounded-xl border px-3 py-2.5 transition-all
        ${selected
          ? "border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
          : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/5"
        }`}
    >
      {m.isLatest && (
        <span className="absolute top-2 right-2 text-[9px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">
          最新
        </span>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-white/50">{m.provider}</span>
      </div>
      <div className="font-semibold text-sm text-white leading-tight mb-1.5">{m.name}</div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[10px] font-medium ${SPEED_COLOR[m.speed] ?? "text-white/40"}`}>
          ⚡ {SPEED_LABEL[m.speed] ?? m.speed}
        </span>
        <span className={`text-[10px] px-1.5 rounded-full ${ACC_BADGE[m.accuracy] ?? "bg-gray-500/20 text-gray-300"}`}>
          {ACC_LABEL[m.accuracy] ?? m.accuracy}
        </span>
        {Number(avgCost) > 0 && (
          <span className="text-[10px] text-white/30">${avgCost}/1M</span>
        )}
        {m.contextWindow >= 100000 && (
          <span className="text-[10px] text-emerald-400/70">
            {(m.contextWindow / 1000).toFixed(0)}K ctx
          </span>
        )}
      </div>
    </motion.button>
  );
}
