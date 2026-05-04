// src/app/api/generate/route.ts
// POST /api/generate — generates an optimized prompt (streaming + non-streaming)

import { NextRequest, NextResponse } from "next/server";
import { callProvider, callProviderStream, type GenerateResult } from "@/lib/providers";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { getModels } from "@/lib/model-cache";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { checkRateLimit, rateLimitResponse, readPositiveIntEnv } from "@/lib/rate-limit";
import { resolveRuntimeApiProvider, runGptImage2Ensemble } from "@/lib/gpt-image-2-ensemble";
import { PromptGenerationProgress, runPromptTournament } from "@/lib/prompt-evaluator";
import {
  ModelHealthMeta,
  getModelCooldown,
  getTimeoutMs,
  recordModelFailure,
  recordModelSuccess,
  withTimeout,
} from "@/lib/model-health";

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
  stream?: boolean;
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
  const availableSet = availableModelIds?.length ? new Set(availableModelIds) : null;
  const candidates = models
    .filter((model) => (model.category ?? "text") === "text")
    .filter((model) => !excludeIds.has(model.id))
    .filter((model) => !availableSet || availableSet.has(model.id) || model.apiProvider !== "aihubmix")
    .sort((a, b) => scoreModel(b, "fast") + scoreModel(b, "accurate") - (scoreModel(a, "fast") + scoreModel(a, "accurate")));

  for (const model of candidates) {
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
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await runner(send);
      } catch (err: any) {
        send({ t: "error", error: err?.message ?? "服务器内部错误 / Internal error" });
      } finally {
        controller.close();
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

    const models         = await getModels();
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

    const systemPrompt = buildSystemPrompt({
      userIdea: cleanIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
    });

    const userPrompt = buildUserPrompt({
      userIdea: cleanIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
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

    const makeDonePayload = (optimizedPrompt: string, stats: {
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      tokensDelta: number;
      changePercent: number;
      estimatedCostUsd?: number;
    }, metaExtra?: Record<string, unknown>, activeGeneratorModel: ModelInfo = generatorModel) => ({
      optimizedPrompt,
      stats,
      generatorModelCost: makeGeneratorModelCost(activeGeneratorModel),
      meta: {
        generatorModel: activeGeneratorModel.name,
        targetModel:    targetModel.name,
        ...metaExtra,
      },
    });

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

    const shouldRunPromptTournament =
      !isGptImage2Target &&
      (generatorModels.length > 1 || evaluatorModels.length > 0);

    if (shouldRunPromptTournament) {
      const runTournament = async (onProgress?: (event: PromptGenerationProgress) => void) => {
        const tournament = await runPromptTournament({
          userIdea: cleanIdea,
          language,
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
        return makeDonePayload(
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
          language,
          targetModel,
          generatorModel,
          models,
          userKeys,
          availableModelIds,
          evaluatorModelIds: evaluatorIds,
          maxTokens,
          onProgress,
        });
        const comparison = comparePrompts(userIdea, ensemble.text);
        return makeDonePayload(
          ensemble.text,
          {
            inputTokens: ensemble.inputTokens,
            outputTokens: ensemble.outputTokens,
            latencyMs: ensemble.latencyMs,
            tokensDelta: comparison.delta,
            changePercent: comparison.ratio,
            estimatedCostUsd: ensemble.totalCostUsd,
          },
          ensemble.meta,
        );
      };

      if (body.stream) {
        return sseResponse(async (send) => {
          send(progressEvent({
            phase: "准备 GPT Image 2 优化",
            current: 0,
            total: 3,
            etaSec: 90,
            elapsedSec: 0,
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
            getTimeoutMs("simple"),
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
            data: makeDonePayload(
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
              getTimeoutMs("simple"),
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
              data: makeDonePayload(
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
        getTimeoutMs("simple"),
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
        getTimeoutMs("simple"),
        `${fallback.model.name} fallback generation`,
      );
      modelHealth.successful.push(recordModelSuccess(
        fallback.model,
        fallback.apiProvider,
        result.latencyMs || Date.now() - fallbackStartedAt,
      ));
      return NextResponse.json(makeDonePayload(
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

    return NextResponse.json(makeDonePayload(
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
      { error: err?.message ?? "服务器内部错误 / Internal error" },
      { status: 500 }
    );
  }
}
