import { ModelCategory, ModelInfo } from "@/lib/models-registry";

function cleanId(id: string): string {
  return id.trim();
}

function lower(id: string): string {
  return cleanId(id).toLowerCase();
}

export function isRelayModelListed(availableModelIds: string[] | undefined, modelId: string): boolean {
  if (!availableModelIds?.length) return false;
  const target = lower(modelId);
  return availableModelIds.some((id) => lower(id) === target);
}

function inferCategory(id: string): ModelCategory {
  const key = lower(id);
  if (/(image|img|dall[-_. ]?e|gpt[-_. ]?image|flux|sdxl|stable[-_. ]?diffusion|midjourney|mj)/.test(key)) return "image";
  if (/(video|sora|veo|seedance|runway|kling|pika|luma|hailuo)/.test(key)) return "video";
  if (/(tts|voice|speech|audio|eleven|fish|cosyvoice|chattts|suno|music)/.test(key)) return "tts";
  if (/(stt|transcri|whisper)/.test(key)) return "stt";
  if (/(embed|embedding|bge|e5-|text-embedding)/.test(key)) return "embedding";
  if (/(ocr|vision-ocr)/.test(key)) return "ocr";
  return "text";
}

function inferProvider(id: string): string {
  const key = lower(id);
  if (/(^|[/_-])(gpt|o[1-9]|codex|dall[-_. ]?e|gpt[-_. ]?image)/.test(key)) return "OpenAI";
  if (/claude|anthropic/.test(key)) return "Anthropic";
  if (/gemini|google/.test(key)) return "Google";
  if (/deepseek/.test(key)) return "DeepSeek";
  if (/glm|zhipu/.test(key)) return "智谱AI";
  if (/kimi|moonshot/.test(key)) return "月之暗面";
  if (/qwen|tongyi|alibaba/.test(key)) return "阿里巴巴";
  if (/ernie|baidu/.test(key)) return "百度";
  if (/grok|xai/.test(key)) return "xAI";
  if (/minimax/.test(key)) return "MiniMax";
  if (/cohere|command-r/.test(key)) return "Cohere";
  if (/mistral|codestral|mixtral/.test(key)) return "Mistral AI";
  if (/llama|meta/.test(key)) return "Meta";
  return "中转站 Relay";
}

function inferAccuracy(id: string): ModelInfo["accuracy"] {
  const key = lower(id);
  if (/(opus|pro|ultra|supreme|gpt-5|gpt5|o3|o4|deepseek-v4|gemini-3|glm-5)/.test(key)) return "supreme";
  if (/(sonnet|flash|v3|v4|plus|max|coder|reason|r1|k2)/.test(key)) return "high";
  return "medium";
}

function inferSpeed(id: string): ModelInfo["speed"] {
  const key = lower(id);
  if (/(flash|fast|mini|haiku|turbo|lite|instant|small)/.test(key)) return "fast";
  if (/(opus|pro|ultra|thinking|reason|r1|o3)/.test(key)) return "slow";
  return "medium";
}

export function createRelayModelInfo(id: string): ModelInfo {
  const modelId = cleanId(id);
  return {
    id: modelId,
    name: modelId,
    provider: inferProvider(modelId),
    apiProvider: "aihubmix",
    contextWindow: 128000,
    maxOutput: 8192,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: inferSpeed(modelId),
    accuracy: inferAccuracy(modelId),
    supportsStreaming: true,
    isLatest: true,
    tags: ["relay", "custom"],
    releaseDate: new Date().toISOString().slice(0, 10),
    category: inferCategory(modelId),
  };
}

export function mergeRelayModelIds(models: ModelInfo[], availableModelIds: string[] | undefined): ModelInfo[] {
  if (!availableModelIds?.length) return models;

  const seen = new Set(models.map((model) => lower(model.id)));
  const extras: ModelInfo[] = [];
  for (const id of availableModelIds) {
    const cleaned = cleanId(id);
    if (!cleaned) continue;
    const key = lower(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(createRelayModelInfo(cleaned));
  }

  return extras.length ? [...models, ...extras] : models;
}
