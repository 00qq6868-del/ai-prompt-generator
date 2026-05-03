// src/app/api/generate/route.ts
// POST /api/generate — generates an optimized prompt (streaming + non-streaming)

import { NextRequest, NextResponse } from "next/server";
import { callProvider, callProviderStream } from "@/lib/providers";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { getModels } from "@/lib/model-cache";
import { ModelInfo } from "@/lib/models-registry";
import { checkRateLimit, rateLimitResponse, readPositiveIntEnv } from "@/lib/rate-limit";
import { resolveRuntimeApiProvider, runGptImage2Ensemble } from "@/lib/gpt-image-2-ensemble";
import { runPromptTournament } from "@/lib/prompt-evaluator";

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

    const providerOpts = {
      model:       generatorModel.id,
      apiProvider: runtimeGeneratorProvider,
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: 0.5,
      userKeys,
    };

    const generatorModelCost = {
      input:  generatorModel.inputCostPer1M  / 1_000_000,
      output: generatorModel.outputCostPer1M / 1_000_000,
    };

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
    }, metaExtra?: Record<string, unknown>) => ({
      optimizedPrompt,
      stats,
      generatorModelCost,
      meta: {
        generatorModel: generatorModel.name,
        targetModel:    targetModel.name,
        ...metaExtra,
      },
    });

    const shouldRunPromptTournament =
      !isGptImage2Target &&
      (generatorModels.length > 1 || evaluatorModels.length > 0);

    if (shouldRunPromptTournament) {
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
      });
      const comparison = comparePrompts(userIdea, tournament.text);
      const payload = makeDonePayload(
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

      if (body.stream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "chunk", c: tournament.text })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "done", data: payload })}\n\n`));
            controller.close();
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

      return NextResponse.json(payload);
    }

    if (isGptImage2Target) {
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
      });
      const comparison = comparePrompts(userIdea, ensemble.text);
      const payload = makeDonePayload(
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

      if (body.stream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "chunk", c: ensemble.text })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "done", data: payload })}\n\n`));
            controller.close();
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

      return NextResponse.json(payload);
    }

    // ── Streaming mode ──────────────────────────────────────────
    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            const result = await callProviderStream(providerOpts, (chunk) => {
              send({ t: "chunk", c: chunk });
            });

            const comparison = comparePrompts(userIdea, result.text);

            send({
              t: "done",
              data: makeDonePayload(result.text, {
                inputTokens:   result.inputTokens,
                outputTokens:  result.outputTokens,
                latencyMs:     result.latencyMs,
                tokensDelta:   comparison.delta,
                changePercent: comparison.ratio,
              }),
            });
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

    // ── Non-streaming fallback ──────────────────────────────────
    const result = await callProvider(providerOpts);
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
    ));
  } catch (err: any) {
    console.error("[generate]", err);
    return NextResponse.json(
      { error: err?.message ?? "服务器内部错误 / Internal error" },
      { status: 500 }
    );
  }
}
