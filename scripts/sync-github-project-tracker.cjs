#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "data", "github-projects");
const sourceTsPath = path.join(projectRoot, "src", "lib", "github-project-tracker-status.ts");

const seeds = [
  ["hallucination", "confident-ai/deepeval", "https://github.com/confident-ai/deepeval", "LLM evaluation metrics and hallucination scoring."],
  ["hallucination", "arize-ai/phoenix", "https://github.com/arize-ai/phoenix", "LLM observability, traces, evals, dataset debugging."],
  ["hallucination", "truera/trulens", "https://github.com/truera/trulens", "Feedback functions and groundedness checks."],
  ["hallucination", "uptrain-ai/uptrain", "https://github.com/uptrain-ai/uptrain", "LLM evaluation checks and experiment tracking."],
  ["hallucination", "stanford-oval/WikiChat", "https://github.com/stanford-oval/WikiChat", "Grounded conversational QA ideas."],
  ["hallucination", "cvs-health/uqlm", "https://github.com/cvs-health/uqlm", "Uncertainty quantification for LLM outputs."],
  ["hallucination", "potsawee/selfcheckgpt", "https://github.com/potsawee/selfcheckgpt", "Sampling-based self-consistency hallucination checks."],
  ["hallucination", "KRLabsOrg/LettuceDetect", "https://github.com/KRLabsOrg/LettuceDetect", "Hallucination/factual inconsistency detection; verify README."],
  ["hallucination", "DAMO-NLP-SG/VCD", "https://github.com/DAMO-NLP-SG/VCD", "Vision-language hallucination mitigation/detection; verify README."],
  ["prompt_optimization", "x1xhlol/system-prompts-and-models-of-ai-tools", "https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools", "Prompt corpus for defensive pattern analysis."],
  ["prompt_optimization", "dair-ai/Prompt-Engineering-Guide", "https://github.com/dair-ai/Prompt-Engineering-Guide", "Prompt engineering methods and examples."],
  ["prompt_optimization", "danielmiessler/Fabric", "https://github.com/danielmiessler/Fabric", "Reusable task prompt workflow templates."],
  ["prompt_optimization", "JushBJJ/Mr.-Ranedeer-AI-Tutor", "https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor", "Adaptive tutor prompt patterns."],
  ["prompt_optimization", "linshenkx/prompt-optimizer", "https://github.com/linshenkx/prompt-optimizer", "Prompt optimizer product patterns."],
  ["prompt_optimization", "elder-plinius/CL4R1T4S", "https://github.com/elder-plinius/CL4R1T4S", "Adversarial corpus for defensive evaluation only."],
  ["prompt_optimization", "promptfoo/promptfoo", "https://github.com/promptfoo/promptfoo", "Prompt testing, eval CI, regression gates."],
  ["prompt_optimization", "elder-plinius/L1B3RT4S", "https://github.com/elder-plinius/L1B3RT4S", "Adversarial corpus for safety regression tests only."],
  ["prompt_optimization", "Nagi-ovo/gemini-voyager", "https://github.com/Nagi-ovo/gemini-voyager", "Gemini workflow and prompt adaptation ideas."],
  ["prompt_optimization", "liyupi/ai-guide", "https://github.com/liyupi/ai-guide", "Chinese AI prompt/product guide material."],
  ["gpt_image_2", "EvoLinkAI/awesome-gpt-image-2-API-and-Prompts", "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts", "GPT Image 2 API and prompt examples."],
  ["gpt_image_2", "Anil-matcha/Awesome-GPT-Image-2-API-Prompts", "https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts", "GPT Image 2 prompt examples and API notes."],
  ["gpt_image_2", "wuyoscar/gpt_image_2_skill", "https://github.com/wuyoscar/gpt_image_2_skill", "GPT Image 2 skill/prompt patterns."],
  ["gpt_image_2", "YouMind-OpenLab/awesome-gpt-image-2", "https://github.com/YouMind-OpenLab/awesome-gpt-image-2", "Awesome list for GPT Image 2 resources."],
];

