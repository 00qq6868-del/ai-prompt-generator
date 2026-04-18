"use client";

import { motion } from "framer-motion";
import { Copy, Check, Coins, Clock, Zap, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useState } from "react";

interface Stats {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  tokensDelta: number;
  changePercent: number;
}

interface Meta {
  generatorModel: string;
  targetModel: string;
}

interface Props {
  prompt: string;
  stats: Stats;
  meta: Meta;
  generatorModelCost: { input: number; output: number };
}

export function ResultPanel({ prompt, stats, meta, generatorModelCost }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cost = (
    stats.inputTokens  * generatorModelCost.input +
    stats.outputTokens * generatorModelCost.output
  ).toFixed(5);

  const pct       = stats.changePercent;
  const isShorter = pct > 5;
  const isLonger  = pct < -5;
  const isSimilar = !isShorter && !isLonger;

  const changeDisplay = isSimilar
    ? "≈0%"
    : `${pct > 0 ? "+" : ""}${pct}%`;

  const changeColor = isShorter
    ? "text-emerald-400"
    : isLonger
    ? "text-blue-400"
    : "text-amber-400";

  const ChangeIcon = isShorter ? TrendingDown : isLonger ? TrendingUp : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          icon={<Zap size={14} className="text-blue-400" />}
          label="响应时间 Response"
          value={`${(stats.latencyMs / 1000).toFixed(2)}s`}
        />
        <StatCard
          icon={<Coins size={14} className="text-amber-400" />}
          label="Token消耗 Usage"
          value={`${stats.inputTokens + stats.outputTokens}`}
        />
        <StatCard
          icon={<ChangeIcon size={14} className={changeColor} />}
          label="长度变化 Change"
          value={changeDisplay}
          valueClass={changeColor}
        />
        <StatCard
          icon={<Clock size={14} className="text-violet-400" />}
          label="估算费用 Cost"
          value={`$${cost}`}
        />
      </div>

      {/* Prompt output */}
      <div className="relative rounded-2xl border border-indigo-500/20 bg-indigo-950/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="text-indigo-400 font-medium">{meta.generatorModel}</span>
            <span>→ 为</span>
            <span className="text-violet-400 font-medium">{meta.targetModel}</span>
            <span>优化生成</span>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={copy}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all
              ${copied
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white border border-white/10"
              }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "已复制 Copied!" : "复制提示词 Copy"}
          </motion.button>
        </div>

        <pre className="whitespace-pre-wrap font-sans text-sm text-white/85 leading-relaxed p-5 max-h-80 overflow-y-auto">
          {prompt}
        </pre>
      </div>
    </motion.div>
  );
}

function StatCard({
  icon, label, value, valueClass = "text-white",
}: {
  icon: React.ReactNode; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/[0.08] px-3 py-2.5">
      {icon}
      <div>
        <div className="text-[10px] text-white/40">{label}</div>
        <div className={`text-sm font-semibold ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}
