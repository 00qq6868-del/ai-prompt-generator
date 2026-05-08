"use client";

import { motion } from "framer-motion";
import { Copy, Check, Coins, Clock, Zap, TrendingDown, TrendingUp, Minus, ArrowLeftRight, Star, MessageSquare, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import type { PromptPreference } from "@/lib/prompt-feedback";

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
    rubric?: Array<{
      id: string;
      label: string;
      labelZh?: string;
      weight: number;
      guide: string;
      guideZh?: string;
    }>;
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
  strictScore?: StrictScore;
  persistenceWarning?: string;
  referenceImage?: {
    enabled?: boolean;
    width?: number;
    height?: number;
    aspectRatio?: string;
    palette?: string[];
    averageColor?: string;
    brightness?: string;
    contrast?: string;
    saturation?: string;
    selectedSource?: string;
    internalBestScore?: number;
    qualityGate?: string;
    analysisChannels?: Array<{
      source: string;
      modelId: string;
      modelName: string;
      available: boolean;
      error?: string;
    }>;
  };
}

interface Props {
  prompt: string;
  promptId?: string;
  versionId?: string;
  stats: Stats;
  meta: Meta;
  strictScore?: StrictScore;
  generatorModelCost: { input: number; output: number };
  originalPrompt?: string;
  previousPrompt?: string;
  onSubmitFeedback?: (payload: {
    userScore: number;
    starRating?: number;
    userNotes: string;
    preference: PromptPreference;
    selectedPrompt: string;
  }) => Promise<void>;
}

interface StrictScore {
  total: number;
  pass: boolean;
  scoreType: "prompt" | "image" | "combined";
  dimensionScores: Record<string, number>;
  deductions: Array<{ dimension: string; reason: string; score: number }>;
}

const STRICT_DIMENSION_LABELS: Record<string, string> = {
  intent_fidelity: "意图保真 Intent",
  detail_coverage: "细节覆盖 Detail",
  target_model_fit: "模型适配 Fit",
  structure_completeness: "结构完整 Structure",
  specificity_control: "可控性 Control",
  negative_constraints: "负面约束 Negative",
  output_format_clarity: "输出清晰 Format",
  evaluation_readiness: "可评测 Eval",
  hallucination_resistance: "幻觉防护 Anti-hallucination",
  generation_stability: "稳定性 Stability",
  reference_image_consistency: "参考图一致 Reference",
};

