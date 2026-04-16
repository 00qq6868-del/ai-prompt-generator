// ============================================================
//  Prompt Optimizer — meta-prompt builder
//  Single unified mode: accurate + token-efficient + fast + model-aligned
// ============================================================

interface PromptBuilderOptions {
  userIdea: string;
  targetModel: string;
  targetProvider: string;
  language: "zh" | "en";
}

const UNIFIED_SYSTEM_PROMPT = `You are an expert prompt engineer. Your task is to rewrite the user's raw idea into a single, ready-to-use prompt that simultaneously achieves ALL of the following goals:

1. Maximum accuracy — Add necessary context, constraints, and output format so the model produces the most precise, thorough answer.
2. Token efficiency — Remove every redundant word; no verbose preambles like "Please" or "I would like you to".
3. Low latency — Structure the request so the model can respond with minimal processing overhead.
4. Natural alignment — Use clear, natural language that matches the expected tone; avoid sounding robotic.

Rules:
- Output ONLY the final optimized prompt. No explanation, no markdown wrapper, no preamble.
- The prompt must be immediately usable as-is.
- Balance all four goals — do not sacrifice accuracy for brevity, or naturalness for speed.`;

export function buildSystemPrompt(opts: PromptBuilderOptions): string {
  const langNote =
    opts.language === "zh"
      ? "\nOutput language: Chinese (中文). The final prompt should be in Chinese unless the task inherently requires English."
      : "\nOutput language: English.";

  return (
    UNIFIED_SYSTEM_PROMPT +
    `\nTarget model: ${opts.targetModel} (${opts.targetProvider})` +
    langNote
  );
}

export function buildUserPrompt(opts: PromptBuilderOptions): string {
  return (
    `User's raw idea:\n"""\n${opts.userIdea}\n"""\n\n` +
    `Rewrite the above into an optimized prompt for ${opts.targetModel}. ` +
    `It must be accurate, concise, fast to process, and naturally written.\n\n` +
    `Output ONLY the ready-to-use prompt text. No markdown, no preamble, no explanation.`
  );
}

/** Estimated token count (heuristic: ~4 chars per token for EN, ~1.8 chars for ZH) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Signed comparison — does NOT clamp to ≥ 0.
 * - delta positive  → prompt got shorter (saved tokens)
 * - delta negative  → prompt got longer  (more detail added)
 * - ratio           → signed percentage of the original length
 */
export function comparePrompts(
  original: string,
  optimized: string
): { delta: number; ratio: number } {
  const orig  = estimateTokens(original);
  const opt   = estimateTokens(optimized);
  const delta = orig - opt;
  const ratio = orig > 0 ? Math.round((delta / orig) * 100) : 0;
  return { delta, ratio };
}
