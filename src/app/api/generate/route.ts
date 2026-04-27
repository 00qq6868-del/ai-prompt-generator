// src/app/api/generate/route.ts
// POST /api/generate — generates an optimized prompt (streaming + non-streaming)

import { NextRequest, NextResponse } from "next/server";
import { callProvider, callProviderStream } from "@/lib/providers";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { getModels } from "@/lib/model-cache";

export interface GenerateRequest {
  userIdea: string;
  targetModelId: string;
  generatorModelId: string;
  language?: "zh" | "en";
  maxTokens?: number;
  userKeys?: Record<string, string>;
  stream?: boolean;
}

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json();
    const {
      userIdea,
      targetModelId,
      generatorModelId,
      language = "zh",
      maxTokens = 1024,
    } = body;

    let userKeys: Record<string, string> = {};
    if (body.userKeys && typeof body.userKeys === "object") {
      userKeys = body.userKeys;
    }

    if (!userIdea?.trim()) {
      return NextResponse.json({ error: "请输入内容 / userIdea is required" }, { status: 400 });
    }

    const models         = await getModels();
    const targetModel    = models.find((m) => m.id === targetModelId);
    const generatorModel = models.find((m) => m.id === generatorModelId);

    if (!targetModel || !generatorModel) {
      return NextResponse.json({ error: "未知的模型 ID / Unknown model id" }, { status: 400 });
    }

    const targetCategory = (targetModel as any).category ?? "text";

    const systemPrompt = buildSystemPrompt({
      userIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
    });

    const userPrompt = buildUserPrompt({
      userIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
    });

    const providerOpts = {
      model:       generatorModel.id,
      apiProvider: generatorModel.apiProvider,
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
              data: {
                optimizedPrompt: result.text,
                stats: {
                  inputTokens:   result.inputTokens,
                  outputTokens:  result.outputTokens,
                  latencyMs:     result.latencyMs,
                  tokensDelta:   comparison.delta,
                  changePercent: comparison.ratio,
                },
                generatorModelCost,
                meta: {
                  generatorModel: generatorModel.name,
                  targetModel:    targetModel.name,
                },
              },
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

    return NextResponse.json({
      optimizedPrompt: result.text,
      stats: {
        inputTokens:   result.inputTokens,
        outputTokens:  result.outputTokens,
        latencyMs:     result.latencyMs,
        tokensDelta:   comparison.delta,
        changePercent: comparison.ratio,
      },
      generatorModelCost,
      meta: {
        generatorModel: generatorModel.name,
        targetModel:    targetModel.name,
      },
    });
  } catch (err: any) {
    console.error("[generate]", err);
    return NextResponse.json(
      { error: err?.message ?? "服务器内部错误 / Internal error" },
      { status: 500 }
    );
  }
}
