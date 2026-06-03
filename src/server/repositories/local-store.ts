import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export interface PromptRecord {
  id: string;
  userIdea: string;
  targetModelId: string;
  modality: string;
  createdAt: string;
}

export interface PromptVersionRecord {
  id: string;
  promptId: string;
  versionNumber: number;
  versionType: "optimized" | "synthetic";
  promptText: string;
  decisionStatus: "candidate" | "accepted" | "rejected" | "needs_review";
  qualityGate: unknown;
  createdAt: string;
}

export interface FeedbackRecord {
  id: string;
  eventId: string;
  promptId: string;
  promptVersionId: string;
  userScore: number;
  starRating: number;
  preference: "new_better" | "old_better" | "blend_needed" | "both_bad";
  userNotes: string;
  needsOptimization: boolean;
  createdAt: string;
}

export interface TestRunRecord {
  id: string;
  eventId: string;
  promptId?: string;
  promptVersionId?: string;
  originalPrompt: string;
  optimizedPrompt: string;
  targetModelId: string;
  externalScore?: number | null;
  systemScore: number;
  pass: boolean;
  createdAt: string;
}

export interface ModelPreferenceRecord {
  id: string;
  deviceId: string;
  targetModelId: string;
  generatorModelIds: string[];
  evaluatorModelIds: string[];
  imageJudgeModelIds: string[];
  isLocked: boolean;
  source: "auto" | "manual" | "imported";
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestRunImageRecord {
  id: string;
  eventId: string;
  testRunId: string;
  imageRole: "reference" | "generated" | "thumbnail" | "other";
  originalName: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  sha256: string;
  storagePath: string;
  fileRef: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DatasetExportRecord {
  id: string;
  exportPath: string;
  itemCount: number;
  privacyFindings: Array<{ field: string; reason: string }>;
  createdAt: string;
}

export interface StoreSnapshot {
  prompts: PromptRecord[];
  promptVersions: PromptVersionRecord[];
  feedback: FeedbackRecord[];
  testRuns: TestRunRecord[];
  modelPreferences: ModelPreferenceRecord[];
  testRunImages: TestRunImageRecord[];
  datasetExports: DatasetExportRecord[];
}

function resolveDataDir(): string {
  const configured = process.env.AI_PROMPT_V3_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return path.join(os.tmpdir(), "ai-prompt-generator-v3");
  }
  return path.join(process.cwd(), ".local-data");
}

export const DATA_DIR = resolveDataDir();
const STORE_FILE = path.join(DATA_DIR, "v3-store.json");
export const DEFAULT_DEVICE_ID = "anonymous-local-device";

function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(): string {
  return crypto.randomUUID();
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    const empty: StoreSnapshot = {
      prompts: [],
      promptVersions: [],
      feedback: [],
      testRuns: [],
      modelPreferences: [],
      testRunImages: [],
      datasetExports: [],
    };
    await fs.writeFile(STORE_FILE, `${JSON.stringify(empty, null, 2)}\n`, "utf8");
  }
}

export async function readStore(): Promise<StoreSnapshot> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoreSnapshot>;
  return {
    prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
    promptVersions: Array.isArray(parsed.promptVersions) ? parsed.promptVersions : [],
    feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    testRuns: Array.isArray(parsed.testRuns) ? parsed.testRuns : [],
    modelPreferences: Array.isArray(parsed.modelPreferences) ? parsed.modelPreferences : [],
    testRunImages: Array.isArray(parsed.testRunImages) ? parsed.testRunImages : [],
    datasetExports: Array.isArray(parsed.datasetExports) ? parsed.datasetExports : [],
  };
}

export async function writeStore(store: StoreSnapshot): Promise<void> {
  await ensureStore();
  const temp = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(temp, STORE_FILE);
}

export async function createPrompt(input: Omit<PromptRecord, "id" | "createdAt">): Promise<PromptRecord> {
  const store = await readStore();
  const record: PromptRecord = { id: makeId(), createdAt: nowIso(), ...input };
  store.prompts.unshift(record);
  await writeStore(store);
  return record;
}

export async function createPromptVersion(
  input: Omit<PromptVersionRecord, "id" | "createdAt" | "versionNumber">,
): Promise<PromptVersionRecord> {
  const store = await readStore();
  const versionNumber = store.promptVersions.filter((item) => item.promptId === input.promptId).length + 1;
  const record: PromptVersionRecord = { id: makeId(), createdAt: nowIso(), versionNumber, ...input };
  store.promptVersions.unshift(record);
  await writeStore(store);
  return record;
}

