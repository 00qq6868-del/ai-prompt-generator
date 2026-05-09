// src/app/api/generate/route.ts
// POST /api/generate — generates an optimized prompt (streaming + non-streaming)

import { NextRequest, NextResponse } from "next/server";
import { callProvider, callProviderStream, type GenerateResult } from "@/lib/providers";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { getModels } from "@/lib/model-cache";
import { ModelInfo } from "@/lib/models-registry";
import { isRelayModelListed, mergeRelayModelIds } from "@/lib/relay-models";
import { checkRateLimit, rateLimitResponse, readPositiveIntEnv } from "@/lib/rate-limit";
import { resolveRuntimeApiProvider, runGptImage2Ensemble } from "@/lib/gpt-image-2-ensemble";
import { PromptGenerationProgress, runPromptTournament } from "@/lib/prompt-evaluator";
import {
  ModelHealthMeta,
  getModelCooldown,
  getModelTimeoutMs,
  recordModelFailure,
  recordModelSuccess,
  withTimeout,
} from "@/lib/model-health";
import { createPrompt, createPromptVersion } from "@/lib/server/storage";
import { exportDatasetRow } from "@/lib/server/github-dataset";
import { strictPromptScore } from "@/lib/strict-scoring";
import { toUserFacingErrorMessage } from "@/lib/error-messages";
import {
  ReferenceImageInput,
  ReferencePromptCandidate,
  analyzeImageWithVisionModel,
  analyzeReferenceImage,
  buildQualityFallbackPrompt,
  buildReferenceCandidatePrompt,
  canCallVisionModel,
  chooseEnhancedVisionModel,
  localVisionResult,
  modelSupportsVision,
  scoreReferencePromptCandidate,
} from "@/lib/reference-image";
import { analyzeUserIntent, type IntentAnalysis } from "@/lib/intent-router";
import { GITHUB_PROJECT_TRACKER_RULES } from "@/lib/github-project-tracker-status";
import { resolvePromptLanguagePolicy, promptLanguageInstruction } from "@/lib/prompt-language-policy";
import { buildTranslationStrategyMemory } from "@/lib/translation-projects";
import { sortModelsForStrongRouting } from "@/lib/model-routing";

export interface GenerateRequest {
  userIdea: string;
  targetModelId: string;
  generatorModelId: string;
  generatorModelIds?: string[];
  evaluatorModelIds?: string[];
  language?: "zh" | "en";
  maxTokens?: number;
  userKeys?: Record<string, string>;
  availableModelIds?: string[];
  deviceId?: string;
  feedbackMemory?: {
    rules?: string[];
    examples?: Array<{
      userIdea?: string;
      targetModel?: string;
      score?: number;
      preference?: string;
      notes?: string;
      selectedPromptPreview?: string;
    }>;
  };
  intentAnalysis?: IntentAnalysis;
  referenceImage?: ReferenceImageInput | null;
  stream?: boolean;
}

function summarizeFeedbackMemory(memory: GenerateRequest["feedbackMemory"]): string {
  if (!memory || typeof memory !== "object") return "";
  const rules = Array.isArray(memory.rules)
    ? memory.rules.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12)
    : [];
  const examples = Array.isArray(memory.examples)
    ? memory.examples.slice(0, 6)
    : [];
  if (!rules.length && !examples.length) return "";

  const lines = [
    "User feedback memory from previous prompt/image tests. Treat this as optimization guidance, not as part of the user's new task:",
    ...rules.map((rule, index) => `${index + 1}. ${rule.slice(0, 500)}`),
  ];
  if (examples.length) {
    lines.push("Recent feedback examples:");
    for (const item of examples) {
      lines.push(
        `- score=${item.score ?? "n/a"}, preference=${item.preference ?? "n/a"}, target=${item.targetModel ?? "n/a"}, notes=${String(item.notes || "").slice(0, 500)}`,
      );
    }
  }
  return lines.join("\n");
}

function summarizeIntentAnalysis(analysis: IntentAnalysis | null | undefined): string {
  if (!analysis) return "";
  const lines = [
    "Internal intent routing. Use it to select the right prompt structure, but do not expose internal taxonomy unless the user asks:",
    `- status=${analysis.status}`,
    `- confidence=${Math.round(analysis.confidence * 100)}%`,
    `- modality=${analysis.modality}`,
    `- domain=${analysis.domain}`,
    `- taskType=${analysis.taskType}`,
  ];
  if (analysis.tags.length) lines.push(`- tags=${analysis.tags.join(", ")}`);
  if (analysis.feedbackMemoryHints.length) lines.push(`- hints=${analysis.feedbackMemoryHints.join("; ")}`);
  if (analysis.conflicts.length) {
    lines.push(`- conflicts=${analysis.conflicts.map((item) => `${item.type}:${item.options.join(" vs ")}`).join("; ")}`);
  }
  return lines.join("\n");
}

