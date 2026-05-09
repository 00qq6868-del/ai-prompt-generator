import type { ModelInfo } from "@/lib/models-registry";
import {
  BEST_GENERATOR_MODEL_PRIORITY,
  BEST_TEXT_MODEL_PRIORITY,
  bestPolicyScore,
  priorityIndex,
} from "@/lib/best-model-policy";
import { isRelayModelListed } from "@/lib/relay-models";

export interface StrongModelRouteCandidate {
  id: string;
  name: string;
  provider: string;
  apiProvider: string;
  score: number;
  strength: "flagship" | "strong" | "usable" | "risky";
  listedByRelay: boolean;
  requested: boolean;
  reasons: string[];
  riskFlags: string[];
}

export interface StrongModelPreflightReport {
  requestedModelIds: string[];
  relayAvailableCount: number;
  selectedStrongModels: StrongModelRouteCandidate[];
  standbyStrongModels: StrongModelRouteCandidate[];
  skippedWeakOrRiskyModels: StrongModelRouteCandidate[];
  routingPolicy: string;
}

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function lower(value: string | null | undefined): string {
  return clean(value).toLowerCase();
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function modelText(model: ModelInfo): string {
  return `${model.id} ${model.name} ${model.provider} ${model.apiProvider} ${(model.tags ?? []).join(" ")}`.toLowerCase();
}

export function modelRoutingRiskFlags(model: ModelInfo): string[] {
  const text = modelText(model);
  const flags: string[] = [];
  if (/(^|[/_-])cli[-_/]/.test(text) || text.includes(" cli-")) flags.push("cli-wrapper");
  if (/\bflash\b|[-_/]flash[-_/]|flash-preview/.test(text) && !/pro[-_/]high|pro/.test(text)) flags.push("flash-first");
  if (/mini|nano|small|lite|haiku|instant|turbo/.test(text)) flags.push("small-fast-model");
  if (/preview|experimental|exp\b|beta/.test(text)) flags.push("preview");
  if (/embedding|ocr|tts|image|video/.test(text) && (model.category ?? "text") !== "text") flags.push("not-text");
  return flags;
}

export function strongModelRoutingScore(
  model: ModelInfo,
  opts: {
    requestedIds?: string[];
    availableModelIds?: string[];
    preferRelayListed?: boolean;
    mode?: "generator" | "target";
  } = {},
): number {
  const mode = opts.mode ?? "generator";
  const text = modelText(model);
  const priority = mode === "generator" ? BEST_GENERATOR_MODEL_PRIORITY : BEST_TEXT_MODEL_PRIORITY;
  const exactPriorityIndex = priorityIndex(model.id, priority);
  const listedByRelay = isRelayModelListed(opts.availableModelIds, model.id);
  const requested = (opts.requestedIds ?? []).some((id) => lower(id) === lower(model.id));
  const riskFlags = modelRoutingRiskFlags(model);

  let score = bestPolicyScore(model, mode === "generator" ? "generator" : "target");

  if (Number.isFinite(exactPriorityIndex)) score += 2200 - exactPriorityIndex * 55;
  if (listedByRelay) score += 900;
  if (requested) score += 120;
  if (model.accuracy === "supreme") score += 420;
  if (model.accuracy === "high") score += 230;
  if (model.isLatest) score += 130;
  if ((model.contextWindow ?? 0) >= 1_000_000) score += 90;
  if ((model.contextWindow ?? 0) >= 128_000) score += 45;
  if ((model.tags ?? []).some((tag) => /reason|thinking|code|vision|agentic|flagship/i.test(tag))) score += 90;

  if (/gpt[-_ ]?5\.?5|gpt5\.?5/.test(text)) score += 520;
  if (/claude.*opus.*4.*7|opus.*4.*7/.test(text)) score += 500;
  if (/claude.*sonnet.*4.*6|sonnet.*4.*6/.test(text)) score += 430;
  if (/gemini.*3\.1.*pro.*high|gemini.*3\.1.*pro/.test(text)) score += 420;
  if (/deepseek.*v4.*pro/.test(text)) score += 340;
  if (/qwen3.*235b|qwen.*max|glm.*5/.test(text)) score += 300;
  if (/o3[-_ ]?pro|\bo3\b|o4/.test(text)) score += 260;
  if (/think|thinking|reason|xhigh|high/.test(text)) score += 90;
  if (/pro|opus|sonnet|ultra|max/.test(text)) score += 120;

  if (riskFlags.includes("cli-wrapper")) score -= 760;
  if (riskFlags.includes("flash-first")) score -= 360;
  if (riskFlags.includes("small-fast-model")) score -= 420;
  if (riskFlags.includes("preview")) score -= 70;
  if (riskFlags.includes("not-text")) score -= 2000;
  if ((model.category ?? "text") !== "text") score -= 1000;
  if (opts.preferRelayListed && model.apiProvider === "aihubmix" && opts.availableModelIds?.length && !listedByRelay) {
    score -= 1400;
  }

  return Math.round(score);
}

export function modelStrengthLabel(score: number, riskFlags: string[]): StrongModelRouteCandidate["strength"] {
  if (riskFlags.includes("not-text")) return "risky";
  if (score >= 3200) return "flagship";
  if (score >= 1700) return "strong";
  if (score >= 850) return "usable";
  return "risky";
}

export function describeStrongModel(model: ModelInfo, score: number, listedByRelay: boolean, requested: boolean): string[] {
  const text = modelText(model);
  const reasons: string[] = [];
  if (listedByRelay) reasons.push("中转站模型列表确认可见 / Listed by relay probe");
  if (requested) reasons.push("用户当前选择 / Current user selection");
  if (model.accuracy === "supreme") reasons.push("最高精度档 / Supreme accuracy tier");
  if (model.accuracy === "high") reasons.push("高精度档 / High accuracy tier");
  if (model.isLatest) reasons.push("登记为新模型 / Marked latest in registry");
  if (/gpt[-_ ]?5\.?5|claude.*opus.*4.*7|sonnet.*4.*6|gemini.*3\.1.*pro|deepseek.*v4.*pro|qwen3|glm.*5/.test(text)) {
    reasons.push("命中旗舰/强模型命名规则 / Matches flagship naming policy");
  }
  if (/pro|opus|sonnet|high|think|reason/.test(text)) reasons.push("包含高质量或推理信号 / Has quality or reasoning signal");
  if (!reasons.length) reasons.push(`综合评分 ${score} / Composite score ${score}`);
  return reasons.slice(0, 5);
}

export function toStrongModelCandidate(
  model: ModelInfo,
  opts: {
    apiProvider?: string;
    requestedIds?: string[];
    availableModelIds?: string[];
    preferRelayListed?: boolean;
    mode?: "generator" | "target";
  } = {},
): StrongModelRouteCandidate {
  const score = strongModelRoutingScore(model, opts);
  const listedByRelay = isRelayModelListed(opts.availableModelIds, model.id);
  const requested = (opts.requestedIds ?? []).some((id) => lower(id) === lower(model.id));
  const riskFlags = modelRoutingRiskFlags(model);
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    apiProvider: opts.apiProvider || model.apiProvider,
    score,
    strength: modelStrengthLabel(score, riskFlags),
    listedByRelay,
    requested,
    reasons: describeStrongModel(model, score, listedByRelay, requested),
    riskFlags,
  };
}

