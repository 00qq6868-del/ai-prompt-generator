"use client";

import { ModelInfo, ModelCategory } from "@/lib/models-registry";
import { useModels } from "@/hooks/useModels";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, RefreshCw, Cpu, Type, Image, Film, Mic, Headphones, Database, ScanSearch, ChevronRight, Search, X, ArrowUpDown } from "lucide-react";
import { useState, useMemo } from "react";
import { ModelPicker } from "./ModelPicker";

interface Props {
  selectedTargetId: string;
  selectedGeneratorIds: string[];
  selectedEvaluatorIds: string[];
  onTargetChange: (id: string) => void;
  onGeneratorChange: (ids: string[]) => void;
  onEvaluatorChange: (ids: string[]) => void;
  availableModelIds?: string[];
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
  "月之暗面", "百度", "MiniMax", "Cohere", "阶跃星辰", "Ollama", "Other",
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

type SortKey = "release" | "price" | "speed" | "accuracy";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "release",  label: "发布日期 Date" },
  { key: "price",    label: "价格 Price" },
  { key: "speed",    label: "速度 Speed" },
  { key: "accuracy", label: "精度 Accuracy" },
];

const SPEED_RANK: Record<string, number> = { ultrafast: 4, fast: 3, medium: 2, slow: 1 };
const ACC_RANK: Record<string, number> = { supreme: 4, high: 3, medium: 2, low: 1 };

