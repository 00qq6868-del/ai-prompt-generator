import { appendLocalJsonl } from "@/lib/server/storage";

export interface DatasetExportResult {
  synced: boolean;
  target: "github" | "local";
  filePath: string;
  repository?: string;
  branch?: string;
  reason?: string;
}

function cleanString(value: unknown, max = 8000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export type DatasetKind =
  | "prompt-feedback"
  | "test-runs"
  | "score-reports"
  | "prompt-history"
  | "github-projects";

function monthPath(kind: DatasetKind, timestamp = Date.now()): string {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `data/${kind}/${year}-${month}.jsonl`;
}

function hashId(value: unknown): string {
  const text = cleanString(value, 240);
  if (!text) return "";
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hash_${(hash >>> 0).toString(16)}`;
}

export function sanitizeDatasetRow(input: Record<string, unknown>) {
  const timestamp = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  return {
    schema_version: "1.0",
    id: cleanString(input.id, 120) || `${timestamp}`,
    timestamp,
    created_at: new Date(timestamp).toISOString(),
    device_hash: hashId(input.deviceId),
    prompt_id: cleanString(input.promptId, 120),
    prompt_version_id: cleanString(input.promptVersionId, 120),
    user_idea: cleanString(input.userIdea, 8000),
    target_model_id: cleanString(input.targetModel || input.targetModelId, 180),
    old_prompt: cleanString(input.previousPrompt || input.oldPrompt, 12000),
    new_prompt: cleanString(input.optimizedPrompt || input.newPrompt, 12000),
    selected_prompt: cleanString(input.selectedPrompt, 12000),
    user_star_rating: Number.isFinite(Number(input.starRating)) ? Math.max(1, Math.min(5, Number(input.starRating))) : null,
    user_score_legacy: Number.isFinite(Number(input.userScore)) ? Math.max(0, Math.min(100, Number(input.userScore))) : null,
    user_notes: cleanString(input.userNotes, 4000),
    preference: cleanString(input.preference, 80),
    ai_prompt_score: Number.isFinite(Number(input.aiPromptScore)) ? Number(input.aiPromptScore) : null,
    strict_score: input.strictScore && typeof input.strictScore === "object" ? input.strictScore : null,
    test_scores: input.testScores && typeof input.testScores === "object" ? input.testScores : null,
    failed_dimensions: Array.isArray(input.failedDimensions)
      ? input.failedDimensions.map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 30)
      : [],
    source_commits: Array.isArray(input.sourceCommits)
      ? input.sourceCommits.map((item) => cleanString(item, 220)).filter(Boolean).slice(0, 40)
      : [],
    github_project_count: Number.isFinite(Number(input.project_count)) ? Number(input.project_count) : null,
    github_top_by_group: input.top_by_group && typeof input.top_by_group === "object" ? input.top_by_group : null,
    github_extracted_rules: Array.isArray(input.extracted_rules)
      ? input.extracted_rules.map((item) => cleanString(item, 800)).filter(Boolean).slice(0, 50)
      : [],
  };
}

async function githubJson(url: string, init: RequestInit & { token: string }) {
  const { token, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(rest.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok && res.status !== 404) {
    throw new Error(data?.message || `GitHub API failed: ${res.status}`);
  }
  return { status: res.status, data };
}

export async function exportDatasetRow(
  kind: DatasetKind,
  row: Record<string, unknown>,
): Promise<DatasetExportResult> {
  const timestamp = Number.isFinite(Number(row.timestamp)) ? Number(row.timestamp) : Date.now();
  const filePath = monthPath(kind, timestamp);
  const sanitized = sanitizeDatasetRow(row);
  const token = process.env.GITHUB_DATA_TOKEN || process.env.PROMPT_FEEDBACK_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_DATA_REPO || process.env.PROMPT_FEEDBACK_GITHUB_REPO || process.env.GITHUB_REPOSITORY || "00qq6868-del/ai-prompt-generator";
  const branch = process.env.GITHUB_DATA_BRANCH || process.env.PROMPT_FEEDBACK_GITHUB_BRANCH || "main";

  if (!token) {
    await appendLocalJsonl(filePath, sanitized);
    return {
      synced: false,
      target: "local",
      filePath,
      reason: "GitHub token not configured; sanitized row was written to .local-data only.",
    };
  }

  const apiBase = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
  const existing = await githubJson(`${apiBase}?ref=${encodeURIComponent(branch)}`, { method: "GET", token });
  let current = "";
  let sha: string | undefined;
  if (existing.status === 200 && typeof existing.data?.content === "string") {
    current = Buffer.from(existing.data.content, "base64").toString("utf8");
    sha = existing.data.sha;
  }

  await githubJson(apiBase, {
    method: "PUT",
    token,
    body: JSON.stringify({
      message: `data: append ${kind} ${sanitized.id} [skip ci]`,
      content: Buffer.from(`${current}${JSON.stringify(sanitized)}\n`, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  return { synced: true, target: "github", repository, branch, filePath };
}