const searchQueries = {
  hallucination: [
    "LLM hallucination evaluation",
    "RAG evaluation hallucination detection",
    "LLM groundedness uncertainty evaluation",
  ],
  prompt_optimization: [
    "prompt engineering evaluation",
    "prompt optimizer LLM",
    "prompt testing LLM eval",
  ],
  gpt_image_2: [
    "\"gpt-image-2\" prompts",
    "\"GPT Image 2\" API prompts",
    "\"gpt image 2\" awesome",
  ],
};

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: projectRoot, shell: false, encoding: "utf8", stdio: "pipe" });
}

function fetchRepo(repo) {
  const gh = run("gh", ["repo", "view", repo, "--json", "nameWithOwner,url,description,stargazerCount,forkCount,openGraphImageUrl,updatedAt,pushedAt,defaultBranchRef"]);
  if (gh.status === 0 && gh.stdout.trim()) {
    const data = JSON.parse(gh.stdout);
    return {
      repo: data.nameWithOwner || repo,
      url: data.url || `https://github.com/${repo}`,
      description: data.description || "",
      stars: Number(data.stargazerCount || 0),
      forks: Number(data.forkCount || 0),
      updatedAt: data.updatedAt || "",
      pushedAt: data.pushedAt || "",
      defaultBranch: data.defaultBranchRef?.name || "",
      verificationStatus: "verified",
    };
  }
  const curl = run("curl", ["-fsSL", "-H", "Accept: application/vnd.github+json", `https://api.github.com/repos/${repo}`]);
  if (curl.status !== 0 || !curl.stdout.trim()) {
    return { repo, url: `https://github.com/${repo}`, description: "", stars: null, forks: null, updatedAt: "", pushedAt: "", defaultBranch: "", verificationStatus: "pending" };
  }
  const data = JSON.parse(curl.stdout);
  return {
    repo: data.full_name || repo,
    url: data.html_url || `https://github.com/${repo}`,
    description: data.description || "",
    stars: Number(data.stargazers_count || 0),
    forks: Number(data.forks_count || 0),
    updatedAt: data.updated_at || "",
    pushedAt: data.pushed_at || "",
    defaultBranch: data.default_branch || "",
    verificationStatus: "verified",
  };
}

