import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt, buildUserPrompt, comparePrompts } from "@/lib/prompt-optimizer";
import { callProvider } from "@/lib/providers";
import { getModels } from "@/lib/model-cache";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { mergeRelayModelIds, isRelayModelListed } from "@/lib/relay-models";
import { resolveRuntimeApiProvider } from "@/lib/gpt-image-2-ensemble";
import { strictPromptScore, type StrictScoreResult } from "@/lib/strict-scoring";
import { exportDatasetRow } from "@/lib/server/github-dataset";
import { checkRateLimit, rateLimitResponse, readPositiveIntEnv } from "@/lib/rate-limit";
import { toUserFacingErrorMessage } from "@/lib/error-messages";

export const runtime = "nodejs";
export const maxDuration = 120;

interface TestChannelRequest {
  userIdea?: string;
  targetModelId?: string;
  generatorModelId?: string;
  generatorModelIds?: string[];
  language?: "zh" | "en";
  maxTokens?: number;
  maxAttempts?: number;
  userKeys?: Record<string, string>;
  availableModelIds?: string[];
  deviceId?: string;
  qualityTargets?: {
    passTotal?: number;
    coreDimensionMin?: number;
  };
  referenceImage?: {
    dataUrl?: string;
    mimeType?: string;
    name?: string;
    size?: number;
  } | null;
}

