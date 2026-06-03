import { applyDecision, createPromptVersion, listPromptVersions } from "../repositories/local-store.js";
import { estimatePromptScores, weightedScore } from "../../quality/quality-gate.js";

export function normalizePreference(value: unknown): "new_better" | "old_better" | "blend_needed" | "both_bad" {
  if (value === "old" || value === "old_better") return "old_better";
  if (value === "blend" || value === "blend_needed") return "blend_needed";
  if (value === "both_bad") return "both_bad";
  return "new_better";
}

export function buildSyntheticBlend(args: {
  userIdea: string;
  oldPrompt?: string;
  newPrompt?: string;
  notes?: string;
  failedDimensions?: string[];
}): string {
  return [
    "## Synthetic Blend Prompt",
    "",
    "目标：保留旧版中稳定、清晰、可执行的结构，吸收新版中真正增加质量的细节。如果两者都失败，则从用户原始意图重新推导。",
    "",
    `用户原始需求：${args.userIdea}`,
    args.oldPrompt ? `\n旧版可保留结构：\n${args.oldPrompt}` : "",
    args.newPrompt ? `\n新版可保留细节：\n${args.newPrompt}` : "",
    args.notes ? `\n用户反馈必须修复：\n${args.notes}` : "",
    args.failedDimensions?.length ? `\n失败维度必须逐项补强：${args.failedDimensions.join(", ")}` : "",
    "",
    "强制要求：增加可验证条件，删除空泛表达，不编造事实，输出前检查意图保真和防幻觉是否达到 9/10。",
  ].filter(Boolean).join("\n");
}

export async function comparePromptVersions(promptId: string) {
  const versions = await listPromptVersions(promptId);
  const oldVersion = versions[1] ?? versions[0] ?? null;
  const newVersion = versions[0] ?? null;
  const syntheticVersion = versions.find((item) => item.versionType === "synthetic") ?? null;
  return { versions, oldVersion, newVersion, syntheticVersion };
}

export async function decidePromptVersion(args: {
  promptId: string;
  decision: unknown;
  oldVersionId?: string;
  newVersionId?: string;
  oldPrompt?: string;
  newPrompt?: string;
  userIdea?: string;
  notes?: string;
  failedDimensions?: string[];
}) {
  const decision = normalizePreference(args.decision);
  if (decision === "blend_needed" || decision === "both_bad") {
    const blendArgs = {
      userIdea: args.userIdea ?? "",
      ...(args.oldPrompt === undefined ? {} : { oldPrompt: args.oldPrompt }),
      ...(decision === "both_bad" || args.newPrompt === undefined ? {} : { newPrompt: args.newPrompt }),
      ...(args.notes === undefined ? {} : { notes: args.notes }),
      ...(args.failedDimensions === undefined ? {} : { failedDimensions: args.failedDimensions }),
    };
    const syntheticPrompt = buildSyntheticBlend(blendArgs);
    const qualityGate = weightedScore(estimatePromptScores(syntheticPrompt, args.userIdea ?? "", args.failedDimensions));
    return applyDecision({ promptId: args.promptId, syntheticPrompt, qualityGate });
  }
  const decisionArgs = {
    promptId: args.promptId,
    ...((decision === "old_better" ? args.oldVersionId : args.newVersionId) === undefined ? {} : { selectedVersionId: decision === "old_better" ? args.oldVersionId : args.newVersionId }),
    ...((decision === "old_better" ? args.newVersionId : args.oldVersionId) === undefined ? {} : { rejectedVersionId: decision === "old_better" ? args.newVersionId : args.oldVersionId }),
  };
  return applyDecision(decisionArgs);
}

export async function createSyntheticVersion(promptId: string, userIdea: string, oldPrompt: string, newPrompt: string, notes: string) {
  const promptText = buildSyntheticBlend({ userIdea, oldPrompt, newPrompt, notes, failedDimensions: [] });
  const qualityGate = weightedScore(estimatePromptScores(promptText, userIdea));
  return createPromptVersion({
    promptId,
    versionType: "synthetic",
    promptText,
    decisionStatus: "candidate",
    qualityGate,
  });
}
