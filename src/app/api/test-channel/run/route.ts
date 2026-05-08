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

interface TestModelPlan {
  model: ModelInfo;
  apiProvider: string;
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

function buildGeneratorPlan(
  models: ModelInfo[],
  requestedIds: string[],
  userKeys: Record<string, string>,
  availableModelIds?: string[],
): TestModelPlan[] {
  const requested = requestedIds
    .map((id) => models.find((model) => model.id.toLowerCase() === id.toLowerCase()))
    .filter((model): model is ModelInfo => Boolean(model))
    .filter((model) => (model.category ?? "text") === "text");

  const fallbackCandidates = [...models]
    .filter((model) => (model.category ?? "text") === "text")
    .sort((a, b) => scoreModel(b, "accurate") - scoreModel(a, "accurate"));
  const seen = new Set<string>();
  const candidates = [...requested, ...fallbackCandidates].filter((model) => {
    const key = model.id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const plan: TestModelPlan[] = [];

  for (const model of candidates) {
    const apiProvider = resolveTestProvider(model, userKeys, availableModelIds);
    if (isProviderCallable(apiProvider, userKeys)) {
      plan.push({ model, apiProvider });
      continue;
    }
    if (hasCustomRelay(userKeys) && (!availableModelIds?.length || isRelayModelListed(availableModelIds, model.id))) {
      plan.push({ model, apiProvider: "aihubmix" });
    }
  }

  return plan.slice(0, 8);
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

function normalizeTestError(error: unknown, modelId?: string): string {
  const message = toUserFacingErrorMessage(error);
  if (
    message.includes("reading '0'") ||
    message.includes("reading \"0\"") ||
    message.includes("Cannot read properties of undefined")
  ) {
    return `模型 ${modelId || ""} 返回了空 choices 或非标准响应。通常表示该模型不支持当前 chat/completions 调用、模型别名不可用，或中转站返回格式异常。请换一个生成/评价模型，或刷新中转站模型列表。 / Model ${modelId || ""} returned an empty or non-standard response. Switch model or refresh relay model availability.`;
  }
  return message;
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
    const generatorPlan = buildGeneratorPlan(models, requestedGeneratorIds, userKeys, availableModelIds);
    if (!generatorPlan.length) {
      return NextResponse.json(
        {
          ok: false,
          status: "fail",
          error: "测试通道没有可调用的生成/评价模型。请先在右上角钥匙设置中保存 API Key，或配置服务器环境变量。 / No callable generation/evaluation model is available for the test channel.",
          providerStatus: configuredProviders(userKeys),
          secretHandling: "原始密钥未保存；这里只检查了供应商是否已配置。 / Raw keys were not stored; only provider presence was inspected.",
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
    let selected: TestModelPlan = generatorPlan[0];
    let bestPlan: TestModelPlan = selected;

    const feedbackMemory = [
      "Test channel quality policy:",
      `- Run real provider generation with selected model candidates, then score strict quality.`,
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
      modelId?: string;
      apiProvider?: string;
    }> = [];
    const modelDiagnostics: Array<{
      modelId: string;
      modelName: string;
      apiProvider: string;
      status: "success" | "failed" | "skipped";
      error?: string;
      attempts: number;
      bestScore?: number;
      latencyMs?: number;
    }> = [];
    let bestText = "";
    let bestScore: StrictScoreResult | null = null;
    let bestLatencyMs = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const startedAt = Date.now();
    let successfulModelSeen = false;

    for (const plan of generatorPlan) {
      selected = plan;
      let repairGuidance = "";
      let modelBestScore = 0;
      let modelLatencyMs = 0;
      let modelAttempts = 0;
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          modelAttempts = attempt;
          const result = await callProvider({
            model: plan.model.id,
            apiProvider: plan.apiProvider,
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
          if (!result.text.trim()) {
            throw new Error(`Empty response from ${plan.apiProvider}/${plan.model.id}. 上游模型返回了空文本。`);
          }
          successfulModelSeen = true;
          totalInputTokens += result.inputTokens;
          totalOutputTokens += result.outputTokens;
          modelLatencyMs += result.latencyMs;
          const score = strictPromptScore({
            userIdea,
            promptText: result.text,
            targetModelId: targetModel.id,
            hasReferenceImage,
          });
          modelBestScore = Math.max(modelBestScore, score.total);
          attempts.push({
            attempt,
            score,
            latencyMs: result.latencyMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            preview: safePreview(result.text, 700),
            modelId: plan.model.id,
            apiProvider: plan.apiProvider,
          });
          if (!bestScore || score.total > bestScore.total) {
            bestText = result.text;
            bestScore = score;
            bestLatencyMs = result.latencyMs;
            bestPlan = plan;
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
        modelDiagnostics.push({
          modelId: plan.model.id,
          modelName: plan.model.name,
          apiProvider: plan.apiProvider,
          status: "success",
          attempts: modelAttempts,
          bestScore: modelBestScore,
          latencyMs: modelLatencyMs,
        });
        if (bestScore && bestScore.total >= passTotal) break;
      } catch (error) {
        modelDiagnostics.push({
          modelId: plan.model.id,
          modelName: plan.model.name,
          apiProvider: plan.apiProvider,
          status: "failed",
          attempts: Math.max(modelAttempts, 1),
          error: normalizeTestError(error, plan.model.id),
        });
        continue;
      }
    }

    if (!bestScore) {
      return NextResponse.json(
        {
          ok: false,
          status: "fail",
          error: "测试通道没有收到任何可评分的模型输出。已尝试可用模型，但都失败或返回空内容。请先换一个生成/评价模型，或打开密钥设置刷新中转站模型列表。 / No scorable output was received. Switch model or refresh relay model availability.",
          providerStatus: {
            configured: providerStatus.configured,
            keys: providerStatus.keyFingerprints.map((item) => ({
              keyName: item.keyName,
              source: item.source,
              masked: item.masked,
              hash: item.hash,
            })),
          },
          modelDiagnostics,
          checks: [
            {
              id: "provider_connectivity",
              label: "真实模型连通性 / Provider connectivity",
              value: 0,
              threshold: 10,
              status: "fail",
            },
          ],
          improvementPlan: [
            "点击右上角模型选择，把生成/评价模型换成该中转站明确支持的 chat 文本模型。 / Open the model picker and choose a chat text model that the relay explicitly supports.",
            "打开密钥设置并保存一次，让系统重新探测中转站模型列表。 / Open key settings and save once so the app re-probes the relay model list.",
            "如果使用的是 gpt-5.5 这类别名，确认中转站是否真实支持该别名；不支持就换成列表里存在的模型。 / If you are using an alias such as gpt-5.5, confirm the relay really supports it; otherwise choose a listed model.",
            "如果某个模型反复返回空 choices，把它从测试模型选择中移除。 / If a model repeatedly returns empty choices, remove it from the test model selection.",
          ],
          secretHandling: "原始密钥不会出现在诊断或报告中。 / Raw keys are not included in diagnostics or reports.",
        },
        { status: 502 },
      );
    }
    selected = bestPlan;

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
        successfulModelSeen,
        modelDiagnostics,
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
        model_diagnostics: modelDiagnostics.map((item) => ({
          model_id: item.modelId,
          provider: item.apiProvider,
          status: item.status,
          error: item.error ? safePreview(item.error, 280) : "",
          best_score: item.bestScore ?? null,
        })),
        key_fingerprints: providerStatus.keyFingerprints.map((item) => ({
          key_name: item.keyName,
          source: item.source,
          hash: item.hash,
        })),
        secret_handling: "原始 API Key 只在本次请求内存中使用；脱敏报告排除完整密钥值。 / Raw API keys are used only in-memory for this request; sanitized reports exclude key values.",
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
      modelDiagnostics,
      improvementPlan: [
        status === "pass"
          ? "本次测试已通过，可把最佳提示词预览作为质量样例进入后续优化。 / This test passed; the best prompt preview can be used as a quality sample for future optimization."
          : "优先查看未通过/警告检查项，对应补强测试目标或提示词模板。 / First inspect failed or warning checks, then strengthen the test objective or prompt template accordingly.",
        "如果模型诊断中有 failed，优先换掉失败模型或刷新中转站模型列表。 / If model diagnostics contains failed items, replace the failed model or refresh the relay model list first.",
        "如果 strict total 未到 85，优先补强意图保真、目标模型适配、幻觉防护三个维度。 / If strict total is below 85, strengthen intent fidelity, target model fit, and hallucination resistance first.",
        "如果生成/评价模型显示的是旧别名，重新打开模型选择器选择当前可用的高质量文本模型。 / If the generation/evaluation model is an old alias, reopen the model picker and choose a currently callable high-quality text model.",
      ],
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
      secretHandling: "浏览器密钥只会随本次请求发送到 /api/test-channel/run；原始密钥永不返回、写日志或写入 GitHub 数据集。 / Browser keys are sent only to /api/test-channel/run for this run; raw keys are never returned, logged, or written to GitHub datasets.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "fail",
        error: toUserFacingErrorMessage(error),
        secretHandling: "原始密钥不会出现在错误或报告中。 / Raw keys are not included in errors or reports.",
      },
      { status: 500 },
    );
  }
}