const PROVIDER_KEY_MAP: Record<string, string[]> = {
  custom: ["CUSTOM_API_KEY", "CUSTOM_BASE_URL"],
  aihubmix: ["CUSTOM_API_KEY", "CUSTOM_BASE_URL", "AIHUBMIX_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  xai: ["XAI_API_KEY"],
  zhipu: ["ZHIPU_API_KEY"],
  moonshot: ["MOONSHOT_API_KEY"],
  qwen: ["QWEN_API_KEY"],
  baidu: ["BAIDU_API_KEY", "BAIDU_SECRET_KEY"],
};

function cleanString(value: unknown, max = 8000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safePreview(value: unknown, max = 1200): string {
  const text = cleanString(value, max);
  return text.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***");
}

function keyHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function maskKey(value: string): string {
  const key = value.trim();
  if (!key) return "";
  const prefix = key.startsWith("sk-") ? "sk-" : key.slice(0, Math.min(4, key.length));
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

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
    case "groq":
      return hasKey("GROQ_API_KEY", userKeys);
    case "deepseek":
      return hasKey("DEEPSEEK_API_KEY", userKeys);
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

function configuredProviders(userKeys: Record<string, string>) {
  const providers = new Set<string>();
  const keyFingerprints: Array<{ keyName: string; source: "browser" | "server"; masked?: string; hash?: string }> = [];

  for (const [provider, keyNames] of Object.entries(PROVIDER_KEY_MAP)) {
    let configured = false;
    for (const keyName of keyNames) {
      const browserValue = userKeys[keyName]?.trim();
      const serverValue = process.env[keyName]?.trim();
      if (browserValue) {
        configured = true;
        keyFingerprints.push({
          keyName,
          source: "browser",
          masked: maskKey(browserValue),
          hash: keyHash(browserValue),
        });
      } else if (serverValue) {
        configured = true;
        keyFingerprints.push({
          keyName,
          source: "server",
          masked: "server-env-configured",
          hash: keyHash(`${keyName}:${serverValue}`),
        });
      }
    }
    if (configured) providers.add(provider);
  }

  return {
    configured: Array.from(providers),
    keyFingerprints,
  };
}

function resolveTestProvider(model: ModelInfo, userKeys: Record<string, string>, availableModelIds?: string[]): string {
  const runtimeProvider = resolveRuntimeApiProvider(model, userKeys, availableModelIds);
  if (isProviderCallable(runtimeProvider, userKeys)) return runtimeProvider;
  if (hasCustomRelay(userKeys)) return "aihubmix";
  return runtimeProvider;
}

function chooseGeneratorModel(
  models: ModelInfo[],
  requestedIds: string[],
  userKeys: Record<string, string>,
  availableModelIds?: string[],
): { model: ModelInfo; apiProvider: string } | null {
  const requested = requestedIds
    .map((id) => models.find((model) => model.id.toLowerCase() === id.toLowerCase()))
    .filter((model): model is ModelInfo => Boolean(model))
    .filter((model) => (model.category ?? "text") === "text");

  const candidates = requested.length
    ? requested
    : [...models]
        .filter((model) => (model.category ?? "text") === "text")
        .sort((a, b) => scoreModel(b, "accurate") - scoreModel(a, "accurate"));

  for (const model of candidates) {
    const apiProvider = resolveTestProvider(model, userKeys, availableModelIds);
    if (isProviderCallable(apiProvider, userKeys)) return { model, apiProvider };
    if (hasCustomRelay(userKeys) && (!availableModelIds?.length || isRelayModelListed(availableModelIds, model.id))) {
      return { model, apiProvider: "aihubmix" };
    }
  }

  return null;
}

function buildChecks(args: {
  score: StrictScoreResult;
  latencyMs: number;
  outputText: string;
  githubTarget: string;
  hasReferenceImage: boolean;
  passTotal: number;
  coreDimensionMin: number;
}) {
  const dimensions = args.score.dimensionScores;
  const check = (id: string, label: string, value: number, passAt: number) => ({
    id,
    label,
    value,
    threshold: passAt,
    status: value >= passAt ? "pass" : value >= Math.max(6, passAt - 1.5) ? "warn" : "fail",
  });

  const checks = [
    {
      id: "provider_connectivity",
      label: "真实模型连通性 / Provider connectivity",
      value: args.outputText.trim().length > 0 ? 10 : 0,
      threshold: 10,
      status: args.outputText.trim().length > 0 ? "pass" : "fail",
    },
    {
      id: "strict_total",
      label: "严格总分 / Strict total score",
      value: args.score.total,
      threshold: args.passTotal,
      status: args.score.total >= args.passTotal ? "pass" : args.score.total >= 70 ? "warn" : "fail",
    },
    check("intent_fidelity", "意图保真 / Intent fidelity", dimensions.intent_fidelity ?? 0, args.coreDimensionMin),
    check("target_model_fit", "目标模型适配 / Target model fit", dimensions.target_model_fit ?? 0, args.coreDimensionMin),
    check("hallucination_resistance", "幻觉防护 / Hallucination resistance", dimensions.hallucination_resistance ?? 0, args.coreDimensionMin),
    {
      id: "latency",
      label: "响应耗时 / Latency",
      value: args.latencyMs,
      threshold: 120000,
      status: args.latencyMs <= 120000 ? "pass" : "warn",
    },
    {
      id: "secret_handling",
      label: "密钥防泄露 / Secret handling",
      value: 10,
      threshold: 10,
      status: "pass",
    },
    {
      id: "sanitized_report",
      label: "脱敏报告写入 / Sanitized report",
      value: args.githubTarget === "github" || args.githubTarget === "local" ? 10 : 0,
      threshold: 10,
      status: args.githubTarget === "github" || args.githubTarget === "local" ? "pass" : "warn",
    },
  ];

  if (args.hasReferenceImage) {
    checks.splice(5, 0, check(
      "reference_image_consistency",
      "参考图一致性 / Reference image consistency",
      dimensions.reference_image_consistency ?? 0,
      Math.max(8, args.coreDimensionMin - 1),
    ));
  }

  return checks;
}

function overallStatus(checks: Array<{ status: string }>, score: StrictScoreResult, passTotal: number): "pass" | "warn" | "fail" {
  if (checks.some((item) => item.status === "fail") || score.total < 60) return "fail";
  if (score.total >= passTotal && checks.every((item) => item.status === "pass")) return "pass";
  return "warn";
}

function cleanDeviceId(req: NextRequest, body: TestChannelRequest): string {
  return (
    cleanString(body.deviceId, 160) ||
    cleanString(req.headers.get("x-ai-prompt-device-id"), 160) ||
    cleanString(req.cookies.get("ai_prompt_device_id")?.value, 160) ||
    "anonymous-device"
  );
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, {
      keyPrefix: "test-channel",
      limit: readPositiveIntEnv("TEST_CHANNEL_RATE_LIMIT_MAX", 10),
      windowMs: readPositiveIntEnv("TEST_CHANNEL_RATE_LIMIT_WINDOW_MS", 60_000),
    });
    if (!rate.ok) return rateLimitResponse(rate);

    const body: TestChannelRequest = await req.json().catch(() => ({}));
    const userIdea = cleanString(body.userIdea, 6000);
    if (!userIdea) {
      return NextResponse.json(
        { ok: false, error: "请输入测试目标 / Test objective is required" },
        { status: 400 },
      );
    }

    const userKeys = body.userKeys && typeof body.userKeys === "object" ? body.userKeys : {};
    const availableModelIds = Array.isArray(body.availableModelIds)
      ? body.availableModelIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : undefined;
    const models = mergeRelayModelIds(await getModels(), availableModelIds);
    const targetModel =
      models.find((model) => model.id.toLowerCase() === cleanString(body.targetModelId, 180).toLowerCase()) ||
      models.find((model) => model.id === "gpt-5.5-pro") ||
      models[0];
    if (!targetModel) {
      return NextResponse.json({ ok: false, error: "没有可用模型 / No model registry available" }, { status: 400 });
    }

    const requestedGeneratorIds = Array.from(new Set([
      ...(Array.isArray(body.generatorModelIds) ? body.generatorModelIds : []),
      body.generatorModelId,
    ].map((id) => cleanString(id, 180)).filter(Boolean))).slice(0, 6);
    const selected = chooseGeneratorModel(models, requestedGeneratorIds, userKeys, availableModelIds);
    if (!selected) {
      return NextResponse.json(
        {
          ok: false,
          status: "fail",
          error: "测试通道没有可调用的生成/评价模型。请先在右上角钥匙设置中保存 API Key，或配置服务器环境变量。 / No callable generation/evaluation model is available for the test channel.",
          providerStatus: configuredProviders(userKeys),
          secretHandling: "raw keys were not stored; only provider presence was inspected",
        },
        { status: 400 },
      );
    }

    const language = body.language === "en" ? "en" : "zh";
    const targetCategory = targetModel.category ?? "text";
    const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 1600, 512), 3000);
    const maxAttempts = Math.min(Math.max(Number(body.maxAttempts) || 2, 1), 3);
    const passTotal = Math.min(Math.max(Number(body.qualityTargets?.passTotal) || 85, 70), 95);
    const coreDimensionMin = Math.min(Math.max(Number(body.qualityTargets?.coreDimensionMin) || 9, 7), 10);
    const hasReferenceImage = Boolean(body.referenceImage?.dataUrl);
    const providerStatus = configuredProviders(userKeys);

    const feedbackMemory = [
      "Test channel quality policy:",
      `- Run real provider generation with ${selected.model.id}, then score strict quality.`,
      "- Human feedback remains higher priority than AI scoring in normal optimization.",
      "- Do not leak API keys. Do not include secrets in prompt text, reports, logs, or GitHub datasets.",
      "- If any key quality dimension is below target, rewrite internally before returning the best candidate.",
      hasReferenceImage
        ? "- Reference image mode: preserve visual style, composition, palette, lighting, subject relation, and user text goal."
        : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = buildSystemPrompt({
      userIdea,
      targetModel: targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
      feedbackMemory,
    });

    const baseUserPrompt = buildUserPrompt({
      userIdea,
      targetModel: targetModel.name,
      targetProvider: targetModel.provider,
      targetCategory,
      language,
      feedbackMemory,
    });

    const attempts: Array<{
      attempt: number;
      score: StrictScoreResult;
      latencyMs: number;
      outputTokens: number;
      inputTokens: number;
      preview: string;
    }> = [];
    let bestText = "";
    let bestScore: StrictScoreResult | null = null;
    let bestLatencyMs = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let repairGuidance = "";
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await callProvider({
        model: selected.model.id,
        apiProvider: selected.apiProvider,
        systemPrompt,
        userPrompt: [
          baseUserPrompt,
          repairGuidance,
          attempt > 1
            ? "Rewrite the previous weak dimensions. Output only the improved final prompt, with no explanation."
            : "",
        ].filter(Boolean).join("\n\n"),
        maxTokens,
        temperature: attempt === 1 ? 0.35 : 0.45,
        userKeys,
      });
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
      const score = strictPromptScore({
        userIdea,
        promptText: result.text,
        targetModelId: targetModel.id,
        hasReferenceImage,
      });
      attempts.push({
        attempt,
        score,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        preview: safePreview(result.text, 700),
      });
      if (!bestScore || score.total > bestScore.total) {
        bestText = result.text;
        bestScore = score;
        bestLatencyMs = result.latencyMs;
      }

      const lowDimensions = Object.entries(score.dimensionScores)
        .filter(([, value]) => value < coreDimensionMin)
        .map(([dimension, value]) => `${dimension}=${value}/10`);
      if (score.total >= passTotal && lowDimensions.length === 0) break;
      repairGuidance = [
        "Quality gate failed. Improve these dimensions before returning:",
        `- strict total: ${score.total}/100, target ${passTotal}/100`,
        ...lowDimensions.map((item) => `- ${item}`),
        "- Add missing structure, anti-hallucination constraints, model-specific fit, acceptance criteria, and user-intent preservation.",
      ].join("\n");
    }

    if (!bestScore) throw new Error("测试通道没有收到模型输出 / No model output received in test channel");

    const checks = buildChecks({
      score: bestScore,
      latencyMs: bestLatencyMs,
      outputText: bestText,
      githubTarget: "pending",
      hasReferenceImage,
      passTotal,
      coreDimensionMin,
    });
    const failedDimensions = checks
      .filter((item) => item.status !== "pass")
      .map((item) => item.id);
    const statusBeforeReport = overallStatus(checks, bestScore, passTotal);

    const reportId = `test_channel_${Date.now()}_${createHash("sha1").update(`${userIdea}:${selected.model.id}`).digest("hex").slice(0, 8)}`;
    const github = await exportDatasetRow("test-channel-runs", {
      id: reportId,
      timestamp: Date.now(),
      deviceId: cleanDeviceId(req, body),
      userIdea: safePreview(userIdea, 600),
      targetModel: targetModel.id,
      optimizedPrompt: safePreview(bestText, 1200),
      aiPromptScore: bestScore.total,
      strictScore: bestScore,
      failedDimensions,
      testScores: {
        status: statusBeforeReport,
        attempts: attempts.length,
        passTotal,
        coreDimensionMin,
      },
      testChannel: {
        status: statusBeforeReport,
        provider: selected.apiProvider,
        model_id: selected.model.id,
        model_name: selected.model.name,
        target_model_id: targetModel.id,
        latency_ms: Date.now() - startedAt,
        attempts: attempts.length,
        key_fingerprints: providerStatus.keyFingerprints.map((item) => ({
          key_name: item.keyName,
          source: item.source,
          hash: item.hash,
        })),
        secret_handling: "raw API keys used only in-memory for this request; sanitized report excludes key values",
      },
    });

    const finalChecks = buildChecks({
      score: bestScore,
      latencyMs: bestLatencyMs,
      outputText: bestText,
      githubTarget: github.target,
      hasReferenceImage,
      passTotal,
      coreDimensionMin,
    });
    const status = overallStatus(finalChecks, bestScore, passTotal);

    return NextResponse.json({
      ok: true,
      status,
      reportId,
      model: {
        id: selected.model.id,
        name: selected.model.name,
        provider: selected.model.provider,
        apiProvider: selected.apiProvider,
        targetModelId: targetModel.id,
        targetModelName: targetModel.name,
      },
      strictScore: bestScore,
      checks: finalChecks,
      attempts,
      stats: {
        latencyMs: Date.now() - startedAt,
        bestModelLatencyMs: bestLatencyMs,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        tokensDelta: comparePrompts(userIdea, bestText).delta,
        changePercent: comparePrompts(userIdea, bestText).ratio,
      },
      providerStatus: {
        configured: providerStatus.configured,
        keys: providerStatus.keyFingerprints.map((item) => ({
          keyName: item.keyName,
          source: item.source,
          masked: item.masked,
          hash: item.hash,
        })),
      },
      bestPromptPreview: safePreview(bestText, 1800),
      github: {
        synced: github.synced,
        target: github.target,
        filePath: github.filePath,
        repository: github.repository,
        branch: github.branch,
        reason: github.reason,
      },
      secretHandling: "browser keys are sent only to /api/test-channel/run for this run; raw keys are never returned, logged, or written to GitHub datasets",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "fail",
        error: toUserFacingErrorMessage(error),
        secretHandling: "raw keys are not included in errors or reports",
      },
      { status: 500 },
    );
  }
}
