import { appendLocalJsonl } from "@/lib/server/storage";

export interface DatasetExportResult {
  synced: boolean;
  target: "github" | "local";
  filePath: string;
  repository?: string;
  branch?: string;
  reason?: string;
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/gsk_[A-Za-z0-9_-]{8,}/g, "gsk_***")
    .replace(/xai-[A-Za-z0-9_-]{8,}/g, "xai-***")
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, "AIza***")
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer ***")
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/gi, "apiKey=***")
    .replace(/secret["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/gi, "secret=***")
    .replace(/token["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/gi, "token=***");
}

function cleanString(value: unknown, max = 8000): string {
  return typeof value === "string" ? maskSensitiveText(value.trim()).slice(0, max) : "";
}

export type DatasetKind =
  | "prompt-feedback"
  | "test-runs"
  | "test-channel-runs"
  | "optimization-backlog"
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
    test_channel: input.testChannel && typeof input.testChannel === "object"
      ? {
          status: cleanString((input.testChannel as Record<string, unknown>).status, 40),
          provider: cleanString((input.testChannel as Record<string, unknown>).provider, 80),
          model_id: cleanString((input.testChannel as Record<string, unknown>).model_id, 180),
          model_name: cleanString((input.testChannel as Record<string, unknown>).model_name, 180),
          target_model_id: cleanString((input.testChannel as Record<string, unknown>).target_model_id, 180),
          latency_ms: Number.isFinite(Number((input.testChannel as Record<string, unknown>).latency_ms))
            ? Number((input.testChannel as Record<string, unknown>).latency_ms)
            : null,
          attempts: Number.isFinite(Number((input.testChannel as Record<string, unknown>).attempts))
            ? Number((input.testChannel as Record<string, unknown>).attempts)
            : null,
          key_fingerprints: Array.isArray((input.testChannel as Record<string, unknown>).key_fingerprints)
            ? ((input.testChannel as Record<string, unknown>).key_fingerprints as unknown[]).map((item) => {
                const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
                return {
                  key_name: cleanString(record.key_name, 80),
                  source: cleanString(record.source, 40),
                  hash: cleanString(record.hash, 80),
                };
              }).filter((item) => item.key_name && item.hash).slice(0, 30)
            : [],
          model_diagnostics: Array.isArray((input.testChannel as Record<string, unknown>).model_diagnostics)
            ? ((input.testChannel as Record<string, unknown>).model_diagnostics as unknown[]).map((item) => {
                const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
                return {
                  model_id: cleanString(record.model_id, 180),
                  provider: cleanString(record.provider, 80),
                  status: cleanString(record.status, 40),
                  error: cleanString(record.error, 500),
                  best_score: Number.isFinite(Number(record.best_score)) ? Number(record.best_score) : null,
                };
              }).filter((item) => item.model_id).slice(0, 20)
            : [],
          secret_handling: cleanString((input.testChannel as Record<string, unknown>).secret_handling, 300),
        }
      : null,
    failed_dimensions: Array.isArray(input.failedDimensions)
      ? input.failedDimensions.map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 30)
      : [],
    optimization_backlog: input.optimizationBacklog && typeof input.optimizationBacklog === "object"
      ? {
          status: cleanString((input.optimizationBacklog as Record<string, unknown>).status, 40),
          item_count: Number.isFinite(Number((input.optimizationBacklog as Record<string, unknown>).itemCount))
            ? Number((input.optimizationBacklog as Record<string, unknown>).itemCount)
            : null,
          summary: cleanString((input.optimizationBacklog as Record<string, unknown>).summary, 1000),
          items: Array.isArray((input.optimizationBacklog as Record<string, unknown>).items)
            ? ((input.optimizationBacklog as Record<string, unknown>).items as unknown[]).map((item) => {
                const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
                return {
                  fingerprint: cleanString(record.fingerprint, 120),
                  source: cleanString(record.source, 80),
                  report_id: cleanString(record.reportId, 120),
                  type: cleanString(record.type, 80),
                  severity: cleanString(record.severity, 40),
                  status: cleanString(record.status, 40),
                  title: cleanString(record.title, 240),
                  detail: cleanString(record.detail, 1000),
                  action: cleanString(record.action, 1000),
                  model_id: cleanString(record.modelId, 180),
                  provider: cleanString(record.provider, 80),
                  dimension: cleanString(record.dimension, 120),
                  check_id: cleanString(record.checkId, 120),
                  occurrences: Number.isFinite(Number(record.occurrences)) ? Number(record.occurrences) : null,
                };
              }).filter((item) => item.fingerprint || item.title).slice(0, 50)
            : [],
        }
      : null,
    error_records: Array.isArray(input.errorRecords)
      ? input.errorRecords.map((item) => {
          const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            error_id: cleanString(record.error_id, 120),
            project_id: cleanString(record.project_id, 120),
            error_type: cleanString(record.error_type, 40),
            severity: cleanString(record.severity, 40),
            summary: cleanString(record.summary, 300),
            detail: cleanString(record.detail, 1200),
            reproduction_path: Array.isArray(record.reproduction_path)
              ? (record.reproduction_path as unknown[]).map((step) => cleanString(step, 300)).filter(Boolean).slice(0, 12)
              : [],
            test_case_id: cleanString(record.test_case_id, 160),
            discovered_at: cleanString(record.discovered_at, 80),
            status: cleanString(record.status, 40),
            optimization_suggestion: cleanString(record.optimization_suggestion, 1000),
            auto_optimized: Boolean(record.auto_optimized),
            fingerprint: cleanString(record.fingerprint, 180),
            occurrences: Number.isFinite(Number(record.occurrences)) ? Number(record.occurrences) : null,
            last_seen_at: cleanString(record.last_seen_at, 80),
            resolved_at: cleanString(record.resolved_at, 80) || null,
          };
        }).filter((item) => item.error_id || item.summary).slice(0, 80)
      : [],
    optimization_items: Array.isArray(input.optimizationItems)
      ? input.optimizationItems.map((item) => {
          const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            optimization_id: cleanString(record.optimization_id, 120),
            project_id: cleanString(record.project_id, 120),
            linked_error_ids: Array.isArray(record.linked_error_ids)
              ? (record.linked_error_ids as unknown[]).map((id) => cleanString(id, 120)).filter(Boolean).slice(0, 20)
              : [],
            priority: cleanString(record.priority, 20),
            description: cleanString(record.description, 800),
            suggested_actions: Array.isArray(record.suggested_actions)
              ? (record.suggested_actions as unknown[]).map((action) => cleanString(action, 600)).filter(Boolean).slice(0, 12)
              : [],
            created_at: cleanString(record.created_at, 80),
            resolved_at: cleanString(record.resolved_at, 80) || null,
            auto_applied: Boolean(record.auto_applied),
            fingerprint: cleanString(record.fingerprint, 180),
          };
        }).filter((item) => item.optimization_id || item.description).slice(0, 80)
      : [],
    adaptive_test_plan: input.adaptivePlan && typeof input.adaptivePlan === "object"
      ? {
          project_id: cleanString((input.adaptivePlan as Record<string, unknown>).project_id, 120),
          unresolved_error_count: Number.isFinite(Number((input.adaptivePlan as Record<string, unknown>).unresolved_error_count))
            ? Number((input.adaptivePlan as Record<string, unknown>).unresolved_error_count)
            : 0,
          regression_case_count: Number.isFinite(Number((input.adaptivePlan as Record<string, unknown>).regression_case_count))
            ? Number((input.adaptivePlan as Record<string, unknown>).regression_case_count)
            : 0,
          focus_error_types: Array.isArray((input.adaptivePlan as Record<string, unknown>).focus_error_types)
            ? ((input.adaptivePlan as Record<string, unknown>).focus_error_types as unknown[]).map((type) => cleanString(type, 40)).filter(Boolean).slice(0, 8)
            : [],
          strategy_weights: (input.adaptivePlan as Record<string, unknown>).strategy_weights &&
            typeof (input.adaptivePlan as Record<string, unknown>).strategy_weights === "object"
            ? (input.adaptivePlan as Record<string, unknown>).strategy_weights
            : {},
          regression_cases: Array.isArray((input.adaptivePlan as Record<string, unknown>).regression_cases)
            ? ((input.adaptivePlan as Record<string, unknown>).regression_cases as unknown[]).map((item) => {
                const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
                return {
                  id: cleanString(record.id, 120),
                  label: cleanString(record.label, 300),
                  source_error_id: cleanString(record.source_error_id, 120),
                  error_type: cleanString(record.error_type, 40),
                  severity: cleanString(record.severity, 40),
                };
              }).filter((item) => item.id || item.label).slice(0, 20)
            : [],
          mutation_hints: Array.isArray((input.adaptivePlan as Record<string, unknown>).mutation_hints)
            ? ((input.adaptivePlan as Record<string, unknown>).mutation_hints as unknown[]).map((hint) => cleanString(hint, 500)).filter(Boolean).slice(0, 20)
            : [],
          summary: cleanString((input.adaptivePlan as Record<string, unknown>).summary, 1000),
        }
      : null,
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
