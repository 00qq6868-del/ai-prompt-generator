// .github/scripts/fetch-models.mjs
// 自动从各厂商 API 拉取最新模型列表，合并到 public/models.json
// 运行环境：Node.js 20+，GitHub Actions
// 参考项目：openai/openai-node, anthropics/anthropic-sdk-python

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = join(__dir, "../../public/models.json");

// ── 当前已知模型的元数据（自动获取 API 没有的价格/速度信息）──────────────
// 格式：modelId → 补充字段
const META_MAP = {
  // OpenAI
  "gpt-4o":             { inputCostPer1M: 2.5,  outputCostPer1M: 10,   speed: "fast",      accuracy: "supreme", tags: ["vision","code"] },
  "gpt-4o-mini":        { inputCostPer1M: 0.15, outputCostPer1M: 0.6,  speed: "ultrafast", accuracy: "high",    tags: ["cheap","fast"] },
  "o3":                 { inputCostPer1M: 10,   outputCostPer1M: 40,   speed: "slow",      accuracy: "supreme", tags: ["reasoning","math","code"] },
  "o4-mini":            { inputCostPer1M: 1.1,  outputCostPer1M: 4.4,  speed: "fast",      accuracy: "supreme", tags: ["reasoning","cheap","code"] },
  "gpt-4.5-preview":    { inputCostPer1M: 75,   outputCostPer1M: 150,  speed: "medium",    accuracy: "supreme", tags: ["vision","reasoning"] },
  // Anthropic
  "claude-opus-4-5":             { inputCostPer1M: 15,  outputCostPer1M: 75,  speed: "slow",      accuracy: "supreme", tags: ["reasoning","vision","code"] },
  "claude-sonnet-4-5":           { inputCostPer1M: 3,   outputCostPer1M: 15,  speed: "fast",      accuracy: "supreme", tags: ["vision","code","balanced"] },
  "claude-3-5-haiku-20241022":   { inputCostPer1M: 0.8, outputCostPer1M: 4,   speed: "ultrafast", accuracy: "high",    tags: ["fast","cheap"] },
  // Google
  "gemini-2.5-pro-preview-03-25":{ inputCostPer1M: 1.25,outputCostPer1M: 10,  speed: "medium",    accuracy: "supreme", tags: ["reasoning","vision","long-context"] },
  "gemini-2.0-flash":            { inputCostPer1M: 0.1, outputCostPer1M: 0.4, speed: "ultrafast", accuracy: "high",    tags: ["fast","cheap","vision"] },
  "gemini-2.0-flash-lite":       { inputCostPer1M: 0.075,outputCostPer1M:0.3, speed: "ultrafast", accuracy: "medium",  tags: ["ultra-cheap","fast"] },
};

// ── 获取 OpenAI 模型列表 ────────────────────────────────────────────────────
async function fetchOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.log("⚠ OPENAI_API_KEY not set, skipping"); return []; }

  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const { data } = await res.json();

  // 只保留主流 chat 模型
  const WHITELIST = /^(gpt-4|gpt-3\.5-turbo|o1|o3|o4|chatgpt-4o)/;
  return data
    .filter((m) => WHITELIST.test(m.id) && !m.id.includes("instruct") && !m.id.includes("realtime"))
    .map((m) => ({
      id:            m.id,
      name:          toDisplayName(m.id, "OpenAI"),
      provider:      "OpenAI",
      apiProvider:   "openai",
      contextWindow: 128000,
      maxOutput:     16384,
      inputCostPer1M:  META_MAP[m.id]?.inputCostPer1M  ?? 0,
      outputCostPer1M: META_MAP[m.id]?.outputCostPer1M ?? 0,
      speed:         META_MAP[m.id]?.speed    ?? "medium",
      accuracy:      META_MAP[m.id]?.accuracy ?? "high",
      supportsStreaming: true,
      isLatest:      false,
      tags:          META_MAP[m.id]?.tags ?? [],
      releaseDate:   new Date(m.created * 1000).toISOString().slice(0, 10),
    }));
}