function searchRepos(group, query) {
  const gh = run("gh", [
    "api",
    "search/repositories",
    "-f",
    `q=${query}`,
    "-f",
    "sort=stars",
    "-f",
    "order=desc",
    "-F",
    "per_page=5",
  ]);
  if (gh.status === 0 && gh.stdout.trim()) {
    const data = JSON.parse(gh.stdout);
    return (data.items || [])
      .filter((item) => item?.full_name && item?.html_url)
      .map((item) => [group, item.full_name, item.html_url, `Discovered by GitHub search query: ${query}`, false]);
  }

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=5`;
  const curl = run("curl", ["-fsSL", "-H", "Accept: application/vnd.github+json", url]);
  if (curl.status !== 0 || !curl.stdout.trim()) return [];
  const data = JSON.parse(curl.stdout);
  return (data.items || [])
    .filter((item) => item?.full_name && item?.html_url)
    .map((item) => [group, item.full_name, item.html_url, `Discovered by GitHub search query: ${query}`, false]);
}

function recencyScore(pushedAt) {
  if (!pushedAt) return 0;
  const ageDays = (Date.now() - Date.parse(pushedAt)) / 86400000;
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 30) return 20;
  if (ageDays <= 180) return 15;
  if (ageDays <= 365) return 10;
  if (ageDays <= 730) return 5;
  return 0;
}

function scoreProject(project, focus) {
  const starScore = project.stars ? Math.min(35, Math.log10(project.stars + 1) * 7) : 0;
  const forkScore = project.forks ? Math.min(15, Math.log10(project.forks + 1) * 3) : 0;
  const activity = recencyScore(project.pushedAt);
  const relevance = /prompt|eval|hallucination|rag|image|gpt|llm|ground|uncertainty/i.test(`${project.description} ${focus}`) ? 20 : 8;
  return Math.round((starScore + forkScore + activity + relevance + (project.verificationStatus === "verified" ? 10 : 0)) * 10) / 10;
}

fs.mkdirSync(outputDir, { recursive: true });
const generatedAt = new Date().toISOString();
const discovered = Object.entries(searchQueries).flatMap(([group, queries]) =>
  queries.flatMap((query) => {
    try {
      return searchRepos(group, query);
    } catch {
      return [];
    }
  }),
);
const dedupedSeeds = [];
const seenRepos = new Set();
for (const item of [...seeds, ...discovered]) {
  const repo = String(item[1] || "").toLowerCase();
  if (!repo || seenRepos.has(repo)) continue;
  seenRepos.add(repo);
  dedupedSeeds.push(item);
}

const projects = dedupedSeeds.map(([group, repo, url, focus, required = true]) => {
  const meta = fetchRepo(repo);
  return {
    group,
    repo: meta.repo,
    url: meta.url || url,
    required: Boolean(required),
    focus,
    description: meta.description,
    stars: meta.stars,
    forks: meta.forks,
    updatedAt: meta.updatedAt,
    pushedAt: meta.pushedAt,
    defaultBranch: meta.defaultBranch,
    verificationStatus: meta.verificationStatus,
    verifiedAt: meta.verificationStatus === "verified" ? generatedAt : null,
    qualityScore: scoreProject(meta, focus),
  };
});

const groups = ["hallucination", "prompt_optimization", "gpt_image_2"];
const topByGroup = Object.fromEntries(groups.map((group) => [
  group,
  projects
    .filter((project) => project.group === group)
    .sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || b.qualityScore - a.qualityScore)
    .slice(0, 3),
]));

const rules = [
  "人工反馈优先级高于 AI 评价；人工指出的问题必须进入下一轮自动优化。",
  "事实型任务不得编造来源、stars、commit、release；无法实时确认时标记待验证。",
  "候选提示词必须通过意图保真、幻觉防护、目标模型适配、可执行性评分后才能展示。",
  "黄色问题优先修复；绿色但低于 9.0 的幻觉和用户意图问题继续优化。",
  "GPT Image 2/以图生图必须保留参考图构图、色彩、比例、主体、风格和商业完成度。",
];

const json = { schema_version: "1.0", generatedAt, projects, topByGroup, extractedRules: rules };
fs.writeFileSync(path.join(outputDir, "PROJECT_TRACKER_STATUS.json"), JSON.stringify(json, null, 2) + "\n", "utf8");
fs.writeFileSync(
  path.join(outputDir, "PROJECT_TRACKER_STATUS.md"),
  [
    "# GitHub Project Tracker Status",
    "",
    `Updated: ${generatedAt}`,
    "",
    "All user-provided repositories are retained. Stars/forks/activity are only filled when verified by GitHub API.",
    "",
    ...groups.flatMap((group) => [
      `## ${group}`,
      "",
      "| Repo | Stars | Forks | Quality | Verified | Focus |",
      "|---|---:|---:|---:|---|---|",
      ...projects
        .filter((project) => project.group === group)
        .sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || b.qualityScore - a.qualityScore)
        .map((project) => `| [${project.repo}](${project.url}) | ${project.stars ?? "待验证"} | ${project.forks ?? "待验证"} | ${project.qualityScore} | ${project.verificationStatus} | ${project.focus.replace(/\|/g, "/")} |`),
      "",
      `Top 3 by verified stars: ${topByGroup[group].map((project) => project.repo).join(", ") || "待验证"}`,
      "",
    ]),
    "## Extracted Rules",
    "",
    ...rules.map((rule) => `- ${rule}`),
    "",
  ].join("\n"),
  "utf8",
);

const ts = [
  "export const GITHUB_PROJECT_TRACKER_UPDATED_AT = " + JSON.stringify(generatedAt) + ";",
  "",
  "export const GITHUB_PROJECT_TRACKER_STATUS = " + JSON.stringify(json, null, 2) + " as const;",
  "",
  "export const GITHUB_PROJECT_TRACKER_RULES = " + JSON.stringify(rules, null, 2) + " as const;",
  "",
];
fs.writeFileSync(sourceTsPath, ts.join("\n"), "utf8");
console.log(`Wrote ${path.relative(projectRoot, sourceTsPath)} and data/github-projects status files.`);
