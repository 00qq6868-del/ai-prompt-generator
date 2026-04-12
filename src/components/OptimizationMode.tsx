"use client";

import { type OptimizationMode } from "@/lib/models-registry";
import { motion } from "framer-motion";
import { Coins, Zap, Target, MessageSquareHeart } from "lucide-react";

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
}[] = [
  {
    id: "token",
    label: "最省Token",
    desc: "极简指令，压缩成本",
    icon: <Coins size={18} />,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  {
    id: "fast",
    label: "最快速",
    desc: "最短延迟，秒级响应",
    icon: <Zap size={18} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
  },
  {
    id: "accurate",
    label: "最准确",
    desc: "深度推理，精准输出",
    icon: <Target size={18} />,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/30",
  },
  {
    id: "aligned",
    label: "最符合人类语言",
    desc: "自然表达，高度对齐",
    icon: <MessageSquareHeart size={18} />,
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/30",
  },
];

export function OptimizationMode({ selected, onChange }: Props) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white/60 mb-3">优化目标</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODES.map((m) => {
          const active = selected === m.id;
          return (
            <motion.button
              key={m.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(m.id)}
              className={`relative flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-center transition-all duration-200
                ${active ? `${m.bg} ${m.color} shadow-lg` : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"}`}
            >
              {active && (
                <motion.div
                  layoutId="mode-ring"
                  className={`absolute inset-0 rounded-2xl border-2 ${m.bg.replace("bg-", "border-").replace("/10", "/60")}`}
                />
              )}
              <span className={active ? m.color : "text-white/40"}>{m.icon}</span>
              <span className="text-xs font-semibold leading-tight">{m.label}</span>
              <span className="text-[10px] leading-tight opacity-70">{m.desc}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
