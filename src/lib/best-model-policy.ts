import type { ModelInfo } from "@/lib/models-registry";

export const BEST_TARGET_MODEL_ID = "gpt-5.5-pro";
export const BEST_BALANCED_MODEL_ID = "gpt-5.5";
export const BEST_IMAGE_MODEL_ID = "gpt-image-2";

export const BEST_TEXT_MODEL_PRIORITY = [
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.4-pro",
  "gpt-5.4",
  "claude-opus-4-7",
  "gemini-3.1-pro-preview",
  "deepseek-v4-pro",
  "qwen3-235b-a22b",
  "grok-4",
  "o3-pro",
  "o3",
  "gpt-4.1",
  "claude-sonnet-4-6",
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-preview-customtools",
  "deepseek-v4-flash",
];

export const BEST_GENERATOR_MODEL_PRIORITY = [
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.4",
  "claude-opus-4-7",
  "gemini-3.1-pro-preview",
  "deepseek-v4-pro",
];

export const BEST_EVALUATOR_MODEL_PRIORITY = [
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.4-pro",
  "claude-opus-4-7",
  "gemini-3.1-pro-preview",
  "deepseek-v4-pro",
  "o3-pro",
  "o3",
];

export const LEGACY_AUTO_MODEL_IDS = new Set([
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022",
  "gemini-2.0-flash",
  "gemini-2.5-pro-preview-03-25",
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-preview-customtools",
  "o4-mini",
  "deepseek-chat",
  "deepseek-reasoner",
]);

const AUTO_UPGRADE_TO_PRO_GENERATOR_IDS = new Set([
  "gpt-5.5",
  "gpt-5.4-pro",
  "gpt-5.4",
  "gpt-5-pro",
  "gpt-5",
]);

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function isImageModelId(modelId: string | null | undefined): boolean {
  return lower(modelId ?? "") === BEST_IMAGE_MODEL_ID;
}

export function isLegacyAutoModelId(modelId: string | null | undefined): boolean {
  if (!modelId) return true;
  if (isImageModelId(modelId)) return false;
  return LEGACY_AUTO_MODEL_IDS.has(lower(modelId));
}

function shouldAutoUpgradeGeneratorIds(modelIds: string[]): boolean {
  if (modelIds.length === 0) return true;
  if (modelIds.some((id) => lower(id) === BEST_TARGET_MODEL_ID)) return false;
  return modelIds.every((id) => isLegacyAutoModelId(id) || AUTO_UPGRADE_TO_PRO_GENERATOR_IDS.has(lower(id)));
}

export function priorityIndex(modelId: string, priority: string[]): number {
  const key = lower(modelId);
  const index = priority.findIndex((id) => lower(id) === key);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function localQualityScore(model: ModelInfo): number {
  const speedScore = { ultrafast: 1, fast: 0.75, medium: 0.4, slow: 0.1 }[model.speed] ?? 0.4;
  const accuracyScore = { supreme: 1, high: 0.75, medium: 0.45, low: 0.2 }[model.accuracy] ?? 0.45;
  const avgCost = ((model.inputCostPer1M ?? 0) + (model.outputCostPer1M ?? 0)) / 2;
  const tokenScore = Math.max(0, 1 - avgCost / 180);
  const alignedScore = (accuracyScore + speedScore) / 2;
  return 0.1 * tokenScore + 0.1 * speedScore + 0.6 * accuracyScore + 0.2 * alignedScore;
}

export function bestPolicyScore(model: ModelInfo, mode: "target" | "generator" | "evaluator" = "target"): number {
  const priority =
    mode === "generator"
      ? BEST_GENERATOR_MODEL_PRIORITY
      : mode === "evaluator"
        ? BEST_EVALUATOR_MODEL_PRIORITY
        : BEST_TEXT_MODEL_PRIORITY;
  const index = priorityIndex(model.id, priority);
  const priorityBoost = Number.isFinite(index) ? 1000 - index * 25 : 0;
  const latestBoost = model.isLatest ? 20 : 0;
  const categoryPenalty = (model.category ?? "text") === "text" ? 0 : -100;
  return priorityBoost + latestBoost + localQualityScore(model) * 100 + categoryPenalty;
}

export function sortBestModels<T extends Pick<ModelInfo, "id" | "isLatest" | "category"> & ModelInfo>(
  models: T[],
  mode: "target" | "generator" | "evaluator" = "target",
): T[] {
  return [...models].sort((a, b) => {
    const scoreDiff = bestPolicyScore(b, mode) - bestPolicyScore(a, mode);
    if (scoreDiff !== 0) return scoreDiff;
    return String(b.releaseDate ?? "").localeCompare(String(a.releaseDate ?? ""));
  });
}

export function chooseBestAvailableModel(
  models: ModelInfo[],
  priority: string[] = BEST_TEXT_MODEL_PRIORITY,
): ModelInfo | null {
  for (const id of priority) {
    const match = models.find((model) => lower(model.id) === lower(id));
    if (match) return match;
  }
  return sortBestModels(models)[0] ?? null;
}

export function chooseBestGeneratorIds(models: ModelInfo[], count = 1): string[] {
  const textModels = models.filter((model) => (model.category ?? "text") === "text");
  return sortBestModels(textModels, "generator").slice(0, count).map((model) => model.id);
}

export function chooseBestEvaluatorIds(models: ModelInfo[], count = 6): string[] {
  const textModels = models.filter((model) => (model.category ?? "text") === "text");
  return sortBestModels(textModels, "evaluator").slice(0, count).map((model) => model.id);
}

export function normalizeBestModelPreference(input: {
  targetModelId?: string | null;
  generatorModelIds?: string[];
  evaluatorModelIds?: string[];
  isLocked?: boolean;
  source?: string;
}): {
  targetModelId: string;
  generatorModelIds: string[];
  evaluatorModelIds: string[];
  upgraded: boolean;
} {
  let upgraded = false;
  let targetModelId = input.targetModelId?.trim() || BEST_TARGET_MODEL_ID;
  const source = input.source ?? "auto";
  const shouldUpgradeTarget =
    !isImageModelId(targetModelId) &&
    (!input.isLocked || source === "auto" || isLegacyAutoModelId(targetModelId));
  if (shouldUpgradeTarget && targetModelId !== BEST_TARGET_MODEL_ID) {
    targetModelId = BEST_TARGET_MODEL_ID;
    upgraded = true;
  }

  let generatorModelIds = (input.generatorModelIds ?? []).filter(Boolean).slice(0, 6);
  if (shouldAutoUpgradeGeneratorIds(generatorModelIds)) {
    generatorModelIds = [BEST_TARGET_MODEL_ID];
    upgraded = true;
  }

  const requestedEvaluatorModelIds = (input.evaluatorModelIds ?? []).filter(Boolean).slice(0, 6);
  const evaluatorModelIds = generatorModelIds.slice(0, 6);
  if (requestedEvaluatorModelIds.join(",") !== evaluatorModelIds.join(",")) {
    upgraded = true;
  }

  return {
    targetModelId,
    generatorModelIds,
    evaluatorModelIds,
    upgraded,
  };
}
