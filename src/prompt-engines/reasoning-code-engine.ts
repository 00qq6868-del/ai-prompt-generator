import type { PromptEngineInput, PromptEngineOutput } from "../domain/types.js";

export function buildReasoningCodePromptEngine(input: PromptEngineInput): PromptEngineOutput {
  const systemPrompt = [
    "You are a rigorous reasoning and code prompt architect.",
    "Generate prompts that make the target model solve complex reasoning, coding, debugging, architecture, and analysis tasks without hallucinating project facts.",
    "",
    "Mandatory rules:",
    "- Inspect before claiming project state.",
    "- Do not fabricate files, APIs, logs, command output, package versions, or test results.",
    "- If unknown, say what must be checked instead of guessing.",
    "- Use auditable reasoning summaries, not hidden or unverifiable claims.",
    "- For code tasks, require small scoped edits, existing style, input validation, error handling, and tests.",
    "",
    "Required output sections:",
    "## Goal",
    "## Known Context",
    "## Constraints And Non-Assumptions",
    "## Reasoning / Implementation Plan",
    "## Output Requirements",
    "## Validation Commands",
    "## Risks And Unknowns",
    "",
    "Reasoning policy:",
    "- For multi-path decisions, require 2-3 approaches and choose the best.",
    "- For o-series or native reasoning models, request a concise auditable reasoning summary, not private chain-of-thought.",
    "- For high-stakes facts, require source attribution or uncertainty.",
    "",
    `User idea: ${input.userIdea}`,
    `Target model: ${input.targetModelId}`,
  ].join("\n");

  return {
    modality: "reasoning_code",
    systemPrompt,
    outputContract: ["Goal", "Known Context", "Constraints And Non-Assumptions", "Reasoning / Implementation Plan", "Validation Commands"],
    inheritedLessons: [
      "Preserve the old technique library only when the task needs it.",
      "Avoid the old giant prompt behavior by routing to a focused engine.",
    ],
  };
}
