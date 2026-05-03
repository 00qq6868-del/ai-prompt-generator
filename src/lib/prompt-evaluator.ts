import { callProvider, GenerateResult } from "@/lib/providers";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { resolveRuntimeApiProvider } from "@/lib/gpt-image-2-ensemble";
import {
  PROMPT_EVALUATION_RUBRIC,
  PROMPT_SOURCE_LIBRARY_COMMITS,
  PROMPT_SOURCE_LIBRARY_STATUS,
} from "@/lib/prompt-source-library-status";

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
  rubric: Array<{ id: string; label: string; weight: number; guide: string }>;
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
  const availableSet = opts.availableModelIds?.length ? new Set(opts.availableModelIds) : null;
  const chosen: Array<{ model: ModelInfo; apiProvider: string }> = [];
  const seen = new Set<string>();

  const add = (model: ModelInfo | undefined) => {
    if (!model || seen.has(model.id)) return;
    if ((model.category ?? "text") !== "text") return;
    const apiProvider = resolveRuntimeApiProvider(model, opts.userKeys, opts.availableModelIds);
    if (availableSet && (apiProvider === "custom" || apiProvider === "aihubmix") && !availableSet.has(model.id)) return;
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
    .filter((model) => !availableSet || availableSet.has(model.id) || model.apiProvider !== "aihubmix")
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

  const generatorResults = await Promise.allSettled(
    opts.generatorModels.slice(0, 6).map(async (model, index) => {
      const apiProvider = resolveRuntimeApiProvider(model, opts.userKeys, opts.availableModelIds);
      const result = await callProvider({
        model: model.id,
        apiProvider,
        systemPrompt: opts.systemPrompt,
        userPrompt: opts.userPrompt,
        maxTokens: opts.maxTokens,
        temperature: 0.5,
        userKeys: opts.userKeys,
      });
      calls.push({ model, result });
      return {
        id: `c${index + 1}`,
        generatorModelId: model.id,
        generatorModelName: model.name,
        prompt: result.text.trim(),
      } satisfies Candidate;
    }),
  );

  const candidates = generatorResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((candidate): candidate is Candidate => Boolean(candidate?.prompt));

  if (candidates.length === 0) {
    const firstError = generatorResults.find((result) => result.status === "rejected");
    const reason = firstError && firstError.status === "rejected" ? firstError.reason : null;
    throw new Error(reason?.message ?? "所有生成器模型都失败了 / All generator models failed");
  }

  const evaluatorPlans = selectEvaluatorPlans(opts);
  const judgeResults = await Promise.allSettled(
    evaluatorPlans.map(async (plan) => {
      const result = await callProvider({
        model: plan.model.id,
        apiProvider: plan.apiProvider,
        systemPrompt: "You are a strict prompt quality evaluator. Output strict JSON only.",
        userPrompt: buildJudgePrompt(candidates, opts),
        maxTokens: 1800,
        temperature: 0.1,
        userKeys: opts.userKeys,
      });
      calls.push({ model: plan.model, result });
      return {
        judgeModel: plan.model.name,
        payload: safeParseJson<JudgeScorePayload>(result.text) ?? {},
      };
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
  const scoreText = ranked
    .slice(0, 6)
    .map((candidate) => `${candidate.generatorModelName}:${candidate.averageScore.toFixed(1)}`)
    .join(", ");
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
      reviewSummary: `Prompt tournament used ${opts.generatorModels.length} generator model(s) and ${judgeNames.length || 0} judge model(s). ${scoreText || "No judge scores parsed; selected first successful candidate."}`,
      judgeModels: judgeNames,
      selectedStrategy: selectedCandidate.generatorModelName,
      promptEvaluation: {
        rubric: PROMPT_EVALUATION_RUBRIC.map((item) => ({
          id: item.id,
          label: item.label,
          weight: item.weight,
          guide: item.guide,
        })),
        sourceCommits: [...PROMPT_SOURCE_LIBRARY_COMMITS],
        candidates: ranked,
        judgeModels: judgeNames,
        selectedCandidateId: selectedCandidate.id,
        summary,
      },
    },
  };
}
