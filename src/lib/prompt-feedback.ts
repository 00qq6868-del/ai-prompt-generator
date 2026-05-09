import {
  PENDING_OPTIMIZATION_STORAGE_KEY,
  OPTIMIZATION_ITEMS_STORAGE_KEY,
  TEST_ERROR_STORAGE_KEY,
  buildAdaptiveTestPlan,
  buildOptimizationBacklogRules,
  buildStructuredOptimizationRules,
  mergeTestErrorRecords,
  mergeOptimizationProjectItems,
  mergeOptimizationBacklogItems,
  normalizeOptimizationProjectItem,
  normalizeTestErrorRecord,
  normalizeOptimizationBacklogItem,
  type AdaptiveTestPlan,
  type OptimizationProjectItem,
  type OptimizationBacklogItem,
  type TestErrorRecord,
} from "./optimization-backlog";

const FEEDBACK_STORAGE_KEY = "ai_prompt_feedback";
const INTENT_MEMORY_STORAGE_KEY = "ai_prompt_intent_memory";
const MAX_FEEDBACK_ITEMS = 200;
const MAX_PENDING_OPTIMIZATION_ITEMS = 200;
const MAX_TEST_ERROR_ITEMS = 400;
const MAX_OPTIMIZATION_ITEMS = 400;

export type PromptPreference = "new" | "old" | "blend" | "both_bad";
export type PromptPreferenceV2 = "new_better" | "old_better" | "blend_needed" | "both_bad";

export interface PromptFeedbackItem {
  id: string;
  timestamp: number;
  userIdea: string;
  originalPrompt?: string;
  previousPrompt?: string;
  optimizedPrompt: string;
  selectedPrompt: string;
  targetModel: string;
  generatorModels: string[];
  evaluatorModels: string[];
  language: "zh" | "en";
  userScore: number;
  starRating?: number;
  userNotes: string;
  preference: PromptPreference | PromptPreferenceV2;
  aiPromptScore?: number | null;
  aiSummary?: string;
  sourceCommits?: string[];
  localTestRunIds?: string[];
}

export interface PromptFeedbackMemory {
  rules: string[];
  examples: Array<{
    userIdea: string;
    targetModel: string;
    score: number;
    preference: PromptPreference | PromptPreferenceV2;
    notes: string;
    selectedPromptPreview: string;
  }>;
}

export interface IntentMemoryEvent {
  id: string;
  timestamp: number;
  userIdea: string;
  decision: "clarified" | "correction_accepted" | "correction_rejected";
  selectedDirection?: string;
  suggestedInput?: string;
  reason?: string;
}

export interface SavePromptFeedbackInput extends Omit<PromptFeedbackItem, "id" | "timestamp"> {}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeIdea(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 500);
}

export function getPromptFeedback(): PromptFeedbackItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(items: PromptFeedbackItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_FEEDBACK_ITEMS)));
}

function readJsonStorage<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonStorage<T>(key: string, items: T[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(items));
}

export function savePromptFeedback(input: SavePromptFeedbackInput): PromptFeedbackItem {
  const item: PromptFeedbackItem = {
    ...input,
    id: generateId(),
    timestamp: Date.now(),
  };
  saveAll([item, ...getPromptFeedback()].slice(0, MAX_FEEDBACK_ITEMS));
  return item;
}

export function getIntentMemoryEvents(): IntentMemoryEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INTENT_MEMORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveIntentMemoryEvent(input: Omit<IntentMemoryEvent, "id" | "timestamp">): IntentMemoryEvent {
  const item: IntentMemoryEvent = {
    ...input,
    id: generateId(),
    timestamp: Date.now(),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(INTENT_MEMORY_STORAGE_KEY, JSON.stringify([item, ...getIntentMemoryEvents()].slice(0, 100)));
  }
  return item;
}

export function getPendingOptimizationItems(): OptimizationBacklogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_OPTIMIZATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeOptimizationBacklogItem(item)).slice(0, MAX_PENDING_OPTIMIZATION_ITEMS)
      : [];
  } catch {
    return [];
  }
}

