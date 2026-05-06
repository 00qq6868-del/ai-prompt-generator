import type { PreferenceDecision } from "@/lib/server/storage";

export function normalizeDecision(value: unknown): PreferenceDecision {
  if (value === "new" || value === "new_better") return "new_better";
  if (value === "old" || value === "old_better") return "old_better";
  if (value === "blend" || value === "blend_needed") return "blend_needed";
  if (value === "both_bad") return "both_bad";
  return "new_better";
}

export function legacyDecision(value: PreferenceDecision): "new" | "old" | "blend" | "both_bad" {
  if (value === "new_better") return "new";
  if (value === "old_better") return "old";
  if (value === "blend_needed") return "blend";
  return "both_bad";
}

export function buildSyntheticBlendPrompt(args: {
  userIdea: string;
  oldPrompt?: string | null;
  newPrompt: string;
  feedbackNotes?: string;
  failedDimensions?: string[];
  language?: "zh" | "en";
}): string {
  const failed = (args.failedDimensions ?? []).filter(Boolean);
  const isEnglish = args.language === "en";
  if (isEnglish) {
    return [
      "Synthetic optimized prompt generated from user feedback:",
      "",
      "User intent:",
      args.userIdea.trim(),
      "",
      "Final prompt:",
      "Use the stable structure from the previous version and the useful specificity from the new version. Remove every vague, inflated, or unverifiable instruction. Preserve the user's exact intent, add concrete constraints, and include strict quality checks.",
      "",
      args.oldPrompt ? `Previous-version strengths to preserve:\n${args.oldPrompt.trim()}` : "",
      "",
      `New-version improvements to keep:\n${args.newPrompt.trim()}`,
      "",
      args.feedbackNotes ? `User dissatisfaction to fix:\n${args.feedbackNotes.trim()}` : "",
      failed.length ? `Failed dimensions that must be corrected: ${failed.join(", ")}` : "",
      "",
      "Mandatory quality gate: do not give high confidence to pretty but wrong output. Check reference consistency, text readability, object proportions, lighting, composition, material detail, face/hand integrity, and whether the result can pass a strict 60/100 threshold.",
    ].filter(Boolean).join("\n");
  }

  return [
    "根据用户反馈生成的折中优化版提示词：",
    "",
    "用户原始需求：",
    args.userIdea.trim(),
    "",
    "最终提示词：",
    "保留旧版中稳定、清晰、可执行的结构，吸收新版真正增加质量的细节；删除两版共同存在的空泛、虚高、不可验证表达。严格围绕用户原始需求，补充具体约束、失败规避、质量检查与输出标准。",
    "",
    args.oldPrompt ? `旧版仍有价值的部分：\n${args.oldPrompt.trim()}` : "",
    "",
    `新版值得保留的增益：\n${args.newPrompt.trim()}`,
    "",
    args.feedbackNotes ? `用户不满意原因，必须修复：\n${args.feedbackNotes.trim()}` : "",
    failed.length ? `失败维度，必须逐项补强：${failed.join("、")}` : "",
    "",
    "强制质量门槛：不要因为结果好看就给高分；必须检查参考图一致性、文字可读性、物体/人体比例、光影、构图、材质细节、五官/手部完整性和商业完成度。60分只是及格线，任一核心维度低于3/10直接不合格。",
  ].filter(Boolean).join("\n");
}
