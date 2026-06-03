import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const LEDGER_ROOT = path.join(ROOT, ".local-data", "github-ledger");
const TARGET_ROOT = path.join(ROOT, "eval-ledger");

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    ...options,
  });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function requireOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
  return result;
}

async function listFiles(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...await listFiles(full));
      else out.push(full);
    }
  } catch {
    return out;
  }
  return out;
}

async function copyLedgers({ dryRun = false } = {}) {
  const files = await listFiles(LEDGER_ROOT);
  const copied = [];
  for (const file of files) {
    const rel = path.relative(LEDGER_ROOT, file);
    const dest = path.join(TARGET_ROOT, rel);
    if (!dryRun) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(file, dest);
    }
    copied.push(dest);
  }
  return copied;
}

function canUseGh() {
  const auth = run("gh", ["auth", "status"]);
  return auth.ok;
}

function currentBranch() {
  const current = run("git", ["branch", "--show-current"]);
  return current.stdout.trim() || "main";
}

function currentCommit() {
  const head = run("git", ["rev-parse", "--short", "HEAD"]);
  return head.ok ? head.stdout.trim() : null;
}

export async function runGithubLedgerWorker({ push = true, dryRun = false } = {}) {
  const copied = await copyLedgers({ dryRun });
  if (copied.length === 0) {
    return { ok: true, mode: "no_ledger_files", copied: [], pushed: false };
  }

  const date = new Date().toISOString().slice(0, 10);
  const branch = `eval/${date}/ledger-${Date.now()}`;
  const baseBranch = currentBranch();
  if (dryRun) {
    return {
      ok: true,
      mode: "dry_run",
      copied,
      branch,
      baseBranch,
      commitCreated: false,
      pushed: false,
      pr: null,
      issue: null,
      ghAvailable: canUseGh(),
      note: "Dry run only inspected local .local-data/github-ledger files and planned the eval-ledger branch.",
    };
  }

  let commitCreated = false;
  let pushed = false;
  let pr = null;
  let issue = null;
  let commitSha = null;
  try {
    requireOk(run("git", ["checkout", "-B", branch]), "git checkout ledger branch");
    requireOk(run("git", ["add", "eval-ledger"]), "git add eval-ledger");
    const diff = run("git", ["diff", "--cached", "--quiet", "--", "eval-ledger"]);
    if (diff.status === 0) {
      return {
        ok: true,
        mode: "no_changes",
        copied,
        branch,
        baseBranch,
        commitCreated: false,
        pushed: false,
        pr: null,
        issue: null,
        ghAvailable: canUseGh(),
      };
    }
    requireOk(run("git", ["commit", "-m", `eval(ledger): sync evaluation ledgers ${date}`]), "git commit ledger");
    commitCreated = true;
    commitSha = currentCommit();
    if (push) {
      const pushResult = run("git", ["push", "-u", "origin", branch]);
      pushed = pushResult.ok;
      if (pushed && canUseGh()) {
        const prResult = run("gh", [
          "pr",
          "create",
          "--title",
          `Evaluation ledger sync ${date}`,
          "--body",
          "Automated sanitized evaluation ledger sync.",
          "--base",
          baseBranch,
          "--head",
          branch,
        ]);
        pr = prResult.ok ? prResult.stdout.trim() : { error: prResult.stderr || prResult.stdout };
        if (!prResult.ok) {
          const issueResult = run("gh", [
            "issue",
            "create",
            "--title",
            `Review evaluation ledger sync ${date}`,
            "--body",
            `Branch ${branch} contains sanitized evaluation ledger files.\n\nGitHub CLI PR creation failed, so this issue records the required manual review.`,
          ]);
          issue = issueResult.ok ? issueResult.stdout.trim() : { error: issueResult.stderr || issueResult.stdout };
        }
      }
    }
  } finally {
    run("git", ["checkout", baseBranch]);
  }
  return {
    ok: commitCreated,
    mode: "git_branch_worker",
    copied,
    branch,
    baseBranch,
    commitSha,
    commitCreated,
    pushed,
    pr,
    issue,
    ghAvailable: canUseGh(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await runGithubLedgerWorker({
    push: !process.argv.includes("--no-push") && !process.argv.includes("--dry-run"),
    dryRun: process.argv.includes("--dry-run"),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
