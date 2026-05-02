// Verified latest-model fallbacks.
// This file is shared by the GitHub auto-updater and the local patch script.
// API fetches remain the primary source; these entries keep the registry from
// losing high-value models when a provider endpoint or relay omits them.

const LAST_VERIFIED_DATE = "2026-05-02";

const LATEST_MODEL_ENSURES = [
  // OpenAI, verified from OpenAI model/pricing docs and GPT-5.5 release notes.
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 5,
    outputCostPer1M: 30,
    speed: "fast",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["reasoning", "code", "vision", "agentic"],
    releaseDate: "2026-04-24",
    category: "text",
  },
  {
    id: "gpt-5.5-pro",
    name: "GPT-5.5 Pro",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 30,
    outputCostPer1M: 180,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["reasoning", "code", "vision", "agentic", "pro"],
    releaseDate: "2026-04-24",
    category: "text",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 2.5,
    outputCostPer1M: 15,
    speed: "fast",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: false,
    tags: ["reasoning", "code", "vision"],
    releaseDate: "2026-03-01",
    category: "text",
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 0.75,
    outputCostPer1M: 4.5,
    speed: "fast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: false,
    tags: ["reasoning", "code", "vision", "cheap"],
    releaseDate: "2026-03-01",
    category: "text",
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 0.2,
    outputCostPer1M: 1.25,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: false,
    tags: ["reasoning", "code", "vision", "cheap", "fast"],
    releaseDate: "2026-03-01",
    category: "text",
  },
  {
    id: "gpt-5.4-pro",
    name: "GPT-5.4 Pro",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 30,
    outputCostPer1M: 180,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: false,
    tags: ["reasoning", "code", "vision", "pro"],
    releaseDate: "2026-03-01",
    category: "text",
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 32768,
    maxOutput: 4096,
    inputCostPer1M: 5,
    outputCostPer1M: 30,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: true,
    tags: ["image-gen", "editing", "transparent-background", "text-rendering"],
    releaseDate: "2026-04-01",
    category: "image",
  },
  {
    id: "gpt-image-1.5",
    name: "GPT Image 1.5",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 32768,
    maxOutput: 4096,
    inputCostPer1M: 5,
    outputCostPer1M: 32,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: false,
    tags: ["image-gen", "editing", "text-rendering"],
    releaseDate: "2026-02-01",
    category: "image",
  },
  {
    id: "gpt-image-1-mini",
    name: "GPT Image 1 Mini",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 32768,
    maxOutput: 4096,
    inputCostPer1M: 2,
    outputCostPer1M: 8,
    speed: "fast",
    accuracy: "high",
    supportsStreaming: false,
    isLatest: false,
    tags: ["image-gen", "cheap", "fast"],
    releaseDate: "2026-02-01",
    category: "image",
  },
  {
    id: "sora-2",
    name: "Sora 2",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: false,
    tags: ["video-gen", "audio-sync", "priced-per-second"],
    releaseDate: "2026-02-01",
    category: "video",
  },
  {
    id: "sora-2-pro",
    name: "Sora 2 Pro",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "slow",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: true,
    tags: ["video-gen", "audio-sync", "pro", "priced-per-second"],
    releaseDate: "2026-02-01",
    category: "video",
  },
  {
    id: "gpt-realtime-1.5",
    name: "GPT Realtime 1.5",
    provider: "OpenAI",
    apiProvider: "openai",
    contextWindow: 128000,
    maxOutput: 4096,
    inputCostPer1M: 4,
    outputCostPer1M: 16,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: true,
    tags: ["audio", "realtime", "voice", "multimodal"],
    releaseDate: "2026-04-01",
    category: "tts",
  },

  // DeepSeek, verified from official DeepSeek API pricing docs.
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    apiProvider: "deepseek",
    contextWindow: 128000,
    maxOutput: 32768,
    inputCostPer1M: 0.28,
    outputCostPer1M: 1.14,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["reasoning", "math", "code", "chinese"],
    releaseDate: "2026-04-01",
    category: "text",
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    apiProvider: "deepseek",
    contextWindow: 128000,
    maxOutput: 32768,
    inputCostPer1M: 0.04,
    outputCostPer1M: 0.14,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: true,
    tags: ["fast", "cheap", "math", "code", "chinese"],
    releaseDate: "2026-04-01",
    category: "text",
  },
  {
    id: "sophnet-deepseek-v4-pro",
    name: "DeepSeek V4 Pro (SophNet relay)",
    provider: "DeepSeek",
    apiProvider: "aihubmix",
    contextWindow: 128000,
    maxOutput: 32768,
    inputCostPer1M: 0.28,
    outputCostPer1M: 1.14,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["reasoning", "math", "code", "chinese", "relay"],
    releaseDate: "2026-04-01",
    category: "text",
  },

  // Google Gemini, verified from Gemini API model and pricing docs.
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 1048576,
    maxOutput: 65536,
    inputCostPer1M: 2,
    outputCostPer1M: 12,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["vision", "reasoning", "code", "long-context", "preview"],
    releaseDate: "2026-04-30",
    category: "text",
  },
  {
    id: "gemini-3.1-pro-preview-customtools",
    name: "Gemini 3.1 Pro Preview Custom Tools",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 1048576,
    maxOutput: 65536,
    inputCostPer1M: 2,
    outputCostPer1M: 12,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["vision", "reasoning", "code", "custom-tools", "long-context", "preview"],
    releaseDate: "2026-04-30",
    category: "text",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 1048576,
    maxOutput: 65536,
    inputCostPer1M: 0.5,
    outputCostPer1M: 3,
    speed: "fast",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["vision", "reasoning", "fast", "preview"],
    releaseDate: "2026-04-30",
    category: "text",
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash-Lite Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 1048576,
    maxOutput: 65536,
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: true,
    tags: ["vision", "fast", "cheap", "preview"],
    releaseDate: "2026-04-30",
    category: "text",
  },
  {
    id: "gemini-3.1-flash-live-preview",
    name: "Gemini 3.1 Flash Live Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 1048576,
    maxOutput: 65536,
    inputCostPer1M: 0.75,
    outputCostPer1M: 4.5,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: true,
    tags: ["audio", "live", "voice", "multimodal", "preview"],
    releaseDate: "2026-04-30",
    category: "tts",
  },
  {
    id: "gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 131072,
    maxOutput: 32768,
    inputCostPer1M: 0.5,
    outputCostPer1M: 60,
    speed: "fast",
    accuracy: "high",
    supportsStreaming: false,
    isLatest: true,
    tags: ["image-gen", "editing", "fast", "preview"],
    releaseDate: "2026-04-30",
    category: "image",
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 131072,
    maxOutput: 32768,
    inputCostPer1M: 2,
    outputCostPer1M: 120,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: true,
    tags: ["image-gen", "editing", "reasoning", "preview"],
    releaseDate: "2026-04-30",
    category: "image",
  },
  {
    id: "gemini-3.1-flash-tts-preview",
    name: "Gemini 3.1 Flash TTS Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 1048576,
    maxOutput: 65536,
    inputCostPer1M: 1,
    outputCostPer1M: 20,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: false,
    isLatest: true,
    tags: ["tts", "audio", "voice", "preview"],
    releaseDate: "2026-04-30",
    category: "tts",
  },
  {
    id: "veo-3.1-generate-preview",
    name: "Veo 3.1 Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: true,
    tags: ["video-gen", "audio-sync", "cinematic", "preview", "priced-per-second"],
    releaseDate: "2026-04-30",
    category: "video",
  },
  {
    id: "veo-3.1-fast-generate-preview",
    name: "Veo 3.1 Fast Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "fast",
    accuracy: "high",
    supportsStreaming: false,
    isLatest: true,
    tags: ["video-gen", "audio-sync", "fast", "preview", "priced-per-second"],
    releaseDate: "2026-04-30",
    category: "video",
  },
  {
    id: "veo-3.1-lite-generate-preview",
    name: "Veo 3.1 Lite Preview",
    provider: "Google",
    apiProvider: "google",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "fast",
    accuracy: "high",
    supportsStreaming: false,
    isLatest: true,
    tags: ["video-gen", "audio-sync", "cheap", "preview", "priced-per-second"],
    releaseDate: "2026-04-30",
    category: "video",
  },

  // Anthropic, verified from Claude model overview.
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "Anthropic",
    apiProvider: "anthropic",
    contextWindow: 1048576,
    maxOutput: 128000,
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["reasoning", "vision", "code", "agentic", "adaptive-thinking"],
    releaseDate: "2026-02-19",
    category: "text",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    apiProvider: "anthropic",
    contextWindow: 1048576,
    maxOutput: 64000,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    speed: "fast",
    accuracy: "supreme",
    supportsStreaming: true,
    isLatest: true,
    tags: ["vision", "code", "thinking"],
    releaseDate: "2025-11-24",
    category: "text",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    apiProvider: "anthropic",
    contextWindow: 200000,
    maxOutput: 64000,
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: true,
    tags: ["vision", "fast", "cheap"],
    releaseDate: "2025-10-01",
    category: "text",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5 Snapshot 20251001",
    provider: "Anthropic",
    apiProvider: "anthropic",
    contextWindow: 200000,
    maxOutput: 64000,
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    speed: "ultrafast",
    accuracy: "high",
    supportsStreaming: true,
    isLatest: false,
    tags: ["vision", "fast", "cheap", "snapshot"],
    releaseDate: "2025-10-01",
    category: "text",
  },
];

