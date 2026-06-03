import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, readStore, saveDatasetExport } from "../repositories/local-store.js";

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "api_key", pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g },
  { name: "cookie", pattern: /\b(cookie|set-cookie|sessionid|connect\.sid)\s*[:=]\s*[^;\s]+/gi },
  { name: "bearer_token", pattern: /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { name: "private_key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g },
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
];

function maskSensitive(value: string): { masked: string; findings: Array<{ field: string; reason: string }> } {
  let masked = value;
  const findings: Array<{ field: string; reason: string }> = [];
  for (const item of SECRET_PATTERNS) {
    if (item.pattern.test(masked)) {
      findings.push({ field: "jsonl", reason: item.name });
      masked = masked.replace(item.pattern, `[REDACTED_${item.name.toUpperCase()}]`);
    }
    item.pattern.lastIndex = 0;
  }
  return { masked, findings };
}

function hashUserScope(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `anon_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function exportDatasetJsonlV3(input: { reason?: string } = {}) {
  const store = await readStore();
  const promptById = new Map(store.prompts.map((item) => [item.id, item]));
  const versionById = new Map(store.promptVersions.map((item) => [item.id, item]));
  const lines: string[] = [];
  const privacyFindings: Array<{ field: string; reason: string }> = [];

  for (const feedback of store.feedback) {
    const prompt = promptById.get(feedback.promptId);
    const version = versionById.get(feedback.promptVersionId);
    if (!prompt || !version) continue;
    const item = {
      schemaVersion: "v3.dataset.feedback.1",
      source: "ai_prompt_generator_v3",
      exportReason: input.reason ?? "manual_or_worker_export",
      promptId: feedback.promptId,
      promptVersionId: feedback.promptVersionId,
      anonymousUserScope: hashUserScope(prompt.id),
      userIdea: prompt.userIdea,
      targetModelId: prompt.targetModelId,
      modality: prompt.modality,
      promptText: version.promptText,
      userScore: feedback.userScore,
      starRating: feedback.starRating,
      preference: feedback.preference,
      userNotes: feedback.userNotes,
      needsOptimization: feedback.needsOptimization,
      createdAt: feedback.createdAt,
    };
    const raw = JSON.stringify(item);
    const sanitized = maskSensitive(raw);
    privacyFindings.push(...sanitized.findings);
    lines.push(sanitized.masked);
  }

  for (const run of store.testRuns) {
    const item = {
      schemaVersion: "v3.dataset.test_run.1",
      source: "ai_prompt_generator_v3",
      exportReason: input.reason ?? "manual_or_worker_export",
      promptId: run.promptId ?? null,
      promptVersionId: run.promptVersionId ?? null,
      originalPrompt: run.originalPrompt,
      optimizedPrompt: run.optimizedPrompt,
      targetModelId: run.targetModelId,
      externalScore: run.externalScore ?? null,
      systemScore: run.systemScore,
      pass: run.pass,
      createdAt: run.createdAt,
      imagePolicy: "images_are_not_exported_only_local_file_refs_allowed",
    };
    const sanitized = maskSensitive(JSON.stringify(item));
    privacyFindings.push(...sanitized.findings);
    lines.push(sanitized.masked);
  }

  const dir = path.join(DATA_DIR, "exports");
  await fs.mkdir(dir, { recursive: true });
  const fileName = `dataset-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const exportPath = path.join(dir, fileName);
  await fs.writeFile(exportPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  const record = await saveDatasetExport({ exportPath, itemCount: lines.length, privacyFindings });
  return { export: record, itemCount: lines.length, privacyFindings, exportPath };
}
