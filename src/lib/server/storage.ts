import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { Pool } from "pg";

export type PreferenceDecision = "new_better" | "old_better" | "blend_needed" | "both_bad";

export interface ModelPreferenceRecord {
  targetModelId: string;
  generatorModelIds: string[];
  evaluatorModelIds: string[];
  imageJudgeModelIds: string[];
  isLocked: boolean;
  source: "auto" | "manual" | "history" | "server";
  deviceId: string;
  updatedAt: string;
}

export interface PromptRecordInput {
  deviceId: string;
  userIdea: string;
  targetModelId: string;
  targetModelCategory: string;
  language: "zh" | "en";
}

export interface PromptVersionInput {
  promptId: string;
  parentVersionId?: string | null;
  versionType: "optimized" | "synthetic";
  promptText: string;
  generatorModelIds?: string[];
  evaluatorModelIds?: string[];
  sourceRepoCommits?: string[];
  aiScore?: number | null;
  decisionStatus?: "candidate" | "active" | "accepted" | "rejected";
}

export interface FeedbackRecordInput {
  promptId?: string | null;
  promptVersionId?: string | null;
  deviceId: string;
  starRating: number;
  userNotes: string;
  preference: PreferenceDecision;
  oldVersionId?: string | null;
  newVersionId?: string | null;
  selectedVersionId?: string | null;
  payload?: Record<string, unknown>;
}

export interface TestRunInput {
  promptId?: string | null;
  promptVersionId?: string | null;
  deviceId: string;
  testSource: string;
  testMode: "text_to_image" | "image_to_image" | "prompt_only";
  originalPrompt: string;
  optimizedPrompt: string;
  targetImageModelId: string;
  externalSiteScore?: number | null;
  systemScore?: number | null;
  pass?: boolean;
}

export interface ScoreReportInput {
  testRunId?: string | null;
  promptVersionId?: string | null;
  scoreType: "prompt" | "image" | "combined";
  totalScore: number;
  pass: boolean;
  dimensionScores: Record<string, number>;
  deductions: Array<Record<string, unknown>>;
  evaluatorModelIds?: string[];
}

export interface TestImageInput {
  testRunId: string;
  imageRole: "reference" | "generated" | "thumbnail";
  storageUrl: string;
  sha256: string;
  width?: number | null;
  height?: number | null;
  mimeType: string;
  perceptualHash?: string | null;
  metadata?: Record<string, unknown>;
}

function resolveLocalDataRoot(): string {
  if (process.env.LOCAL_DATA_DIR?.trim()) return process.env.LOCAL_DATA_DIR.trim();
  const cwd = process.cwd();
  const isServerlessReadOnly =
    Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    cwd === "/var/task" ||
    cwd.startsWith("/var/task/");
  return isServerlessReadOnly
    ? path.join(os.tmpdir(), "ai-prompt-generator", ".local-data")
    : path.join(cwd, ".local-data");
}

export const localDataRoot = resolveLocalDataRoot();
let pool: Pool | null | undefined;

function makeId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (pool === undefined) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

function normalizeDeviceId(deviceId?: string | null): string {
  const clean = typeof deviceId === "string" ? deviceId.trim().slice(0, 160) : "";
  return clean || "anonymous-device";
}

async function ensureLocalDir(): Promise<void> {
  await fs.mkdir(localDataRoot, { recursive: true });
}

async function readJsonArray<T>(fileName: string): Promise<T[]> {
  await ensureLocalDir();
  try {
    const raw = await fs.readFile(path.join(localDataRoot, fileName), "utf8");
    const parsed = parseJsonArray(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function parseJsonArray(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    let inString = false;
    let escaped = false;
    let depth = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = inString;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "[") depth += 1;
      if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(raw.slice(0, i + 1));
        }
      }
    }
    return [];
  }
}