function repairPromptForStrictQuality(args: {
  userIdea: string;
  promptText: string;
  targetModel: ModelInfo;
  language: "zh" | "en";
  hasReferenceImage: boolean;
  failedDimensions: string[];
}): string {
  const prompt = args.promptText.trim();
  const isImage = (args.targetModel.category ?? "text") === "image";
  const failed = args.failedDimensions.length ? args.failedDimensions.join(", ") : "strict quality gate";
  if (args.language === "zh") {
    return [
      prompt,
      "",
      "自动质量门补强 / Quality Gate Reinforcement",
      `用户原始意图必须完整保留：${args.userIdea}`,
      `本次补强针对低分维度：${failed}。`,
      "- 不得编造用户没有要求的事实、来源、人物身份、品牌、文字或细节；不确定处必须保持可控描述。",
      "- 输出必须直接可执行，包含清晰结构、约束、失败规避、验收检查和最终格式要求。",
      "- 幻觉防护：只使用用户输入、参考图信息和明确推断；禁止把推测当事实。",
      isImage
        ? `- 图像提示词必须包含主体、风格、构图、镜头、光影、色彩、材质、背景、质量标准、负面提示词和参数建议${args.hasReferenceImage ? "；必须保持参考图构图、色彩、比例和视觉效果一致" : ""}。`
        : "- 文本/代码提示词必须包含角色、任务、上下文、约束、步骤、输出格式、边界条件和自检标准。",
      "- 最终回答前必须自检：意图保真 >= 9/10，幻觉防护 >= 9/10，可执行性 >= 9/10；未达到则继续改写。",
    ].join("\n");
  }

  return [
    prompt,
    "",
    "Automatic Quality Gate Reinforcement",
    `Preserve the user's original intent completely: ${args.userIdea}`,
    `This reinforcement targets low-scoring dimensions: ${failed}.`,
    "- Do not invent facts, sources, identities, brands, visible text, or details the user did not provide; keep uncertain details controllable.",
    "- The prompt must be directly executable, with clear structure, constraints, failure prevention, acceptance checks, and final output format.",
    "- Anti-hallucination: use only the user's input, reference-image information, and explicitly marked inferences; never present guesses as facts.",
    isImage
      ? `- Image prompts must include subject, style, composition, camera, lighting, color, materials, background, quality criteria, negative prompt, and parameter guidance${args.hasReferenceImage ? "; preserve the reference image's composition, palette, proportions, and visual effect" : ""}.`
      : "- Text/code prompts must include role, task, context, constraints, steps, output format, edge cases, and self-check criteria.",
    "- Before final output, self-check: intent fidelity >= 9/10, hallucination resistance >= 9/10, actionability >= 9/10; if not met, rewrite internally.",
  ].join("\n");
}

export const maxDuration = 300;

function hasKey(name: string, userKeys: Record<string, string>): boolean {
  return Boolean(userKeys[name]?.trim() || process.env[name]?.trim());
}

function hasCustomRelay(userKeys: Record<string, string>): boolean {
  return hasKey("CUSTOM_API_KEY", userKeys) && Boolean(userKeys.CUSTOM_BASE_URL?.trim() || process.env.CUSTOM_BASE_URL?.trim());
}

function isProviderCallable(apiProvider: string, userKeys: Record<string, string>): boolean {
  switch (apiProvider) {
    case "custom":
      return hasCustomRelay(userKeys);
    case "aihubmix":
      return hasCustomRelay(userKeys) || hasKey("AIHUBMIX_API_KEY", userKeys);
    case "openai":
      return hasKey("OPENAI_API_KEY", userKeys);
    case "anthropic":
      return hasKey("ANTHROPIC_API_KEY", userKeys);
    case "google":
      return hasKey("GOOGLE_API_KEY", userKeys);
    case "deepseek":
      return hasKey("DEEPSEEK_API_KEY", userKeys);
    case "groq":
      return hasKey("GROQ_API_KEY", userKeys);
    case "mistral":
      return hasKey("MISTRAL_API_KEY", userKeys);
    case "xai":
      return hasKey("XAI_API_KEY", userKeys);
    case "zhipu":
      return hasKey("ZHIPU_API_KEY", userKeys);
    case "moonshot":
      return hasKey("MOONSHOT_API_KEY", userKeys);
    case "qwen":
      return hasKey("QWEN_API_KEY", userKeys);
    case "baidu":
      return hasKey("BAIDU_API_KEY", userKeys) && hasKey("BAIDU_SECRET_KEY", userKeys);
    case "ollama":
      return true;
    default:
      return false;
  }
}

function findHealthyTextFallback(
  models: ModelInfo[],
  userKeys: Record<string, string>,
  availableModelIds: string[] | undefined,
  excludeIds: Set<string>,
): { model: ModelInfo; apiProvider: string } | null {
  const candidates = models
    .filter((model) => (model.category ?? "text") === "text")
    .filter((model) => !excludeIds.has(model.id))
    .filter((model) => !availableModelIds?.length || isRelayModelListed(availableModelIds, model.id) || model.apiProvider !== "aihubmix");
  const sortedCandidates = sortModelsForStrongRouting(candidates, {
    availableModelIds,
    preferRelayListed: Boolean(availableModelIds?.length),
    mode: "generator",
  });

  for (const model of sortedCandidates) {
    const apiProvider = resolveRuntimeApiProvider(model, userKeys, availableModelIds);
    if (!isProviderCallable(apiProvider, userKeys)) continue;
    if (getModelCooldown(model, apiProvider)) continue;
    return { model, apiProvider };
  }

  return null;
}

