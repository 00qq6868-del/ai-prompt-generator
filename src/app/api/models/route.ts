// src/app/api/models/route.ts
// GET /api/models — returns current model list

import { NextRequest, NextResponse } from "next/server";
import { ModelInfo, getTopModels, OptimizationMode } from "@/lib/models-registry";
import { getModels, invalidateCache, cacheAge } from "@/lib/model-cache"; // [C3 FIX]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode         = searchParams.get("mode") as OptimizationMode | null;
  const provider     = searchParams.get("provider");
  const forceRefresh = searchParams.get("refresh") === "1";

  if (forceRefresh) invalidateCache();

  let models = await getModels();

  if (provider) {
    models = models.filter(
      (m) =>
        m.provider.toLowerCase()    === provider.toLowerCase() ||
        m.apiProvider.toLowerCase() === provider.toLowerCase()
    );
  }

  const grouped: Record<string, ModelInfo[]> = {};
  for (const m of models) {
    (grouped[m.provider] ??= []).push(m);
  }

  const recommended = mode ? getTopModels(models, mode, 5) : null;
  const age = cacheAge();

  return NextResponse.json({
    total: models.length,
    updatedAt: new Date(Date.now() - age).toISOString(),
    source: age > 0 ? "remote" : "bundled",
    models,
    grouped,
    ...(recommended ? { recommended } : {}),
  });
}
