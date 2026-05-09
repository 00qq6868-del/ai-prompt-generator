import type { ModelInfo } from "@/lib/models-registry";

export type PromptAuthoringLanguage = "en" | "zh";

export interface PromptLanguagePolicy {
  promptLanguage: PromptAuthoringLanguage;
  explanationLanguage: "zh";
  truePromptLanguageLabel: string;
  reasonZh: string;
  reasonEn: string;
  isChineseFirstModel: boolean;
}

function lower(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function modelSignature(model: Pick<ModelInfo, "id" | "name" | "provider" | "apiProvider" | "tags">): string {
  return [
    model.id,
    model.name,
    model.provider,
    model.apiProvider,
    ...(model.tags ?? []),
  ].map(lower).join(" ");
}

export function isChineseFirstModel(model: Pick<ModelInfo, "id" | "name" | "provider" | "apiProvider" | "tags">): boolean {
  const sig = modelSignature(model);
  return /qwen|通义|alibaba|aliyun|百炼|glm|zhipu|智谱|kimi|moonshot|月之暗面|ernie|baidu|百度|wenxin|文心|hunyuan|tencent|腾讯|deepseek|豆包|doubao|字节|bytedance|minimax|abab|yi[-_ ]|零一万物|01-ai|chinese/.test(sig);
}

export function resolvePromptLanguagePolicy(
  targetModel: Pick<ModelInfo, "id" | "name" | "provider" | "apiProvider" | "tags">,
): PromptLanguagePolicy {
  const chineseFirst = isChineseFirstModel(targetModel);
  if (chineseFirst) {
    return {
      promptLanguage: "zh",
      explanationLanguage: "zh",
      truePromptLanguageLabel: "中文 Chinese",
      reasonZh: "目标模型属于中国本土或中文优先模型，真正用于复制的 AI 提示词使用中文以获得更稳定的指令遵循。",
      reasonEn: "The target model is China-native or Chinese-first, so the copyable AI prompt uses Chinese for stronger instruction following.",
      isChineseFirstModel: true,
    };
  }

  return {
    promptLanguage: "en",
    explanationLanguage: "zh",
    truePromptLanguageLabel: "English 英语",
    reasonZh: "目标模型属于海外通用/旗舰模型，默认英语提示词表现最稳；中文只用于向用户解释设计思路。",
    reasonEn: "The target model is a foreign general/flagship model, where English prompts are the most stable by default; Chinese is used only for the user-facing explanation.",
    isChineseFirstModel: false,
  };
}

export function promptLanguageInstruction(policy: PromptLanguagePolicy): string {
  if (policy.promptLanguage === "zh") {
    return [
      "# TRUE PROMPT LANGUAGE",
      "The copyable AI prompt body MUST be written in Chinese because the target model is Chinese-first.",
      "Keep code, JSON keys, CLI flags, image-model parameters, proper nouns, and exact model names in their original form.",
      "After the prompt body, include a short Chinese explanation for the user.",
      `Policy reason: ${policy.reasonEn}`,
    ].join("\n");
  }

  return [
    "# TRUE PROMPT LANGUAGE",
    "The copyable AI prompt body MUST be written in English because the target model is strongest with English instructions.",
    "Use Chinese only in the separate user-facing explanation section. Do not mix Chinese into the AI Prompt section unless the user's requested final output itself must be Chinese.",
    "Preserve Chinese names, Chinese UI labels, exact user-provided Chinese text, and target-output language constraints when they are part of the task.",
    `Policy reason: ${policy.reasonEn}`,
  ].join("\n");
}