const LATEST_BY_ID = new Map(LATEST_MODEL_ENSURES.map((model) => [model.id, model]));
const LATEST_BY_LOWER_ID = new Map(LATEST_MODEL_ENSURES.map((model) => [model.id.toLowerCase(), model]));
const KNOWN_LATEST_IDS = new Set(
  LATEST_MODEL_ENSURES.filter((model) => model.isLatest).map((model) => model.id.toLowerCase())
);

function cloneModel(model) {
  return JSON.parse(JSON.stringify(model));
}

function metaFromModel(model) {
  return {
    i: model.inputCostPer1M,
    o: model.outputCostPer1M,
    s: model.speed,
    a: model.accuracy,
    t: model.tags,
    d: model.releaseDate,
  };
}

function lookupLatestMeta(id) {
  const exact = LATEST_BY_ID.get(id) || LATEST_BY_LOWER_ID.get(id.toLowerCase());
  if (exact) return metaFromModel(exact);
  return null;
}

function isKnownLatest(id) {
  return KNOWN_LATEST_IDS.has(String(id).toLowerCase());
}

function mergeKnownLatestModels(models) {
  const byId = new Map(models.map((model, index) => [model.id, { model, index }]));
  let added = 0;
  let updated = 0;

  for (const latest of LATEST_MODEL_ENSURES) {
    const existing = byId.get(latest.id);
    if (existing) {
      const merged = {
        ...existing.model,
        ...cloneModel(latest),
        // Preserve relay routing when an existing fetched model came from a relay.
        apiProvider: existing.model.apiProvider || latest.apiProvider,
      };
      const before = JSON.stringify(existing.model);
      models[existing.index] = merged;
      byId.set(latest.id, { model: merged, index: existing.index });
      if (before !== JSON.stringify(merged)) updated++;
    } else {
      models.push(cloneModel(latest));
      byId.set(latest.id, { model: latest, index: models.length - 1 });
      added++;
    }
  }

  return { models, stats: { added, updated, verifiedAt: LAST_VERIFIED_DATE } };
}

function markLatestModels(models) {
  const groups = new Map();
  for (const model of models) {
    model.isLatest = false;
    const key = `${model.provider || "Other"}::${model.category || "text"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(model);
  }

  for (const group of groups.values()) {
    const explicitLatest = group.filter((model) => isKnownLatest(model.id));
    if (explicitLatest.length > 0) {
      for (const model of explicitLatest) model.isLatest = true;
      continue;
    }

    const sorted = group
      .filter((model) => model.releaseDate)
      .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)));
    if (sorted[0]) sorted[0].isLatest = true;
  }

  return models;
}

module.exports = {
  LAST_VERIFIED_DATE,
  LATEST_MODEL_ENSURES,
  lookupLatestMeta,
  mergeKnownLatestModels,
  markLatestModels,
  isKnownLatest,
};
