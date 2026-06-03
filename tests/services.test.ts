import test from "node:test";
import assert from "node:assert/strict";
import { generatePromptV3 } from "../src/server/services/prompt-orchestrator.js";
import { submitFeedbackV3 } from "../src/server/services/feedback-loop-service.js";
import { ingestTestRunV3 } from "../src/server/services/test-run-ingestion-service.js";
import { saveTestRunImageV3 } from "../src/server/services/test-run-image-service.js";
import { exportDatasetJsonlV3 } from "../src/server/services/dataset-export-service.js";
import { comparePromptVersions, decidePromptVersion } from "../src/server/services/prompt-version-service.js";
import { getModelPreference, saveModelPreference } from "../src/server/repositories/local-store.js";
import { evaluateAndOptimizeUnified } from "../src/server/services/unified-evaluation-service.js";
import { writeGithubLedgerPayload } from "../src/server/services/github-ledger-service.js";
import { validateProviderModel, validateAllProviderModels } from "../src/server/services/provider-registry-service.js";
import { runProductionMigration } from "../src/server/repositories/database.js";

test("service loop generates prompt, stores feedback, test run, and synthetic decision", async () => {
  const generated = await generatePromptV3({
    userIdea: "生成一张参考图一致的商业海报，中文标题清晰，手部不能畸形",
    targetModelId: "gpt-image-2",
    failedDimensions: ["hand_anatomy", "text_rendering", "reference_similarity"],
    hasReferenceImage: true,
  });
  assert.ok(generated.prompt.id);
  assert.ok(generated.version.id);
  assert.ok(generated.optimizedPrompt.includes("Negative Prompt"));

  const feedback = await submitFeedbackV3({
    eventId: `feedback-test-${generated.prompt.id}`,
    promptId: generated.prompt.id,
    promptVersionId: generated.version.id,
    userScore: 55,
    starRating: 2,
    preference: "blend_needed",
    userNotes: "评分虚高，手部和文字需要更严格",
  });
  assert.equal(feedback.needsOptimization, true);

  const testRun = await ingestTestRunV3({
    eventId: `test-run-${generated.prompt.id}`,
    promptId: generated.prompt.id,
    promptVersionId: generated.version.id,
    originalPrompt: "原始需求",
    optimizedPrompt: generated.optimizedPrompt,
    targetModelId: "gpt-image-2",
    externalScore: 55,
  });
  assert.ok(testRun.testRun.id);

  const decision = await decidePromptVersion({
    promptId: generated.prompt.id,
    decision: "blend_needed",
    newVersionId: generated.version.id,
    newPrompt: generated.optimizedPrompt,
    oldPrompt: "旧版结构稳定但细节不足",
    userIdea: "商业海报",
    notes: "融合旧版结构和新版细节",
    failedDimensions: ["hand_anatomy"],
  });
  assert.ok(decision.syntheticVersionId);

  const compared = await comparePromptVersions(generated.prompt.id);
  assert.ok(compared.syntheticVersion);
});

test("model preference persists to local store by device id", async () => {
  const deviceId = `device-${Date.now()}`;
  const saved = await saveModelPreference({
    deviceId,
    targetModelId: "gpt-image-2",
    generatorModelIds: ["gpt-5.5", "claude-opus-4-7"],
    evaluatorModelIds: ["gpt-5.5"],
    imageJudgeModelIds: ["gpt-5.5"],
    isLocked: true,
    source: "manual",
  });
  assert.equal(saved.isLocked, true);
  const loaded = await getModelPreference(deviceId);
  assert.equal(loaded.targetModelId, "gpt-image-2");
  assert.deepEqual(loaded.generatorModelIds, ["gpt-5.5", "claude-opus-4-7"]);
});

test("auto model selection chooses GPT Image 2 for new image users", async () => {
  const generated = await generatePromptV3({
    userIdea: "生成一张手机壁纸图片，要真实光影和商业质感",
    deviceId: `auto-device-${Date.now()}`,
  });
  assert.equal(generated.prompt.targetModelId, "gpt-image-2");
  assert.equal(generated.modelSelection.source, "auto");
});

test("low feedback creates one idempotent synthetic optimization candidate", async () => {
  const generated = await generatePromptV3({
    userIdea: "写一个严格的代码重构提示词，不要编造文件",
    targetModelId: "gpt-5.5",
  });
  const eventId = `low-feedback-${generated.prompt.id}`;
  const first = await submitFeedbackV3({
    eventId,
    promptId: generated.prompt.id,
    promptVersionId: generated.version.id,
    userScore: 35,
    starRating: 1,
    preference: "both_bad",
    userNotes: "具体意图没实现，幻觉太重",
  });
  assert.equal(first.needsOptimization, true);
  assert.ok(first.optimizationCandidate);

  const second = await submitFeedbackV3({
    eventId,
    promptId: generated.prompt.id,
    promptVersionId: generated.version.id,
    userScore: 35,
    starRating: 1,
    preference: "both_bad",
    userNotes: "具体意图没实现，幻觉太重",
  });
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.optimizationCandidate, null);
});

