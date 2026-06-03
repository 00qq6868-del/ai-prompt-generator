import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKBENCH_ROOT = process.env.AI_WORKBENCH_ROOT || "E:\\AI工作台";
const STATUS_PATH = path.join(WORKBENCH_ROOT, "资料 Sources", "hallucination-guard", "source-status.json");
const FIREWALL = path.join(WORKBENCH_ROOT, "core", "hallucination_firewall.py");
const REPOS_ROOT = path.join(WORKBENCH_ROOT, "资料 Sources", "hallucination-guard", "repos");
const DETECTORS = [
  "deepeval",
  "phoenix",
  "trulens",
  "uptrain",
  "WikiChat",
  "uqlm",
  "selfcheckgpt",
  "LettuceDetect",
  "VCD",
];

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
    ...options,
  });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runPythonFirewall(text) {
  const python = process.env.PYTHON || "python";
  const result = run(python, [FIREWALL, "check-text", "--input", text, "--strictness", "strict"], {
    cwd: WORKBENCH_ROOT,
  });
  if (!result.ok && !result.stdout) {
    return { ok: false, error: result.stderr || `exit ${result.status}` };
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { ok: false, raw: result.stdout, error: result.stderr };
  }
}

function gitInfo(repoPath) {
  const isRepo = run("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"]);
  if (!isRepo.ok) return { ok: false, error: isRepo.stderr || isRepo.stdout || "not a git repository" };
  const commit = run("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"]);
  const commitDate = run("git", ["-C", repoPath, "log", "-1", "--format=%cI"]);
  const branch = run("git", ["-C", repoPath, "branch", "--show-current"]);
  const status = run("git", ["-C", repoPath, "status", "--porcelain"]);
  return {
    ok: commit.ok,
    commit: commit.stdout.trim(),
    commitDate: commitDate.stdout.trim(),
    branch: branch.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
    warning: status.stdout.trim().length > 0 ? "repository has local changes or diverged state; sync worker should repair before strict production run" : null,
  };
}

async function loadSourceStatus() {
  try {
    const raw = await fs.readFile(STATUS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return { repos: [], error: String(error) };
  }
}

function detectorMode(name) {
  if (name === "phoenix") return "trace_ready";
  if (name === "WikiChat") return "evidence_pattern_ready";
  if (name === "VCD") return "multimodal_reference_strategy_ready";
  if (name === "LettuceDetect") return "rag_factuality_adapter_ready";
  if (name === "uqlm") return "uncertainty_adapter_ready";
  if (name === "selfcheckgpt") return "self_consistency_adapter_ready";
  return "async_adapter_ready";
}

export async function runHallucinationLiveWorker(input = {}) {
  const text = String(input.text ?? "No claim provided.");
  const sourceStatus = await loadSourceStatus();
  const repos = new Map((sourceStatus.repos ?? []).map((item) => [item.name, item]));
  const firewall = runPythonFirewall(text);
  const detectorResults = DETECTORS.map((name) => {
    const repo = repos.get(name);
    const repoPath = repo?.path ?? path.join(REPOS_ROOT, name);
    const liveRepo = gitInfo(repoPath);
    const sourceSynced = Boolean(repo?.ok || liveRepo.ok);
    return {
      detector: name,
      sourceSynced,
      sourceCommit: repo?.commit || liveRepo.commit || null,
      sourceCommitDate: repo?.commitDate || liveRepo.commitDate || null,
      sourcePath: repoPath,
      mode: detectorMode(name),
      ok: sourceSynced && Boolean(firewall.ok !== false),
      findings: ["deepeval", "uqlm", "selfcheckgpt", "LettuceDetect"].includes(name) ? firewall.findings ?? [] : [],
      warning: sourceSynced
        ? liveRepo.warning
        : `source not synced or status missing for ${name}: ${repo?.error ?? liveRepo.error ?? "unknown"}`,
    };
  });
  const output = {
    ok: detectorResults.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    workbenchRoot: WORKBENCH_ROOT,
    sourceStatusPath: STATUS_PATH,
    firewall,
    detectorResults,
  };
  const stateDir = path.join(process.cwd(), ".local-data", "hallucination-live");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, "last-run.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return {
    ...output,
    localRunPath: path.join(stateDir, "last-run.json"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const text = process.argv.slice(2).join(" ") || "No claim provided.";
  const result = await runHallucinationLiveWorker({ text });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
