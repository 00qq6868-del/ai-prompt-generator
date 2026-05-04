import { callProvider, GenerateResult } from "@/lib/providers";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { resolveRuntimeApiProvider } from "@/lib/gpt-image-2-ensemble";
import { isRelayModelListed } from "@/lib/relay-models";
import {
  ModelHealthIssue,
  ModelHealthMeta,
  getModelTimeoutMs,
  recordModelFailure,
  recordModelSuccess,
  splitCoolingPlans,
  withTimeout,
} from "@/lib/model-health";
import {
  PROMPT_EVALUATION_RUBRIC,
  PROMPT_SOURCE_LIBRARY_COMMITS,
  PROMPT_SOURCE_LIBRARY_STATUS,
} from "@/lib/prompt-source-library-status";

export interface PromptGenerationProgress {
  phase: string;
  current?: number;
  total?: number;
  etaSec?: number;
  elapsedSec?: number;
  message?: string;
}

interface PromptTournamentOptions {
  userIdea: string;
  language: "zh" | "en";
  targetModel: ModelInfo;
  generatorModels: ModelInfo[];
  evaluatorModels: ModelInfo[];
  models: ModelInfo[];
  userKeys: Record<string, string>;
  availableModelIds?: string[];
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  onProgress?: (event: PromptGenerationProgress) => void;
}

interface Candidate {
  id: string;
  generatorModelId: string;
  generatorModelName: string;
  prompt: string;
}

interface JudgeScorePayload {
  scores?: Array<{
    candidateId?: string;
    score?: number;
    reason?: string;
  }>;
  winnerId?: string;
  summary?: string;
}

type PromptEvaluationRubricItem = (typeof PROMPT_EVALUATION_RUBRIC)[number] & {
  labelZh?: string;
  guideZh?: string;
};

export interface PromptEvaluationScore {
  judgeModel: string;
  score: number;
  reason: string;
}

export interface PromptEvaluationCandidate {
  id: string;
  generatorModelId: string;
  generatorModelName: string;
  averageScore: number;
  rank: number;
  scores: PromptEvaluationScore[];
}

export interface PromptEvaluationReport {
  rubric: Array<{ id: string; label: string; labelZh?: string; weight: number; guide: string; guideZh?: string }>;
  sourceCommits: string[];
  candidates: PromptEvaluationCandidate[];
  judgeModels: string[];
  selectedCandidateId: string;
  summary: string;
}

export interface PromptTournamentResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  totalCostUsd: number;
  meta: {
    reviewSummary: string;
    judgeModels: string[];
    selectedStrategy: string;
    promptEvaluation: PromptEvaluationReport;
    modelHealth: ModelHealthMeta;
  };
}

const AUTO_JUDGE_PREFERENCE = [
  "gpt-5.5-pro",
  "gpt-5.5",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "gemini-3.1-pro-preview",
  "deepseek-v4-pro",
  "o3-pro",
  "o3",
  "o4-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4o-mini",
];

function hasKey(name: string, userKeys: Record<string, string>): boolean {
  return Boolean(userKeys[name]?.trim() || process.env[name]?.trim());
}

function hasCustomRelay(userKeys: Record<string, string>): boolean {
  return hasKey("CUSTOM_API_KEY", userKeys) && Boolean(userKeys.CUSTOM_BASE_URL?.trim() || process.env.CUSTOM_BASE_URL?.trim());
}

function isProviderCallable(apiProvider: string, userKeys: Record<string, string>): boolean {
  switch (apiProvider) {
    case "custom":
      return hasCustomRelay(userKeys);
    case "aihubmix":
      return hasCustomRelay(userKeys) || hasKey("AIHUBMIX_API_KEY", userKeys);
    case "openai":
      return hasKey("OPENAI_API_KEY", userKeys);
    case "anthropic":
      return hasKey("ANTHROPIC_API_KEY", userKeys);
    case "google":
      return hasKey("GOOGLE_API_KEY", userKeys);
    case "deepseek":
      return hasKey("DEEPSEEK_API_KEY", userKeys);
    case "groq":
      return hasKey("GROQ_API_KEY", userKeys);
    case "mistral":
      return hasKey("MISTRAL_API_KEY", userKeys);
    case "xai":
      return hasKey("XAI_API_KEY", userKeys);
    case "zhipu":
      return hasKey("ZHIPU_API_KEY", userKeys);
    case "moonshot":
      return hasKey("MOONSHOT_API_KEY", userKeys);
    case "qwen":
      return hasKey("QWEN_API_KEY", userKeys);
    case "baidu":
      return hasKey("BAIDU_API_KEY", userKeys) && hasKey("BAIDU_SECRET_KEY", userKeys);
    case "ollama":
      return true;
    default:
      return false;
  }
}

