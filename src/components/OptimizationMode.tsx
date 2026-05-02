"use client";

import { type OptimizationMode } from "@/lib/models-registry";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Zap, Target, MessageSquareHeart, ChevronDown } from "lucide-react";
import { useRef, useEffect, useState } from "react";

interface Props {
  selected: OptimizationMode;
  onChange: (m: OptimizationMode) => void;
}

const MODES: {
  id: OptimizationMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    id: "accurate",
    label: "最准确",
    desc: "深度推理，精准输出",
    icon: <Target size={28} />,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/50",
  },
  {
    id: "token",
    label: "最省Token",
    desc: "极简指令，压缩成本",
    icon: <Coins size={28} />,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/50",
  },
  {
    id: "fast",
    label: "最快速",
    desc: "最短延迟，秒级响应",
    icon: <Zap size={28} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/50",
  },
  {
    id: "aligned",
    label: "最符合人类语言",
    desc: "自然表达，高度对齐",
    icon: <MessageSquareHeart size={28} />,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/50",
  },
];

export function OptimizationMode({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedMode = MODES.find((m) => m.id === selected) ?? MODES[0];

  // When panel opens, scroll the selected card into view
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    const idx = MODES.findIndex((m) => m.id === selected);
    if (idx < 0) return;
    // Slight delay so the panel has finished mounting
    const t = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const card = container.children[idx] as HTMLElement;
      if (card) {
        container.scrollTo({ left: card.offsetLeft - 12, behavior: "smooth" });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [open, selected]);

  return (
    <div>
      <h3 className="text-sm font-medium text-white/60 mb-2">优化目标</h3>

      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 transition-all
          ${selectedMode.bg} ${selectedMode.border} ${selectedMode.color}`}
      >
        <div className="flex items-center gap-3">
          {selectedMode.icon}
          <div className="text-left">
            <div className="text-sm font-semibold">{selectedMode.label}</div>
            <div className="text-[10px] opacity-70">{selectedMode.desc}</div>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Swipeable card strip */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Scroll hint dots */}
            <div className="flex justify-center gap-1.5 pt-3 pb-1">
              {MODES.map((m) => (
                <div
                  key={m.id}
                  className={`h-1 rounded-full transition-all duration-200 ${
                    selected === m.id ? `w-4 ${m.color.replace("text-", "bg-")}` : "w-1.5 bg-white/20"
                  }`}
                />
              ))}
            </div>

            {/* Horizontal scroll container */}
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-3 pt-1 px-1"
              style={{
                scrollSnapType: "x mandatory",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {MODES.map((m) => {
                const active = selected === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    style={{ scrollSnapAlign: "start", minWidth: "calc(80% - 6px)", flexShrink: 0 }}
                    className={`flex flex-col items-center justify-center gap-3 rounded-2xl border p-5 text-center transition-all
                      ${active
                        ? `${m.bg} ${m.border} ${m.color} shadow-lg`
                        : "bg-white/[0.03] border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white/70"
                      }`}
                  >
                    <span className={active ? m.color : "text-white/70"}>{m.icon}</span>
                    <div>
                      <div className="text-sm font-semibold mb-1">{m.label}</div>
                      <div className="text-[11px] opacity-70 leading-relaxed">{m.desc}</div>
                    </div>
                    {active && (
                      <div className={`w-2 h-2 rounded-full ${m.color.replace("text-", "bg-")}`} />
                    )}
                  </button>
                );
              })}
            </div>

            <style>{`
              div::-webkit-scrollbar { display: none; }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
