import { callProvider, GenerateResult } from "@/lib/providers";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { isRelayModelListed } from "@/lib/relay-models";
import { GPT_IMAGE_2_SOURCE_COMMITS } from "@/lib/gpt-image-2-source-status";
import {
  ModelHealthMeta,
  getModelCooldown,
  getModelTimeoutMs,
  recordModelFailure,
  recordModelSuccess,
  splitCoolingPlans,
  withTimeout,
} from "@/lib/model-health";

export interface GptImage2Candidate {
  id: string;
  label: string;
  prompt: string;
  sourceId?: string;
}

export interface GptImage2Progress {
  phase: string;
  current?: number;
  total?: number;
  etaSec?: number;
  elapsedSec?: number;
  message?: string;
}

interface GptImage2EnsembleOptions {
  userIdea: string;
  language: "zh" | "en";
  targetModel: ModelInfo;
  generatorModel: ModelInfo;
  generatorModels?: ModelInfo[];
  models: ModelInfo[];
  userKeys: Record<string, string>;
  availableModelIds?: string[];
  evaluatorModelIds?: string[];
  feedbackMemory?: string;
  maxTokens: number;
  onProgress?: (event: GptImage2Progress) => void;
}

export interface GptImage2EnsembleResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  totalCostUsd: number;
  meta: {
    reviewSummary: string;
    judgeModels: string[];
    selectedStrategy: string;
    sourceCommits: string[];
    modelHealth?: ModelHealthMeta;
    promptEvaluation?: {
      rubric?: Array<{ id: string; label: string; labelZh: string; weight: number; guide: string; guideZh: string }>;
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
      sourceCommits: string[];
    };
  };
}

interface CandidatePayload {
  candidates?: Array<Partial<GptImage2Candidate>>;
  hybrid?: Partial<GptImage2Candidate>;
}

interface JudgePayload {
  scores?: Array<{ id?: string; score?: number; reason?: string }>;
  winnerId?: string;
  shouldSynthesize?: boolean;
}

const SOURCE_STRATEGIES = [
  {
    id: "evolink",
    label: "EvoLinkAI case-pattern route",
    guide:
      "Use task-specific gallery thinking. First identify whether the request is e-commerce, ad creative, portrait, poster, character, UI/social mockup, or comparison. Write a polished natural-language production prompt with concrete scene assets, commercial lighting, visible layout hierarchy, exact readable text, and style-consistency constraints. Strong for product ads, posters, UI cards, portraits, and storyboard-like boards.",
  },
  {
    id: "youmind",
    label: "YouMind taxonomy/config route",
    guide:
      "Use broad taxonomy and config-style structure. Put artifact type, canvas, aspect ratio, and layout before subject. For complex outputs, use a clean JSON-like visual spec with type, subject, style, layout, text, materials, lighting, and rendering fields. Preserve dynamic user slots as quoted literal copy when needed. Strong for multi-language typography, grids, product series, maps, UI overlays, stickers, diagrams, and structured prompts.",
  },
  {
    id: "anil",
    label: "Anil-matcha concise API route",
    guide:
      "Use direct OpenAI Images API prompt style: copy-pasteable, concise but rich, no unsupported negative-prompt syntax, no Midjourney flags. Emphasize photorealism, style fidelity, prompt adherence, screenshots/mockups, portraits, posters, game/UI/infographic use cases, and clear final image intent. Strong when the user wants a clean ready-to-call API prompt without overengineering.",
  },
  {
    id: "wuyoscar",
    label: "wuyoscar craft/skill route",
    guide:
      "Use the craft checklist: exact text in quotes, canvas/layout first, fixed-region schemas for infographics, diagram grammar for research/data figures, UI prompts as product specs, multi-panel consistency, capture context for photorealism, scene density over empty adjectives, bounded style anchors, and edit/reference-image invariants. Strong for typography, scientific boards, app screens, infographics, character sheets, and prompt debugging.",
  },
];

