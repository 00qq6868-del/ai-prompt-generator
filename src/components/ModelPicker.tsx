"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Search, X, Star, Zap } from "lucide-react";
import { ModelInfo, scoreModel } from "@/lib/models-registry";

const STORAGE_KEY_FAVORITES = "ai_prompt_model_favorites";

function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_FAVORITES) || "[]"));
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify([...favs]));
}

const SPEED_COLOR: Record<string, string> = {
  ultrafast: "text-emerald-400", fast: "text-blue-400",
  medium: "text-amber-400", slow: "text-red-400",
};
const SPEED_LABEL: Record<string, string> = {
  ultrafast: "极速", fast: "快", medium: "中", slow: "慢",
};
const ACC_BADGE: Record<string, string> = {
  supreme: "bg-violet-500/20 text-violet-300",
  high: "bg-blue-500/20 text-blue-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-gray-500/20 text-gray-300",
};
const ACC_LABEL: Record<string, string> = {
  supreme: "卓越", high: "优秀", medium: "良好", low: "基础",
};

const PROVIDER_TABS = [
  "全部", "OpenAI", "Anthropic", "Google", "DeepSeek",
  "Meta", "xAI", "Mistral AI", "智谱AI", "阿里巴巴",
  "月之暗面", "百度", "MiniMax", "Cohere", "阶跃星辰", "Ollama", "Other",
];

interface ModelPickerProps {
  models: ModelInfo[];
  selectedId?: string;
  selectedIds?: string[];
  onChange?: (id: string) => void;
  onMultiChange?: (ids: string[]) => void;
  multiple?: boolean;
  maxSelected?: number;
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  availableModelIds?: string[];
}

