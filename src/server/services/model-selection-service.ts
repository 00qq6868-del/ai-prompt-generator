import { getModelPreference, saveModelPreference } from "../repositories/local-store.js";

export interface ModelRegistryItem {
  id: string;
  label: string;
  modalities: Array<"image" | "reasoning_code" | "defensive_redteam" | "general_text">;
  provider: "openai" | "anthropic" | "relay" | "local";
  defaultFor?: Array<"image" | "reasoning_code" | "defensive_redteam" | "general_text">;
}

export const MODEL_REGISTRY: ModelRegistryItem[] = [
  { id: "gpt-image-2", label: "GPT Image 2", modalities: ["image"], provider: "openai", defaultFor: ["image"] },
  { id: "gpt-5.5", label: "GPT-5.5", modalities: ["reasoning_code", "defensive_redteam", "general_text"], provider: "openai", defaultFor: ["reasoning_code", "defensive_redteam", "general_text"] },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", modalities: ["reasoning_code", "defensive_redteam", "general_text"], provider: "anthropic" },
];

const IMAGE_INTENT_PATTERN = /(图像|图片|照片|海报|插画|头像|视觉|以图生图|参考图|商业图|poster|image|photo|visual|reference image|generate.*picture)/i;
const REDTEAM_INTENT_PATTERN = /(红队|防御|漏洞|逆向|安全|注入|xss|sqli|攻防|red team|security|vulnerability|reverse|defensive)/i;
const CODE_INTENT_PATTERN = /(代码|重构|函数|接口|测试|构建|Next\.js|TypeScript|Python|bug|code|refactor|api|test|build)/i;

export function recommendTargetModel(input: { userIdea: string; hasReferenceImage?: boolean }): {
  targetModelId: string;
  reason: string;
} {
  if (input.hasReferenceImage || IMAGE_INTENT_PATTERN.test(input.userIdea)) {
    return { targetModelId: "gpt-image-2", reason: "image_or_reference_intent_detected" };
  }
  if (REDTEAM_INTENT_PATTERN.test(input.userIdea)) {
    return { targetModelId: "gpt-5.5", reason: "defensive_security_or_reverse_intent_detected" };
  }
  if (CODE_INTENT_PATTERN.test(input.userIdea)) {
    return { targetModelId: "gpt-5.5", reason: "reasoning_code_intent_detected" };
  }
  return { targetModelId: "gpt-5.5", reason: "general_text_default" };
}

export async function resolveTargetModel(input: {
  userIdea: string;
  targetModelId?: string;
  deviceId?: string;
  hasReferenceImage?: boolean;
}): Promise<{ targetModelId: string; source: "manual" | "locked_preference" | "auto"; reason: string }> {
  const explicit = input.targetModelId?.trim();
  if (explicit) {
    await saveModelPreference({
      targetModelId: explicit,
      isLocked: true,
      source: "manual",
      ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
    });
    return { targetModelId: explicit, source: "manual", reason: "explicit_target_model" };
  }

  const preference = await getModelPreference(input.deviceId);
  if (preference.isLocked) {
    return { targetModelId: preference.targetModelId, source: "locked_preference", reason: "manual_preference_locked" };
  }

  const recommended = recommendTargetModel({
    userIdea: input.userIdea,
    ...(input.hasReferenceImage === undefined ? {} : { hasReferenceImage: input.hasReferenceImage }),
  });
  await saveModelPreference({
    targetModelId: recommended.targetModelId,
    isLocked: false,
    source: "auto",
    ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
  });
  return { targetModelId: recommended.targetModelId, source: "auto", reason: recommended.reason };
}