function modelCost(model: ModelInfo, result: GenerateResult): number {
  return (
    result.inputTokens * (model.inputCostPer1M / 1_000_000) +
    result.outputTokens * (model.outputCostPer1M / 1_000_000)
  );
}

function progress(opts: PromptTournamentOptions, startedAt: number, event: Omit<PromptGenerationProgress, "elapsedSec">) {
  opts.onProgress?.({
    elapsedSec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    ...event,
  });
}

function estimateTournamentEtaSec(phase: "generators" | "judges" | "final", total: number, current: number): number {
  if (phase === "generators") return Math.max(10, 45 - Math.floor((current / Math.max(total, 1)) * 24));
  if (phase === "judges") return Math.max(8, 30 - Math.floor((current / Math.max(total, 1)) * 18));
  return 5;
}

function planModels(models: ModelInfo[], opts: PromptTournamentOptions): Array<{ model: ModelInfo; apiProvider: string }> {
  return models
    .slice(0, 6)
    .map((model) => ({
      model,
      apiProvider: resolveRuntimeApiProvider(model, opts.userKeys, opts.availableModelIds),
    }))
    .filter((plan) => isProviderCallable(plan.apiProvider, opts.userKeys));
}

function selectFallbackGeneratorPlans(
  opts: PromptTournamentOptions,
  existingModelIds: Set<string>,
  needed: number,
): { plans: Array<{ model: ModelInfo; apiProvider: string }>; skippedCooling: ModelHealthIssue[] } {
  if (needed <= 0) return { plans: [], skippedCooling: [] };
  const candidates = opts.models
    .filter((model) => (model.category ?? "text") === "text")
    .filter((model) => !existingModelIds.has(model.id))
    .filter((model) => !opts.availableModelIds?.length || isRelayModelListed(opts.availableModelIds, model.id) || model.apiProvider !== "aihubmix")
    .sort((a, b) => scoreModel(b, "fast") + scoreModel(b, "accurate") - (scoreModel(a, "fast") + scoreModel(a, "accurate")));

  const rawPlans = planModels(candidates, opts);
  const split = splitCoolingPlans(rawPlans);
  return {
    plans: split.runnable.slice(0, needed),
    skippedCooling: split.skippedCooling,
  };
}

function safeParseJson<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function selectEvaluatorPlans(opts: PromptTournamentOptions): Array<{ model: ModelInfo; apiProvider: string }> {
  const chosen: Array<{ model: ModelInfo; apiProvider: string }> = [];
  const seen = new Set<string>();

  const add = (model: ModelInfo | undefined) => {
    if (!model || seen.has(model.id)) return;
    if ((model.category ?? "text") !== "text") return;
    const apiProvider = resolveRuntimeApiProvider(model, opts.userKeys, opts.availableModelIds);
    if (opts.availableModelIds?.length && (apiProvider === "custom" || apiProvider === "aihubmix") && !isRelayModelListed(opts.availableModelIds, model.id)) return;
    if (!isProviderCallable(apiProvider, opts.userKeys)) return;
    chosen.push({ model, apiProvider });
    seen.add(model.id);
  };

  for (const model of opts.evaluatorModels.slice(0, 6)) add(model);
  if (chosen.length > 0) return chosen.slice(0, 6);

  for (const id of AUTO_JUDGE_PREFERENCE) {
    add(opts.models.find((model) => model.id === id));
    if (chosen.length >= 3) return chosen;
  }

  const fallback = opts.models
    .filter((model) => (model.category ?? "text") === "text")
    .filter((model) => !opts.availableModelIds?.length || isRelayModelListed(opts.availableModelIds, model.id) || model.apiProvider !== "aihubmix")
    .sort((a, b) => scoreModel(b, "accurate") - scoreModel(a, "accurate"));

  for (const model of fallback) {
    add(model);
    if (chosen.length >= 3) return chosen;
  }

  for (const model of opts.generatorModels) {
    add(model);
    if (chosen.length > 0) return chosen;
  }

  return chosen;
}

