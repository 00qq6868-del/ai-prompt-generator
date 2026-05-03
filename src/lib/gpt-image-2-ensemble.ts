import { callProvider, GenerateResult } from "@/lib/providers";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { GPT_IMAGE_2_SOURCE_COMMITS } from "@/lib/gpt-image-2-source-status";

export interface GptImage2Candidate {
  id: string;
  label: string;
  prompt: string;
}

interface GptImage2EnsembleOptions {
  userIdea: string;
  language: "zh" | "en";
  targetModel: ModelInfo;
  generatorModel: ModelInfo;
  models: ModelInfo[];
  userKeys: Record<string, string>;
  availableModelIds?: string[];
  maxTokens: number;
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
  const availableSet = availableModelIds?.length ? new Set(availableModelIds) : null;
  if (hasCustomRelay(userKeys) && availableSet?.has(model.id)) return "aihubmix";
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

function buildCandidatePrompt(userIdea: string, language: "zh" | "en"): string {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `User idea:
${userIdea}

Create GPT Image 2.0 prompt candidates using four independent source strategies plus one hybrid.

Rules:
- Preserve every user detail exactly.
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

function buildJudgePrompt(candidates: GptImage2Candidate[], userIdea: string, language: "zh" | "en"): string {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `You are judging GPT Image 2.0 prompts.

Original user idea:
${userIdea}

Candidates:
${JSON.stringify(candidates, null, 2)}

Score every candidate from 0 to 100 using these criteria:
- intent fidelity: preserves every explicit and implicit user detail
- GPT Image 2 fit: natural-language/structured prompt style, no unsupported flags
- visual specificity: subject, layout, lighting, material, camera, palette, mood
- typography reliability: exact quoted text, readable placement, no garbled text
- layout controllability: aspect ratio, panels, zones, UI/diagram structure when relevant
- commercial usability: polished, practical, avoids watermarks/logos unless user supplied them

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

function normalizeCandidates(payload: CandidatePayload | null): GptImage2Candidate[] {
  const candidates: GptImage2Candidate[] = [];
  for (const source of SOURCE_STRATEGIES) {
    const found = payload?.candidates?.find((c) => c.id === source.id);
    if (found?.prompt?.trim()) {
      candidates.push({
        id: source.id,
        label: found.label?.trim() || source.label,
        prompt: found.prompt.trim(),
      });
    }
  }
  if (payload?.hybrid?.prompt?.trim()) {
    candidates.push({
      id: "hybrid",
      label: payload.hybrid.label?.trim() || "four-source hybrid",
      prompt: payload.hybrid.prompt.trim(),
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
    if (!isProviderCallable(apiProvider, opts.userKeys)) return;
    chosen.push({ model, apiProvider });
    seen.add(model.id);
  };

  for (const id of JUDGE_PREFERENCE) {
    add(opts.models.find((m) => m.id === id));
    if (chosen.length >= 3) return chosen;
  }

  const availableSet = opts.availableModelIds?.length ? new Set(opts.availableModelIds) : null;
  const fallback = opts.models
    .filter((m) => (m.category ?? "text") === "text")
    .filter((m) => !availableSet || availableSet.has(m.id) || m.apiProvider !== "aihubmix")
    .sort((a, b) => scoreModel(b, "accurate") - scoreModel(a, "accurate"));

  for (const model of fallback) {
    add(model);
    if (chosen.length >= 3) return chosen;
  }

  add(opts.generatorModel);
  return chosen;
}

function aggregateScores(candidates: GptImage2Candidate[], judgePayloads: JudgePayload[]) {
  const totals = new Map<string, { score: number; count: number }>();
  for (const candidate of candidates) totals.set(candidate.id, { score: 0, count: 0 });

  let synthesizeVotes = 0;
  for (const payload of judgePayloads) {
    if (payload.shouldSynthesize) synthesizeVotes += 1;
    for (const item of payload.scores ?? []) {
      if (!item.id || typeof item.score !== "number") continue;
      const bucket = totals.get(item.id);
      if (!bucket) continue;
      bucket.score += Math.max(0, Math.min(100, item.score));
      bucket.count += 1;
    }
  }

  const averages = candidates.map((candidate) => {
    const bucket = totals.get(candidate.id);
    return {
      candidate,
      average: bucket && bucket.count > 0 ? bucket.score / bucket.count : 0,
    };
  });

  averages.sort((a, b) => b.average - a.average);
  return { averages, synthesizeVotes };
}

export async function runGptImage2Ensemble(opts: GptImage2EnsembleOptions): Promise<GptImage2EnsembleResult> {
  const startedAt = Date.now();
  const calls: Array<{ model: ModelInfo; result: GenerateResult }> = [];
  const generatorApiProvider = resolveRuntimeApiProvider(opts.generatorModel, opts.userKeys, opts.availableModelIds);

  const candidateResult = await callProvider({
    model: opts.generatorModel.id,
    apiProvider: generatorApiProvider,
    systemPrompt: "You generate candidate prompts for GPT Image 2. Output strict JSON only.",
    userPrompt: buildCandidatePrompt(opts.userIdea, opts.language),
    maxTokens: Math.min(opts.maxTokens, 4096),
    temperature: 0.45,
    userKeys: opts.userKeys,
  });
  calls.push({ model: opts.generatorModel, result: candidateResult });

  const parsed = safeParseJson<CandidatePayload>(candidateResult.text);
  const candidates = normalizeCandidates(parsed);

  if (candidates.length < 2) {
    return {
      text: candidateResult.text.trim(),
      inputTokens: candidateResult.inputTokens,
      outputTokens: candidateResult.outputTokens,
      latencyMs: Date.now() - startedAt,
      totalCostUsd: modelCost(opts.generatorModel, candidateResult),
      meta: {
        reviewSummary: "GPT Image 2 source ensemble fallback: candidate JSON parsing failed, returned the generator prompt directly.",
        judgeModels: [opts.generatorModel.name],
        selectedStrategy: "fallback",
        sourceCommits: [...GPT_IMAGE_2_SOURCE_COMMITS],
      },
    };
  }

  const judgePlans = selectJudgeModels(opts);
  const judgeResults = await Promise.allSettled(
    judgePlans.map(async (plan) => {
      const result = await callProvider({
        model: plan.model.id,
        apiProvider: plan.apiProvider,
        systemPrompt: "You are a strict image-prompt evaluator. Output strict JSON only.",
        userPrompt: buildJudgePrompt(candidates, opts.userIdea, opts.language),
        maxTokens: 1200,
        temperature: 0.1,
        userKeys: opts.userKeys,
      });
      calls.push({ model: plan.model, result });
      return safeParseJson<JudgePayload>(result.text);
    }),
  );

  const judgePayloads = judgeResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is JudgePayload => Boolean(r));

  const { averages, synthesizeVotes } = aggregateScores(candidates, judgePayloads);
  const fallbackWinner = candidates.find((c) => c.id === "hybrid") ?? candidates[0];
  const top = averages[0]?.average > 0 ? averages[0] : { candidate: fallbackWinner, average: 0 };
  const hybridScore = averages.find((a) => a.candidate.id === "hybrid")?.average ?? 0;
  const bestSingle = averages.find((a) => a.candidate.id !== "hybrid") ?? top;
  const hybrid = candidates.find((c) => c.id === "hybrid");

  const shouldSynthesize =
    Boolean(hybrid) &&
    (synthesizeVotes > 0 || Math.abs(bestSingle.average - hybridScore) <= 3);

  let finalPrompt = top.candidate.prompt;
  let selectedStrategy = top.candidate.id;

  if (shouldSynthesize && hybrid) {
    const synthesisResult = await callProvider({
      model: opts.generatorModel.id,
      apiProvider: generatorApiProvider,
      systemPrompt: "You synthesize the final GPT Image 2 prompt. Output only the final prompt.",
      userPrompt: buildSynthesisPrompt(opts.userIdea, bestSingle.candidate, hybrid, opts.language),
      maxTokens: Math.min(opts.maxTokens, 2048),
      temperature: 0.35,
      userKeys: opts.userKeys,
    });
    calls.push({ model: opts.generatorModel, result: synthesisResult });
    if (synthesisResult.text.trim()) {
      finalPrompt = synthesisResult.text.trim();
      selectedStrategy = `${bestSingle.candidate.id}+hybrid`;
    }
  }

  const inputTokens = calls.reduce((sum, c) => sum + c.result.inputTokens, 0);
  const outputTokens = calls.reduce((sum, c) => sum + c.result.outputTokens, 0);
  const totalCostUsd = calls.reduce((sum, c) => sum + modelCost(c.model, c.result), 0);
  const scoreText = averages
    .filter((a) => a.average > 0)
    .slice(0, 5)
    .map((a) => `${a.candidate.id}:${a.average.toFixed(1)}`)
    .join(", ");

  return {
    text: finalPrompt,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
    totalCostUsd,
    meta: {
      reviewSummary: `GPT Image 2 four-source ensemble used ${judgePlans.length || 1} judge model(s). Scores: ${scoreText || "fallback selected"}.`,
      judgeModels: judgePlans.map((p) => p.model.name),
      selectedStrategy,
      sourceCommits: [...GPT_IMAGE_2_SOURCE_COMMITS],
    },
  };
}
