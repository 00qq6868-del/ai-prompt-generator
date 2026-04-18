// src/app/api/generate/route.ts
// POST /api/generate — generates an optimized prompt

import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { getModels } from "@/lib/model-cache";

export interface GenerateRequest {
  userIdea: string;
  targetModelId: string;
  generatorModelId: string;
  language?: "zh" | "en";
  maxTokens?: number;
  userKeys?: Record<string, string>;
}

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

    // Parse user-supplied API keys from the request body
    let userKeys: Record<string, string> = {};
    if (body.userKeys && typeof body.userKeys === "object") {
      userKeys = body.userKeys;
    }

    if (!userIdea?.trim()) {
      return NextResponse.json({ error: "userIdea is required" }, { status: 400 });
    }

    const models         = await getModels();
    const targetModel    = models.find((m) => m.id === targetModelId);
    const generatorModel = models.find((m) => m.id === generatorModelId);

    if (!targetModel || !generatorModel) {
      return NextResponse.json({ error: "Unknown model id" }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt({
      userIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      language,
    });

    const userPrompt = buildUserPrompt({
      userIdea,
      targetModel:    targetModel.name,
      targetProvider: targetModel.provider,
      language,
    });

    const result = await callProvider({
      model:       generatorModel.id,
      apiProvider: generatorModel.apiProvider,
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: 0.5,
      userKeys,
    });

    // [S2 FIX] signed delta — positive = shorter, negative = longer (fine for accurate/aligned)
    const comparison = comparePrompts(userIdea, result.text);

    // [S1 FIX] real per-model cost rates, not hardcoded GPT-4o prices
    const generatorModelCost = {
      input:  generatorModel.inputCostPer1M  / 1_000_000,
      output: generatorModel.outputCostPer1M / 1_000_000,
    };

    return NextResponse.json({
      optimizedPrompt: result.text,
      stats: {
        inputTokens:   result.inputTokens,
        outputTokens:  result.outputTokens,
        latencyMs:     result.latencyMs,
        tokensDelta:   comparison.delta,   // signed: positive=saved, negative=grew
        changePercent: comparison.ratio,   // signed %
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
      { error: err?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