export function sortModelsForStrongRouting(
  models: ModelInfo[],
  opts: {
    requestedIds?: string[];
    availableModelIds?: string[];
    preferRelayListed?: boolean;
    mode?: "generator" | "target";
  } = {},
): ModelInfo[] {
  return [...models].sort((a, b) => {
    const diff = strongModelRoutingScore(b, opts) - strongModelRoutingScore(a, opts);
    if (diff !== 0) return diff;
    const dateDiff = String(b.releaseDate ?? "").localeCompare(String(a.releaseDate ?? ""));
    if (dateDiff !== 0) return dateDiff;
    return a.id.localeCompare(b.id);
  });
}

export function isStrongEnoughForPrimaryRoute(model: ModelInfo, score: number): boolean {
  const text = modelText(model);
  if ((model.category ?? "text") !== "text") return false;
  if (includesAny(text, [/mini|nano|small|lite|haiku|instant/])) return false;
  return score >= 850 || model.accuracy === "supreme" || model.accuracy === "high";
}

export function buildStrongModelPreflightReport(args: {
  requestedModelIds: string[];
  relayAvailableCount: number;
  selectedStrongModels: StrongModelRouteCandidate[];
  standbyStrongModels: StrongModelRouteCandidate[];
  skippedWeakOrRiskyModels: StrongModelRouteCandidate[];
}): StrongModelPreflightReport {
  return {
    requestedModelIds: args.requestedModelIds,
    relayAvailableCount: args.relayAvailableCount,
    selectedStrongModels: args.selectedStrongModels.slice(0, 6),
    standbyStrongModels: args.standbyStrongModels.slice(0, 8),
    skippedWeakOrRiskyModels: args.skippedWeakOrRiskyModels.slice(0, 8),
    routingPolicy:
      "先读取当前密钥/中转站可见模型，再按旗舰优先级、最新程度、精度、上下文、推理能力和风险惩罚排序；cli/mini/haiku/flash-only/未列入中转站的别名不会压过 GPT-5.5、Claude Opus/Sonnet、Gemini Pro、DeepSeek/Qwen/GLM 等强模型。 / The router first reads models visible to the current key/relay, then ranks by flagship priority, recency, accuracy, context, reasoning signals, and risk penalties; cli/mini/haiku/flash-only/unlisted aliases cannot outrank strong flagship models.",
  };
}