test("test run image upload stores sha256 metadata and rejects unknown test run", async () => {
  const run = await ingestTestRunV3({
    eventId: `image-run-${Date.now()}`,
    originalPrompt: "测试参考照片",
    optimizedPrompt: "Final Prompt with Negative Prompt, do not fabricate, quality checklist",
    targetModelId: "gpt-image-2",
    externalScore: 72,
  });
  const file = new File([Buffer.from("small-image")], "reference.png", { type: "image/png" });
  const saved = await saveTestRunImageV3({
    testRunId: run.testRun.id,
    file,
    imageRole: "reference",
    metadata: { case: "unit" },
  });
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.equal(saved.image.mimeType, "image/png");
    assert.equal(saved.image.sha256.length, 64);
    assert.match(saved.image.fileRef, /^local:\/\/test-run-images\//);
  }

  const missing = await saveTestRunImageV3({
    testRunId: "missing",
    file,
    imageRole: "reference",
  });
  assert.equal(missing.ok, false);
});

test("dataset export writes jsonl and masks secrets", async () => {
  const generated = await generatePromptV3({
    userIdea: "导出测试，不得泄露邮箱 test@example.com，也不要泄露任何真实 API key",
    targetModelId: "gpt-5.5",
  });
  await submitFeedbackV3({
    eventId: `export-feedback-${generated.prompt.id}`,
    promptId: generated.prompt.id,
    promptVersionId: generated.version.id,
    userScore: 45,
    starRating: 2,
    preference: "both_bad",
    userNotes: "cookie: abc123; bearer token should be redacted",
  });
  const exported = await exportDatasetJsonlV3({ reason: "unit_test" });
  assert.ok(exported.itemCount >= 1);
  assert.ok(exported.exportPath.endsWith(".jsonl"));
  assert.ok(exported.privacyFindings.length >= 1);
});

test("unified evaluation prioritizes human feedback, yellow findings, and green below 9", async () => {
  const generated = await generatePromptV3({
    userIdea: "生成 GPT Image 2 商业海报提示词，中文标题准确，不能有幻觉，必须保留用户意图",
    targetModelId: "gpt-image-2",
    hasReferenceImage: true,
  });
  const evaluated = await evaluateAndOptimizeUnified({
    artifactType: "image_prompt",
    promptId: generated.prompt.id,
    promptVersionId: generated.version.id,
    targetModelId: "gpt-image-2",
    aiScores: {
      hallucination_resistance: 8.8,
      user_intent_alignment: 8.7,
      image_prompt_quality: 8.1,
      safety: 9.4,
    },
    humanScore: 64,
    humanSeverity: "high",
    humanNotes: "人工评价优先：中文文字和比例不稳，黄色问题必须先修，幻觉和意图虽然是绿色但低于 9.0 也要继续优化。",
  });
  assert.equal(evaluated.ok, true);
  if (evaluated.ok) {
    assert.equal(evaluated.feedbackMemoryDelta.humanOverridesAi, true);
    assert.equal(evaluated.needsOptimization, true);
    assert.ok(evaluated.partitions.yellow.some((item) => item.dimension === "human_feedback"));
    assert.ok(evaluated.partitions.greenBelowNine.some((item) => item.dimension === "hallucination_resistance"));
    assert.ok(evaluated.partitions.greenBelowNine.some((item) => item.dimension === "user_intent_alignment"));
    assert.ok(evaluated.optimizationCandidate);
    assert.equal(evaluated.githubLedgerPayload.humanEvaluation.priority, "highest");
    assert.equal(evaluated.githubLedgerPayload.optimization.triggered, true);
    assert.ok(evaluated.githubLedger?.payloadPath.endsWith("evaluation-ledger.json"));
  }
});

test("github ledger writer persists sanitized evaluation payload", async () => {
  const result = await writeGithubLedgerPayload({
    dryRun: true,
    payload: {
      generatedAt: new Date().toISOString(),
      project: "ai-prompt-generator-v3",
      artifactType: "text_prompt",
      promptId: "prompt-secret-test",
      promptVersionId: "version-secret-test",
      redactedInput: "contact user@example.com and bearer abcdefghijklmnopqrstuvwxyz",
      humanEvaluation: { priority: "highest" },
      optimization: { triggered: true, status: "candidate" },
      yellowItems: [{ dimension: "user_intent_alignment" }],
      greenBelowNineItems: [{ dimension: "hallucination_resistance" }],
      redItems: [],
      regression: { commands: ["npm run test:compiled"] },
    },
  });
  assert.equal(result.ok, true);
  assert.ok(result.payloadPath.endsWith("evaluation-ledger.json"));
  assert.ok(result.privacyFindings.some((item) => item.reason === "email"));
  assert.ok(result.privacyFindings.some((item) => item.reason === "bearer_token"));
});

test("provider registry validates gpt-image-2 aliases and missing models", () => {
  const fallback = validateProviderModel("gpt-image-2", {
    source: "configured_list",
    models: new Set(["gpt-image-1.5", "gpt-5.5"]),
    warnings: [],
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.status, "alias_fallback");
  assert.equal(fallback.resolvedModelId, "gpt-image-1.5");

  const missing = validateProviderModel("gpt-image-2", {
    source: "configured_list",
    models: new Set(["gpt-5.5"]),
    warnings: [],
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "missing");

  const needsProvider = validateAllProviderModels({
    openai: { source: "none", models: new Set(), warnings: ["unit test no provider"] },
    anthropic: { source: "none", models: new Set(), warnings: ["unit test no provider"] },
  });
  assert.equal(needsProvider.ok, true);
  assert.ok(needsProvider.results.every((item) => item.status === "needs_provider_check"));
});

test("production migration dry run parses executable schema without requiring DATABASE_URL", async () => {
  const migration = await runProductionMigration({ dryRun: true });
  assert.equal(migration.ok, true);
  assert.equal(migration.mode, "dry_run");
  assert.ok(migration.statementCount >= 10);
});
