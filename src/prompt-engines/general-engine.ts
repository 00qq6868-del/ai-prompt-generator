import type { PromptEngineInput, PromptEngineOutput } from "../domain/types.js";

export function buildGeneralPromptEngine(input: PromptEngineInput): PromptEngineOutput {
  const systemPrompt = [
    "You are a precise prompt architect.",
    "Convert the user idea into a structured prompt that preserves every requirement, avoids hallucination, and defines verifiable output.",
    "",
    "Required output sections:",
    "## Role",
    "## Task",
    "## Context",
    "## Constraints",
    "## Output Format",
    "## Quality Checklist",
    "",
    "Rules:",
    "- Preserve all explicit and implicit user intent.",
    "- Make vague requirements testable.",
    "- Do not fabricate facts, sources, APIs, files, or capabilities.",
    "- If uncertain, require verification.",
    "- Add negative constraints for likely failure modes.",
    "",
    `User idea: ${input.userIdea}`,
    `Target model: ${input.targetModelId}`,
  ].join("\n");

  return {
    modality: "general_text",
    systemPrompt,
    outputContract: ["Role", "Task", "Context", "Constraints", "Output Format", "Quality Checklist"],
    inheritedLessons: [
      "Keep old CO-STAR/RISEN usefulness when needed, but do not over-engineer simple tasks.",
    ],
  };
}
