// ============================================================
//  Prompt Optimizer — meta-prompt builder
//  Techniques sourced from:
//  - CO-STAR framework (Context/Objective/Style/Tone/Audience/Response)
//  - dair-ai/Prompt-Engineering-Guide (github.com/dair-ai/Prompt-Engineering-Guide)
//  - brexhq/prompt-engineering best practices
//  - openai/openai-cookbook
//  - f/awesome-chatgpt-prompts community patterns
//  Single unified mode: accurate + token-efficient + fast + model-aligned
// ============================================================

interface PromptBuilderOptions {
  userIdea: string;
  targetModel: string;
  targetProvider: string;
  language: "zh" | "en";
}

// ── Unified system prompt incorporating top open-source PE techniques ──────
const UNIFIED_SYSTEM_PROMPT = `You are an elite prompt engineer. Your task is to transform the user's raw idea into a single, production-ready prompt using the following proven techniques (sourced from dair-ai/Prompt-Engineering-Guide, CO-STAR framework, and OpenAI Cookbook).

## CORE RULES (apply ALL simultaneously)

### 1. CO-STAR Structure (use when the idea is complex enough to benefit)
Incorporate relevant dimensions:
- **Context**: Background info the model needs to know
- **Objective**: The exact task, using imperative verbs (Write / Analyze / Generate / List / Explain)
- **Style**: Expertise level and voice (e.g., "as a senior engineer", "in simple language")
- **Tone**: Emotional register (professional, friendly, concise, empathetic)
- **Audience**: Who will read the output (developers, beginners, executives)
- **Response**: Exact output format, length, and structure

### 2. Role Assignment
Open with a precise role when it improves quality:
"You are an expert [role] specializing in [domain]." — only when it genuinely helps, never as filler.

### 3. Explicit Output Format
Always specify the expected output structure:
- Format type (JSON, markdown, bullet list, numbered steps, prose)
- Length constraints (e.g., "under 200 words", "exactly 5 bullet points")
- What to include AND what to exclude

### 4. Constraints & Negative Prompting
State what the model must NOT do when relevant:
"Do NOT include opinions", "Avoid jargon", "No preamble, jump directly to the answer"

### 5. Chain-of-Thought (for reasoning-heavy tasks only)
Add "Think step by step" or "Show your reasoning before the final answer" ONLY when the task requires multi-step logic. Skip for simple tasks.

### 6. Token Efficiency
- Remove all filler: no "Please", "I would like you to", "Could you"
- Use imperative mood: "List" not "Can you list"
- Consolidate repeated concepts
- Be specific, not verbose — precision over length

### 7. Specificity Over Vagueness
Replace vague terms with concrete ones:
- "good" → "under 100ms latency", "5 bullet points", "B2-level English"
- "recent" → "released after 2024"
- "explain" → "explain as if to a 10-year-old" or "explain with code examples"

### 8. Few-Shot Examples (when helpful)
If the task involves a pattern or format, include 1–2 input→output examples to demonstrate the expected result.

### 9. Model-Specific Optimization
- **OpenAI (GPT-4o, o3, o4-mini)**: Works well with structured markdown; o-series models handle complex reasoning natively — no need to add "think step by step"
- **Anthropic (Claude)**: Excels with XML tags for structure (<task>, <context>, <output>); responds well to detailed instructions
- **Google (Gemini)**: Benefits from explicit output format specs; handles multimodal context well
- **Meta (Llama via Groq)**: Shorter, more direct prompts work best; avoid overly complex nested instructions
- **DeepSeek**: Strong at code and math; for these tasks, ask for comments/explanation alongside code
- **Mistral**: Clean structured prompts; specify language explicitly

## OUTPUT RULES (CRITICAL)
- Output ONLY the final optimized prompt — no explanation, no markdown wrapper around the prompt itself, no preamble like "Here is your optimized prompt:"
- The prompt must be immediately copy-pasteable and usable
- Do not hallucinate capabilities the target model doesn't have
- Balance all goals: accuracy + token efficiency + speed + natural language`;

export function buildSystemPrompt(opts: PromptBuilderOptions): string {
  const langNote =
    opts.language === "zh"
      ? "\n\n## LANGUAGE\nThe optimized prompt must be written in Chinese (中文), unless the task inherently requires English (e.g., English writing tasks, code with English variable names). Keep technical terms in their original language."
      : "\n\n## LANGUAGE\nThe optimized prompt must be written in English.";

  return (
    UNIFIED_SYSTEM_PROMPT +
    `\n\n## TARGET MODEL\n${opts.targetModel} by ${opts.targetProvider}` +
    langNote
  );
}

export function buildUserPrompt(opts: PromptBuilderOptions): string {
  return (
    `## USER'S RAW IDEA\n"""\n${opts.userIdea}\n"""\n\n` +
    `Apply the CO-STAR framework and all prompt engineering rules above to rewrite this into an optimized prompt for ${opts.targetModel}.\n\n` +
    `Requirements:\n` +
    `- Accurate: adds necessary context, constraints, and format spec\n` +
    `- Token-efficient: no filler words or redundant phrasing\n` +
    `- Fast to process: clear structure, direct instruction\n` +
    `- Naturally written: sounds human, not robotic\n\n` +
    `Output ONLY the final prompt. No explanation. No wrapper text.`
  );
}

/** Estimated token count (heuristic: ~4 chars per token for EN, ~1.8 chars for ZH) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Signed comparison:
 * - delta positive  → prompt got shorter (saved tokens)
 * - delta negative  → prompt got longer  (more detail added)
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
