// ============================================================
//  Prompt Optimizer — meta-prompt builder
//  Generates optimized prompts for each optimization mode
// ============================================================

import { OptimizationMode } from "./models-registry";

interface PromptBuilderOptions {
  userIdea: string;
  targetModel: string;
  targetProvider: string;
  mode: OptimizationMode;
  language: "zh" | "en";
}

const MODE_SYSTEM_PROMPTS: Record<OptimizationMode, string> = {
  token: `You are an expert prompt engineer specializing in token efficiency.
Your goal: rewrite the user's idea into the most concise, token-efficient prompt for the specified AI model.
Rules:
- Remove every redundant word while preserving full meaning
- Use bullets or structured formats only when they genuinely save tokens
- Avoid verbose preambles like "Please" / "I would like you to"
- Output ONLY the optimized prompt, no explanation`,

  fast: `You are an expert prompt engineer specializing in low-latency responses.
Your goal: rewrite the user's idea so the target model can answer in the fewest processing steps.
Rules:
- Ask for a single, direct output with no chain-of-thought unless truly needed
- Prefer closed-form questions over open-ended ones when possible
- Add "Be concise." or "One sentence." where appropriate
- Output ONLY the optimized prompt, no explanation`,

  accurate: `You are an expert prompt engineer maximizing factual accuracy and reasoning depth.
Your goal: rewrite the user's idea so the target model gives the most accurate, thorough answer.
Rules:
- Add context, constraints, and output format specifications
- Include "Think step by step" or "Show your reasoning" when beneficial
- Specify expected length, structure, and quality bar
- For the target model's known strengths, lean into them
- Output ONLY the optimized prompt, no explanation`,

  aligned: `You are an expert prompt engineer maximizing human-AI alignment.
Your goal: rewrite the user's idea so the output reads as natural and human as possible.
Rules:
- Match tone: friendly, empathetic, conversational where appropriate
- Use natural language examples and analogies
- Specify the exact persona or voice the model should adopt
- Ask for output that would not sound "AI-generated"
- Output ONLY the optimized prompt, no explanation`,
};

const MODE_LABELS: Record<OptimizationMode, string> = {
  token:    "最省Token",
  fast:     "最快速",
  accurate: "最准确",
  aligned:  "最符合人类语言",
};

export function buildSystemPrompt(opts: PromptBuilderOptions): string {
  const base = MODE_SYSTEM_PROMPTS[opts.mode];
  const modelCtx =
    `\nTarget model: ${opts.targetModel} (${opts.targetProvider})` +
    `\nOptimization goal: ${MODE_LABELS[opts.mode]}` +
    (opts.language === "zh"
      ? "\nOutput language: Chinese (中文). The final prompt should be in Chinese unless the task requires English."
      : "\nOutput language: English.");
  return base + modelCtx;
}

export function buildUserPrompt(opts: PromptBuilderOptions): string {
  return (
    `User's raw idea:\n"""\n${opts.userIdea}\n"""\n\n` +
    `Generate an optimized prompt for ${opts.targetModel} optimized for: ${MODE_LABELS[opts.mode]}.` +
    `\n\nOutput ONLY the ready-to-use prompt text. No markdown, no preamble, no explanation.`
  );
}

/** Estimated token count (heuristic: ~4 chars per token for EN, ~1.8 chars for ZH) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * [S2 FIX] Signed comparison — does NOT clamp to ≥ 0.
 * - delta positive  → prompt got shorter (token/fast: 🎉 saved tokens)
 * - delta negative  → prompt got longer  (accurate/aligned: expected & fine)
 * - ratio           → signed percentage of the original length
 */
export function comparePrompts(
  original: string,
  optimized: string
): { delta: number; ratio: number } {
  const orig  = estimateTokens(original);
  const opt   = estimateTokens(optimized);
  const delta = orig - opt;                                 // positive = shorter
  const ratio = orig > 0 ? Math.round((delta / orig) * 100) : 0; // signed %
  return { delta, ratio };
}
