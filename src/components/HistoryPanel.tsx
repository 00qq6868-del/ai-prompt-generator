"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Star, Trash2, X, Clock } from "lucide-react";
import { getHistory, toggleFavorite, deleteHistory, clearHistory, HistoryItem } from "@/lib/history";

interface Props {
  onReuse: (item: HistoryItem) => void;
}

export function HistoryPanel({ onReuse }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<"all" | "favorites">("all");

  useEffect(() => {
    if (open) setItems(getHistory());
  }, [open]);

  const filtered = filter === "favorites" ? items.filter(i => i.isFavorite) : items;

  const handleToggleFav = (id: string) => {
    setItems(toggleFavorite(id));
  };

  const handleDelete = (id: string) => {
    setItems(deleteHistory(id));
  };

  const handleClear = () => {
    if (confirm("确定清空所有历史? Clear all history?")) {
      clearHistory();
      setItems([]);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}分钟前`;
    if (diffH < 24) return `${diffH}小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}天前`;
    return d.toLocaleDateString();
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
        aria-label="历史记录 History"
      >
        <History size={14} />
        <span className="hidden sm:inline">历史 History</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div className="relative w-full max-w-2xl max-h-[70vh] rounded-2xl border border-white/10 bg-[#0d0f1a] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium text-white">历史记录 History</h3>
                  <div className="flex rounded-lg overflow-hidden border border-white/10">
                    <button
                      onClick={() => setFilter("all")}
                      className={`px-3 py-1 text-xs transition-all ${
                        filter === "all" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                      }`}
                    >
                      全部 All ({items.length})
                    </button>
                    <button
                      onClick={() => setFilter("favorites")}
                      className={`px-3 py-1 text-xs transition-all ${
                        filter === "favorites" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                      }`}
                    >
                      <Star size={10} className="inline mr-1" />
                      收藏 ({items.filter(i => i.isFavorite).length})
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      onClick={handleClear}
                      className="text-xs text-red-400/60 hover:text-red-400 transition-all"
                    >
                      清空 Clear
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
                    aria-label="关闭 Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {filtered.length === 0 ? (
                  <div className="text-center text-white/30 text-sm py-12">
                    {filter === "favorites" ? "暂无收藏 No favorites yet" : "暂无历史 No history yet"}
                  </div>
                ) : (
                  filtered.map(item => (
                    <div
                      key={item.id}
                      className="group rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] p-3 cursor-pointer transition-all"
                      onClick={() => { onReuse(item); setOpen(false); }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 truncate">{item.userIdea}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              {item.targetModel}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-white/30">
                              <Clock size={10} />
                              {formatTime(item.timestamp)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleFav(item.id); }}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                            aria-label={item.isFavorite ? "取消收藏 Unfavorite" : "收藏 Favorite"}
                          >
                            <Star
                              size={14}
                              className={item.isFavorite ? "text-amber-400 fill-amber-400" : "text-white/30"}
                            />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
                            aria-label="删除 Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
