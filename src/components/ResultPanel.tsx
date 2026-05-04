"use client";

import { motion } from "framer-motion";
import { Copy, Check, Coins, Clock, Zap, TrendingDown, TrendingUp, Minus, ArrowLeftRight } from "lucide-react";
import { useState } from "react";

interface Stats {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  tokensDelta: number;
  changePercent: number;
  estimatedCostUsd?: number;
}

interface Meta {
  generatorModel: string;
  targetModel: string;
  reviewSummary?: string;
  judgeModels?: string[];
  selectedStrategy?: string;
  modelHealth?: {
    skippedCooling?: Array<{ modelId: string; modelName?: string; cooldownUntil: number; lastError: string }>;
    failed?: Array<{ modelId: string; modelName?: string; lastError: string }>;
    successful?: Array<{ modelId: string; modelName?: string; latencyMs: number }>;
  };
  promptEvaluation?: {
    candidates: Array<{
      id: string;
      generatorModelId: string;
      generatorModelName: string;
      averageScore: number;
      rank: number;
      scores: Array<{ judgeModel: string; score: number; reason: string }>;
    }>;
    judgeModels: string[];
    selectedCandidateId: string;
    summary: string;
    sourceCommits?: string[];
  };
}

interface Props {
  prompt: string;
  stats: Stats;
  meta: Meta;
  generatorModelCost: { input: number; output: number };
  originalPrompt?: string;
}

export function ResultPanel({ prompt, stats, meta, generatorModelCost, originalPrompt }: Props) {
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cost = (
    stats.estimatedCostUsd ??
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
      <div role="region" aria-label="优化结果 Optimized prompt" className="relative rounded-2xl border border-indigo-500/20 bg-indigo-950/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="text-indigo-400 font-medium">{meta.generatorModel}</span>
            <span>→ 为</span>
            <span className="text-violet-400 font-medium">{meta.targetModel}</span>
            <span>优化生成</span>
          </div>
          <div className="flex items-center gap-2">
            {originalPrompt && (
              <button
                onClick={() => setShowDiff(d => !d)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border
                  ${showDiff
                    ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                    : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white border-white/10"
                  }`}
                aria-label={showDiff ? "隐藏对比 Hide comparison" : "显示对比 Show comparison"}
              >
                <ArrowLeftRight size={12} />
                {showDiff ? "隐藏对比" : "对比原文"}
              </button>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={copy}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all
                ${copied
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white border border-white/10"
                }`}
              aria-label={copied ? "已复制 Copied" : "复制提示词 Copy prompt"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "已复制 Copied!" : "复制提示词 Copy"}
            </motion.button>
          </div>
        </div>

        {showDiff && originalPrompt ? (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="p-4">
              <div className="text-[10px] font-medium text-white/70 uppercase tracking-wider mb-2">
                原始输入 Original
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-white/50 leading-relaxed max-h-72 overflow-y-auto">
                {originalPrompt}
              </pre>
            </div>
            <div className="p-4">
              <div className="text-[10px] font-medium text-indigo-400/70 uppercase tracking-wider mb-2">
                优化结果 Optimized
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-white/85 leading-relaxed max-h-72 overflow-y-auto">
                {prompt}
              </pre>
            </div>
          </div>
        ) : (
          <>
            {meta.reviewSummary && (
              <div className="px-5 pt-4 text-xs text-indigo-200/70">
                {meta.reviewSummary}
                {meta.selectedStrategy && (
                  <span className="text-white/45"> · {meta.selectedStrategy}</span>
                )}
              </div>
            )}
            {(meta.modelHealth?.skippedCooling?.length || meta.modelHealth?.failed?.length) && (
              <div className="mx-5 mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
                已自动处理不稳定模型：
                {meta.modelHealth?.skippedCooling?.length ? ` 冷却跳过 ${meta.modelHealth.skippedCooling.length} 个` : ""}
                {meta.modelHealth?.failed?.length ? `，本次失败但未中断 ${meta.modelHealth.failed.length} 个` : ""}
                。冷却结束后会自动再试，成功后恢复使用。
              </div>
            )}
            {meta.promptEvaluation && (
              <div className="mx-5 mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-white/80">
                    AI 评价打分 Evaluation
                  </div>
                  <div className="text-[10px] text-white/50">
                    满分 100 · {meta.promptEvaluation.judgeModels.length || 0} 个评价模型
                  </div>
                </div>
                <div className="space-y-2">
                  {meta.promptEvaluation.candidates.slice(0, 6).map((candidate) => {
                    const score = Math.round(candidate.averageScore);
                    const selected = candidate.id === meta.promptEvaluation?.selectedCandidateId;
                    return (
                      <div key={candidate.id} className={`rounded-lg border px-3 py-2 ${selected ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/8 bg-white/[0.025]"}`}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <div className="min-w-0 truncate text-xs text-white/75">
                            #{candidate.rank} {candidate.generatorModelName}
                            {selected && <span className="ml-2 text-indigo-300">已采用 Selected</span>}
                          </div>
                          <div className="font-mono text-xs font-semibold text-white">{score}/100</div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                          />
                        </div>
                        {candidate.scores[0]?.reason && (
                          <div className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-white/50">
                            {candidate.scores[0].reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {meta.promptEvaluation.summary && (
                  <div className="mt-2 text-[10px] leading-4 text-white/55">
                    {meta.promptEvaluation.summary}
                  </div>
                )}
              </div>
            )}
            <pre className="whitespace-pre-wrap font-sans text-sm text-white/85 leading-relaxed p-5 max-h-80 overflow-y-auto">
              {prompt}
            </pre>
          </>
        )}
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
        <div className="text-[10px] text-white/65">{label}</div>
        <div className={`text-sm font-semibold ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}
