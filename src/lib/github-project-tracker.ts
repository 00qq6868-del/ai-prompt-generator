export type GithubProjectGroup = "hallucination" | "prompt_optimization" | "gpt_image_2";

export interface GithubSeedProject {
  group: GithubProjectGroup;
  repo: string;
  url: string;
  required: boolean;
  focus: string;
}

export interface GithubTrackedProject extends GithubSeedProject {
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  pushedAt: string | null;
  updatedAt: string | null;
  description: string;
  defaultBranch: string;
  verifiedAt: string | null;
  verificationStatus: "verified" | "pending" | "failed";
  qualityScore: number;
  scoreReasons: string[];
  extractedRules: string[];
}

export const GITHUB_PROJECT_SEEDS: GithubSeedProject[] = [
  {
    group: "hallucination",
    repo: "confident-ai/deepeval",
    url: "https://github.com/confident-ai/deepeval",
    required: true,
    focus: "LLM evaluation metrics, regression tests, hallucination and factuality scoring.",
  },
  {
    group: "hallucination",
    repo: "arize-ai/phoenix",
    url: "https://github.com/arize-ai/phoenix",
    required: true,
    focus: "LLM observability, tracing, evals, dataset-driven debugging.",
  },
  {
    group: "hallucination",
    repo: "truera/trulens",
    url: "https://github.com/truera/trulens",
    required: true,
    focus: "Feedback functions, groundedness checks, RAG evaluation.",
  },
  {
    group: "hallucination",
    repo: "uptrain-ai/uptrain",
    url: "https://github.com/uptrain-ai/uptrain",
    required: true,
    focus: "LLM evaluation, checks, experiment tracking.",
  },
  {
    group: "hallucination",
    repo: "stanford-oval/WikiChat",
    url: "https://github.com/stanford-oval/WikiChat",
    required: true,
    focus: "Grounded conversational QA ideas and retrieval-backed hallucination reduction.",
  },
  {
    group: "hallucination",
    repo: "cvs-health/uqlm",
    url: "https://github.com/cvs-health/uqlm",
    required: true,
    focus: "Uncertainty quantification for language model outputs.",
  },
  {
    group: "hallucination",
    repo: "potsawee/selfcheckgpt",
    url: "https://github.com/potsawee/selfcheckgpt",
    required: true,
    focus: "Sampling-based self-consistency checks for hallucination detection.",
  },
  {
    group: "hallucination",
    repo: "KRLabsOrg/LettuceDetect",
    url: "https://github.com/KRLabsOrg/LettuceDetect",
    required: true,
    focus: "Hallucination/factual inconsistency detection; details must be verified from README.",
  },
  {
    group: "hallucination",
    repo: "DAMO-NLP-SG/VCD",
    url: "https://github.com/DAMO-NLP-SG/VCD",
    required: true,
    focus: "Vision-language hallucination mitigation/detection ideas; details must be verified from README.",
  },
  {
    group: "prompt_optimization",
    repo: "x1xhlol/system-prompts-and-models-of-ai-tools",
    url: "https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools",
    required: true,
    focus: "Prompt corpus for defensive pattern analysis and model-specific structure extraction.",
  },
  {
    group: "prompt_optimization",
    repo: "dair-ai/Prompt-Engineering-Guide",
    url: "https://github.com/dair-ai/Prompt-Engineering-Guide",
    required: true,
    focus: "Prompt engineering methods, examples, evaluation concepts.",
  },
  {
    group: "prompt_optimization",
    repo: "danielmiessler/Fabric",
    url: "https://github.com/danielmiessler/Fabric",
    required: true,
    focus: "Reusable task prompt patterns and workflow templates.",
  },
  {
    group: "prompt_optimization",
    repo: "JushBJJ/Mr.-Ranedeer-AI-Tutor",
    url: "https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor",
    required: true,
    focus: "Adaptive tutoring prompt patterns.",
  },
  {
    group: "prompt_optimization",
    repo: "linshenkx/prompt-optimizer",
    url: "https://github.com/linshenkx/prompt-optimizer",
    required: true,
    focus: "Prompt optimizer product and iterative rewrite ideas.",
  },
  {
    group: "prompt_optimization",
    repo: "elder-plinius/CL4R1T4S",
    url: "https://github.com/elder-plinius/CL4R1T4S",
    required: true,
    focus: "Adversarial corpus for defensive evaluation only; do not reuse unsafe bypass content.",
  },
  {
    group: "prompt_optimization",
    repo: "promptfoo/promptfoo",
    url: "https://github.com/promptfoo/promptfoo",
    required: true,
    focus: "Prompt testing, eval CI, regression gates.",
  },
  {
    group: "prompt_optimization",
    repo: "elder-plinius/L1B3RT4S",
    url: "https://github.com/elder-plinius/L1B3RT4S",
    required: true,
    focus: "Adversarial corpus for safety regression tests only.",
  },
  {
    group: "prompt_optimization",
    repo: "Nagi-ovo/gemini-voyager",
    url: "https://github.com/Nagi-ovo/gemini-voyager",
    required: true,
    focus: "Gemini workflow and prompt adaptation ideas.",
  },
  {
    group: "prompt_optimization",
    repo: "liyupi/ai-guide",
    url: "https://github.com/liyupi/ai-guide",
    required: true,
    focus: "Chinese AI learning and prompt guide material.",
  },
  {
    group: "gpt_image_2",
    repo: "EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
    url: "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
    required: true,
    focus: "GPT Image 2 API and prompt examples.",
  },
  {
    group: "gpt_image_2",
    repo: "Anil-matcha/Awesome-GPT-Image-2-API-Prompts",
    url: "https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts",
    required: true,
    focus: "GPT Image 2 prompt examples and API notes.",
  },
  {
    group: "gpt_image_2",
    repo: "wuyoscar/gpt_image_2_skill",
    url: "https://github.com/wuyoscar/gpt_image_2_skill",
    required: true,
    focus: "GPT Image 2 skill/prompt patterns.",
  },
  {
    group: "gpt_image_2",
    repo: "YouMind-OpenLab/awesome-gpt-image-2",
    url: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
    required: true,
    focus: "Awesome list for GPT Image 2 resources.",
  },
];