export async function listPromptVersions(promptId: string): Promise<PromptVersionRecord[]> {
  const store = await readStore();
  return store.promptVersions
    .filter((item) => item.promptId === promptId)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function getPrompt(promptId: string): Promise<PromptRecord | null> {
  const store = await readStore();
  return store.prompts.find((item) => item.id === promptId) ?? null;
}

export async function getPromptVersion(promptVersionId: string): Promise<PromptVersionRecord | null> {
  const store = await readStore();
  return store.promptVersions.find((item) => item.id === promptVersionId) ?? null;
}

export async function getFeedbackByEventId(eventId: string): Promise<FeedbackRecord | null> {
  const store = await readStore();
  return store.feedback.find((item) => item.eventId === eventId) ?? null;
}

export async function saveFeedback(input: Omit<FeedbackRecord, "id" | "createdAt">): Promise<FeedbackRecord> {
  const store = await readStore();
  const existing = store.feedback.find((item) => item.eventId === input.eventId);
  if (existing) return existing;
  const record: FeedbackRecord = { id: makeId(), createdAt: nowIso(), ...input };
  store.feedback.unshift(record);
  await writeStore(store);
  return record;
}

export async function saveTestRun(input: Omit<TestRunRecord, "id" | "createdAt">): Promise<TestRunRecord> {
  const store = await readStore();
  const existing = store.testRuns.find((item) => item.eventId === input.eventId);
  if (existing) return existing;
  const record: TestRunRecord = { id: makeId(), createdAt: nowIso(), ...input };
  store.testRuns.unshift(record);
  await writeStore(store);
  return record;
}

function defaultModelPreference(deviceId: string): Omit<ModelPreferenceRecord, "id" | "createdAt" | "updatedAt" | "lastUsedAt"> {
  return {
    deviceId,
    targetModelId: "gpt-image-2",
    generatorModelIds: ["gpt-5.5"],
    evaluatorModelIds: ["gpt-5.5"],
    imageJudgeModelIds: ["gpt-5.5"],
    isLocked: false,
    source: "auto",
  };
}

export async function getModelPreference(deviceId = DEFAULT_DEVICE_ID): Promise<ModelPreferenceRecord> {
  const store = await readStore();
  const existing = store.modelPreferences.find((item) => item.deviceId === deviceId);
  if (existing) return existing;
  const timestamp = nowIso();
  const record: ModelPreferenceRecord = {
    id: makeId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    ...defaultModelPreference(deviceId),
  };
  store.modelPreferences.unshift(record);
  await writeStore(store);
  return record;
}

export async function saveModelPreference(input: {
  deviceId?: string;
  targetModelId?: string;
  generatorModelIds?: string[];
  evaluatorModelIds?: string[];
  imageJudgeModelIds?: string[];
  isLocked?: boolean;
  source?: "auto" | "manual" | "imported";
}): Promise<ModelPreferenceRecord> {
  const deviceId = input.deviceId || DEFAULT_DEVICE_ID;
  const store = await readStore();
  const timestamp = nowIso();
  const existing = store.modelPreferences.find((item) => item.deviceId === deviceId);
  const base: ModelPreferenceRecord = existing ?? {
    id: makeId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    ...defaultModelPreference(deviceId),
  };
  const updated: ModelPreferenceRecord = {
    ...base,
    targetModelId: input.targetModelId ?? base.targetModelId,
    generatorModelIds: input.generatorModelIds ?? base.generatorModelIds,
    evaluatorModelIds: input.evaluatorModelIds ?? base.evaluatorModelIds,
    imageJudgeModelIds: input.imageJudgeModelIds ?? base.imageJudgeModelIds,
    isLocked: input.isLocked ?? base.isLocked,
    source: input.source ?? base.source,
    lastUsedAt: timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    store.modelPreferences = store.modelPreferences.map((item) => item.deviceId === deviceId ? updated : item);
  } else {
    store.modelPreferences.unshift(updated);
  }
  await writeStore(store);
  return updated;
}

export async function getTestRun(testRunId: string): Promise<TestRunRecord | null> {
  const store = await readStore();
  return store.testRuns.find((item) => item.id === testRunId || item.eventId === testRunId) ?? null;
}

export async function saveTestRunImage(input: Omit<TestRunImageRecord, "id" | "createdAt">): Promise<TestRunImageRecord> {
  const store = await readStore();
  const existing = store.testRunImages.find((item) => item.eventId === input.eventId);
  if (existing) return existing;
  const record: TestRunImageRecord = { id: makeId(), createdAt: nowIso(), ...input };
  store.testRunImages.unshift(record);
  await writeStore(store);
  return record;
}

export async function saveDatasetExport(input: Omit<DatasetExportRecord, "id" | "createdAt">): Promise<DatasetExportRecord> {
  const store = await readStore();
  const record: DatasetExportRecord = { id: makeId(), createdAt: nowIso(), ...input };
  store.datasetExports.unshift(record);
  await writeStore(store);
  return record;
}

export async function applyDecision(args: {
  promptId: string;
  selectedVersionId?: string;
  rejectedVersionId?: string;
  syntheticPrompt?: string;
  qualityGate?: unknown;
}): Promise<{ selectedVersionId: string | null; syntheticVersionId?: string }> {
  const store = await readStore();
  let selectedVersionId = args.selectedVersionId ?? null;
  let syntheticVersionId: string | undefined;
  if (args.syntheticPrompt) {
    const versionNumber = store.promptVersions.filter((item) => item.promptId === args.promptId).length + 1;
    const synthetic: PromptVersionRecord = {
      id: makeId(),
      promptId: args.promptId,
      versionNumber,
      versionType: "synthetic",
      promptText: args.syntheticPrompt,
      decisionStatus: "candidate",
      qualityGate: args.qualityGate ?? null,
      createdAt: nowIso(),
    };
    store.promptVersions.unshift(synthetic);
    syntheticVersionId = synthetic.id;
    selectedVersionId = synthetic.id;
  }
  for (const version of store.promptVersions) {
    if (version.promptId !== args.promptId) continue;
    if (selectedVersionId && version.id === selectedVersionId) version.decisionStatus = "accepted";
    if (args.rejectedVersionId && version.id === args.rejectedVersionId) version.decisionStatus = "rejected";
  }
  await writeStore(store);
  return syntheticVersionId ? { selectedVersionId, syntheticVersionId } : { selectedVersionId };
}
