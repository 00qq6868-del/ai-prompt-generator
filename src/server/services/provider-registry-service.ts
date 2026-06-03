import { MODEL_REGISTRY } from "./model-selection-service.js";

export interface ProviderRegistryValidation {
  ok: boolean;
  checkedAt: string;
  requestedModelId: string;
  resolvedModelId: string;
  provider: string;
  status: "confirmed" | "alias_fallback" | "needs_provider_check" | "missing" | "provider_error";
  source: "configured_list" | "openai_models_api" | "anthropic_configured_list" | "none";
  warnings: string[];
}

const IMAGE_ALIAS_FALLBACKS: Record<string, string[]> = {
  "gpt-image-2": ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"],
};

export interface ProviderModelSource {
  models: Set<string>;
  source: ProviderRegistryValidation["source"];
  warnings: string[];
}

function parseModelList(raw = ""): Set<string> {
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

export function getConfiguredProviderModels(provider: string): ProviderModelSource {
  if (provider === "openai") {
    const models = parseModelList(process.env.AI_PROMPT_V3_PROVIDER_MODELS ?? process.env.OPENAI_AVAILABLE_MODELS ?? "");
    return { models, source: models.size ? "configured_list" : "none", warnings: [] };
  }
  if (provider === "anthropic") {
    const models = parseModelList(process.env.ANTHROPIC_AVAILABLE_MODELS ?? "");
    return { models, source: models.size ? "anthropic_configured_list" : "none", warnings: [] };
  }
  return { models: new Set(), source: "none", warnings: [`Provider ${provider} has no model registry adapter.`] };
}

export async function fetchOpenAIModelList(input: {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
} = {}): Promise<ProviderModelSource> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      models: new Set(),
      source: "none",
      warnings: ["OPENAI_API_KEY is not configured, so the live OpenAI /models registry cannot be queried."],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  try {
    const baseUrl = (input.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        models: new Set(),
        source: "openai_models_api",
        warnings: [`OpenAI /models returned HTTP ${response.status}. Reauthorize provider credentials before production calls.`],
      };
    }
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    return {
      models: new Set((body.data ?? []).map((item) => String(item.id ?? "")).filter(Boolean)),
      source: "openai_models_api",
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      models: new Set(),
      source: "openai_models_api",
      warnings: [`OpenAI /models query failed: ${message}`],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateAgainstSource(
  requestedModelId: string,
  source: ProviderModelSource,
  provider: string,
  checkedAt: string,
): ProviderRegistryValidation {
  const registryItem = MODEL_REGISTRY.find((item) => item.id === requestedModelId);
  const resolvedProvider = provider || registryItem?.provider || "unknown";
  const fallbacks = IMAGE_ALIAS_FALLBACKS[requestedModelId] ?? [requestedModelId];

  if (source.models.size === 0) {
    return {
      ok: false,
      checkedAt,
      requestedModelId,
      resolvedModelId: requestedModelId,
      provider: resolvedProvider,
      status: source.source === "openai_models_api" && source.warnings.length ? "provider_error" : "needs_provider_check",
      source: source.source,
      warnings: [
        ...source.warnings,
        "No provider model list is available. Set AI_PROMPT_V3_PROVIDER_MODELS/OPENAI_AVAILABLE_MODELS or provide live provider credentials before production calls.",
      ],
    };
  }

  for (const candidate of fallbacks) {
    if (source.models.has(candidate)) {
      return {
        ok: true,
        checkedAt,
        requestedModelId,
        resolvedModelId: candidate,
        provider: resolvedProvider,
        status: candidate === requestedModelId ? "confirmed" : "alias_fallback",
        source: source.source,
        warnings: candidate === requestedModelId ? [] : [`${requestedModelId} resolved to available fallback ${candidate}`],
      };
    }
  }

  return {
    ok: false,
    checkedAt,
    requestedModelId,
    resolvedModelId: requestedModelId,
    provider: resolvedProvider,
    status: "missing",
    source: source.source,
    warnings: [
      ...source.warnings,
      `Provider registry does not include ${requestedModelId} or fallbacks: ${fallbacks.join(", ")}`,
    ],
  };
}

export function validateProviderModel(
  requestedModelId: string,
  source?: ProviderModelSource,
): ProviderRegistryValidation {
  const registryItem = MODEL_REGISTRY.find((item) => item.id === requestedModelId);
  const provider = registryItem?.provider ?? "unknown";
  const modelSource = source ?? getConfiguredProviderModels(provider);
  return validateAgainstSource(requestedModelId, modelSource, provider, new Date().toISOString());
}

export async function validateProviderModelLive(requestedModelId: string): Promise<ProviderRegistryValidation> {
  const registryItem = MODEL_REGISTRY.find((item) => item.id === requestedModelId);
  const provider = registryItem?.provider ?? "unknown";
  const configured = getConfiguredProviderModels(provider);
  if (configured.models.size > 0 || provider !== "openai") {
    return validateAgainstSource(requestedModelId, configured, provider, new Date().toISOString());
  }
  const live = await fetchOpenAIModelList();
  return validateAgainstSource(requestedModelId, live, provider, new Date().toISOString());
}

export function validateAllProviderModels(sourceByProvider?: Record<string, ProviderModelSource>) {
  const checkedAt = new Date().toISOString();
  const results = MODEL_REGISTRY.map((item) => {
    const source = sourceByProvider?.[item.provider] ?? getConfiguredProviderModels(item.provider);
    return validateAgainstSource(item.id, source, item.provider, checkedAt);
  });
  return {
    ok: results.every((item) => item.ok || item.status === "needs_provider_check"),
    checkedAt,
    configuredModels: Object.fromEntries(
      [...new Set(MODEL_REGISTRY.map((item) => item.provider))].map((provider) => {
        const source = sourceByProvider?.[provider] ?? getConfiguredProviderModels(provider);
        return [provider, [...source.models]];
      }),
    ),
    results,
  };
}

export async function validateAllProviderModelsLive() {
  const openai = getConfiguredProviderModels("openai");
  const sourceByProvider: Record<string, ProviderModelSource> = {
    openai: openai.models.size ? openai : await fetchOpenAIModelList(),
    anthropic: getConfiguredProviderModels("anthropic"),
  };
  return validateAllProviderModels(sourceByProvider);
}
