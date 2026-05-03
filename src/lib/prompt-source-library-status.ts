export interface PromptSourceRepositoryStatus {
  repo: string;
  url: string;
  focus: string;
  stars: number;
  defaultBranch: string;
  updatedAt: string;
  description: string;
  short: string;
  commit: string;
}

export const PROMPT_SOURCE_LIBRARY_UPDATED_AT = "2026-05-03T17:19:02.007Z";

export const PROMPT_SOURCE_LIBRARY_STATUS = [
  {
    "repo": "dair-ai/Prompt-Engineering-Guide",
    "url": "https://github.com/dair-ai/Prompt-Engineering-Guide",
    "focus": "prompt engineering research, methods, RAG, agents, examples",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "5767372",
    "commit": "57673726396dd94acb23bdb1e67f27c78ee85a8e"
  },
  {
    "repo": "danielmiessler/Fabric",
    "url": "https://github.com/danielmiessler/Fabric",
    "focus": "modular reusable prompt patterns for concrete tasks",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "8a3058e",
    "commit": "8a3058e2b819c4a80bf32bc9733052e9590b4c8b"
  },
  {
    "repo": "elder-plinius/CL4R1T4S",
    "url": "https://github.com/elder-plinius/CL4R1T4S",
    "focus": "system-prompt transparency corpus; use only for defensive structure analysis",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "1a55b8a",
    "commit": "1a55b8a36d47c86e8d774acef83306d56fb0b302"
  },
  {
    "repo": "elder-plinius/L1B3RT4S",
    "url": "https://github.com/elder-plinius/L1B3RT4S",
    "focus": "adversarial prompt corpus; use only for safety and failure-mode evaluation",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "64960b7",
    "commit": "64960b783249d36f76a48a33103cc4b168332b9b"
  },
  {
    "repo": "JushBJJ/Mr.-Ranedeer-AI-Tutor",
    "url": "https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor",
    "focus": "education, tutoring, adaptive learning prompts",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "ea29bcf",
    "commit": "ea29bcf196d28e70eb31100d00b108ebbacceb96"
  },
  {
    "repo": "linshenkx/prompt-optimizer",
    "url": "https://github.com/linshenkx/prompt-optimizer",
    "focus": "iterative prompt optimization product patterns",
    "stars": 0,
    "defaultBranch": "develop",
    "updatedAt": "",
    "description": "",
    "short": "e40fc24",
    "commit": "e40fc249ff70e51d1924181f109d79b985400aec"
  },
  {
    "repo": "liyupi/ai-guide",
    "url": "https://github.com/liyupi/ai-guide",
    "focus": "Chinese AI guide, prompt resources, coding and product workflows",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "1ce719f",
    "commit": "1ce719ffb3aaa5b612f4a04f1fcfd318b3831715"
  },
  {
    "repo": "Nagi-ovo/gemini-voyager",
    "url": "https://github.com/Nagi-ovo/gemini-voyager",
    "focus": "Gemini workflow enhancement, prompt library and chat export patterns",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "d73a92f",
    "commit": "d73a92f639781f55316134ca1536c808b1944779"
  },
  {
    "repo": "promptfoo/promptfoo",
    "url": "https://github.com/promptfoo/promptfoo",
    "focus": "prompt evaluation, tests, red-team criteria, CI quality gates",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "355fbaf",
    "commit": "355fbaf6e71d1afe24b3e5242cc00f1ee70753bc"
  },
  {
    "repo": "x1xhlol/system-prompts-and-models-of-ai-tools",
    "url": "https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools",
    "focus": "real-world system prompts and agent/tool patterns",
    "stars": 0,
    "defaultBranch": "main",
    "updatedAt": "",
    "description": "",
    "short": "9749f2d",
    "commit": "9749f2dcdbfd5d6b670614bb8407b706c19e3b9a"
  }
] as const satisfies readonly PromptSourceRepositoryStatus[];

export const PROMPT_SOURCE_LIBRARY_COMMITS = [
  "dair-ai/Prompt-Engineering-Guide@5767372",
  "danielmiessler/Fabric@8a3058e",
  "elder-plinius/CL4R1T4S@1a55b8a",
  "elder-plinius/L1B3RT4S@64960b7",
  "JushBJJ/Mr.-Ranedeer-AI-Tutor@ea29bcf",
  "linshenkx/prompt-optimizer@e40fc24",
  "liyupi/ai-guide@1ce719f",
  "Nagi-ovo/gemini-voyager@d73a92f",
  "promptfoo/promptfoo@355fbaf",
  "x1xhlol/system-prompts-and-models-of-ai-tools@9749f2d",
] as const;

export const PROMPT_EVALUATION_RUBRIC = [
  {
    "id": "intent_fidelity",
    "label": "Intent fidelity",
    "weight": 16,
    "guide": "Preserves every explicit user requirement, hidden constraint, target model, language, and output goal."
  },
  {
    "id": "task_decomposition",
    "label": "Task decomposition",
    "weight": 10,
    "guide": "Breaks complex work into clear phases, inputs, assumptions, checks, and decision points without overcomplicating small tasks."
  },
  {
    "id": "context_engineering",
    "label": "Context engineering",
    "weight": 12,
    "guide": "Defines role, audience, references, examples, retrieval/context boundaries, and what to ignore."
  },
  {
    "id": "specificity_control",
    "label": "Specificity and controllability",
    "weight": 12,
    "guide": "Uses concrete constraints, success criteria, style/format controls, and verifiable deliverables."
  },
  {
    "id": "model_fit",
    "label": "Target-model fit",
    "weight": 10,
    "guide": "Matches the target model category and known behavior; avoids unsupported flags, tools, or reasoning instructions."
  },
  {
    "id": "output_usability",
    "label": "Output usability",
    "weight": 12,
    "guide": "Produces copy-pasteable output with clean structure, labels, examples, and no unnecessary explanation."
  },
  {
    "id": "evaluation_ready",
    "label": "Evaluation readiness",
    "weight": 10,
    "guide": "Includes acceptance tests, scoring hooks, edge cases, or comparison criteria when useful."
  },
  {
    "id": "hallucination_safety",
    "label": "Hallucination and safety control",
    "weight": 10,
    "guide": "Requires uncertainty handling, source boundaries, refusal/redirect rules, and avoids unsafe prompt-injection patterns."
  },
  {
    "id": "efficiency",
    "label": "Efficiency",
    "weight": 8,
    "guide": "Keeps the prompt no longer than needed for the task and model context window."
  }
] as const;
