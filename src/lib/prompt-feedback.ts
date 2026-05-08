const FEEDBACK_STORAGE_KEY = "ai_prompt_feedback";
const INTENT_MEMORY_STORAGE_KEY = "ai_prompt_intent_memory";
const MAX_FEEDBACK_ITEMS = 200;

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