export function savePendingOptimizationItems(items: OptimizationBacklogItem[]): OptimizationBacklogItem[] {
  if (typeof window === "undefined" || !items.length) return getPendingOptimizationItems();
  const merged = mergeOptimizationBacklogItems(
    getPendingOptimizationItems(),
    items.map((item) => normalizeOptimizationBacklogItem(item)),
    MAX_PENDING_OPTIMIZATION_ITEMS,
  );
  localStorage.setItem(PENDING_OPTIMIZATION_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function getTestErrorRecords(): TestErrorRecord[] {
  if (typeof window === "undefined") return [];
  const legacyBacklog = getPendingOptimizationItems();
  const structured = readJsonStorage<TestErrorRecord>(TEST_ERROR_STORAGE_KEY).map((item) =>
    normalizeTestErrorRecord(item, item.project_id || "ai-prompt-generator")
  );
  const legacyConverted = legacyBacklog.map((item) => normalizeTestErrorRecord({
    project_id: "ai-prompt-generator",
    error_type: item.type === "model_error" ? "api" : item.type === "low_dimension" ? "logic" : "other",
    severity: item.severity === "red" ? "high" : item.severity === "yellow" ? "medium" : "low",
    summary: item.title,
    detail: item.detail,
    reproduction_path: [
      "打开 AI 提示词测试通道 / Open AI prompt test channel",
      "点击一键全流程测试 / Click one-click full-flow test",
      item.modelId ? `调用模型 ${item.modelId}` : "",
      item.checkId ? `触发检查 ${item.checkId}` : "",
    ].filter(Boolean),
    test_case_id: item.checkId || item.dimension || item.modelId || "one_click_full_flow",
    discovered_at: new Date(item.createdAt).toISOString(),
    status: item.status === "resolved" ? "resolved" : "open",
    optimization_suggestion: item.action,
    auto_optimized: false,
    optimization_history: [],
    fingerprint: item.fingerprint,
    occurrences: item.occurrences,
    last_seen_at: new Date(item.lastSeenAt).toISOString(),
  }, "ai-prompt-generator"));
  return mergeTestErrorRecords(structured, legacyConverted, MAX_TEST_ERROR_ITEMS);
}

export function saveTestErrorRecords(items: TestErrorRecord[]): TestErrorRecord[] {
  if (typeof window === "undefined") return items;
  const merged = mergeTestErrorRecords(
    getTestErrorRecords(),
    items.map((item) => normalizeTestErrorRecord(item, item.project_id || "ai-prompt-generator")),
    MAX_TEST_ERROR_ITEMS,
  );
  writeJsonStorage(TEST_ERROR_STORAGE_KEY, merged);
  return merged;
}

export function getOptimizationProjectItems(): OptimizationProjectItem[] {
  if (typeof window === "undefined") return [];
  const raw = readJsonStorage<OptimizationProjectItem>(OPTIMIZATION_ITEMS_STORAGE_KEY).map((item) =>
    normalizeOptimizationProjectItem(item, item.project_id || "ai-prompt-generator")
  );
  const legacyConverted = getPendingOptimizationItems().map((item) =>
    normalizeOptimizationProjectItem({
      project_id: "ai-prompt-generator",
      linked_error_ids: item.fingerprint ? [item.fingerprint] : [item.id],
      priority: item.severity === "red" ? "P0" : item.severity === "yellow" ? "P1" : "P2",
      description: item.title,
      suggested_actions: [item.action],
      created_at: new Date(item.createdAt).toISOString(),
      resolved_at: item.status === "resolved" ? new Date(item.lastSeenAt).toISOString() : null,
      auto_applied: false,
      fingerprint: item.fingerprint,
    }, "ai-prompt-generator")
  );
  return mergeOptimizationProjectItems(raw, legacyConverted, "ai-prompt-generator", MAX_OPTIMIZATION_ITEMS);
}

export function saveOptimizationProjectItems(items: OptimizationProjectItem[]): OptimizationProjectItem[] {
  if (typeof window === "undefined") return items;
  const merged = mergeOptimizationProjectItems(
    getOptimizationProjectItems(),
    items.map((item) => normalizeOptimizationProjectItem(item, item.project_id || "ai-prompt-generator")),
    "ai-prompt-generator",
    MAX_OPTIMIZATION_ITEMS,
  );
  writeJsonStorage(OPTIMIZATION_ITEMS_STORAGE_KEY, merged);
  return merged;
}

export function normalizePromptPreference(preference: PromptPreference | PromptPreferenceV2): PromptPreferenceV2 {
  if (preference === "new") return "new_better";
  if (preference === "old") return "old_better";
  if (preference === "blend") return "blend_needed";
  return preference;
}

export function preferenceToLegacy(preference: PromptPreference | PromptPreferenceV2): PromptPreference {
  if (preference === "new_better") return "new";
  if (preference === "old_better") return "old";
  if (preference === "blend_needed") return "blend";
  return preference;
}

export function findPreviousPrompt(userIdea: string, targetModel: string): string | null {
  const ideaKey = normalizeIdea(userIdea);
  if (!ideaKey) return null;

  const feedbackMatch = getPromptFeedback().find((item) =>
    item.targetModel === targetModel &&
    normalizeIdea(item.userIdea) === ideaKey &&
    item.selectedPrompt.trim().length > 0
  );
  if (feedbackMatch) return feedbackMatch.selectedPrompt;

  try {
    const raw = localStorage.getItem("ai_prompt_history");
    const history = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(history)) return null;
    const match = history.find((item) =>
      item?.targetModel === targetModel &&
      normalizeIdea(String(item?.userIdea || "")) === ideaKey &&
      String(item?.optimizedPrompt || "").trim().length > 0
    );
    return match ? String(match.optimizedPrompt) : null;
  } catch {
    return null;
  }
}

export function buildPromptFeedbackMemory(userIdea: string, targetModel: string): PromptFeedbackMemory {
  const ideaKey = normalizeIdea(userIdea);
  const relevant = getPromptFeedback()
    .filter((item) => item.targetModel === targetModel || normalizeIdea(item.userIdea) === ideaKey)
    .slice(0, 20);

  const rules = new Set<string>();
  for (const item of relevant) {
    if (item.userScore < 70) {
      rules.add("用户评分低于 70 时，下一版必须明显增加可验证细节、约束、失败规避和输出检查，不要只复述原文。");
    }
    if (item.preference === "old" || item.preference === "old_better") {
      rules.add("如果用户选择旧版更好，后续优化要保留旧版表达结构，只做最小增量修补。");
    }
    if (item.preference === "blend" || item.preference === "blend_needed") {
      rules.add("如果用户认为新旧都不够好但可折中，后续生成要融合旧版稳定结构和新版新增细节，再输出一个折中改进版。");
    }
    if (item.preference === "both_bad") {
      rules.add("如果用户认为新旧都不好，后续必须从用户原始需求重新分析，不沿用失败表达，并列出更细的质量控制条件。");
    }
    if (/评分.*高|太高|虚高|不真实|不像|细节|抠|手|脸|文字|比例|构图|光影|真实照片/.test(item.userNotes)) {
      rules.add("评分要更严格：发现手、脸、文字、比例、构图、光影、真实感或商业完成度问题时，不能给高分。");
    }
  }

  for (const item of getIntentMemoryEvents().slice(0, 12)) {
    if (item.decision === "clarified" && item.selectedDirection) {
      rules.add(`用户曾因输入冲突澄清主方向为「${item.selectedDirection}」；遇到相似冲突时必须先确认，不要擅自选择。`);
    }
    if (item.decision === "correction_accepted" && item.suggestedInput) {
      rules.add("用户接受过自动纠错；高置信误写可以提示纠正，但必须保留用户确认记录。");
    }
    if (item.decision === "correction_rejected") {
      rules.add("用户曾拒绝自动纠错；低置信纠错必须追问或允许保留原文，不能强行改写。");
    }
  }

  for (const rule of buildOptimizationBacklogRules(getPendingOptimizationItems()).slice(0, 12)) {
    rules.add(rule);
  }

  const testErrorRecords = getTestErrorRecords();
  const optimizationItems = getOptimizationProjectItems();
  const adaptivePlan: AdaptiveTestPlan | undefined = testErrorRecords.length
    ? buildAdaptiveTestPlan({
        projectId: "ai-prompt-generator",
        historicalErrors: testErrorRecords,
        historicalOptimizations: optimizationItems,
      })
    : undefined;

  for (const rule of buildStructuredOptimizationRules(testErrorRecords, optimizationItems, adaptivePlan).slice(0, 12)) {
    rules.add(rule);
  }

  return {
    rules: [...rules].slice(0, 12),
    examples: relevant.slice(0, 8).map((item) => ({
      userIdea: item.userIdea.slice(0, 360),
      targetModel: item.targetModel,
      score: item.userScore,
      preference: item.preference,
      notes: item.userNotes.slice(0, 500),
      selectedPromptPreview: item.selectedPrompt.slice(0, 500),
    })),
  };
}