export function ResultPanel({ prompt, promptId, versionId, stats, meta, strictScore, generatorModelCost, originalPrompt, previousPrompt, onSubmitFeedback }: Props) {
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [starRating, setStarRating] = useState(3);
  const [userNotes, setUserNotes] = useState("");
  const [preference, setPreference] = useState<PromptPreference>("new");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const activeStrictScore = strictScore ?? meta.strictScore;

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
  const selectedPrompt = preference === "old" && previousPrompt ? previousPrompt : prompt;

  const submitFeedback = async () => {
    if (!onSubmitFeedback) return;
    setSavingFeedback(true);
    try {
      await onSubmitFeedback({
        userScore: starRating * 20,
        starRating,
        userNotes,
        preference,
        selectedPrompt,
      });
      setFeedbackSaved(true);
    } finally {
      setSavingFeedback(false);
    }
  };

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
            {promptId && <span className="hidden text-white/35 sm:inline">· version {versionId?.slice(0, 8)}</span>}
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
                模型健康 Model health：
                {meta.modelHealth?.successful?.length ? ` 成功 ${meta.modelHealth.successful.length} 个` : " 成功 0 个"}
                {meta.modelHealth?.skippedCooling?.length ? ` 冷却跳过 ${meta.modelHealth.skippedCooling.length} 个` : ""}
                {meta.modelHealth?.failed?.length ? `，本次失败但未中断 ${meta.modelHealth.failed.length} 个` : ""}
                。会等待可用模型完整输出，持续失败的模型冷却后再试。 Successful models are waited for; repeatedly failing models cool down before retry.
              </div>
            )}
            {meta.persistenceWarning && (
              <div className="mx-5 mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
                {meta.persistenceWarning}
              </div>
            )}
            {meta.referenceImage?.enabled && (
              <details className="mx-5 mt-4 rounded-xl border border-cyan-300/15 bg-cyan-500/10 p-3 text-xs text-cyan-50/80">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-cyan-100">
                  <ImageIcon size={14} />
                  参考图优化摘要 Reference image summary
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-black/10 px-2.5 py-2">
                    尺寸/画幅：{meta.referenceImage.width}x{meta.referenceImage.height} · {meta.referenceImage.aspectRatio}
                  </div>
                  <div className="rounded-lg bg-black/10 px-2.5 py-2">
                    内部质量门：{Math.round(meta.referenceImage.internalBestScore ?? 0)}/100 · {meta.referenceImage.qualityGate}
                  </div>
                  <div className="rounded-lg bg-black/10 px-2.5 py-2">
                    色彩：{meta.referenceImage.averageColor} · {meta.referenceImage.brightness}/{meta.referenceImage.contrast}/{meta.referenceImage.saturation}
                  </div>
                  <div className="rounded-lg bg-black/10 px-2.5 py-2">
                    采用路径：{meta.referenceImage.selectedSource}
                  </div>
                </div>
                {meta.referenceImage.palette?.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {meta.referenceImage.palette.slice(0, 6).map((color) => (
                      <span
                        key={color}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/10 px-2 py-1 font-mono text-[10px]"
                      >
                        <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                        {color}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] leading-4 text-cyan-50/55">
                  普通模式隐藏内部失败候选和原始错误，只展示通过内部择优后的最佳提示词。
                </div>
              </details>
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
                {meta.promptEvaluation.rubric?.length ? (
                  <div className="mb-3 rounded-lg border border-white/8 bg-black/10 p-2.5">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                      评分标准 Scoring Criteria
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {meta.promptEvaluation.rubric.map((item) => (
                        <div key={item.id} className="rounded-md bg-white/[0.025] px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-white/75">
                            <span className="min-w-0 truncate">
                              {item.labelZh ? `${item.labelZh} ` : ""}{item.label}
                            </span>
                            <span className="shrink-0 font-mono text-indigo-300">{item.weight}</span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/45">
                            {item.guideZh ? `${item.guideZh} / ` : ""}{item.guide}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
            {activeStrictScore && (
              <div className="mx-5 mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-white/85">
                    严格评分 Strict Score
                  </div>
                  <div className={`font-mono text-sm font-bold ${activeStrictScore.pass ? "text-emerald-300" : "text-rose-300"}`}>
                    {activeStrictScore.total}/100 · {activeStrictScore.pass ? "通过 Pass" : "不合格 Fail"}
                  </div>
                </div>
                <div className="mb-2 text-[10px] leading-4 text-white/55">
                  60 分只是及格线；任一核心维度低于 3/10 直接不合格。不要因为提示词很长或画面漂亮就给高分。
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {Object.entries(activeStrictScore.dimensionScores).slice(0, 12).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-white/8 bg-black/10 px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-white/70">
                        <span className="min-w-0 truncate">{STRICT_DIMENSION_LABELS[key] ?? key}</span>
                        <span className="font-mono text-white/80">{Number(value).toFixed(1)}/10</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${value < 3 ? "bg-rose-400" : value < 6 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${Math.max(0, Math.min(100, Number(value) * 10))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {activeStrictScore.deductions.length > 0 && (
                  <div className="mt-2 rounded-lg border border-rose-300/15 bg-black/15 p-2 text-[10px] leading-4 text-rose-100/80">
                    扣分依据 Deductions：
                    {activeStrictScore.deductions.slice(0, 5).map((item) => (
                      <span key={`${item.dimension}-${item.reason}`} className="ml-1">
                        {STRICT_DIMENSION_LABELS[item.dimension] ?? item.dimension} {item.score}/10 ({item.reason});
                      </span>
                    ))}
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

      {onSubmitFeedback && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                <Star size={15} className="text-amber-300" />
                给这条 AI 提示词打分 1-5 Stars
              </div>
              <p className="mt-1 text-xs leading-5 text-white/55">
                你的评分会进入本机反馈记忆；如果服务器配置了 GitHub token，也会作为优化材料同步到 GitHub。
              </p>
            </div>
            <div className="font-mono text-lg font-bold text-indigo-300">{starRating}/5</div>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="提示词星级评分 Prompt star rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={starRating === value}
                onClick={() => setStarRating(value)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all
                  ${starRating >= value
                    ? "border-amber-300/50 bg-amber-400/15 text-amber-200"
                    : "border-white/10 bg-white/[0.03] text-white/35 hover:text-white/70"
                  }`}
                aria-label={`${value} 星 ${value} stars`}
              >
                <Star size={18} fill={starRating >= value ? "currentColor" : "none"} />
              </button>
            ))}
            <span className="ml-1 text-xs text-white/50">
              {starRating <= 2 ? "不满意，会触发更严格优化" : starRating === 3 ? "一般，需要继续打磨" : "较满意，仍可记录细节"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
            {[
              { id: "new" as const, label: "新版更好", hint: "采用新版" },
              { id: "old" as const, label: "旧版更好", hint: previousPrompt ? "保留旧版" : "暂无旧版" },
              { id: "blend" as const, label: "折中改进", hint: "融合新旧优点" },
              { id: "both_bad" as const, label: "两版都不好", hint: "重做方向" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.id === "old" && !previousPrompt}
                onClick={() => setPreference(item.id)}
                className={`rounded-xl border px-3 py-2 text-left transition-all
                  ${preference === item.id
                    ? "border-indigo-400/50 bg-indigo-500/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
                  }
                  ${item.id === "old" && !previousPrompt ? "cursor-not-allowed opacity-45" : ""}
                `}
              >
                <div className="text-xs font-semibold">{item.label}</div>
                <div className="mt-0.5 text-[10px] text-white/45">{item.hint}</div>
              </button>
            ))}
          </div>

          {previousPrompt && (
            <div className="mt-3 rounded-xl border border-white/8 bg-black/10 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                旧版提示词 Previous version
              </div>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-white/45">
                {previousPrompt}
              </pre>
            </div>
          )}

          <label className="mt-3 block text-xs font-medium text-white/60">
            你的评价：哪里好、哪里不好、哪里虚高、哪里要更抠细节
          </label>
          <div className="mt-2 flex gap-2">
            <div className="mt-3 hidden shrink-0 text-white/35 sm:block">
              <MessageSquare size={16} />
            </div>
            <textarea
              value={userNotes}
              onChange={(event) => setUserNotes(event.target.value)}
              rows={3}
              placeholder="例如：评分太高，手部不自然，文字不清楚，提示词没有保留参考图五官，服装不符合角色，商业感不足..."
              aria-label="提示词评价 Prompt feedback notes"
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-500/50"
            />
          </div>

          <button
            type="button"
            onClick={submitFeedback}
            disabled={savingFeedback}
            className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingFeedback ? "保存中..." : feedbackSaved ? "已保存，可继续修改再保存" : "保存评分与评价"}
          </button>
        </div>
      )}
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
