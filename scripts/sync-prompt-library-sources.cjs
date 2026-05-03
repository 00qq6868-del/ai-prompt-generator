#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const workbenchRoot = process.env.AI_WORKBENCH_ROOT || path.resolve(projectRoot, "..", "..");
const sourceRoot = path.join(workbenchRoot, "资料 Sources", "prompt-library");

const repos = [
  {
    name: "x1xhlol-system-prompts-and-models-of-ai-tools",
    repo: "x1xhlol/system-prompts-and-models-of-ai-tools",
    url: "https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools.git",
    focus: "real-world system prompts and agent/tool patterns",
  },
  {
    name: "dair-ai-Prompt-Engineering-Guide",
    repo: "dair-ai/Prompt-Engineering-Guide",
    url: "https://github.com/dair-ai/Prompt-Engineering-Guide.git",
    focus: "prompt engineering research, methods, RAG, agents, examples",
  },
  {
    name: "danielmiessler-Fabric",
    repo: "danielmiessler/Fabric",
    url: "https://github.com/danielmiessler/Fabric.git",
    focus: "modular reusable prompt patterns for concrete tasks",
  },
  {
    name: "JushBJJ-Mr-Ranedeer-AI-Tutor",
    repo: "JushBJJ/Mr.-Ranedeer-AI-Tutor",
    url: "https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor.git",
    focus: "education, tutoring, adaptive learning prompts",
  },
  {
    name: "linshenkx-prompt-optimizer",
    repo: "linshenkx/prompt-optimizer",
    url: "https://github.com/linshenkx/prompt-optimizer.git",
    focus: "iterative prompt optimization product patterns",
  },
  {
    name: "elder-plinius-CL4R1T4S",
    repo: "elder-plinius/CL4R1T4S",
    url: "https://github.com/elder-plinius/CL4R1T4S.git",
    focus: "system-prompt transparency corpus; use only for defensive structure analysis",
  },
  {
    name: "promptfoo-promptfoo",
    repo: "promptfoo/promptfoo",
    url: "https://github.com/promptfoo/promptfoo.git",
    focus: "prompt evaluation, tests, red-team criteria, CI quality gates",
  },
  {
    name: "elder-plinius-L1B3RT4S",
    repo: "elder-plinius/L1B3RT4S",
    url: "https://github.com/elder-plinius/L1B3RT4S.git",
    focus: "adversarial prompt corpus; use only for safety and failure-mode evaluation",
  },
  {
    name: "Nagi-ovo-gemini-voyager",
    repo: "Nagi-ovo/gemini-voyager",
    url: "https://github.com/Nagi-ovo/gemini-voyager.git",
    focus: "Gemini workflow enhancement, prompt library and chat export patterns",
  },
  {
    name: "liyupi-ai-guide",
    repo: "liyupi/ai-guide",
    url: "https://github.com/liyupi/ai-guide.git",
    focus: "Chinese AI guide, prompt resources, coding and product workflows",
  },
];

function run(cmd, args, cwd, allowFailure = false) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });
  if (res.status !== 0 && !allowFailure) {
    const details = [res.stdout, res.stderr].filter(Boolean).join("\n");
    throw new Error(`${cmd} ${args.join(" ")} failed\n${details}`);
  }
  return {
    ok: res.status === 0,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };
}

function ghMeta(repo) {
  const res = run(
    "gh",
    ["repo", "view", repo, "--json", "nameWithOwner,stargazerCount,defaultBranchRef,updatedAt,description,url"],
    projectRoot,
    true,
  );
  if (!res.ok || !res.stdout) return {};
  try {
    const data = JSON.parse(res.stdout);
    return {
      repo: data.nameWithOwner || repo,
      stars: Number(data.stargazerCount || 0),
      defaultBranch: data.defaultBranchRef?.name || "",
      updatedAt: data.updatedAt || "",
      description: data.description || "",
      htmlUrl: data.url || `https://github.com/${repo}`,
    };
  } catch {
    return {};
  }
}