export const GITHUB_PROJECT_SEARCH_QUERIES: Record<GithubProjectGroup, string[]> = {
  hallucination: [
    "LLM hallucination evaluation stars:>100",
    "RAG evaluation hallucination detection stars:>100",
    "LLM observability evals groundedness stars:>100",
  ],
  prompt_optimization: [
    "prompt engineering evaluation stars:>100",
    "prompt optimizer LLM stars:>100",
    "prompt testing LLM eval stars:>100",
  ],
  gpt_image_2: [
    "\"gpt-image-2\" prompts",
    "\"GPT Image 2\" API prompts",
    "\"gpt image 2\" awesome",
  ],
};

function recencyScore(pushedAt: string | null): number {
  if (!pushedAt) return 0;
  const ageDays = (Date.now() - Date.parse(pushedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 30) return 20;
  if (ageDays <= 180) return 15;
  if (ageDays <= 365) return 10;
  if (ageDays <= 730) return 5;
  return 0;
}

function logScore(value: number | null, max: number): number {
  if (!value || value <= 0) return 0;
  return Math.min(max, Math.log10(value + 1) * (max / 5));
}

export function scoreGithubProject(project: Pick<GithubTrackedProject, "stars" | "forks" | "pushedAt" | "description" | "focus" | "verificationStatus">): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const stars = logScore(project.stars, 35);
  const forks = logScore(project.forks, 15);
  const recent = recencyScore(project.pushedAt);
  const relevance = /prompt|eval|hallucination|rag|image|gpt|llm|ground|uncertainty/i.test(`${project.description} ${project.focus}`) ? 20 : 8;
  const verified = project.verificationStatus === "verified" ? 10 : 0;
  score = stars + forks + recent + relevance + verified;
  reasons.push(`stars=${project.stars ?? "pending"} contributes ${Math.round(stars)}`);
  reasons.push(`forks=${project.forks ?? "pending"} contributes ${Math.round(forks)}`);
  reasons.push(`activity contributes ${recent}`);
  reasons.push(`relevance contributes ${relevance}`);
  if (verified) reasons.push("GitHub API verified");
  return { score: Math.round(score * 10) / 10, reasons };
}

export function extractProjectRules(project: GithubTrackedProject): string[] {
  const rules: string[] = [];
  if (project.group === "hallucination") {
    rules.push("对事实型、研究型、法律/医疗/安全任务启用更严格防幻觉：区分确定事实、合理推断、待验证信息。");
    rules.push("所有 GitHub 项目、stars、release、commit 必须来自实时 API 或标记待验证，禁止编造。");
    rules.push("评价候选提示词时加入 groundedness、uncertainty、self-consistency 和 retrieval/source-boundary 检查。");
  }
  if (project.group === "prompt_optimization") {
    rules.push("生成多个候选提示词后用固定 rubric 自动评分，最佳候选不足 9.0 时重写或融合。");
    rules.push("按内部模态/任务分类选择模板，但不要求用户手动选择分类。");
    rules.push("把失败案例转为 regression case；人工反馈优先覆盖 AI 评价。");
  }
  if (project.group === "gpt_image_2") {
    rules.push("GPT Image 2 提示词必须覆盖主体、构图、风格、镜头、光影、色彩、材质、负面约束和参数建议。");
    rules.push("以图生图必须保留参考图构图、比例、色彩、主体身份和商业完成度，不合格候选不展示给用户。");
  }
  return Array.from(new Set(rules));
}

export function buildPendingProject(seed: GithubSeedProject): GithubTrackedProject {
  const pending: GithubTrackedProject = {
    ...seed,
    stars: null,
    forks: null,
    openIssues: null,
    pushedAt: null,
    updatedAt: null,
    description: "",
    defaultBranch: "",
    verifiedAt: null,
    verificationStatus: "pending",
    qualityScore: 0,
    scoreReasons: ["待 GitHub API 实时查询确认；不能编造 stars/forks/activity。"],
    extractedRules: [],
  };
  const scored = scoreGithubProject(pending);
  return {
    ...pending,
    qualityScore: scored.score,
    scoreReasons: scored.reasons,
    extractedRules: extractProjectRules(pending),
  };
}

export function selectTopProjects(projects: GithubTrackedProject[], group: GithubProjectGroup, limit = 3): GithubTrackedProject[] {
  return projects
    .filter((project) => project.group === group)
    .sort((a, b) => {
      const starDelta = (b.stars ?? -1) - (a.stars ?? -1);
      if (starDelta !== 0) return starDelta;
      return b.qualityScore - a.qualityScore;
    })
    .slice(0, limit);
}