async function writeJsonArray<T>(fileName: string, rows: T[]): Promise<void> {
  await ensureLocalDir();
  const filePath = path.join(localDataRoot, fileName);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  try {
    await fs.copyFile(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

export function storageMode(): "postgres" | "local-json" {
  return getPool() ? "postgres" : "local-json";
}

export async function appendLocalJsonl(relativePath: string, row: unknown): Promise<string> {
  await ensureLocalDir();
  const filePath = path.join(localDataRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, "utf8");
  return filePath;
}

export async function getModelPreference(deviceId?: string | null): Promise<ModelPreferenceRecord | null> {
  const safeDeviceId = normalizeDeviceId(deviceId);
  const db = getPool();
  if (db) {
    const result = await db.query(
      `SELECT target_model_id, generator_model_ids, evaluator_model_ids, image_judge_model_ids,
              is_locked, source, device_id, last_used_at
         FROM model_preferences
        WHERE device_id = $1
        LIMIT 1`,
      [safeDeviceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      targetModelId: row.target_model_id,
      generatorModelIds: row.generator_model_ids ?? [],
      evaluatorModelIds: row.evaluator_model_ids ?? [],
      imageJudgeModelIds: row.image_judge_model_ids ?? [],
      isLocked: Boolean(row.is_locked),
      source: row.source ?? "server",
      deviceId: row.device_id,
      updatedAt: new Date(row.last_used_at).toISOString(),
    };
  }

  const rows = await readJsonArray<ModelPreferenceRecord>("model-preferences.json");
  return rows.find((row) => row.deviceId === safeDeviceId) ?? null;
}

export async function saveModelPreference(input: ModelPreferenceRecord): Promise<ModelPreferenceRecord> {
  const record: ModelPreferenceRecord = {
    targetModelId: input.targetModelId,
    generatorModelIds: input.generatorModelIds.slice(0, 6),
    evaluatorModelIds: input.evaluatorModelIds.slice(0, 6),
    imageJudgeModelIds: input.imageJudgeModelIds.slice(0, 6),
    isLocked: input.isLocked,
    source: input.source,
    deviceId: normalizeDeviceId(input.deviceId),
    updatedAt: nowIso(),
  };

  const db = getPool();
  if (db) {
    await db.query(
      `INSERT INTO model_preferences (
         device_id, target_model_id, generator_model_ids, evaluator_model_ids,
         image_judge_model_ids, is_locked, source, last_used_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (device_id)
       DO UPDATE SET
         target_model_id = EXCLUDED.target_model_id,
         generator_model_ids = EXCLUDED.generator_model_ids,
         evaluator_model_ids = EXCLUDED.evaluator_model_ids,
         image_judge_model_ids = EXCLUDED.image_judge_model_ids,
         is_locked = EXCLUDED.is_locked,
         source = EXCLUDED.source,
         last_used_at = now()`,
      [
        record.deviceId,
        record.targetModelId,
        record.generatorModelIds,
        record.evaluatorModelIds,
        record.imageJudgeModelIds,
        record.isLocked,
        record.source,
      ],
    );
    return record;
  }

  const rows = await readJsonArray<ModelPreferenceRecord>("model-preferences.json");
  await writeJsonArray("model-preferences.json", [record, ...rows.filter((row) => row.deviceId !== record.deviceId)].slice(0, 500));
  return record;
}

export async function createPrompt(input: PromptRecordInput): Promise<{ id: string }> {
  const id = makeId();
  const db = getPool();
  if (db) {
    const result = await db.query(
      `INSERT INTO prompts (id, device_id, user_idea, target_model_id, target_model_category, language)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [id, normalizeDeviceId(input.deviceId), input.userIdea, input.targetModelId, input.targetModelCategory, input.language],
    );
    return { id: result.rows[0].id };
  }

  const rows = await readJsonArray<Record<string, unknown>>("prompts.json");
  rows.unshift({ id, ...input, deviceId: normalizeDeviceId(input.deviceId), status: "active", createdAt: nowIso() });
  await writeJsonArray("prompts.json", rows.slice(0, 2000));
  return { id };
}

export async function createPromptVersion(input: PromptVersionInput): Promise<{ id: string; versionNumber: number }> {
  const id = makeId();
  const db = getPool();
  if (db) {
    const versionResult = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM prompt_versions
        WHERE prompt_id = $1`,
      [input.promptId],
    );
    const versionNumber = Number(versionResult.rows[0]?.next_version ?? 1);
    const result = await db.query(
      `INSERT INTO prompt_versions (
         id, prompt_id, parent_version_id, version_number, version_type, prompt_text,
         generator_model_ids, evaluator_model_ids, source_repo_commits, ai_score, decision_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, version_number`,
      [
        id,
        input.promptId,
        input.parentVersionId ?? null,
        versionNumber,
        input.versionType,
        input.promptText,
        input.generatorModelIds ?? [],
        input.evaluatorModelIds ?? [],
        input.sourceRepoCommits ?? [],
        input.aiScore ?? null,
        input.decisionStatus ?? "candidate",
      ],
    );
    return { id: result.rows[0].id, versionNumber: result.rows[0].version_number };
  }

  const rows = await readJsonArray<Record<string, any>>("prompt-versions.json");
  const versionNumber = rows.filter((row) => row.promptId === input.promptId).length + 1;
  rows.unshift({
    id,
    promptId: input.promptId,
    parentVersionId: input.parentVersionId ?? null,
    versionNumber,
    versionType: input.versionType,
    promptText: input.promptText,
    generatorModelIds: input.generatorModelIds ?? [],
    evaluatorModelIds: input.evaluatorModelIds ?? [],
    sourceRepoCommits: input.sourceRepoCommits ?? [],
    aiScore: input.aiScore ?? null,
    decisionStatus: input.decisionStatus ?? "candidate",
    createdAt: nowIso(),
  });
  await writeJsonArray("prompt-versions.json", rows.slice(0, 4000));
  return { id, versionNumber };
}

export async function getPromptVersions(promptId: string): Promise<Array<Record<string, any>>> {
  const db = getPool();
  if (db) {
    const result = await db.query(
      `SELECT id, prompt_id, parent_version_id, version_number, version_type,
              prompt_text, ai_score, decision_status, created_at
         FROM prompt_versions
        WHERE prompt_id = $1
        ORDER BY version_number DESC`,
      [promptId],
    );
    return result.rows;
  }
  const rows = await readJsonArray<Record<string, any>>("prompt-versions.json");
  return rows
    .filter((row) => row.promptId === promptId)
    .sort((a, b) => Number(b.versionNumber ?? 0) - Number(a.versionNumber ?? 0));
}

export async function saveFeedbackRecord(input: FeedbackRecordInput): Promise<{ id: string }> {
  const id = makeId();
  const starRating = Math.max(1, Math.min(5, Math.round(Number(input.starRating) || 1)));
  const db = getPool();
  if (db) {
    const result = await db.query(
      `INSERT INTO feedback (
         id, prompt_id, prompt_version_id, device_id, star_rating, user_notes, preference,
         old_version_id, new_version_id, selected_version_id, anti_cheat_flags
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        id,
        input.promptId ?? null,
        input.promptVersionId ?? null,
        normalizeDeviceId(input.deviceId),
        starRating,
        input.userNotes,
        input.preference,
        input.oldVersionId ?? null,
        input.newVersionId ?? null,
        input.selectedVersionId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    return { id: result.rows[0].id };
  }

  const rows = await readJsonArray<Record<string, unknown>>("feedback.json");
  rows.unshift({ id, ...input, deviceId: normalizeDeviceId(input.deviceId), starRating, createdAt: nowIso() });
  await writeJsonArray("feedback.json", rows.slice(0, 4000));
  return { id };
}

export async function saveDecision(input: {
  promptId: string;
  decision: PreferenceDecision;
  oldVersionId?: string | null;
  newVersionId?: string | null;
  selectedVersionId?: string | null;
  syntheticPrompt?: string | null;
}): Promise<{ selectedVersionId: string | null; syntheticVersionId?: string }> {
  let selectedVersionId = input.selectedVersionId ?? null;
  let syntheticVersionId: string | undefined;

  if ((input.decision === "blend_needed" || input.decision === "both_bad") && input.syntheticPrompt) {
    const version = await createPromptVersion({
      promptId: input.promptId,
      parentVersionId: input.newVersionId ?? input.oldVersionId ?? null,
      versionType: "synthetic",
      promptText: input.syntheticPrompt,
      decisionStatus: "candidate",
    });
    syntheticVersionId = version.id;
    selectedVersionId = version.id;
  }

  const db = getPool();
  if (db) {
    await db.query(
      `UPDATE prompt_versions
          SET decision_status = CASE
            WHEN id = $2 THEN 'accepted'
            WHEN id = $3 THEN 'rejected'
            ELSE decision_status
          END
        WHERE prompt_id = $1`,
      [input.promptId, selectedVersionId, input.decision === "new_better" ? input.oldVersionId : input.newVersionId],
    );
  } else {
    const rows = await readJsonArray<Record<string, any>>("prompt-versions.json");
    for (const row of rows) {
      if (row.promptId !== input.promptId) continue;
      if (row.id === selectedVersionId) row.decisionStatus = "accepted";
      if (row.id === (input.decision === "new_better" ? input.oldVersionId : input.newVersionId)) row.decisionStatus = "rejected";
    }
    await writeJsonArray("prompt-versions.json", rows);
  }

  return { selectedVersionId, syntheticVersionId };
}

export async function createTestRun(input: TestRunInput): Promise<{ id: string }> {
  const id = makeId();
  const db = getPool();
  if (db) {
    const result = await db.query(
      `INSERT INTO test_runs (
         id, prompt_id, prompt_version_id, device_id, test_source, test_mode,
         original_prompt, optimized_prompt, target_image_model_id,
         external_site_score, system_score, pass
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        id,
        input.promptId ?? null,
        input.promptVersionId ?? null,
        normalizeDeviceId(input.deviceId),
        input.testSource,
        input.testMode,
        input.originalPrompt,
        input.optimizedPrompt,
        input.targetImageModelId,
        input.externalSiteScore ?? null,
        input.systemScore ?? null,
        input.pass ?? false,
      ],
    );
    return { id: result.rows[0].id };
  }

  const rows = await readJsonArray<Record<string, unknown>>("test-runs.json");
  rows.unshift({ id, ...input, deviceId: normalizeDeviceId(input.deviceId), createdAt: nowIso() });
  await writeJsonArray("test-runs.json", rows.slice(0, 4000));
  return { id };
}

export async function saveScoreReport(input: ScoreReportInput): Promise<{ id: string }> {
  const id = makeId();
  const db = getPool();
  if (db) {
    const result = await db.query(
      `INSERT INTO score_reports (
         id, test_run_id, prompt_version_id, score_type, total_score, pass,
         dimension_scores, deductions, evaluator_model_ids
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        id,
        input.testRunId ?? null,
        input.promptVersionId ?? null,
        input.scoreType,
        input.totalScore,
        input.pass,
        JSON.stringify(input.dimensionScores),
        JSON.stringify(input.deductions),
        input.evaluatorModelIds ?? [],
      ],
    );
    return { id: result.rows[0].id };
  }

  const rows = await readJsonArray<Record<string, unknown>>("score-reports.json");
  rows.unshift({ id, ...input, createdAt: nowIso() });
  await writeJsonArray("score-reports.json", rows.slice(0, 4000));
  return { id };
}

export async function saveTestImage(input: TestImageInput): Promise<{ id: string }> {
  const id = makeId();
  const db = getPool();
  if (db) {
    const result = await db.query(
      `INSERT INTO test_images (
         id, test_run_id, image_role, storage_url, sha256, width, height,
         mime_type, perceptual_hash, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        id,
        input.testRunId,
        input.imageRole,
        input.storageUrl,
        input.sha256,
        input.width ?? null,
        input.height ?? null,
        input.mimeType,
        input.perceptualHash ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return { id: result.rows[0].id };
  }

  const rows = await readJsonArray<Record<string, unknown>>("test-images.json");
  rows.unshift({
    id,
    ...input,
    createdAt: nowIso(),
  });
  await writeJsonArray("test-images.json", rows.slice(0, 4000));
  return { id };
}