function asciiSummary(text) {
  return String(text || "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

fs.mkdirSync(sourceRoot, { recursive: true });

const rows = [];
for (const item of repos) {
  const dest = path.join(sourceRoot, item.name);
  const gitDir = path.join(dest, ".git");
  const meta = ghMeta(item.repo);

  if (fs.existsSync(gitDir)) {
    console.log(`Updating ${item.repo}`);
    const pulled = run("git", ["-C", dest, "pull", "--ff-only"], projectRoot, true);
    if (!pulled.ok) {
      console.warn(`Pull failed for ${item.repo}; fetching metadata only. ${pulled.stderr || pulled.stdout}`);
      const branch = meta.defaultBranch || "main";
      run("git", ["-C", dest, "fetch", "--depth", "1", "origin", branch], projectRoot, true);
      run("git", ["-C", dest, "reset", "--hard", `origin/${branch}`], projectRoot, true);
    }
  } else if (fs.existsSync(dest)) {
    console.log(`Skipping non-git folder: ${dest}`);
  } else {
    console.log(`Cloning ${item.repo}`);
    const cloned = run("git", ["clone", "--depth", "1", "--filter=blob:none", item.url, dest], projectRoot, true);
    if (!cloned.ok && !fs.existsSync(gitDir)) {
      throw new Error(`Unable to clone ${item.repo}\n${cloned.stdout}\n${cloned.stderr}`);
    }
    if (!cloned.ok) {
      console.warn(`Checkout failed for ${item.repo}; keeping git metadata only. ${cloned.stderr || cloned.stdout}`);
    }
  }

  if (fs.existsSync(gitDir)) {
    const short = run("git", ["-C", dest, "rev-parse", "--short", "HEAD"], projectRoot).stdout;
    const long = run("git", ["-C", dest, "rev-parse", "HEAD"], projectRoot).stdout;
    rows.push({
      repo: meta.repo || item.repo,
      url: meta.htmlUrl || item.url.replace(/\.git$/, ""),
      focus: item.focus,
      stars: meta.stars || 0,
      defaultBranch: meta.defaultBranch || run("git", ["-C", dest, "branch", "--show-current"], projectRoot, true).stdout,
      updatedAt: meta.updatedAt || "",
      description: asciiSummary(meta.description),
      short,
      commit: long,
      localPath: dest,
    });
  }
}

rows.sort((a, b) => b.stars - a.stars || a.repo.localeCompare(b.repo));

const statusPath = path.join(sourceRoot, "SOURCE_STATUS.md");
const sourceStatusTsPath = path.join(projectRoot, "src", "lib", "prompt-source-library-status.ts");
const generatedAt = new Date().toISOString();
const sourceUpdatedAt = rows
  .map((row) => row.updatedAt)
  .filter(Boolean)
  .sort()
  .at(-1) || generatedAt;
const tsRows = rows.map(({ localPath, ...row }) => row);

const body = [
  "# Prompt Source Library Status",
  "",
  `Updated: ${generatedAt}`,
  "",
  "| Repository | Stars | Commit | Focus | Local path |",
  "|---|---:|---|---|---|",
  ...rows.map((r) => `| ${r.repo} | ${r.stars} | \`${r.short}\` | ${r.focus} | \`${r.localPath}\` |`),
  "",
  "These repositories are kept outside the project repository. Do not copy full source repositories into the app bundle.",
  "Use them as separate source groups for rubric design, regression tests, and future model review.",
  "Adversarial or leaked-prompt corpora must be used only for defensive quality/safety evaluation, not for jailbreak generation.",
  "",
].join("\n");

const rubric = [
  {
    id: "intent_fidelity",
    label: "Intent fidelity",
    weight: 16,
    guide: "Preserves every explicit user requirement, hidden constraint, target model, language, and output goal.",
  },
  {
    id: "task_decomposition",
    label: "Task decomposition",
    weight: 10,
    guide: "Breaks complex work into clear phases, inputs, assumptions, checks, and decision points without overcomplicating small tasks.",
  },
  {
    id: "context_engineering",
    label: "Context engineering",
    weight: 12,
    guide: "Defines role, audience, references, examples, retrieval/context boundaries, and what to ignore.",
  },
  {
    id: "specificity_control",
    label: "Specificity and controllability",
    weight: 12,
    guide: "Uses concrete constraints, success criteria, style/format controls, and verifiable deliverables.",
  },
  {
    id: "model_fit",
    label: "Target-model fit",
    weight: 10,
    guide: "Matches the target model category and known behavior; avoids unsupported flags, tools, or reasoning instructions.",
  },
  {
    id: "output_usability",
    label: "Output usability",
    weight: 12,
    guide: "Produces copy-pasteable output with clean structure, labels, examples, and no unnecessary explanation.",
  },
  {
    id: "evaluation_ready",
    label: "Evaluation readiness",
    weight: 10,
    guide: "Includes acceptance tests, scoring hooks, edge cases, or comparison criteria when useful.",
  },
  {
    id: "hallucination_safety",
    label: "Hallucination and safety control",
    weight: 10,
    guide: "Requires uncertainty handling, source boundaries, refusal/redirect rules, and avoids unsafe prompt-injection patterns.",
  },
  {
    id: "efficiency",
    label: "Efficiency",
    weight: 8,
    guide: "Keeps the prompt no longer than needed for the task and model context window.",
  },
];

const sourceStatusTs = [
  "export interface PromptSourceRepositoryStatus {",
  "  repo: string;",
  "  url: string;",
  "  focus: string;",
  "  stars: number;",
  "  defaultBranch: string;",
  "  updatedAt: string;",
  "  description: string;",
  "  short: string;",
  "  commit: string;",
  "}",
  "",
  `export const PROMPT_SOURCE_LIBRARY_UPDATED_AT = ${JSON.stringify(sourceUpdatedAt)};`,
  "",
  `export const PROMPT_SOURCE_LIBRARY_STATUS = ${JSON.stringify(tsRows, null, 2)} as const satisfies readonly PromptSourceRepositoryStatus[];`,
  "",
  "export const PROMPT_SOURCE_LIBRARY_COMMITS = [",
  ...rows.map((r) => `  ${JSON.stringify(`${r.repo}@${r.short}`)},`),
  "] as const;",
  "",
  `export const PROMPT_EVALUATION_RUBRIC = ${JSON.stringify(rubric, null, 2)} as const;`,
  "",
].join("\n");

fs.writeFileSync(statusPath, body, "utf8");
fs.writeFileSync(sourceStatusTsPath, sourceStatusTs, "utf8");
console.log(`Status written: ${statusPath}`);
console.log(`Project source status written: ${sourceStatusTsPath}`);