const JUDGE_PREFERENCE = [
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

const GPT_IMAGE_2_RUBRIC = [
  {
    id: "intent_fidelity",
    label: "Intent fidelity",
    labelZh: "意图保真",
    weight: 18,
    guide: "Preserves every explicit and implicit user detail without inventing new requirements.",
    guideZh: "完整保留用户明确和隐含要求，不私自添加需求。",
  },
  {
    id: "gpt_image_2_fit",
    label: "GPT Image 2 fit",
    labelZh: "GPT Image 2 适配",
    weight: 17,
    guide: "Uses natural language or clean structured visual specs and avoids unsupported flags or negative-prompt syntax.",
    guideZh: "使用自然语言或清晰视觉规格，避免不支持的参数旗标和负面提示词语法。",
  },
  {
    id: "visual_specificity",
    label: "Visual specificity",
    labelZh: "视觉细节",
    weight: 17,
    guide: "Defines subject, scene, layout, lighting, material, camera, palette, and mood with controllable detail.",
    guideZh: "明确主体、场景、构图、光照、材质、镜头、色彩和氛围，并且可控制。",
  },
  {
    id: "typography_reliability",
    label: "Typography reliability",
    labelZh: "文字渲染可靠性",
    weight: 16,
    guide: "Quotes exact visible text and specifies font, size, color, placement, and hierarchy when text appears.",
    guideZh: "涉及画面文字时，必须用引号标出精确文本，并说明字体、大小、颜色、位置和层级。",
  },
  {
    id: "layout_controllability",
    label: "Layout controllability",
    labelZh: "构图和布局可控性",
    weight: 16,
    guide: "Specifies aspect ratio, panels, zones, UI/diagram structure, foreground/background, and spatial relationships.",
    guideZh: "指定画幅比例、分镜/区域、UI 或图表结构、前后景和空间关系。",
  },
  {
    id: "commercial_usability",
    label: "Commercial usability",
    labelZh: "商业可用性",
    weight: 16,
    guide: "Produces polished, practical prompts suitable for ads, product pages, social posts, covers, or client delivery.",
    guideZh: "产出适合广告、电商、社媒、封面或客户交付的精致实用提示词。",
  },
] as const;

function hasKey(name: string, userKeys: Record<string, string>): boolean {
  return Boolean(userKeys[name]?.trim() || process.env[name]?.trim());
}

function hasCustomRelay(userKeys: Record<string, string>): boolean {
  return hasKey("CUSTOM_API_KEY", userKeys) && Boolean(userKeys.CUSTOM_BASE_URL?.trim() || process.env.CUSTOM_BASE_URL?.trim());
}

export function resolveRuntimeApiProvider(
  model: ModelInfo,
  userKeys: Record<string, string>,
  availableModelIds?: string[],
): string {
  if (hasCustomRelay(userKeys) && isRelayModelListed(availableModelIds, model.id)) return "aihubmix";
  if (hasCustomRelay(userKeys) && (model.apiProvider === "custom" || model.apiProvider === "aihubmix")) return "aihubmix";
  return model.apiProvider;
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

function progress(opts: GptImage2EnsembleOptions, startedAt: number, event: Omit<GptImage2Progress, "elapsedSec">) {
  opts.onProgress?.({
    elapsedSec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    ...event,
  });
}

function selectHealthyGeneratorFallback(
  opts: GptImage2EnsembleOptions,
  excludeModelIds: Set<string>,
): { model: ModelInfo; apiProvider: string } | null {
  const candidates = opts.models
    .filter((model) => !excludeModelIds.has(model.id))
    .filter((model) => (model.category ?? "text") === "text")
    .sort((a, b) => scoreModel(b, "fast") + scoreModel(b, "accurate") - (scoreModel(a, "fast") + scoreModel(a, "accurate")));

  for (const model of candidates) {
    const apiProvider = resolveRuntimeApiProvider(model, opts.userKeys, opts.availableModelIds);
    if (opts.availableModelIds?.length && (apiProvider === "custom" || apiProvider === "aihubmix") && !isRelayModelListed(opts.availableModelIds, model.id)) continue;
    if (!isProviderCallable(apiProvider, opts.userKeys)) continue;
    if (getModelCooldown(model, apiProvider)) continue;
    return { model, apiProvider };
  }

  return null;
}

function planGeneratorModels(opts: GptImage2EnsembleOptions): Array<{ model: ModelInfo; apiProvider: string }> {
  const seen = new Set<string>();
  const selected = [...(opts.generatorModels?.length ? opts.generatorModels : [opts.generatorModel]), opts.generatorModel]
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    })
    .slice(0, 6);

  return selected
    .map((model) => ({
      model,
      apiProvider: resolveRuntimeApiProvider(model, opts.userKeys, opts.availableModelIds),
    }))
    .filter((plan) => (plan.model.category ?? "text") === "text")
    .filter((plan) => !opts.availableModelIds?.length || isRelayModelListed(opts.availableModelIds, plan.model.id) || (plan.apiProvider !== "custom" && plan.apiProvider !== "aihubmix"))
    .filter((plan) => isProviderCallable(plan.apiProvider, opts.userKeys));
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

function buildCandidatePrompt(userIdea: string, language: "zh" | "en", feedbackMemory?: string): string {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `User idea:
${userIdea}
${buildFeedbackBlock(feedbackMemory)}

Create GPT Image 2.0 prompt candidates using four independent source strategies plus one hybrid.

Rules:
- Preserve every user detail exactly.
- Apply previous human/test feedback if present. If old/new prompt comparisons exist, preserve what the human preferred and remove what they rejected.
- Be stricter than previous versions: add concrete checks for face identity, hand anatomy, text readability, clothing/story accuracy, lighting, camera realism, and commercial finish when relevant.
- Do not mix the four strategies inside the four source candidates.
- The fifth candidate is the only hybrid.
- GPT Image 2 uses natural language and structured visual specs; do not add Midjourney flags, SD weights, or unsupported negative-prompt sections.
- Exact visible text must be wrapped in quotes and placed with font, size, color, and position.
- If the image has panels, UI, infographic, product layout, or typography, define canvas/aspect ratio/layout first.
- Output language for the final prompts: ${outputLanguage}.

Source strategies:
${SOURCE_STRATEGIES.map((s, i) => `${i + 1}. ${s.id} (${s.label}): ${s.guide}`).join("\n")}

Return STRICT JSON only:
{
  "candidates": [
    { "id": "evolink", "label": "EvoLinkAI case-pattern route", "prompt": "..." },
    { "id": "youmind", "label": "YouMind taxonomy/config route", "prompt": "..." },
    { "id": "anil", "label": "Anil-matcha concise API route", "prompt": "..." },
    { "id": "wuyoscar", "label": "wuyoscar craft/skill route", "prompt": "..." }
  ],
  "hybrid": { "id": "hybrid", "label": "four-source hybrid", "prompt": "..." }
}`;
}

function buildFeedbackBlock(feedbackMemory?: string): string {
  if (!feedbackMemory?.trim()) return "";
  return `\n\nPrevious human/test feedback to obey strictly:\n${feedbackMemory.trim()}\n`;
}

function buildJudgePrompt(candidates: GptImage2Candidate[], userIdea: string, language: "zh" | "en"): string {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `You are judging GPT Image 2.0 prompts.

Original user idea:
${userIdea}

Candidates:
${JSON.stringify(candidates, null, 2)}

Score every candidate from 0 to 100 using these weighted criteria:
${GPT_IMAGE_2_RUBRIC.map((item) => `- ${item.label} / ${item.labelZh} (${item.weight}): ${item.guide}`).join("\n")}

Strict score calibration:
- 95-100: ready for paid commercial use, no visible ambiguity, all details controlled.
- 85-94: strong, but only minor low-risk issues.
- 70-84: usable draft with clear missing controls or possible image defects.
- 50-69: important user details or realism/typography/layout controls are missing.
- below 50: likely fails the user's visual intent.
- Penalize aggressively for fake-looking faces, wrong identity, bad anatomy/hands, unreadable text, weak composition, generic style, missing reference-image preservation, or vague prompts.

If the top single-source candidate and the hybrid are close in quality, set shouldSynthesize=true.

Return STRICT JSON only in ${outputLanguage}:
{
  "scores": [
    { "id": "evolink", "score": 0, "reason": "short reason" }
  ],
  "winnerId": "candidate id",
  "shouldSynthesize": true
}`;
}

function buildSynthesisPrompt(
  userIdea: string,
  bestSingle: GptImage2Candidate,
  hybrid: GptImage2Candidate,
  language: "zh" | "en",
): string {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `Synthesize the best final GPT Image 2.0 prompt.

Original user idea:
${userIdea}

Best single-source prompt (${bestSingle.label}):
${bestSingle.prompt}

Hybrid prompt:
${hybrid.prompt}

Create one final prompt that beats both. Keep only the strongest compatible parts. Preserve every user detail. Use GPT Image 2 compatible natural language or a clean JSON-like visual spec. Do not include explanations, scores, source names, markdown fences, Midjourney flags, or SD negative-prompt sections.

Output only the final prompt in ${outputLanguage}.`;
}

function normalizeCandidates(
  payload: CandidatePayload | null,
  generator?: ModelInfo,
): GptImage2Candidate[] {
  const idPrefix = generator ? `${generator.id}:` : "";
  const labelPrefix = generator ? `${generator.name} · ` : "";
  const candidates: GptImage2Candidate[] = [];
  for (const source of SOURCE_STRATEGIES) {
    const found = payload?.candidates?.find((c) => c.id === source.id);
    if (found?.prompt?.trim()) {
      candidates.push({
        id: `${idPrefix}${source.id}`,
        label: `${labelPrefix}${found.label?.trim() || source.label}`,
        prompt: found.prompt.trim(),
        sourceId: source.id,
      });
    }
  }
  if (payload?.hybrid?.prompt?.trim()) {
    candidates.push({
      id: `${idPrefix}hybrid`,
      label: `${labelPrefix}${payload.hybrid.label?.trim() || "four-source hybrid"}`,
      prompt: payload.hybrid.prompt.trim(),
      sourceId: "hybrid",
    });
  }
  return candidates;
}

function selectJudgeModels(opts: GptImage2EnsembleOptions): Array<{ model: ModelInfo; apiProvider: string }> {
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

  for (const id of opts.evaluatorModelIds ?? []) {
    add(opts.models.find((m) => m.id === id));
    if (chosen.length >= 6) return chosen;
  }
  if (chosen.length > 0) return chosen;

  for (const id of JUDGE_PREFERENCE) {
    add(opts.models.find((m) => m.id === id));
    if (chosen.length >= 3) return chosen;
  }

  const fallback = opts.models
    .filter((m) => (m.category ?? "text") === "text")
    .filter((m) => !opts.availableModelIds?.length || isRelayModelListed(opts.availableModelIds, m.id) || m.apiProvider !== "aihubmix")
    .sort((a, b) => scoreModel(b, "accurate") - scoreModel(a, "accurate"));

  for (const model of fallback) {
    add(model);
    if (chosen.length >= 3) return chosen;
  }

  add(opts.generatorModel);
  return chosen;
}

function aggregateScores(
  candidates: GptImage2Candidate[],
  judgeOutputs: Array<{ judgeModel: string; payload: JudgePayload }>,
) {
  const buckets = new Map<string, {
    candidate: GptImage2Candidate;
    score: number;
    count: number;
    scores: Array<{ judgeModel: string; score: number; reason: string }>;
  }>();
  for (const candidate of candidates) {
    buckets.set(candidate.id, { candidate, score: 0, count: 0, scores: [] });
  }

  let synthesizeVotes = 0;
  for (const output of judgeOutputs) {
    const payload = output.payload;
    if (payload.shouldSynthesize) synthesizeVotes += 1;
    for (const item of payload.scores ?? []) {
      if (!item.id || typeof item.score !== "number") continue;
      const bucket = buckets.get(item.id);
      if (!bucket) continue;
      const score = Math.max(0, Math.min(100, item.score));
      bucket.score += score;
      bucket.count += 1;
      bucket.scores.push({
        judgeModel: output.judgeModel,
        score,
        reason: item.reason?.trim() || "",
      });
    }
  }

  const averages = [...buckets.values()].map((bucket) => ({
    candidate: bucket.candidate,
    average: bucket.count > 0 ? bucket.score / bucket.count : 0,
    scores: bucket.scores,
  }));

  averages.sort((a, b) => b.average - a.average);
  return { averages, synthesizeVotes };
}

export async function runGptImage2Ensemble(opts: GptImage2EnsembleOptions): Promise<GptImage2EnsembleResult> {
  const startedAt = Date.now();
  const calls: Array<{ model: ModelInfo; result: GenerateResult }> = [];
  const modelHealth: ModelHealthMeta = {
    skippedCooling: [],
    failed: [],
    successful: [],
  };
  const selectedGeneratorModels = [...(opts.generatorModels?.length ? opts.generatorModels : [opts.generatorModel]), opts.generatorModel]
    .filter((model, index, arr) => arr.findIndex((item) => item.id === model.id) === index)
    .slice(0, 6);
  const selectedGeneratorIds = new Set(selectedGeneratorModels.map((model) => model.id));
  const rawGeneratorPlans = planGeneratorModels(opts);
  const generatorSplit = splitCoolingPlans(rawGeneratorPlans);
  modelHealth.skippedCooling.push(...generatorSplit.skippedCooling);
  let generatorPlans = generatorSplit.runnable;

  if (generatorPlans.length === 0) {
    const fallback = selectHealthyGeneratorFallback(opts, selectedGeneratorIds);
    if (!fallback) {
      const skippedText = modelHealth.skippedCooling
        .map((issue) => issue.modelName ?? issue.modelId)
        .join(", ");
      throw new Error(
        skippedText
          ? `所选 GPT Image 2 生成模型暂时不稳定，已自动冷却：${skippedText}。请稍后重试或换一个模型。`
          : "没有可调用的 GPT Image 2 生成模型 / No callable GPT Image 2 generator model",
      );
    }
    generatorPlans = [fallback];
  }

  progress(opts, startedAt, {
    phase: "生成 GPT Image 2 候选提示词",
    current: 0,
    total: generatorPlans.length,
    etaSec: Math.min(180, 50 + generatorPlans.length * 25),
    message: "会等待可用生成模型完整输出；持续失败、冷却或中转站不可用的模型才会跳过。 Slow but responsive models will be waited for.",
  });

  const runCandidateGenerator = async (plan: { model: ModelInfo; apiProvider: string }) => {
    const callStartedAt = Date.now();
    const result = await withTimeout(
      callProvider({
        model: plan.model.id,
        apiProvider: plan.apiProvider,
        systemPrompt: "You generate candidate prompts for GPT Image 2. Output strict JSON only.",
        userPrompt: buildCandidatePrompt(opts.userIdea, opts.language, opts.feedbackMemory),
        maxTokens: Math.min(opts.maxTokens, 4096),
        temperature: 0.45,
        userKeys: opts.userKeys,
      }),
      getModelTimeoutMs(plan.model, "generator", { startedAt, reserveMs: 90_000 }),
      `${plan.model.name} GPT Image 2 candidates`,
    );
    calls.push({ model: plan.model, result });
    modelHealth.successful.push(recordModelSuccess(
      plan.model,
      plan.apiProvider,
      result.latencyMs || Date.now() - callStartedAt,
    ));
    const parsed = safeParseJson<CandidatePayload>(result.text);
    return {
      plan,
      result,
      candidates: normalizeCandidates(parsed, plan.model),
    };
  };

  let finishedGenerators = 0;
  const generatorResults = await Promise.allSettled(
    generatorPlans.map(async (plan) => {
      try {
        return await runCandidateGenerator(plan);
      } catch (err) {
        modelHealth.failed.push(recordModelFailure(plan.model, plan.apiProvider, err));
        throw err;
      } finally {
        finishedGenerators += 1;
        progress(opts, startedAt, {
          phase: "生成 GPT Image 2 候选提示词",
          current: finishedGenerators,
          total: generatorPlans.length,
          etaSec: Math.max(15, Math.min(180, 50 + (generatorPlans.length - finishedGenerators) * 25)),
          message: "正在等待仍有响应的模型返回；失败模型会记录并冷却。 Waiting for responsive models; failed models are cooled down.",
        });
      }
    }),
  );

  let candidateRuns = generatorResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((result): result is { plan: { model: ModelInfo; apiProvider: string }; result: GenerateResult; candidates: GptImage2Candidate[] } => Boolean(result));
  let candidates = candidateRuns.flatMap((run) => run.candidates);

  if (candidates.length < 2) {
    const excludeIds = new Set([
      ...selectedGeneratorIds,
      ...generatorPlans.map((plan) => plan.model.id),
    ]);
    const fallback = selectHealthyGeneratorFallback(opts, excludeIds);
    if (fallback) {
      progress(opts, startedAt, {
        phase: "主生成模型不足，切换备用模型",
        current: 0,
        total: 1,
        etaSec: 60,
        message: `正在改用 ${fallback.model.name} 继续生成 GPT Image 2 候选。 Switching to a healthy fallback generator.`,
      });
      try {
        const fallbackRun = await runCandidateGenerator(fallback);
        candidateRuns = [...candidateRuns, fallbackRun];
        candidates = candidateRuns.flatMap((run) => run.candidates);
      } catch (fallbackErr) {
        modelHealth.failed.push(recordModelFailure(fallback.model, fallback.apiProvider, fallbackErr));
      }
    }
  }

  if (candidates.length < 2) {
    const directRun = candidateRuns.find((run) => run.result.text.trim());
    if (!directRun) {
      const failedText = modelHealth.failed
        .map((issue) => `${issue.modelName ?? issue.modelId}: ${issue.lastError}`)
        .join("；");
      throw new Error(
        failedText
          ? `GPT Image 2 生成模型都未返回可用候选：${failedText}`
          : "GPT Image 2 生成模型未返回可用候选 / No usable GPT Image 2 candidates",
      );
    }
    return {
      text: directRun.result.text.trim(),
      inputTokens: calls.reduce((sum, c) => sum + c.result.inputTokens, 0),
      outputTokens: calls.reduce((sum, c) => sum + c.result.outputTokens, 0),
      latencyMs: Date.now() - startedAt,
      totalCostUsd: calls.reduce((sum, c) => sum + modelCost(c.model, c.result), 0),
      meta: {
        reviewSummary: "GPT Image 2 source ensemble fallback: candidate JSON parsing failed, returned the best generator output directly. / 候选 JSON 解析不足，已直接返回最可用的生成结果。",
        judgeModels: [directRun.plan.model.name],
        selectedStrategy: "fallback",
        sourceCommits: [...GPT_IMAGE_2_SOURCE_COMMITS],
        modelHealth,
      },
    };
  }

  const judgeSplit = splitCoolingPlans(selectJudgeModels(opts));
  modelHealth.skippedCooling.push(...judgeSplit.skippedCooling);
  const judgePlans = judgeSplit.runnable;
  let finishedJudges = 0;
  progress(opts, startedAt, {
    phase: judgePlans.length > 0 ? "AI 评价 GPT Image 2 提示词" : "整理 GPT Image 2 最终提示词",
    current: 0,
    total: judgePlans.length,
    etaSec: judgePlans.length > 0 ? Math.min(160, 45 + judgePlans.length * 18) : 12,
    message: "评价模型会打 0-100 分；慢但能返回的模型会被等待。 Judge models score 0-100; slow responsive judges are waited for.",
  });

  const judgeResults = await Promise.allSettled(
    judgePlans.map(async (plan) => {
      const callStartedAt = Date.now();
      try {
        const result = await withTimeout(
          callProvider({
            model: plan.model.id,
            apiProvider: plan.apiProvider,
            systemPrompt: "You are a strict image-prompt evaluator. Output strict JSON only.",
            userPrompt: buildJudgePrompt(candidates, opts.userIdea, opts.language),
            maxTokens: 1200,
            temperature: 0.1,
            userKeys: opts.userKeys,
          }),
          getModelTimeoutMs(plan.model, "judge", { startedAt, reserveMs: 45_000 }),
          `${plan.model.name} GPT Image 2 judge`,
        );
        calls.push({ model: plan.model, result });
        modelHealth.successful.push(recordModelSuccess(
          plan.model,
          plan.apiProvider,
          result.latencyMs || Date.now() - callStartedAt,
        ));
        return {
          judgeModel: plan.model.name,
          payload: safeParseJson<JudgePayload>(result.text) ?? {},
        };
      } catch (err) {
        modelHealth.failed.push(recordModelFailure(plan.model, plan.apiProvider, err));
        return null;
      } finally {
        finishedJudges += 1;
        progress(opts, startedAt, {
          phase: "AI 评价 GPT Image 2 提示词",
          current: finishedJudges,
          total: judgePlans.length,
          etaSec: Math.max(8, 45 - Math.floor((finishedJudges / Math.max(judgePlans.length, 1)) * 30)),
          message: "正在汇总评价模型打分。 Aggregating judge scores.",
        });
      }
    }),
  );

  const judgeOutputs = judgeResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is { judgeModel: string; payload: JudgePayload } => Boolean(r));

  const { averages, synthesizeVotes } = aggregateScores(candidates, judgeOutputs);
  const fallbackWinner = candidates.find((c) => c.sourceId === "hybrid") ?? candidates[0];
  const top = averages[0]?.average > 0 ? averages[0] : { candidate: fallbackWinner, average: 0 };
  const bestHybrid = averages.find((a) => a.candidate.sourceId === "hybrid");
  const hybridScore = bestHybrid?.average ?? 0;
  const bestSingle = averages.find((a) => a.candidate.sourceId !== "hybrid") ?? top;
  const hybrid = bestHybrid?.candidate ?? candidates.find((c) => c.sourceId === "hybrid");
  const candidateProducer = new Map<string, { model: ModelInfo; apiProvider: string }>();
  for (const run of candidateRuns) {
    for (const candidate of run.candidates) {
      candidateProducer.set(candidate.id, run.plan);
    }
  }
  const synthesisPlan =
    candidateProducer.get(bestSingle.candidate.id) ??
    candidateProducer.get(top.candidate.id) ??
    candidateRuns[0]?.plan ??
    generatorPlans[0];

  const shouldSynthesize =
    Boolean(hybrid) &&
    (synthesizeVotes > 0 || Math.abs(bestSingle.average - hybridScore) <= 3);

  let finalPrompt = top.candidate.prompt;
  let selectedStrategy = top.candidate.id;

  if (shouldSynthesize && hybrid) {
    progress(opts, startedAt, {
      phase: "融合最佳 GPT Image 2 提示词",
      current: 2,
      total: 3,
      etaSec: 25,
      message: "正在把最佳单路线和混合路线融合成最终版。 Synthesizing the best single route with the hybrid route.",
    });
    try {
      const callStartedAt = Date.now();
      const synthesisResult = await withTimeout(
        callProvider({
          model: synthesisPlan.model.id,
          apiProvider: synthesisPlan.apiProvider,
          systemPrompt: "You synthesize the final GPT Image 2 prompt. Output only the final prompt.",
          userPrompt: buildSynthesisPrompt(opts.userIdea, bestSingle.candidate, hybrid, opts.language),
          maxTokens: Math.min(opts.maxTokens, 2048),
          temperature: 0.35,
          userKeys: opts.userKeys,
        }),
        getModelTimeoutMs(synthesisPlan.model, "generator", { startedAt, reserveMs: 20_000 }),
        `${synthesisPlan.model.name} GPT Image 2 synthesis`,
      );
      calls.push({ model: synthesisPlan.model, result: synthesisResult });
      modelHealth.successful.push(recordModelSuccess(
        synthesisPlan.model,
        synthesisPlan.apiProvider,
        synthesisResult.latencyMs || Date.now() - callStartedAt,
      ));
      if (synthesisResult.text.trim()) {
        finalPrompt = synthesisResult.text.trim();
        selectedStrategy = `${bestSingle.candidate.id}+hybrid`;
      }
    } catch (err) {
      modelHealth.failed.push(recordModelFailure(synthesisPlan.model, synthesisPlan.apiProvider, err));
    }
  }

  progress(opts, startedAt, {
    phase: "整理 GPT Image 2 最终提示词",
    current: 3,
    total: 3,
    etaSec: 3,
  });

  const inputTokens = calls.reduce((sum, c) => sum + c.result.inputTokens, 0);
  const outputTokens = calls.reduce((sum, c) => sum + c.result.outputTokens, 0);
  const totalCostUsd = calls.reduce((sum, c) => sum + modelCost(c.model, c.result), 0);
  const scoreText = averages
    .filter((a) => a.average > 0)
    .slice(0, 5)
    .map((a) => `${a.candidate.label}:${a.average.toFixed(1)}`)
    .join(", ");
  const successfulGeneratorNames = Array.from(new Set(candidateRuns
    .filter((run) => run.candidates.length > 0)
    .map((run) => run.plan.model.name)));
  const successfulJudgeNames = judgeOutputs.map((output) => output.judgeModel);
  const healthText = `模型健康 Model health: 已等待可用模型完整返回；冷却跳过 ${modelHealth.skippedCooling.length} 个持续失败模型；本次失败但未中断 ${modelHealth.failed.length} 个模型。`;

  return {
    text: finalPrompt,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
    totalCostUsd,
    meta: {
      reviewSummary: `GPT Image 2 多模型集成 Multi-model ensemble: 已使用 ${successfulGeneratorNames.length}/${selectedGeneratorModels.length} 个生成器模型、${successfulJudgeNames.length}/${judgePlans.length || 0} 个评价模型。Scores: ${scoreText || "fallback selected"}. ${healthText}`,
      judgeModels: successfulJudgeNames,
      selectedStrategy,
      sourceCommits: [...GPT_IMAGE_2_SOURCE_COMMITS],
      modelHealth,
      promptEvaluation: {
        rubric: GPT_IMAGE_2_RUBRIC.map((item) => ({ ...item })),
        candidates: averages.map((item, index) => {
          const producer = candidateProducer.get(item.candidate.id);
          return {
            id: item.candidate.id,
            generatorModelId: producer?.model.id ?? item.candidate.id,
            generatorModelName: item.candidate.label,
            averageScore: item.average,
            rank: index + 1,
            scores: item.scores.length
              ? item.scores
              : item.average > 0
                ? [{ judgeModel: "Average", score: item.average, reason: item.candidate.label }]
                : [],
          };
        }),
        judgeModels: successfulJudgeNames,
        selectedCandidateId: top.candidate.id,
        summary: `GPT Image 2 scoring summary 评分摘要: ${scoreText || "fallback selected"}. ${healthText}`,
        sourceCommits: [...GPT_IMAGE_2_SOURCE_COMMITS],
      },
    },
  };
}