function sseResponse(
  runner: (send: (data: Record<string, unknown>) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let closed = false;
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        send({
          t: "ping",
          elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
          message: "连接保持中，仍在等待模型返回。 / Connection kept alive; still waiting for model output.",
        });
      }, 12_000);

      try {
        await runner(send);
      } catch (err: any) {
        send({ t: "error", error: toUserFacingErrorMessage(err) });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may already have disconnected; nothing else to do.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function progressEvent(event: PromptGenerationProgress): Record<string, unknown> {
  return { t: "progress", ...event };
}

function cleanDeviceId(req: NextRequest, body: GenerateRequest): string {
  const fromBody = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 160) : "";
  const fromHeader = req.headers.get("x-ai-prompt-device-id")?.trim().slice(0, 160) ?? "";
  const fromCookie = req.cookies.get("ai_prompt_device_id")?.value?.trim().slice(0, 160) ?? "";
  return fromBody || fromHeader || fromCookie || "anonymous-device";
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, {
      keyPrefix: "generate",
      limit: readPositiveIntEnv("GENERATE_RATE_LIMIT_MAX", 20),
      windowMs: readPositiveIntEnv("GENERATE_RATE_LIMIT_WINDOW_MS", 60_000),
    });
    if (!rate.ok) return rateLimitResponse(rate);

    const body: GenerateRequest = await req.json();
    const {
      userIdea,
      targetModelId,
      generatorModelId,
      language = "zh",
    } = body;
    const maxTokens = Math.min(
      Math.max(Number.isFinite(Number(body.maxTokens)) ? Number(body.maxTokens) : 1024, 256),
      readPositiveIntEnv("GENERATE_MAX_TOKENS", 4096),
    );

    let userKeys: Record<string, string> = {};
    if (body.userKeys && typeof body.userKeys === "object") {
      userKeys = body.userKeys;
    }
    const availableModelIds = Array.isArray(body.availableModelIds)
      ? body.availableModelIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined;
    const deviceId = cleanDeviceId(req, body);

    const cleanIdea = userIdea?.trim() ?? "";

    if (!cleanIdea) {
      return NextResponse.json({ error: "请输入内容 / userIdea is required" }, { status: 400 });
    }

    const maxIdeaChars = readPositiveIntEnv("GENERATE_MAX_INPUT_CHARS", 12_000);
    if (cleanIdea.length > maxIdeaChars) {
      return NextResponse.json(
        {
          error: `输入内容太长，请控制在 ${maxIdeaChars} 字以内 / Input is too long, keep it under ${maxIdeaChars} characters`,
        },
        { status: 413 },
      );
    }

    const serverIntentAnalysis = analyzeUserIntent(cleanIdea, language);
    const alreadyClarified = /用户已澄清主要方向|main direction/i.test(cleanIdea);
    if (serverIntentAnalysis.status === "needs_clarification" && !alreadyClarified) {
      return NextResponse.json(
        {
          error: serverIntentAnalysis.clarificationQuestion || "需要确认主方向 / Clarification required",
          clarification: serverIntentAnalysis,
        },
        { status: 409 },
      );
    }

    const baseFeedbackMemoryText = [
      summarizeFeedbackMemory(body.feedbackMemory),
      summarizeIntentAnalysis(body.intentAnalysis || serverIntentAnalysis),
      GITHUB_PROJECT_TRACKER_RULES.length
        ? [
            "Rules distilled from the GitHub project tracker. Apply them as quality guidance:",
            ...GITHUB_PROJECT_TRACKER_RULES.slice(0, 8).map((rule, index) => `${index + 1}. ${rule}`),
          ].join("\n")
        : "",
    ].filter(Boolean).join("\n\n");

    const models         = mergeRelayModelIds(await getModels(), availableModelIds);
    const targetModel    = models.find((m: ModelInfo) => m.id === targetModelId);
    const generatorIds = Array.from(new Set([
      ...(Array.isArray(body.generatorModelIds) ? body.generatorModelIds : []),
      generatorModelId,
    ].filter((id): id is string => typeof id === "string" && id.trim().length > 0))).slice(0, 6);
    const evaluatorIds = Array.from(new Set(
      (Array.isArray(body.evaluatorModelIds) ? body.evaluatorModelIds : [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    )).slice(0, 6);
    const generatorModels = generatorIds
      .map((id) => models.find((m: ModelInfo) => m.id === id))
      .filter((m): m is ModelInfo => Boolean(m));
    const evaluatorModels = evaluatorIds
      .map((id) => models.find((m: ModelInfo) => m.id === id))
      .filter((m): m is ModelInfo => Boolean(m))
      .filter((m) => (m.category ?? "text") === "text");
    const generatorModel = generatorModels[0];

    if (!targetModel || !generatorModel) {
      return NextResponse.json({ error: "未知的模型 ID / Unknown model id" }, { status: 400 });
    }

    const targetCategory = targetModel.category ?? "text";
    const runtimeGeneratorProvider = resolveRuntimeApiProvider(generatorModel, userKeys, availableModelIds);
    const promptLanguagePolicy = resolvePromptLanguagePolicy(targetModel);
    const promptLanguage = promptLanguagePolicy.promptLanguage;
    const languagePolicyMemory = [
      promptLanguageInstruction(promptLanguagePolicy),
      buildTranslationStrategyMemory(),
    ].join("\n\n");
    const feedbackMemoryText = [
      baseFeedbackMemoryText,
      languagePolicyMemory,
    ].filter(Boolean).join("\n\n");

    const systemPrompt = buildSystemPrompt({
      userIdea: cleanIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language: promptLanguage,
      explanationLanguage: "zh",
      includeExplanation: true,
      languagePolicyReason: `${promptLanguagePolicy.reasonZh} / ${promptLanguagePolicy.reasonEn}`,
      feedbackMemory: feedbackMemoryText,
    });

    const userPrompt = buildUserPrompt({
      userIdea: cleanIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language: promptLanguage,
      explanationLanguage: "zh",
      includeExplanation: true,
      languagePolicyReason: `${promptLanguagePolicy.reasonZh} / ${promptLanguagePolicy.reasonEn}`,
      feedbackMemory: feedbackMemoryText,
    });

    const makeProviderOpts = (activeModel: ModelInfo, apiProvider: string) => ({
      model:       activeModel.id,
      apiProvider,
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: 0.5,
      userKeys,
    });

    const makeGeneratorModelCost = (activeModel: ModelInfo) => ({
      input:  activeModel.inputCostPer1M  / 1_000_000,
      output: activeModel.outputCostPer1M / 1_000_000,
    });

    const targetModelKey = `${targetModel.id} ${targetModel.name}`.toLowerCase();
    const isGptImage2Target =
      targetCategory === "image" &&
      (targetModelKey.includes("gpt image 2") || targetModelKey.includes("gpt-image-2"));

    const makeDonePayload = async (optimizedPrompt: string, stats: {
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      tokensDelta: number;
      changePercent: number;
      estimatedCostUsd?: number;
    }, metaExtra?: Record<string, unknown>, activeGeneratorModel: ModelInfo = generatorModel) => {
      const hasReferenceImage =
        Boolean(body.referenceImage?.dataUrl) ||
        /参考图|真实照片|原图|reference image|image-to-image/i.test(cleanIdea);
      let finalPrompt = optimizedPrompt;
      let strictScore = strictPromptScore({
        userIdea: cleanIdea,
        promptText: finalPrompt,
        targetModelId: targetModel.id,
        hasReferenceImage,
      });
      let qualityGateRepair: Record<string, unknown> | undefined;
      const criticalPromptDimensions = ["intent_fidelity", "target_model_fit", "hallucination_resistance", "reference_image_consistency"];
      const shouldRepair =
        !strictScore.pass ||
        strictScore.total < 70 ||
        criticalPromptDimensions.some((dimension) => (strictScore.dimensionScores[dimension] ?? 10) < 7) ||
        (strictScore.dimensionScores.intent_fidelity ?? 10) < 9 ||
        (strictScore.dimensionScores.hallucination_resistance ?? 10) < 9;
      if (shouldRepair) {
        const failedDimensions = Object.entries(strictScore.dimensionScores)
          .filter(([, value]) => value < 8)
          .map(([dimension]) => dimension);
        finalPrompt = repairPromptForStrictQuality({
          userIdea: cleanIdea,
          promptText: finalPrompt,
          targetModel,
          language: promptLanguage,
          hasReferenceImage,
          failedDimensions,
        });
        const repairedScore = strictPromptScore({
          userIdea: cleanIdea,
          promptText: finalPrompt,
          targetModelId: targetModel.id,
          hasReferenceImage,
        });
        qualityGateRepair = {
          applied: true,
          beforeTotal: strictScore.total,
          afterTotal: repairedScore.total,
          failedDimensions,
        };
        strictScore = repairedScore;
      }
      let promptRecord: { id?: string } = {};
      let versionRecord: { id?: string; versionNumber?: number } = {};
      let persistenceWarning: string | undefined;
      let historyExportWarning: string | undefined;
      let historyExport: Awaited<ReturnType<typeof exportDatasetRow>> | undefined;
      try {
        const createdPrompt = await createPrompt({
          deviceId,
          userIdea: cleanIdea,
          targetModelId: targetModel.id,
          targetModelCategory: targetCategory,
          language: promptLanguage,
        });
        promptRecord = createdPrompt;
        versionRecord = await createPromptVersion({
          promptId: createdPrompt.id,
          versionType: "optimized",
          promptText: finalPrompt,
          generatorModelIds: generatorModels.map((model) => model.id),
          evaluatorModelIds: evaluatorModels.map((model) => model.id),
          sourceRepoCommits: [
            ...(((metaExtra?.promptEvaluation as any)?.sourceCommits as string[] | undefined) ?? []),
          ],
          aiScore: strictScore.total,
          decisionStatus: "active",
        });
        historyExport = await exportDatasetRow("prompt-history", {
          id: versionRecord.id,
          timestamp: Date.now(),
          deviceId,
          promptId: createdPrompt.id,
          promptVersionId: versionRecord.id,
          userIdea: cleanIdea,
          optimizedPrompt: finalPrompt,
          selectedPrompt: finalPrompt,
          targetModel: targetModel.id,
          generatorModels: generatorModels.map((model) => model.id),
          evaluatorModels: evaluatorModels.map((model) => model.id),
          language: promptLanguage,
          userInterfaceLanguage: language,
          promptLanguageReason: promptLanguagePolicy.reasonZh,
          aiPromptScore: strictScore.total,
          strictScore,
          sourceCommits: [
            ...(((metaExtra?.promptEvaluation as any)?.sourceCommits as string[] | undefined) ?? []),
          ],
        });
      } catch (error: any) {
        persistenceWarning = "生成已成功，但服务器保存记录失败；结果仍会返回给用户。 Generation succeeded, but server-side history save failed; the prompt is still returned.";
        console.warn("[generate:persistence]", error?.message || error);
      }
      if (!historyExport && !persistenceWarning) {
        historyExportWarning = "生成已成功，但历史同步未返回状态。 Generation succeeded, but history sync did not return a status.";
      }

      return {
        promptId: promptRecord.id,
        versionId: versionRecord.id,
        versionNumber: versionRecord.versionNumber,
        optimizedPrompt: finalPrompt,
        stats,
        strictScore,
        generatorModelCost: makeGeneratorModelCost(activeGeneratorModel),
        meta: {
          generatorModel: activeGeneratorModel.name,
          targetModel:    targetModel.name,
          promptLanguage: promptLanguagePolicy.promptLanguage,
          promptLanguageReason: promptLanguagePolicy.reasonZh,
          strictScore,
          qualityGateRepair,
          persistenceWarning,
          historyExport,
          historyExportWarning,
          ...metaExtra,
        },
      };
    };

    const resolveSimpleGenerator = () => {
      const modelHealth: ModelHealthMeta = {
        skippedCooling: [],
        failed: [],
        successful: [],
      };
      let activeModel = generatorModel;
      let apiProvider = runtimeGeneratorProvider;
      const cooldown = getModelCooldown(activeModel, apiProvider);

      if (cooldown) {
        modelHealth.skippedCooling.push(cooldown);
        const fallback = findHealthyTextFallback(models, userKeys, availableModelIds, new Set(generatorIds));
        if (!fallback) {
          throw new Error(`${activeModel.name} 暂时不稳定，已自动冷却。请稍后重试或换一个生成模型。`);
        }
        activeModel = fallback.model;
        apiProvider = fallback.apiProvider;
      }

      return { activeModel, apiProvider, modelHealth };
    };

    const runReferenceImageGeneration = async (onProgress?: (event: PromptGenerationProgress) => void) => {
      const startedAt = Date.now();
      const referenceImage = body.referenceImage;
      if (!referenceImage?.dataUrl) {
        throw new Error("缺少参考图 / Missing reference image");
      }
      const modelHealth: ModelHealthMeta = {
        skippedCooling: [],
        failed: [],
        successful: [],
      };
      const progress = (event: Omit<PromptGenerationProgress, "elapsedSec">) => {
        onProgress?.({
          elapsedSec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
          ...event,
        });
      };

      progress({
        phase: "分析参考图",
        current: 1,
        total: 5,
        etaSec: 75,
        message: "正在提取参考图构图、色彩、光影和尺寸；内部评分未通过会自动重试。 Analyzing the reference image and optimizing internally.",
      });

      const analyzed = await analyzeReferenceImage(referenceImage);
      const originalVisionSupported =
        modelSupportsVision(generatorModel) &&
        canCallVisionModel(generatorModel, userKeys, availableModelIds);
      const enhancedVisionModel = chooseEnhancedVisionModel(
        models,
        userKeys,
        availableModelIds,
        originalVisionSupported ? generatorModel.id : undefined,
      );

      progress({
        phase: "双通道识图",
        current: 2,
        total: 5,
        etaSec: 65,
        message: originalVisionSupported
          ? "当前生成/评价模型支持识图，先走原 API 视觉通道，再走增强视觉通道。"
          : "当前模型未确认可直接识图，改用增强视觉通道和免费本地图像分析。",
      });

      const visionAnalyses = await Promise.all([
        originalVisionSupported
          ? analyzeImageWithVisionModel({
              model: generatorModel,
              channel: "original_api_vision",
              userIdea: cleanIdea,
              local: analyzed.local,
              base64: analyzed.base64,
              mimeType: analyzed.mimeType,
              userKeys,
              availableModelIds,
            })
          : Promise.resolve(null),
        enhancedVisionModel
          ? analyzeImageWithVisionModel({
              model: enhancedVisionModel,
              channel: "enhanced_vision",
              userIdea: cleanIdea,
              local: analyzed.local,
              base64: analyzed.base64,
              mimeType: analyzed.mimeType,
              userKeys,
              availableModelIds,
            })
          : Promise.resolve(localVisionResult(analyzed.local, "enhanced_vision")),
      ]);
      const analyses = visionAnalyses
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item, index, arr) => arr.findIndex((other) => other.source === item.source && other.modelId === item.modelId) === index);
      if (analyses.length < 2) analyses.push(localVisionResult(analyzed.local));

      const { activeModel, apiProvider, modelHealth: simpleHealth } = resolveSimpleGenerator();
      modelHealth.skippedCooling.push(...(simpleHealth.skippedCooling ?? []));
      let generatorPlan = { model: activeModel, apiProvider };
      const calls: Array<{ model: ModelInfo; result: GenerateResult }> = [];
      const previousFailures: string[] = [];
      let bestCandidate: ReferencePromptCandidate | null = null;
      let bestScore: ReturnType<typeof scoreReferencePromptCandidate> | null = null;
      let lastCandidates: ReferencePromptCandidate[] = [];
      let lastScores: ReturnType<typeof scoreReferencePromptCandidate>[] = [];
      const maxAttempts = 3;

      const ensureReferencePromptGuardrails = (text: string): string => {
        const prompt = text.trim();
        const missingNegative = !/(负向|negative|avoid|不要|避免|bad hands|坏手|畸形)/i.test(prompt);
        const missingParams = !/(推荐参数|recommended parameters|aspect|比例|cfg|steps|seed|reference weight|参考图权重)/i.test(prompt);
        const missingQuality = !/(不得虚构|do not invent|unknown|uncertain|幻觉|检查|verify|score|reference similarity|参考图一致)/i.test(prompt);
        if (!missingNegative && !missingParams && !missingQuality) return prompt;
        return [
          prompt,
          missingNegative
            ? "负向提示词补强 / Negative Reinforcement: avoid bad hands, distorted faces, unreadable text, invented unseen text, wrong object proportions, low-resolution artifacts, identity drift, composition drift, over-smoothed texture, and generic stock-photo look."
            : "",
          missingParams
            ? `推荐参数补强 / Parameter Reinforcement: aspect ratio ${analyzed.local.aspectRatioLabel}; reference image weight high 0.75-0.9; style strength 0.55-0.75; CFG 6-8; steps 28-40; keep seed fixed for comparison before small variations.`
            : "",
          missingQuality
            ? "质量检查 / Quality Gate: do not invent details not visible in the reference image; mark uncertain text or identity details as uncertain; verify user intent alignment, reference image consistency, proportion accuracy, text readability, and hallucination resistance before final use."
            : "",
        ].filter(Boolean).join("\n\n");
      };

      const generateCandidate = async (analysis: (typeof analyses)[number], attempt: number): Promise<ReferencePromptCandidate> => {
        const started = Date.now();
        try {
          const result = await withTimeout(
            callProvider({
              model: generatorPlan.model.id,
              apiProvider: generatorPlan.apiProvider,
              systemPrompt: "You generate production-ready image-to-image prompts. Output only the final prompt with positive prompt, negative prompt, and recommended parameters.",
              userPrompt: buildReferenceCandidatePrompt({
                userIdea: cleanIdea,
                targetModel,
                language: promptLanguage,
                analysis,
                local: analyzed.local,
                attempt,
                channelLabel: analysis.source === "original_api_vision" ? "Original API vision" : analysis.source === "enhanced_vision" ? "Enhanced vision" : "Free local analysis",
                previousFailures,
              }),
              maxTokens: Math.min(maxTokens, 2600),
              temperature: attempt === 1 ? 0.35 : 0.5,
              userKeys,
            }),
            getModelTimeoutMs(generatorPlan.model, "generator", { startedAt, reserveMs: 80_000 }),
            `${generatorPlan.model.name} reference image prompt candidate`,
          );
          calls.push({ model: generatorPlan.model, result });
          modelHealth.successful.push(recordModelSuccess(
            generatorPlan.model,
            generatorPlan.apiProvider,
            result.latencyMs || Date.now() - started,
          ));
          return {
            id: buildReferenceCandidateId(analysis.source, attempt),
            source: analysis.source,
            label: `${analysis.modelName} → ${generatorPlan.model.name}`,
            prompt: ensureReferencePromptGuardrails(result.text),
          };
        } catch (err) {
          modelHealth.failed.push(recordModelFailure(generatorPlan.model, generatorPlan.apiProvider, err));
          const fallback = findHealthyTextFallback(models, userKeys, availableModelIds, new Set([generatorPlan.model.id, ...generatorIds]));
          if (!fallback || fallback.model.id === generatorPlan.model.id) throw err;
          generatorPlan = fallback;
          const fallbackStarted = Date.now();
          const result = await withTimeout(
            callProvider({
              model: generatorPlan.model.id,
              apiProvider: generatorPlan.apiProvider,
              systemPrompt: "You generate production-ready image-to-image prompts. Output only the final prompt with positive prompt, negative prompt, and recommended parameters.",
              userPrompt: buildReferenceCandidatePrompt({
                userIdea: cleanIdea,
                targetModel,
                language: promptLanguage,
                analysis,
                local: analyzed.local,
                attempt,
                channelLabel: `${analysis.modelName} fallback`,
                previousFailures,
              }),
              maxTokens: Math.min(maxTokens, 2600),
              temperature: 0.45,
              userKeys,
            }),
            getModelTimeoutMs(generatorPlan.model, "generator", { startedAt, reserveMs: 80_000 }),
            `${generatorPlan.model.name} reference image prompt fallback candidate`,
          );
          calls.push({ model: generatorPlan.model, result });
          modelHealth.successful.push(recordModelSuccess(
            generatorPlan.model,
            generatorPlan.apiProvider,
            result.latencyMs || Date.now() - fallbackStarted,
          ));
          return {
            id: buildReferenceCandidateId(analysis.source, attempt),
            source: analysis.source,
            label: `${analysis.modelName} → ${generatorPlan.model.name}`,
            prompt: ensureReferencePromptGuardrails(result.text),
          };
        }
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        progress({
          phase: attempt === 1 ? "生成图生图候选" : "内部质量未达标，自动重生成",
          current: 2 + attempt,
          total: 5,
          etaSec: Math.max(12, 55 - attempt * 10),
          message: "系统会比较原 API 识图候选和增强识图候选，只把最佳版本给用户。 Comparing candidates internally and only returning the best result.",
        });
        const candidateResults = await Promise.allSettled(
          analyses.slice(0, 2).map((analysis) => generateCandidate(analysis, attempt)),
        );
        const candidates = candidateResults
          .map((result) => (result.status === "fulfilled" ? result.value : null))
          .filter((item): item is ReferencePromptCandidate => Boolean(item?.prompt?.trim()));
        if (candidates.length < 2) {
          candidates.push({
            id: buildReferenceCandidateId("fallback", attempt),
            source: "fallback",
            label: "Curated fallback",
            prompt: buildQualityFallbackPrompt({
              userIdea: cleanIdea,
              targetModel,
              language: promptLanguage,
              local: analyzed.local,
              analyses,
            }),
          });
        }
        lastCandidates = candidates;
        lastScores = candidates.map((candidate) => scoreReferencePromptCandidate(candidate, cleanIdea, analyzed.local));
        const rankedScores = [...lastScores].sort((a, b) => b.total - a.total);
        const topScore = rankedScores[0];
        const topCandidate = candidates.find((candidate) => candidate.id === topScore?.candidateId) ?? candidates[0];
        if (!bestScore || (topScore && topScore.total > bestScore.total)) {
          bestScore = topScore;
          bestCandidate = topCandidate;
        }
        const visualOk = (topScore?.dimensions.visual_similarity ?? 0) >= 8;
        const intentOk = (topScore?.dimensions.user_intent_alignment ?? 0) >= 8;
        const executableOk = (topScore?.dimensions.executable_clarity ?? 0) >= 8;
        if (topScore && topScore.total >= 85 && visualOk && intentOk && executableOk) {
          bestCandidate = topCandidate;
          bestScore = topScore;
          break;
        }
        previousFailures.splice(0, previousFailures.length, ...rankedScores.slice(0, 4).map((score) => `${score.candidateId}: ${score.reason}`));
      }

      if (!bestCandidate || !bestScore || bestScore.total < 85) {
        const fallbackPrompt = buildQualityFallbackPrompt({
          userIdea: cleanIdea,
          targetModel,
          language: promptLanguage,
          local: analyzed.local,
          analyses,
        });
        bestCandidate = {
          id: "quality-fallback-final",
          source: "fallback",
          label: "Quality-gated fallback",
          prompt: fallbackPrompt,
        };
        bestScore = scoreReferencePromptCandidate(bestCandidate, cleanIdea, analyzed.local);
        lastCandidates = [bestCandidate, ...lastCandidates.filter((candidate) => candidate.id !== bestCandidate?.id)];
        lastScores = [bestScore, ...lastScores.filter((score) => score.candidateId !== bestScore?.candidateId)];
      }

      progress({
        phase: "输出最佳图生图提示词",
        current: 5,
        total: 5,
        etaSec: 2,
        message: "已完成内部识图、评分、择优和必要重试。 Finalizing the best image-to-image prompt.",
      });

      const scoreById = new Map(lastScores.map((score) => [score.candidateId, score]));
      const rankedCandidates = [...lastCandidates]
        .map((candidate) => ({ candidate, score: scoreById.get(candidate.id) }))
        .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
      const totalInputTokens = calls.reduce((sum, call) => sum + call.result.inputTokens, 0);
      const totalOutputTokens = calls.reduce((sum, call) => sum + call.result.outputTokens, 0);
      const totalCostUsd = calls.reduce((sum, call) => sum + modelCallCost(call.model, call.result), 0);
      const referenceMeta = {
        referenceImage: {
          enabled: true,
          width: analyzed.local.width,
          height: analyzed.local.height,
          aspectRatio: analyzed.local.aspectRatioLabel,
          palette: analyzed.local.palette,
          averageColor: analyzed.local.averageColor,
          brightness: analyzed.local.brightness,
          contrast: analyzed.local.contrast,
          saturation: analyzed.local.saturation,
          analysisChannels: analyses.map((analysis) => ({
            source: analysis.source,
            modelId: analysis.modelId,
            modelName: analysis.modelName,
            available: analysis.available,
            error: analysis.error,
          })),
          selectedCandidateId: bestCandidate.id,
          selectedSource: bestCandidate.source,
          internalBestScore: bestScore.total,
          qualityGate: bestScore.total >= 85 ? "passed" : "fallback_passed",
        },
        promptEvaluation: {
          rubric: [
            { id: "visual_similarity", label: "Visual similarity", labelZh: "参考图相似度", weight: 18, guide: "Matches uploaded image composition, palette, lighting, and mood.", guideZh: "匹配上传图构图、色彩、光影和氛围。" },
            { id: "user_intent_alignment", label: "User intent alignment", labelZh: "用户意图对齐", weight: 18, guide: "Preserves the user's typed goal.", guideZh: "保留用户文字目标。" },
            { id: "model_fit", label: "Image model fit", labelZh: "生图模型适配", weight: 12, guide: "Includes executable prompt sections and parameters.", guideZh: "包含可执行提示词结构和参数。" },
            { id: "artifact_control", label: "Artifact control", labelZh: "瑕疵控制", weight: 12, guide: "Prevents bad hands, faces, text, and proportions.", guideZh: "防止坏手、歪脸、乱码和比例错误。" },
          ],
          candidates: rankedCandidates.map((item, index) => ({
            id: item.candidate.id,
            generatorModelId: generatorPlan.model.id,
            generatorModelName: item.candidate.label,
            averageScore: item.score?.total ?? 0,
            rank: index + 1,
            scores: item.score
              ? [{ judgeModel: "Reference Quality Gate", score: item.score.total, reason: item.score.reason }]
              : [],
          })),
          judgeModels: ["Reference Quality Gate"],
          selectedCandidateId: bestCandidate.id,
          summary: `Reference image workflow selected ${bestCandidate.label}; internal score ${bestScore.total}/100. Low-quality candidates were regenerated or hidden from the user.`,
        },
        modelHealth,
        selectedStrategy: `参考图双识别择优 / ${bestCandidate.label}`,
        reviewSummary: "已基于上传参考图完成双通道识图、候选生成、AI 内部评分、择优和必要重试；普通模式只展示最佳提示词。",
      };

      return await makeDonePayload(
        bestCandidate.prompt,
        {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          latencyMs: Date.now() - startedAt,
          tokensDelta: comparePrompts(userIdea, bestCandidate.prompt).delta,
          changePercent: comparePrompts(userIdea, bestCandidate.prompt).ratio,
          estimatedCostUsd: totalCostUsd,
        },
        referenceMeta,
        generatorPlan.model,
      );
    };

    const shouldRunPromptTournament =
      !isGptImage2Target &&
      (generatorModels.length > 1 || evaluatorModels.length > 0);

    if (body.referenceImage?.dataUrl) {
      if (body.stream) {
        return sseResponse(async (send) => {
          const payload = await runReferenceImageGeneration((event) => send(progressEvent(event)));
          send({ t: "chunk", c: payload.optimizedPrompt });
          send({ t: "done", data: payload });
        });
      }

      return NextResponse.json(await runReferenceImageGeneration());
    }

    if (shouldRunPromptTournament) {
      const runTournament = async (onProgress?: (event: PromptGenerationProgress) => void) => {
        const tournament = await runPromptTournament({
          userIdea: cleanIdea,
          language: promptLanguage,
          targetModel,
          generatorModels,
          evaluatorModels,
          models,
          userKeys,
          availableModelIds,
          systemPrompt,
          userPrompt,
          maxTokens,
          onProgress,
        });
        const comparison = comparePrompts(userIdea, tournament.text);
        return await makeDonePayload(
          tournament.text,
          {
            inputTokens: tournament.inputTokens,
            outputTokens: tournament.outputTokens,
            latencyMs: tournament.latencyMs,
            tokensDelta: comparison.delta,
            changePercent: comparison.ratio,
            estimatedCostUsd: tournament.totalCostUsd,
          },
          {
            generatorModel: generatorModels.map((model) => model.name).join(" + "),
            ...tournament.meta,
          },
        );
      };

      if (body.stream) {
        return sseResponse(async (send) => {
          send(progressEvent({
            phase: "准备多模型生成",
            current: 0,
            total: generatorModels.length + Math.max(evaluatorModels.length, 1),
            etaSec: 75,
            elapsedSec: 0,
          }));
          const payload = await runTournament((event) => send(progressEvent(event)));
          send({ t: "chunk", c: payload.optimizedPrompt });
          send({ t: "done", data: payload });
        });
      }

      return NextResponse.json(await runTournament());
    }

    if (isGptImage2Target) {
      const runEnsemble = async (onProgress?: (event: PromptGenerationProgress) => void) => {
        const ensemble = await runGptImage2Ensemble({
          userIdea: cleanIdea,
          language: promptLanguage,
          targetModel,
          generatorModel,
          generatorModels,
          models,
          userKeys,
          availableModelIds,
          evaluatorModelIds: evaluatorIds,
          feedbackMemory: feedbackMemoryText,
          maxTokens,
          onProgress,
        });
        const comparison = comparePrompts(userIdea, ensemble.text);
        return await makeDonePayload(
          ensemble.text,
          {
            inputTokens: ensemble.inputTokens,
            outputTokens: ensemble.outputTokens,
            latencyMs: ensemble.latencyMs,
            tokensDelta: comparison.delta,
            changePercent: comparison.ratio,
            estimatedCostUsd: ensemble.totalCostUsd,
          },
          {
            generatorModel: generatorModels.map((model) => model.name).join(" + "),
            ...ensemble.meta,
          },
        );
      };

      if (body.stream) {
        return sseResponse(async (send) => {
          send(progressEvent({
            phase: "准备 GPT Image 2 优化",
            current: 0,
            total: generatorModels.length + Math.max(evaluatorModels.length, 1),
            etaSec: Math.min(260, 95 + generatorModels.length * 25 + Math.max(evaluatorModels.length, 1) * 18),
            elapsedSec: 0,
            message: "正在检查中转站可用模型；可输出的慢模型会等待，持续失败的模型才会跳过。 Checking relay availability; slow responsive models will be waited for.",
          }));
          const payload = await runEnsemble((event) => send(progressEvent(event)));
          send({ t: "chunk", c: payload.optimizedPrompt });
          send({ t: "done", data: payload });
        });
      }

      return NextResponse.json(await runEnsemble());
    }

    // ── Streaming mode ──────────────────────────────────────────
    if (body.stream) {
      return sseResponse(async (send) => {
        const { activeModel, apiProvider, modelHealth } = resolveSimpleGenerator();
        const providerOpts = makeProviderOpts(activeModel, apiProvider);
        const callStartedAt = Date.now();
        let sentAnyChunk = false;

        send(progressEvent({
          phase: "连接生成模型",
          current: 0,
          total: 2,
          etaSec: 35,
          elapsedSec: 0,
          message: modelHealth.skippedCooling.length
            ? "已自动换用健康模型继续生成。"
            : "正在连接模型，若接口不稳定会自动冷却。",
        }));

        try {
          const result = await withTimeout(
            callProviderStream(providerOpts, (chunk) => {
              sentAnyChunk = true;
              send({ t: "chunk", c: chunk });
            }),
            getModelTimeoutMs(activeModel, "simple"),
            `${activeModel.name} streaming generation`,
          );
          modelHealth.successful.push(recordModelSuccess(
            activeModel,
            apiProvider,
            result.latencyMs || Date.now() - callStartedAt,
          ));

          send(progressEvent({
            phase: "整理最终结果",
            current: 2,
            total: 2,
            etaSec: 3,
            elapsedSec: Math.floor((Date.now() - callStartedAt) / 1000),
          }));

          const comparison = comparePrompts(userIdea, result.text);

          send({
            t: "done",
            data: await makeDonePayload(
              result.text,
              {
                inputTokens:   result.inputTokens,
                outputTokens:  result.outputTokens,
                latencyMs:     result.latencyMs,
                tokensDelta:   comparison.delta,
                changePercent: comparison.ratio,
              },
              { modelHealth },
              activeModel,
            ),
          });
        } catch (err) {
          modelHealth.failed.push(recordModelFailure(activeModel, apiProvider, err));
          const fallback = !sentAnyChunk
            ? findHealthyTextFallback(models, userKeys, availableModelIds, new Set([...generatorIds, activeModel.id]))
            : null;
          if (fallback) {
            send(progressEvent({
              phase: "主模型不稳定，切换备用模型",
              current: 1,
              total: 2,
              etaSec: 35,
              elapsedSec: Math.floor((Date.now() - callStartedAt) / 1000),
              message: `${activeModel.name} 本次失败，正在改用 ${fallback.model.name}。`,
            }));
            const fallbackStartedAt = Date.now();
            const fallbackResult = await withTimeout(
              callProviderStream(makeProviderOpts(fallback.model, fallback.apiProvider), (chunk) => {
                send({ t: "chunk", c: chunk });
              }),
              getModelTimeoutMs(fallback.model, "simple"),
              `${fallback.model.name} fallback streaming generation`,
            );
            modelHealth.successful.push(recordModelSuccess(
              fallback.model,
              fallback.apiProvider,
              fallbackResult.latencyMs || Date.now() - fallbackStartedAt,
            ));
            const comparison = comparePrompts(userIdea, fallbackResult.text);
            send({
              t: "done",
              data: await makeDonePayload(
                fallbackResult.text,
                {
                  inputTokens:   fallbackResult.inputTokens,
                  outputTokens:  fallbackResult.outputTokens,
                  latencyMs:     fallbackResult.latencyMs,
                  tokensDelta:   comparison.delta,
                  changePercent: comparison.ratio,
                },
                { modelHealth },
                fallback.model,
              ),
            });
            return;
          }
          throw err;
        }
      });
    }

    // ── Non-streaming fallback ──────────────────────────────────
    const { activeModel, apiProvider, modelHealth } = resolveSimpleGenerator();
    const providerOpts = makeProviderOpts(activeModel, apiProvider);
    const callStartedAt = Date.now();
    let result: GenerateResult;
    try {
      result = await withTimeout(
        callProvider(providerOpts),
        getModelTimeoutMs(activeModel, "simple"),
        `${activeModel.name} generation`,
      );
      modelHealth.successful.push(recordModelSuccess(
        activeModel,
        apiProvider,
        result.latencyMs || Date.now() - callStartedAt,
      ));
    } catch (err) {
      modelHealth.failed.push(recordModelFailure(activeModel, apiProvider, err));
      const fallback = findHealthyTextFallback(models, userKeys, availableModelIds, new Set([...generatorIds, activeModel.id]));
      if (!fallback) throw err;
      const fallbackStartedAt = Date.now();
      result = await withTimeout(
        callProvider(makeProviderOpts(fallback.model, fallback.apiProvider)),
        getModelTimeoutMs(fallback.model, "simple"),
        `${fallback.model.name} fallback generation`,
      );
      modelHealth.successful.push(recordModelSuccess(
        fallback.model,
        fallback.apiProvider,
        result.latencyMs || Date.now() - fallbackStartedAt,
      ));
      return NextResponse.json(await makeDonePayload(
        result.text,
        {
          inputTokens:   result.inputTokens,
          outputTokens:  result.outputTokens,
          latencyMs:     result.latencyMs,
          tokensDelta:   comparePrompts(userIdea, result.text).delta,
          changePercent: comparePrompts(userIdea, result.text).ratio,
        },
        { modelHealth },
        fallback.model,
      ));
    }
    const comparison = comparePrompts(userIdea, result.text);

    return NextResponse.json(await makeDonePayload(
      result.text,
      {
        inputTokens:   result.inputTokens,
        outputTokens:  result.outputTokens,
        latencyMs:     result.latencyMs,
        tokensDelta:   comparison.delta,
        changePercent: comparison.ratio,
      },
      { modelHealth },
      activeModel,
    ));
  } catch (err: any) {
    console.error("[generate]", err);
    return NextResponse.json(
      { error: toUserFacingErrorMessage(err) },
      { status: 500 }
    );
  }
}

function modelCallCost(model: ModelInfo, result: GenerateResult): number {
  return (
    result.inputTokens * (model.inputCostPer1M / 1_000_000) +
    result.outputTokens * (model.outputCostPer1M / 1_000_000)
  );
}

function buildReferenceCandidateId(source: ReferencePromptCandidate["source"], attempt: number): string {
  return `${source}-attempt-${attempt}`;
}