export function ModelSelector({
  selectedTargetId,
  selectedGeneratorIds,
  selectedEvaluatorIds,
  onTargetChange,
  onGeneratorChange,
  onEvaluatorChange,
  availableModelIds,
}: Props) {
  const { models, loading, source, updatedAt, refresh } = useModels("accurate");
  const [category, setCategory] = useState<ModelCategory | "all">("text");
  const [provider, setProvider] = useState("全部");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("release");
  const [generatorPickerOpen, setGeneratorPickerOpen] = useState(false);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);

  const selectedGenerators = useMemo(
    () => selectedGeneratorIds
      .map(id => models.find(m => m.id === id))
      .filter((m): m is ModelInfo => Boolean(m)),
    [models, selectedGeneratorIds]
  );

  const selectedEvaluators = useMemo(
    () => selectedEvaluatorIds
      .map(id => models.find(m => m.id === id))
      .filter((m): m is ModelInfo => Boolean(m)),
    [models, selectedEvaluatorIds]
  );

  const targetModel = useMemo(
    () => models.find(m => m.id === selectedTargetId),
    [models, selectedTargetId]
  );
  const targetCategory = targetModel?.category ?? "text";
  const generatorSubtitle = targetCategory === "image"
    ? "目标是图像模型 — 推荐选质量高的生成器 / Target is image model"
    : targetCategory === "video"
    ? "目标是视频模型 — 推荐选质量高的生成器 / Target is video model"
    : "用来写提示词的 AI — 推荐选便宜快速的模型";
  const evaluatorSubtitle = "最多 6 个，用来给生成器产出的提示词打 0-100 分 / Up to 6 judge models";

  // Category counts (across all models, unaffected by filters)
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

  // Filter + search + sort
  const filtered = useMemo(() => {
    let list = models;

    if (category !== "all") {
      list = list.filter((m) => (m.category ?? "text") === category);
    }
    if (provider !== "全部") {
      list = list.filter((m) => m.provider === provider);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case "release":
        sorted.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
        break;
      case "price":
        sorted.sort((a, b) =>
          (a.inputCostPer1M + a.outputCostPer1M) - (b.inputCostPer1M + b.outputCostPer1M)
        );
        break;
      case "speed":
        sorted.sort((a, b) => (SPEED_RANK[b.speed] ?? 0) - (SPEED_RANK[a.speed] ?? 0));
        break;
      case "accuracy":
        sorted.sort((a, b) => (ACC_RANK[b.accuracy] ?? 0) - (ACC_RANK[a.accuracy] ?? 0));
        break;
    }

    return sorted;
  }, [models, category, provider, search, sortBy]);

  return (
    <div className="space-y-5">
      {/* Generator model picker — trigger button */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/60 flex items-center gap-1.5">
            <Cpu size={13} />
            生成器模型
            <span className="text-xs text-white/70">（可多选，用来写提示词）</span>
          </h3>
        </div>
        <button
          onClick={() => setGeneratorPickerOpen(true)}
          aria-label="选择生成器模型 Open generator model picker"
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 hover:bg-white/[0.06] text-sm text-white transition-all group"
        >
          {selectedGenerators.length > 0 ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 shrink-0">
                <Cpu size={14} className="text-indigo-400" />
              </div>
              <div className="text-left min-w-0">
                <div className="font-medium text-white truncate">
                  {selectedGenerators.length === 1
                    ? selectedGenerators[0].name
                    : `${selectedGenerators[0].name} +${selectedGenerators.length - 1}`}
                </div>
                <div className="text-[11px] text-white/65 flex items-center gap-2">
                  <span>{selectedGenerators.map(m => m.provider).slice(0, 2).join(" / ")}</span>
                  <span className="text-indigo-300">已选 {selectedGenerators.length}</span>
                </div>
              </div>
            </div>
          ) : (
            <span className="text-white/65">点击选择生成器模型</span>
          )}
          <ChevronRight size={16} className="text-white/70 group-hover:text-indigo-400 transition-colors shrink-0" />
        </button>

        <ModelPicker
          models={models}
          selectedIds={selectedGeneratorIds}
          onMultiChange={onGeneratorChange}
          multiple
          maxSelected={6}
          title="选择生成器模型"
          subtitle={generatorSubtitle}
          open={generatorPickerOpen}
          onClose={() => setGeneratorPickerOpen(false)}
          availableModelIds={availableModelIds}
        />
      </div>

      {/* Evaluator model picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/60 flex items-center gap-1.5">
            <ScanSearch size={13} />
            评价模型
            <span className="text-xs text-white/70">（可选，最多 6 个）</span>
          </h3>
        </div>
        <button
          onClick={() => setEvaluatorPickerOpen(true)}
          aria-label="选择评价模型 Open evaluator model picker"
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/30 hover:bg-white/[0.06] text-sm text-white transition-all group"
        >
          {selectedEvaluators.length > 0 ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 shrink-0">
                <ScanSearch size={14} className="text-violet-300" />
              </div>
              <div className="text-left min-w-0">
                <div className="font-medium text-white truncate">
                  {selectedEvaluators.length === 1
                    ? selectedEvaluators[0].name
                    : `${selectedEvaluators[0].name} +${selectedEvaluators.length - 1}`}
                </div>
                <div className="text-[11px] text-white/65">
                  0-100 分评审 · 已选 {selectedEvaluators.length}/6
                </div>
              </div>
            </div>
          ) : (
            <span className="text-white/65">可选：点击选择评价模型，未选时自动挑选</span>
          )}
          <ChevronRight size={16} className="text-white/70 group-hover:text-violet-300 transition-colors shrink-0" />
        </button>

        <ModelPicker
          models={models}
          selectedIds={selectedEvaluatorIds}
          onMultiChange={onEvaluatorChange}
          multiple
          maxSelected={6}
          title="选择评价模型"
          subtitle={evaluatorSubtitle}
          open={evaluatorPickerOpen}
          onClose={() => setEvaluatorPickerOpen(false)}
          availableModelIds={availableModelIds}
        />
      </div>

      {/* Target model picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/60">
            目标模型
            <span className="text-xs text-white/70 ml-2">（最终运行提示词的 AI）</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70">
              {source === "remote" ? "🌐 远程" : "📦 内置"}
              {updatedAt && ` · ${new Date(updatedAt).toLocaleDateString()}`}
            </span>
            <button onClick={refresh} aria-label="刷新模型列表 Refresh model list" className="text-white/65 hover:text-white transition-colors">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── Search input ── */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型名称、ID、供应商... Search models"
            aria-label="搜索模型 Search models"
            className="w-full pl-9 pr-9 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/60 outline-none focus:border-indigo-500/50 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="清除搜索 Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white/60 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── Category tabs (horizontal scroll) ── */}
        <div role="tablist" aria-label="模型分类 Model categories" className="flex gap-1 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map((c) => {
            const count = catCounts[c.id] ?? 0;
            const isEmpty = c.id !== "all" && count === 0;
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={category === c.id}
                disabled={isEmpty}
                onClick={() => { if (!isEmpty) { setCategory(c.id); setProvider("全部"); } }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all shrink-0
                  ${isEmpty
                    ? "text-white/45 cursor-not-allowed border border-transparent"
                    : category === c.id
                      ? "bg-indigo-500/30 text-white border border-indigo-400/60"
                      : "text-white/85 hover:text-white border border-transparent"
                  }`}
              >
                {c.icon}
                {c.label}
                <span className={`text-[9px] ${isEmpty ? "text-white/45" : "text-white/80"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Provider filter (horizontal scroll) ── */}
        <div role="tablist" aria-label="提供商筛选 Provider filter" className="flex flex-wrap gap-1.5 mb-3 overflow-visible pb-1">
          {PROVIDER_TABS.map((p) => {
            const count = provCounts[p] ?? 0;
            if (p !== "全部" && count === 0) return null;
            return (
              <button
                key={p}
                role="tab"
                aria-selected={provider === p}
                onClick={() => setProvider(p)}
                className={`min-h-7 px-3 py-1 rounded-full text-[10px] leading-4 font-medium whitespace-nowrap transition-all shrink-0
                  ${provider === p
                    ? "bg-white/15 text-white border border-white/20"
                    : "text-white/85 hover:text-white border border-transparent"
                  }`}
              >
                {p} {count > 0 && <span className="text-white/75">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Sort options ── */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <ArrowUpDown size={11} className="text-white/60 shrink-0" />
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all shrink-0
                ${sortBy === opt.key
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "text-white/60 hover:text-white/70 border border-transparent"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Model grid ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${category}-${provider}-${sortBy}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-[400px] overflow-y-auto pr-1"
          >
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" role="status" aria-label="加载中 Loading" />
                ))
              : filtered.length === 0
                ? <div className="col-span-2 text-center text-white/70 text-sm py-8">
                    {search ? "未找到匹配的模型 No matching models" : "暂无此类模型 No models in this category"}
                  </div>
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
          <p className="text-[11px] text-white/60 text-center mt-2">
            显示前 50 个（共 {filtered.length} 个）Showing 50 of {filtered.length}
          </p>
        )}
      </div>
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
      aria-label={`${m.name} — ${m.provider}, ${SPEED_LABEL[m.speed] ?? m.speed}, ${ACC_LABEL[m.accuracy] ?? m.accuracy}`}
      aria-pressed={selected}
      className={`relative text-left rounded-xl border px-3 py-2.5 transition-all
        ${selected
          ? "border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
          : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/5"
        }`}
    >
      {m.isLatest && (
        <span className="absolute top-2 right-2 text-[9px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">
          最新 New
        </span>
      )}
      <div className="flex items-center gap-1.5 mb-1 pr-14">
        <span className="text-xs leading-5 text-white/50 break-keep">{m.provider}</span>
      </div>
      <div className="font-semibold text-sm text-white leading-tight mb-1.5 pr-14">{m.name}</div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[10px] font-medium ${SPEED_COLOR[m.speed] ?? "text-white/65"}`}>
          ⚡ {SPEED_LABEL[m.speed] ?? m.speed}
        </span>
        <span className={`text-[10px] px-1.5 rounded-full ${ACC_BADGE[m.accuracy] ?? "bg-gray-500/20 text-gray-300"}`}>
          {ACC_LABEL[m.accuracy] ?? m.accuracy}
        </span>
        {Number(avgCost) > 0 ? (
          <span className="text-[10px] text-white/70">${avgCost}/1M</span>
        ) : (
          <span className="text-[10px] text-green-400/70">免费 Free</span>
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