// ── 获取 Anthropic 模型列表 ────────────────────────────────────────────────
async function fetchAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.log("⚠ ANTHROPIC_API_KEY not set, skipping"); return []; }

  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
    },
  });
  const { data } = await res.json();
  return (data ?? []).map((m) => ({
    id:            m.id,
    name:          m.display_name ?? toDisplayName(m.id, "Anthropic"),
    provider:      "Anthropic",
    apiProvider:   "anthropic",
    contextWindow: 200000,
    maxOutput:     m.id.includes("haiku") ? 8096 : 16000,
    inputCostPer1M:  META_MAP[m.id]?.inputCostPer1M  ?? 0,
    outputCostPer1M: META_MAP[m.id]?.outputCostPer1M ?? 0,
    speed:         META_MAP[m.id]?.speed    ?? "medium",
    accuracy:      META_MAP[m.id]?.accuracy ?? "high",
    supportsStreaming: true,
    isLatest:      false,
    tags:          META_MAP[m.id]?.tags ?? [],
    releaseDate:   m.created_at?.slice(0, 10) ?? "",
  }));
}

// ── 获取 Google Gemini 模型列表 ────────────────────────────────────────────
async function fetchGoogle() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) { console.log("⚠ GOOGLE_API_KEY not set, skipping"); return []; }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
  );
  const { models } = await res.json();
  return (models ?? [])
    .filter((m) => m.name.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => {
      const id = m.name.replace("models/", "");
      return {
        id,
        name:          m.displayName ?? toDisplayName(id, "Google"),
        provider:      "Google",
        apiProvider:   "google",
        contextWindow: m.inputTokenLimit ?? 1048576,
        maxOutput:     m.outputTokenLimit ?? 8192,
        inputCostPer1M:  META_MAP[id]?.inputCostPer1M  ?? 0,
        outputCostPer1M: META_MAP[id]?.outputCostPer1M ?? 0,
        speed:         META_MAP[id]?.speed    ?? "fast",
        accuracy:      META_MAP[id]?.accuracy ?? "high",
        supportsStreaming: true,
        isLatest:      false,
        tags:          META_MAP[id]?.tags ?? ["vision"],
        releaseDate:   "",
      };
    });
}

// ── 工具函数：把 model id 转成可读名称 ────────────────────────────────────
function toDisplayName(id, provider) {
  return id
    .replace(/-\d{8}$/, "")          // 去掉日期后缀
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── 标记最新模型（每个 provider 的最新发布） ──────────────────────────────
function markLatest(models) {
  const byProvider = {};
  for (const m of models) {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m);
  }
  for (const list of Object.values(byProvider)) {
    const sorted = list
      .filter((m) => m.releaseDate)
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    if (sorted[0]) sorted[0].isLatest = true;
  }
  return models;
}

// ── 保留现有 models.json 中 API 无法获取的模型（Groq/xAI/Mistral 等）────
function mergeWithExisting(fetched) {
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(MODELS_PATH, "utf8"));
  } catch { /* file might not exist */ }

  const NON_API_PROVIDERS = ["groq", "xai", "mistral", "deepseek", "zhipu", "moonshot", "qwen", "baidu", "ollama"];
  const manual = existing.filter((m) => NON_API_PROVIDERS.includes(m.apiProvider));

  // 合并：API 获取的 + 手动维护的，去重
  const combined = [...fetched, ...manual];
  const seen = new Set();
  return combined.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Fetching latest models from APIs...");

  const [openai, anthropic, google] = await Promise.allSettled([
    fetchOpenAI(),
    fetchAnthropic(),
    fetchGoogle(),
  ]);

  const fetched = [
    ...(openai.status === "fulfilled"    ? openai.value    : []),
    ...(anthropic.status === "fulfilled" ? anthropic.value : []),
    ...(google.status === "fulfilled"    ? google.value    : []),
  ];

  console.log(`✅ Fetched: OpenAI=${openai.value?.length ?? 0}, Anthropic=${anthropic.value?.length ?? 0}, Google=${google.value?.length ?? 0}`);

  const merged = mergeWithExisting(fetched);
  const final  = markLatest(merged);

  // 按 provider 分组排序
  const ORDER = ["openai","anthropic","google","groq","xai","mistral","deepseek","zhipu","moonshot","qwen","baidu","ollama"];
  final.sort((a, b) => {
    const ai = ORDER.indexOf(a.apiProvider);
    const bi = ORDER.indexOf(b.apiProvider);
    if (ai !== bi) return ai - bi;
    return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
  });

  writeFileSync(MODELS_PATH, JSON.stringify(final, null, 2));
  console.log(`✅ Written ${final.length} models to public/models.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
