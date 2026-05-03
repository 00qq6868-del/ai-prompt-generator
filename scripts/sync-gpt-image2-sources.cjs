#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const workbenchRoot = process.env.AI_WORKBENCH_ROOT || path.resolve(projectRoot, "..", "..");
const sourceRoot = path.join(workbenchRoot, "资料 Sources", "gpt-image-2");

const repos = [
  {
    name: "EvoLinkAI-awesome-gpt-image-2-API-and-Prompts",
    repo: "EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
    url: "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts.git",
  },
  {
    name: "YouMind-OpenLab-awesome-gpt-image-2",
    repo: "YouMind-OpenLab/awesome-gpt-image-2",
    url: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2.git",
  },
  {
    name: "Anil-matcha-Awesome-GPT-Image-2-API-Prompts",
    repo: "Anil-matcha/Awesome-GPT-Image-2-API-Prompts",
    url: "https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts.git",
  },
  {
    name: "wuyoscar-gpt_image_2_skill",
    repo: "wuyoscar/gpt_image_2_skill",
    url: "https://github.com/wuyoscar/gpt_image_2_skill.git",
  },
];

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });
  if (res.status !== 0) {
    const details = [res.stdout, res.stderr].filter(Boolean).join("\n");
    throw new Error(`${cmd} ${args.join(" ")} failed\n${details}`);
  }
  return (res.stdout || "").trim();
}

fs.mkdirSync(sourceRoot, { recursive: true });

const rows = [];
for (const item of repos) {
  const dest = path.join(sourceRoot, item.name);
  const gitDir = path.join(dest, ".git");

  if (fs.existsSync(gitDir)) {
    console.log(`Updating ${item.repo}`);
    run("git", ["-C", dest, "pull", "--ff-only"], projectRoot);
  } else if (fs.existsSync(dest)) {
    console.log(`Skipping non-git folder: ${dest}`);
  } else {
    console.log(`Cloning ${item.repo}`);
    run("git", ["clone", "--depth", "1", item.url, dest], projectRoot);
  }

  if (fs.existsSync(gitDir)) {
    const short = run("git", ["-C", dest, "rev-parse", "--short", "HEAD"], projectRoot);
    const long = run("git", ["-C", dest, "rev-parse", "HEAD"], projectRoot);
    rows.push({ ...item, path: dest, short, long });
  }
}

const statusPath = path.join(sourceRoot, "SOURCE_STATUS.md");
const sourceStatusTsPath = path.join(projectRoot, "src", "lib", "gpt-image-2-source-status.ts");
const now = new Date().toISOString();
const body = [
  "# GPT Image 2 Upstream Source Status",
  "",
  `Updated: ${now}`,
  "",
  "| Repository | Commit | Local path |",
  "|---|---|---|",
  ...rows.map((r) => `| ${r.repo} | \`${r.short}\` | \`${r.path}\` |`),
  "",
  "These repositories are kept outside the project repository. Do not copy the full prompt galleries or image assets into the app bundle. Distill reusable strategy only.",
  "",
].join("\n");

fs.writeFileSync(statusPath, body, "utf8");
const sourceStatusTs = [
  "export const GPT_IMAGE_2_SOURCE_COMMITS = [",
  ...rows.map((r) => `  "${r.repo}@${r.short}",`),
  "] as const;",
  "",
].join("\n");
fs.writeFileSync(sourceStatusTsPath, sourceStatusTs, "utf8");
console.log(`Status written: ${statusPath}`);
console.log(`Project source status written: ${sourceStatusTsPath}`);