function buildJudgePrompt(candidates: Candidate[], opts: PromptTournamentOptions): string {
  const outputLanguage = opts.language === "zh" ? "Chinese" : "English";
  const topSources = PROMPT_SOURCE_LIBRARY_STATUS
    .slice(0, 10)
    .map((source, index) => `${index + 1}. ${source.repo} (${source.stars} stars): ${source.focus}`)
    .join("\n");
  const rubric = PROMPT_EVALUATION_RUBRIC
    .map((item) => `- ${item.label} (${item.weight}): ${item.guide}`)
    .join("\n");

  return `You are evaluating optimized prompts for a production AI prompt generator.

Original user idea:
${opts.userIdea}

Target model:
${opts.targetModel.name} (${opts.targetModel.provider}, category: ${opts.targetModel.category ?? "text"})

Reference source groups used to design the scoring rubric:
${topSources}

Important safety boundary:
- Use adversarial/leaked-prompt repositories only as defensive failure-mode references.
- Do not reward jailbreak, credential extraction, system-prompt exfiltration, or policy-bypass content.

Scoring rubric totals 100 points:
${rubric}

Strict score calibration:
- 95-100: production-ready prompt with no important missing detail, clear checks, and strong target-model fit.
- 85-94: strong prompt with only minor low-risk gaps.
- 70-84: usable draft, but missing notable constraints, examples, edge cases, or failure-mode controls.
- 50-69: significant user details, target-model behavior, safety, or output usability are under-specified.
- below 50: likely fails the user's intent.
- Penalize score inflation. Do not reward long prompts that merely restate the user without adding control, verifiability, or failure prevention.

Candidate prompts:
${JSON.stringify(candidates, null, 2)}

Score every candidate from 0 to 100. Penalize hallucinated requirements, missing user details, unsupported target-model syntax, unsafe prompt-injection patterns, vague instructions, and unusable formatting.

Return STRICT JSON only in ${outputLanguage}:
{
  "scores": [
    { "candidateId": "c1", "score": 0, "reason": "short reason" }
  ],
  "winnerId": "candidate id",
  "summary": "one sentence summary"
}`;
}