export function ModelPicker({
  models,
  selectedId,
  selectedIds,
  onChange,
  onMultiChange,
  multiple = false,
  maxSelected = 6,
  title,
  subtitle,
  open,
  onClose,
  availableModelIds,
}: ModelPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("全部");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    if (open) {
      setFavorites(loadFavorites());
      setSearch("");
      setProvider("全部");
      setShowFavoritesOnly(false);
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open, onClose]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);

  const textModels = useMemo(
    () => models.filter(m => (m.category ?? "text") === "text"),
    [models]
  );

  const { filtered, providerCounts, topIds } = useMemo(() => {
    const scored = textModels
      .map(m => ({ model: m, score: scoreModel(m, "accurate") }))
      .sort((a, b) => b.score - a.score);

    const topIds = new Set(scored.slice(0, 5).map(s => s.model.id));

    const counts: Record<string, number> = { "全部": scored.length };
    for (const { model } of scored) {
      counts[model.provider] = (counts[model.provider] ?? 0) + 1;
    }

    let result = scored;

    if (showFavoritesOnly) {
      result = result.filter(s => favorites.has(s.model.id));
    }

    if (provider !== "全部") {
      result = result.filter(s => s.model.provider === provider);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.model.id.toLowerCase().includes(q) ||
        s.model.name.toLowerCase().includes(q) ||
        s.model.provider.toLowerCase().includes(q) ||
        s.model.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      const aFav = favorites.has(a.model.id) ? 1 : 0;
      const bFav = favorites.has(b.model.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return b.score - a.score;
    });

    return { filtered: result, providerCounts: counts, topIds };
  }, [textModels, search, provider, favorites, showFavoritesOnly]);

  const availableSet = useMemo(
    () => availableModelIds ? new Set(availableModelIds) : null,
    [availableModelIds]
  );

  const selectedSet = useMemo(() => {
    if (multiple) return new Set(selectedIds ?? []);
    return new Set(selectedId ? [selectedId] : []);
  }, [multiple, selectedId, selectedIds]);

  const handleSelect = (id: string) => {
    if (availableSet && !availableSet.has(id)) return;

    if (multiple) {
      const current = selectedIds ?? [];
      if (current.includes(id)) {
        onMultiChange?.(current.filter(item => item !== id));
        return;
      }
      if (current.length >= maxSelected) return;
      onMultiChange?.([...current, id]);
      return;
    }

    onChange?.(id);
    onClose();
  };

  const forwardWheelToList = (event: React.WheelEvent) => {
    if (!scrollRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    scrollRef.current.scrollTop += event.deltaY;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#08080f]"
          style={{ height: "100dvh" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Top bar */}
          <div onWheel={forwardWheelToList} className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4 shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">{title}</h2>
              {subtitle && <p className="text-[11px] text-white/65 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="关闭 Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/65 hover:bg-white/8 hover:text-white transition-all"
            >
              <X size={17} />
            </button>
          </div>

          {/* Search + filters */}
          <div onWheel={forwardWheelToList} className="border-b border-white/[0.07] px-6 py-3 space-y-3 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索模型名称、提供商、标签..."
                aria-label="搜索模型 Search models"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/60 outline-none focus:border-indigo-500/50 transition-all"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="清除搜索 Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white/60">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all shrink-0
                  ${showFavoritesOnly
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-white/70 hover:text-white/50 border border-transparent"
                  }`}
              >
                <Star size={10} fill={showFavoritesOnly ? "currentColor" : "none"} />
                收藏
              </button>
              <div className="h-3 w-px bg-white/10" />
              <div role="tablist" aria-label="提供商筛选 Provider filter" className="flex flex-wrap gap-1.5 overflow-visible">
                {PROVIDER_TABS.map(p => {
                  const count = providerCounts[p] ?? 0;
                  if (p !== "全部" && count === 0) return null;
                  return (
                    <button
                      key={p}
                      role="tab"
                      aria-selected={provider === p}
                      onClick={() => setProvider(p)}
                      className={`min-h-7 px-3 py-1 rounded-full text-[10px] leading-4 font-medium whitespace-nowrap break-keep transition-all shrink-0
                        ${provider === p
                          ? "bg-white/15 text-white border border-white/20"
                          : "text-white/85 hover:text-white border border-transparent"
                        }`}
                    >
                      {p} {count > 0 && <span className="opacity-50">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Model grid */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="mx-auto max-w-5xl px-6 py-4">
              {filtered.length === 0 ? (
                <div className="text-center text-white/70 text-sm py-16">
                  {showFavoritesOnly ? "还没有收藏的模型，点击 ⭐ 收藏常用模型" : "没有匹配的模型"}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map(({ model: m, score }) => (
                    <PickerCard
                      key={m.id}
                      model={m}
                      score={score}
                      isSelected={selectedSet.has(m.id)}
                      isFavorite={favorites.has(m.id)}
                      isTop={topIds.has(m.id)}
                      isAvailable={availableSet ? availableSet.has(m.id) : true}
                      multiple={multiple}
                      onSelect={() => handleSelect(m.id)}
                      onToggleFavorite={() => toggleFavorite(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom status */}
          <div className="border-t border-white/[0.07] px-6 py-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/70">
              <span>
                共 {filtered.length} 个文本模型
                {multiple && <span className="text-indigo-300"> · 已选 {selectedSet.size}/{maxSelected}</span>}
              </span>
              {availableSet && (
                <span className="text-emerald-400/70">
                  中转站可用: {availableSet.size} 个
                </span>
              )}
              {multiple && (
                <button
                  onClick={onClose}
                  className="ml-auto rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/30"
                >
                  完成 Done
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PickerCard({
  model: m,
  score,
  isSelected,
  isFavorite,
  isTop,
  isAvailable,
  multiple,
  onSelect,
  onToggleFavorite,
}: {
  model: ModelInfo;
  score: number;
  isSelected: boolean;
  isFavorite: boolean;
  isTop: boolean;
  isAvailable: boolean;
  multiple: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const avgCost = ((m.inputCostPer1M + m.outputCostPer1M) / 2).toFixed(2);

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      aria-label={`${m.name} — ${m.provider}`}
      aria-pressed={isSelected}
      disabled={!isAvailable}
      className={`relative text-left rounded-2xl border p-4 transition-all duration-200
        ${isSelected
          ? "border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30"
          : isAvailable
            ? "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/5"
            : "border-white/5 bg-white/[0.01] opacity-40"
        }`}
    >
      {/* Top-right badges */}
      <div className="flex items-center gap-1.5 absolute top-3 right-3">
        {isTop && (
          <span className="text-[9px] bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-0.5">
            <Zap size={8} /> 推荐
          </span>
        )}
        {m.isLatest && (
          <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">
            最新
          </span>
        )}
        {multiple && isSelected && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-white">
            <Check size={10} />
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          aria-label={isFavorite ? "取消收藏 Unfavorite" : "收藏 Favorite"}
          className="text-white/60 hover:text-amber-400 transition-colors"
        >
          <Star size={12} fill={isFavorite ? "currentColor" : "none"} className={isFavorite ? "text-amber-400" : ""} />
        </button>
      </div>

      {/* Provider */}
      <div className="text-[11px] leading-5 text-white/65 mb-0.5 pr-20 break-keep">{m.provider}</div>

      {/* Name */}
      <div className="font-semibold text-sm text-white leading-tight mb-2 pr-20">{m.name}</div>

      {/* Stats */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={`text-[10px] font-medium ${SPEED_COLOR[m.speed] ?? "text-white/65"}`}>
          ⚡ {SPEED_LABEL[m.speed] ?? m.speed}
        </span>
        <span className={`text-[10px] px-1.5 rounded-full ${ACC_BADGE[m.accuracy] ?? "bg-gray-500/20 text-gray-300"}`}>
          {ACC_LABEL[m.accuracy] ?? m.accuracy}
        </span>
        {Number(avgCost) > 0 ? (
          <span className="text-[10px] text-white/70">${avgCost}/1M</span>
        ) : (
          <span className="text-[10px] text-green-400/70">免费</span>
        )}
        {m.contextWindow >= 100000 && (
          <span className="text-[10px] text-emerald-400/60">
            {(m.contextWindow / 1000).toFixed(0)}K
          </span>
        )}
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
            style={{ width: `${Math.round(score * 100)}%` }}
          />
        </div>
        <span className="text-[9px] text-white/60 font-mono">{Math.round(score * 100)}</span>
      </div>

      {/* Tags */}
      {m.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {m.tags.slice(0, 4).map(tag => (
            <span key={tag} className="text-[9px] text-white/60 bg-white/[0.04] px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  );
}