function aggregateCandidates(candidates: Candidate[], judgeOutputs: Array<{ judgeModel: string; payload: JudgeScorePayload }>): PromptEvaluationCandidate[] {
  const buckets = new Map<string, PromptEvaluationCandidate>();
  for (const candidate of candidates) {
    buckets.set(candidate.id, {
      id: candidate.id,
      generatorModelId: candidate.generatorModelId,
      generatorModelName: candidate.generatorModelName,
      averageScore: 0,
      rank: 0,
      scores: [],
    });
  }

  for (const output of judgeOutputs) {
    for (const item of output.payload.scores ?? []) {
      if (!item.candidateId || typeof item.score !== "number") continue;
      const bucket = buckets.get(item.candidateId);
      if (!bucket) continue;
      bucket.scores.push({
        judgeModel: output.judgeModel,
        score: Math.max(0, Math.min(100, item.score)),
        reason: item.reason?.trim() || "",
      });
    }
  }

  const rows = [...buckets.values()].map((candidate) => ({
    ...candidate,
    averageScore: candidate.scores.length
      ? candidate.scores.reduce((sum, item) => sum + item.score, 0) / candidate.scores.length
      : 0,
  }));

  rows.sort((a, b) => b.averageScore - a.averageScore);
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

export async function runPromptTournament(opts: PromptTournamentOptions): Promise<PromptTournamentResult> {
  const startedAt = Date.now();
  const calls: Array<{ model: ModelInfo; result: GenerateResult }> = [];
  const modelHealth: ModelHealthMeta = {
    skippedCooling: [],
    failed: [],
    successful: [],
  };

  const selectedGeneratorPlans = planModels(opts.generatorModels, opts);
  const generatorSplit = splitCoolingPlans(selectedGeneratorPlans);
  modelHealth.skippedCooling.push(...generatorSplit.skippedCooling);
  let generatorPlans = generatorSplit.runnable;

  if (generatorPlans.length === 0) {
    const fallback = selectFallbackGeneratorPlans(
      opts,
      new Set(opts.generatorModels.map((model) => model.id)),
      2,
    );
    generatorPlans = fallback.plans;
    modelHealth.skippedCooling.push(...fallback.skippedCooling);
  }

  if (generatorPlans.length === 0) {
    const skippedText = modelHealth.skippedCooling
      .map((issue) => issue.modelName ?? issue.modelId)
      .join(", ");
    throw new Error(
      skippedText
        ? `所选生成器模型暂时不稳定，已自动冷却：${skippedText}。请稍后重试或换一个模型。`
        : "没有可调用的生成器模型 / No callable generator model",
    );
  }

  let finishedGenerators = 0;
  progress(opts, startedAt, {
    phase: "生成候选提示词",
    current: 0,
    total: generatorPlans.length,
    etaSec: estimateTournamentEtaSec("generators", generatorPlans.length, 0),
    message: "会等待可用模型完整输出；持续失败或已冷却的模型才会跳过。",
  });

  const generatorResults = await Promise.allSettled(
    generatorPlans.map(async (plan, index) => {
      const callStartedAt = Date.now();
      try {
        const result = await withTimeout(
          callProvider({
            model: plan.model.id,
            apiProvider: plan.apiProvider,
            systemPrompt: opts.systemPrompt,
            userPrompt: opts.userPrompt,
            maxTokens: opts.maxTokens,
            temperature: 0.5,
            userKeys: opts.userKeys,
          }),
          getModelTimeoutMs(plan.model, "generator", { startedAt, reserveMs: 75_000 }),
          `${plan.model.name} generator`,
        );
        calls.push({ model: plan.model, result });
        modelHealth.successful.push(recordModelSuccess(
          plan.model,
          plan.apiProvider,
          result.latencyMs || Date.now() - callStartedAt,
        ));
        return {
          id: `c${index + 1}`,
          generatorModelId: plan.model.id,
          generatorModelName: plan.model.name,
          prompt: result.text.trim(),
        } satisfies Candidate;
      } catch (err) {
        modelHealth.failed.push(recordModelFailure(plan.model, plan.apiProvider, err));
        throw err;
      } finally {
        finishedGenerators += 1;
        progress(opts, startedAt, {
          phase: "生成候选提示词",
          current: finishedGenerators,
          total: generatorPlans.length,
          etaSec: estimateTournamentEtaSec("generators", generatorPlans.length, finishedGenerators),
        });
      }
    }),
  );

  let candidates = generatorResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((candidate): candidate is Candidate => Boolean(candidate?.prompt));

  if (candidates.length === 0) {
    const fallback = selectFallbackGeneratorPlans(
      opts,
      new Set([...opts.generatorModels.map((model) => model.id), ...generatorPlans.map((plan) => plan.model.id)]),
      1,
    );
    modelHealth.skippedCooling.push(...fallback.skippedCooling);
    if (fallback.plans[0]) {
      const plan = fallback.plans[0];
      progress(opts, startedAt, {
        phase: "主生成模型失败，切换备用模型",
        current: 0,
        total: 1,
        etaSec: 35,
        message: `正在改用 ${plan.model.name} 继续生成。`,
      });
      const callStartedAt = Date.now();
      try {
        const result = await withTimeout(
          callProvider({
            model: plan.model.id,
            apiProvider: plan.apiProvider,
            systemPrompt: opts.systemPrompt,
            userPrompt: opts.userPrompt,
            maxTokens: opts.maxTokens,
            temperature: 0.5,
            userKeys: opts.userKeys,
          }),
          getModelTimeoutMs(plan.model, "generator", { startedAt, reserveMs: 75_000 }),
          `${plan.model.name} fallback generator`,
        );
        calls.push({ model: plan.model, result });
        modelHealth.successful.push(recordModelSuccess(
          plan.model,
          plan.apiProvider,
          result.latencyMs || Date.now() - callStartedAt,
        ));
        candidates = [{
          id: "c-fallback",
          generatorModelId: plan.model.id,
          generatorModelName: plan.model.name,
          prompt: result.text.trim(),
        }];
      } catch (err) {
        modelHealth.failed.push(recordModelFailure(plan.model, plan.apiProvider, err));
      }
    }
  }

  if (candidates.length === 0) {
    const firstError = generatorResults.find((result) => result.status === "rejected");
    const reason = firstError && firstError.status === "rejected" ? firstError.reason : null;
    const failedText = modelHealth.failed
      .map((issue) => `${issue.modelName ?? issue.modelId}: ${issue.lastError}`)
      .join("；");
    throw new Error(
      failedText
        ? `所有生成器模型都失败了，已临时跳过不稳定模型：${failedText}`
        : reason?.message ?? "所有生成器模型都失败了 / All generator models failed",
    );
  }

  const evaluatorSplit = splitCoolingPlans(selectEvaluatorPlans(opts));
  modelHealth.skippedCooling.push(...evaluatorSplit.skippedCooling);
  const evaluatorPlans = evaluatorSplit.runnable;
  let finishedJudges = 0;
  progress(opts, startedAt, {
    phase: evaluatorPlans.length > 0 ? "AI 评价打分" : "整理最终结果",
    current: 0,
    total: evaluatorPlans.length,
    etaSec: evaluatorPlans.length > 0 ? estimateTournamentEtaSec("judges", evaluatorPlans.length, 0) : 5,
  });

  const judgeResults = await Promise.allSettled(
    evaluatorPlans.map(async (plan) => {
      const callStartedAt = Date.now();
      try {
        const result = await withTimeout(
          callProvider({
            model: plan.model.id,
            apiProvider: plan.apiProvider,
            systemPrompt: "You are a strict prompt quality evaluator. Output strict JSON only.",
            userPrompt: buildJudgePrompt(candidates, opts),
            maxTokens: 1800,
            temperature: 0.1,
            userKeys: opts.userKeys,
          }),
          getModelTimeoutMs(plan.model, "judge", { startedAt, reserveMs: 35_000 }),
          `${plan.model.name} judge`,
        );
        calls.push({ model: plan.model, result });
        modelHealth.successful.push(recordModelSuccess(
          plan.model,
          plan.apiProvider,
          result.latencyMs || Date.now() - callStartedAt,
        ));
        return {
          judgeModel: plan.model.name,
          payload: safeParseJson<JudgeScorePayload>(result.text) ?? {},
        };
      } catch (err) {
        modelHealth.failed.push(recordModelFailure(plan.model, plan.apiProvider, err));
        throw err;
      } finally {
        finishedJudges += 1;
        progress(opts, startedAt, {
          phase: "AI 评价打分",
          current: finishedJudges,
          total: evaluatorPlans.length,
          etaSec: estimateTournamentEtaSec("judges", evaluatorPlans.length, finishedJudges),
        });
      }
    }),
  );

  const judgeOutputs = judgeResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((result): result is { judgeModel: string; payload: JudgeScorePayload } => Boolean(result));

  const ranked = aggregateCandidates(candidates, judgeOutputs);
  const selected = ranked.find((candidate) => candidate.averageScore > 0) ?? ranked[0];
  const selectedCandidate = candidates.find((candidate) => candidate.id === selected.id) ?? candidates[0];
  const inputTokens = calls.reduce((sum, call) => sum + call.result.inputTokens, 0);
  const outputTokens = calls.reduce((sum, call) => sum + call.result.outputTokens, 0);
  const totalCostUsd = calls.reduce((sum, call) => sum + modelCost(call.model, call.result), 0);
  const judgeNames = evaluatorPlans.map((plan) => plan.model.name);
  progress(opts, startedAt, {
    phase: "整理最终结果",
    current: 1,
    total: 1,
    etaSec: estimateTournamentEtaSec("final", 1, 1),
  });
  const scoreText = ranked
    .slice(0, 6)
    .map((candidate) => `${candidate.generatorModelName}:${candidate.averageScore.toFixed(1)}`)
    .join(", ");
  const skippedText = modelHealth.skippedCooling.length
    ? ` 自动跳过冷却模型 ${modelHealth.skippedCooling.length} 个。`
    : "";
  const failedText = modelHealth.failed.length
    ? ` 本次失败但未中断的模型 ${modelHealth.failed.length} 个。`
    : "";
  const summary = judgeOutputs
    .map((output) => output.payload.summary)
    .find((item): item is string => Boolean(item?.trim()))
    ?? `Selected ${selectedCandidate.generatorModelName}. Scores: ${scoreText || "judge fallback"}.`;

  return {
    text: selectedCandidate.prompt,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
    totalCostUsd,
    meta: {
      reviewSummary: `Prompt tournament used ${generatorPlans.length} active generator model(s) and ${judgeNames.length || 0} judge model(s). ${scoreText || "No judge scores parsed; selected first successful candidate."}${skippedText}${failedText}`,
      judgeModels: judgeNames,
      selectedStrategy: selectedCandidate.generatorModelName,
      promptEvaluation: {
        rubric: PROMPT_EVALUATION_RUBRIC.map((item) => {
          const rubricItem = item as PromptEvaluationRubricItem;
          return {
            id: rubricItem.id,
            label: rubricItem.label,
            labelZh: rubricItem.labelZh,
            weight: rubricItem.weight,
            guide: rubricItem.guide,
            guideZh: rubricItem.guideZh,
          };
        }),
        sourceCommits: [...PROMPT_SOURCE_LIBRARY_COMMITS],
        candidates: ranked,
        judgeModels: judgeNames,
        selectedCandidateId: selectedCandidate.id,
        summary,
      },
      modelHealth,
    },
  };
}
