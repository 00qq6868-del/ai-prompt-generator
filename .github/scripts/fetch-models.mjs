// .github/scripts/fetch-models.mjs
// 自动从各厂商 API 拉取最新模型列表，合并到 public/models.json
// 运行环境：Node.js 22+，GitHub Actions

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = join(__dir, "../../public/models.json");

// ── 价格/速度 元数据（API 不提供这些）──────────────────────────────────────
const META = {
  // ── OpenAI ──────────────────────────────────────────────────
  "gpt-4o":                     { i: 2.5,  o: 10,   s: "fast",      a: "supreme", t: ["vision","code"],              d: "2024-05-13" },
  "gpt-4o-mini":                { i: 0.15, o: 0.6,  s: "ultrafast", a: "high",    t: ["cheap","fast"],               d: "2024-07-18" },
  "gpt-4.1":                    { i: 2,    o: 8,    s: "fast",      a: "supreme", t: ["vision","code"],              d: "2025-04-14" },
  "gpt-4.1-mini":               { i: 0.4,  o: 1.6,  s: "ultrafast", a: "high",    t: ["cheap","fast"],               d: "2025-04-14" },
  "gpt-4.1-nano":               { i: 0.1,  o: 0.4,  s: "ultrafast", a: "medium",  t: ["ultra-cheap","fast"],          d: "2025-04-14" },
  "gpt-4-turbo":                { i: 10,   o: 30,   s: "fast",      a: "supreme", t: ["vision","legacy"],             d: "2024-04-09" },
  "gpt-3.5-turbo":              { i: 0.5,  o: 1.5,  s: "ultrafast", a: "medium",  t: ["cheap","legacy"],              d: "2023-03-01" },
  "o1":                         { i: 15,   o: 60,   s: "slow",      a: "supreme", t: ["reasoning","math"],            d: "2024-12-17" },
  "o1-mini":                    { i: 1.1,  o: 4.4,  s: "fast",      a: "high",    t: ["reasoning","cheap"],           d: "2024-09-12" },
  "o3":                         { i: 10,   o: 40,   s: "slow",      a: "supreme", t: ["reasoning","math"],            d: "2025-04-16" },
  "o3-mini":                    { i: 1.1,  o: 4.4,  s: "fast",      a: "supreme", t: ["reasoning","cheap"],           d: "2025-01-31" },
  "o4-mini":                    { i: 1.1,  o: 4.4,  s: "fast",      a: "supreme", t: ["reasoning","cheap"],           d: "2025-04-16" },
  // ── Anthropic ───────────────────────────────────────────────
  "claude-opus-4-5":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-02-24" },
  "claude-opus-4-7":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-05-01" },
  "claude-opus-4-6":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-04-01" },
  "claude-sonnet-4-5":          { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2025-02-24" },
  "claude-sonnet-4-6":          { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2025-04-01" },
  "claude-3-5-sonnet-20241022": { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2024-10-22" },
  "claude-3-7-sonnet-20250219": { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code","thinking"],    d: "2025-02-19" },
  "claude-3-5-haiku-20241022":  { i: 0.8,  o: 4,    s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2024-10-22" },
  "claude-3-haiku-20240307":    { i: 0.25, o: 1.25, s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2024-03-07" },
  "claude-3-opus-20240229":     { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning"],                   d: "2024-02-29" },
  // ── Google ──────────────────────────────────────────────────
  "gemini-2.5-pro":             { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning","long-context"], d: "2025-03-25" },
  "gemini-2.5-flash":           { i: 0.15, o: 0.6,  s: "fast",      a: "high",    t: ["fast","cheap","vision"],       d: "2025-04-17" },
  "gemini-2.0-flash":           { i: 0.1,  o: 0.4,  s: "ultrafast", a: "high",    t: ["fast","cheap","vision"],       d: "2025-02-05" },
  "gemini-2.0-flash-lite":      { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["ultra-cheap","fast"],          d: "2025-02-05" },
  "gemini-1.5-pro":             { i: 1.25, o: 5,    s: "medium",    a: "high",    t: ["long-context","vision"],       d: "2024-05-14" },
  "gemini-1.5-flash":           { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["cheap","fast"],                d: "2024-05-14" },
  // ── xAI ─────────────────────────────────────────────────────
  "grok-3":                     { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["reasoning","real-time-web"],   d: "2025-02-17" },
  "grok-3-mini":                { i: 0.3,  o: 0.5,  s: "ultrafast", a: "high",    t: ["cheap","fast"],                d: "2025-02-17" },
  // ── Meta Llama ──────────────────────────────────────────────
  "llama-3.3-70b":              { i: 0.59, o: 0.79, s: "ultrafast", a: "high",    t: ["open-source","fast"],          d: "2024-12-06" },
  "llama-3.1-8b-instant":       { i: 0.05, o: 0.08, s: "ultrafast", a: "medium",  t: ["open-source","ultra-cheap"],   d: "2024-07-23" },
  "llama-4-scout":              { i: 0.11, o: 0.34, s: "ultrafast", a: "high",    t: ["open-source","multimodal"],    d: "2025-04-05" },
  "llama-4-maverick":           { i: 0.22, o: 0.88, s: "fast",      a: "supreme", t: ["open-source","flagship"],      d: "2025-04-05" },
  // ── DeepSeek ────────────────────────────────────────────────
  "deepseek-chat":              { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math","cheap"],         d: "2025-01-20" },
  "deepseek-reasoner":          { i: 0.55, o: 2.19, s: "medium",    a: "supreme", t: ["reasoning","math","code"],     d: "2025-01-20" },
  "deepseek-v3":                { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-03-15" },
  "deepseek-r1":                { i: 0.55, o: 2.19, s: "medium",    a: "supreme", t: ["reasoning","math"],            d: "2025-01-20" },
  // ── Mistral ─────────────────────────────────────────────────
  "mistral-large":              { i: 2,    o: 6,    s: "fast",      a: "high",    t: ["multilingual","code"],         d: "2024-11-18" },
  "mistral-small":              { i: 0.1,  o: 0.3,  s: "ultrafast", a: "medium",  t: ["cheap","fast"],                d: "2024-09-18" },
  "codestral":                  { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["code"],                        d: "2024-05-29" },
  // ── 国产模型 ─────────────────────────────────────────────────
  "glm-4-plus":                 { i: 0.7,  o: 0.7,  s: "fast",      a: "high",    t: ["chinese","code","vision"],     d: "2024-08-01" },
  "glm-4-air":                  { i: 0.14, o: 0.14, s: "ultrafast", a: "medium",  t: ["chinese","cheap"],             d: "2024-06-01" },
  "glm-z1-flash":               { i: 0.05, o: 0.05, s: "ultrafast", a: "medium",  t: ["chinese","ultra-cheap"],       d: "2025-02-01" },
  "qwen-max":                   { i: 0.4,  o: 1.2,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-01-15" },
  "qwen-plus":                  { i: 0.08, o: 0.24, s: "fast",      a: "medium",  t: ["chinese","cheap"],             d: "2025-01-15" },
  "qwen-turbo":                 { i: 0.05, o: 0.15, s: "ultrafast", a: "medium",  t: ["chinese","cheap","fast"],      d: "2025-01-15" },
  "moonshot-v1-128k":           { i: 2,    o: 2,    s: "medium",    a: "high",    t: ["chinese","long-context"],      d: "2024-03-01" },
  "moonshot-v1-8k":             { i: 0.5,  o: 0.5,  s: "fast",      a: "high",    t: ["chinese","cheap"],             d: "2024-03-01" },
  "ernie-4.0-8k":               { i: 0.12, o: 0.12, s: "medium",    a: "high",    t: ["chinese","search"],            d: "2024-06-01" },
  "step-2-16k":                 { i: 0.38, o: 1.14, s: "fast",      a: "high",    t: ["chinese"],                     d: "2024-09-01" },
};

// 前缀匹配回退：精确 ID 优先，否则匹配最长前缀
function lookupMeta(id) {
  if (META[id]) return META[id];
  const keys = Object.keys(META).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (id.startsWith(k)) return META[k];
  }
  return null;
}

// ── AihubMix（聚合平台，一个Key拉取所有模型）─────────────────────────────
async function fetchAihubmix() {
  const key = process.env.AIHUBMIX_API_KEY;
  if (!key) { console.log("⚠ AIHUBMIX_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching AihubMix models (all providers)...");
  const res = await fetch("https://aihubmix.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.log(`❌ AihubMix API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  console.log(`✅ AihubMix: found ${data.length} models`);

  // Map known provider prefixes
  const PROVIDER_MAP = {
    "gpt-":     { provider: "OpenAI",     apiProvider: "aihubmix" },
    "o1":       { provider: "OpenAI",     apiProvider: "aihubmix" },
    "o3":       { provider: "OpenAI",     apiProvider: "aihubmix" },
    "o4":       { provider: "OpenAI",     apiProvider: "aihubmix" },
    "claude-":  { provider: "Anthropic",  apiProvider: "aihubmix" },
    "gemini-":  { provider: "Google",     apiProvider: "aihubmix" },
    "llama":    { provider: "Meta",       apiProvider: "aihubmix" },
    "grok-":    { provider: "xAI",        apiProvider: "aihubmix" },
    "mistral":  { provider: "Mistral AI", apiProvider: "aihubmix" },
    "deepseek": { provider: "DeepSeek",   apiProvider: "aihubmix" },
    "glm-":     { provider: "智谱AI",     apiProvider: "aihubmix" },
    "qwen":     { provider: "阿里巴巴",   apiProvider: "aihubmix" },
  };

  // Skip only truly useless models (old deprecated ones, internal tools)
  const SKIP = /moderation|text-davinci|babbage-002|ada-002|curie|search|edit|insert|similarity|code-davinci|chatgpt-4o-latest|auto|rerank$/i;

  // Classify model by category based on ID
  function classifyModel(id) {
    const lower = id.toLowerCase();
    if (/dall-e|flux|sd-|stable-diffusion|image-gen|midjourney|seedance|cogview|wanx|-image-|-image$|gpt-image|imagen|ideogram|playground-v|recraft|kolors|hidream|hunyuan-image/.test(lower)) return "image";
    if (/sora|wan2|video|luma|runway|vidu|kling|t2v|i2v|hailuo|mochi|ltx-video/.test(lower)) return "video";
    if (/tts|audio-gen|speech-gen|voice-gen|fish-audio|cosyvoice|chattts/.test(lower)) return "tts";
    if (/whisper|stt|audio-transcri|speech-to|paraformer/.test(lower)) return "stt";
    if (/embed|bge-|text-embedding|e5-|jina-embed/.test(lower)) return "embedding";
    if (/ocr|document-ai|vision-extract|doc-parse/.test(lower)) return "ocr";
    if (/rerank|reranker/.test(lower)) return "other";
    return "text";
  }

  // Expand provider map to cover more prefixes
  const EXTRA_PROVIDERS = {
    "step-":     "阶跃星辰",
    "minimax":   "MiniMax",
    "doubao":    "字节豆包",
    "ernie":     "百度",
    "moonshot":  "月之暗面",
    "yi-":       "零一万物",
    "abab":      "MiniMax",
    "cohere":    "Cohere",
    "gemma":     "Google",
    "phi-":      "Microsoft",
    "command":   "Cohere",
    "coding-glm":"智谱AI",
    "cc-glm":    "智谱AI",
    "zai-glm":   "智谱AI",
    "glm-":      "智谱AI",
    "cc-minimax":"MiniMax",
    "mm-minimax":"MiniMax",
    "coding-minimax":"MiniMax",
    "DeepSeek":  "DeepSeek",
    "deepseek":  "DeepSeek",
  };

  return data
    .filter((m) => !SKIP.test(m.id))
    .map((m) => {
      // Detect provider from model ID prefix
      let provInfo = { provider: "Other", apiProvider: "aihubmix" };
      for (const [prefix, info] of Object.entries(PROVIDER_MAP)) {
        if (m.id.startsWith(prefix)) { provInfo = info; break; }
      }
      // Extra provider detection for non-standard prefixes
      if (provInfo.provider === "Other") {
        for (const [prefix, name] of Object.entries(EXTRA_PROVIDERS)) {
          if (m.id.toLowerCase().startsWith(prefix.toLowerCase()) || m.id.startsWith(prefix)) {
            provInfo = { provider: name, apiProvider: "aihubmix" };
            break;
          }
        }
      }

      const meta = lookupMeta(m.id);
      return {
        id:            m.id,
        name:          m.id,
        provider:      provInfo.provider,
        apiProvider:   provInfo.apiProvider,
        contextWindow: 128000,
        maxOutput:     16384,
        inputCostPer1M:  meta?.i ?? 0,
        outputCostPer1M: meta?.o ?? 0,
        speed:         meta?.s ?? "medium",
        accuracy:      meta?.a ?? "high",
        supportsStreaming: true,
        isLatest:      false,
        tags:          meta?.t ?? [],
        releaseDate:   meta?.d ?? "",
        category:      classifyModel(m.id),
      };
    });
}

// ── Google Gemini（你有这个 Key）──────────────────────────────────────────
async function fetchGoogle() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) { console.log("⚠ GOOGLE_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching Google models...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
  );

  if (!res.ok) {
    console.log(`❌ Google API error: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(text.slice(0, 300));
    return [];
  }

  const json = await res.json();
  const models = json.models ?? [];
  console.log(`✅ Google: found ${models.length} models`);

  return models
    .filter((m) => m.name?.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => {
      const id = m.name.replace("models/", "");
      const meta = lookupMeta(id);
      return {
        id,
        name:          m.displayName ?? id,
        provider:      "Google",
        apiProvider:   "google",
        contextWindow: m.inputTokenLimit ?? 1048576,
        maxOutput:     m.outputTokenLimit ?? 8192,
        inputCostPer1M:  meta?.i ?? 0,
        outputCostPer1M: meta?.o ?? 0,
        speed:         meta?.s ?? "fast",
        accuracy:      meta?.a ?? "high",
        supportsStreaming: true,
        isLatest:      false,
        tags:          meta?.t ?? [],
        releaseDate:   "",
      };
    });
}

// ── OpenAI（可选）──────────────────────────────────────────────────────────
async function fetchOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.log("⚠ OPENAI_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching OpenAI models...");
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.log(`❌ OpenAI API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  const KEEP = /^(gpt-4|o1|o3|o4)/;

  return data
    .filter((m) => KEEP.test(m.id) && !m.id.includes("instruct") && !m.id.includes("realtime") && !m.id.includes("audio"))
    .map((m) => {
      const meta = lookupMeta(m.id);
      return {
        id:            m.id,
        name:          m.id,
        provider:      "OpenAI",
        apiProvider:   "openai",
        contextWindow: 128000,
        maxOutput:     16384,
        inputCostPer1M:  meta?.i ?? 0,
        outputCostPer1M: meta?.o ?? 0,
        speed:         meta?.s ?? "medium",
        accuracy:      meta?.a ?? "high",
        supportsStreaming: true,
        isLatest:      false,
        tags:          meta?.t ?? [],
        releaseDate:   new Date(m.created * 1000).toISOString().slice(0, 10),
      };
    });
}

// ── Anthropic（可选）─────────────────────────────────────────────────────
async function fetchAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.log("⚠ ANTHROPIC_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching Anthropic models...");
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });

  if (!res.ok) {
    console.log(`❌ Anthropic API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  return data.map((m) => {
    const meta = META[m.id];
    return {
      id:            m.id,
      name:          m.display_name ?? m.id,
      provider:      "Anthropic",
      apiProvider:   "anthropic",
      contextWindow: 200000,
      maxOutput:     16000,
      inputCostPer1M:  meta?.i ?? 0,
      outputCostPer1M: meta?.o ?? 0,
      speed:         meta?.s ?? "medium",
      accuracy:      meta?.a ?? "high",
      supportsStreaming: true,
      isLatest:      false,
      tags:          meta?.t ?? [],
      releaseDate:   m.created_at?.slice(0, 10) ?? "",
    };
  });
}

// ── 合并：API 获取的 + 现有手动维护的 ─────────────────────────────────────
function mergeWithExisting(fetched) {
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(MODELS_PATH, "utf8"));
    console.log(`📄 Existing models.json: ${existing.length} models`);
  } catch (e) {
    console.log("⚠ Could not read existing models.json:", e.message);
  }

  // 不通过 API 获取的平台，保留手动维护的数据
  const MANUAL = new Set(["groq","xai","mistral","deepseek","zhipu","moonshot","qwen","baidu","ollama"]);
  const manual = existing.filter((m) => MANUAL.has(m.apiProvider));

  // 去重合并
  const combined = [...fetched, ...manual];
  const seen = new Set();
  return combined.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// ── 标记每个 provider 最新发布的模型 ────────────────────────────────────
function markLatest(models) {
  const byProvider = {};
  for (const m of models) {
    m.isLatest = false; // reset
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m);
  }
  for (const list of Object.values(byProvider)) {
    const sorted = list.filter((m) => m.releaseDate).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    if (sorted[0]) sorted[0].isLatest = true;
  }
  return models;
}

// ── 主流程 ──────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Model auto-updater starting...\n");

  const results = await Promise.allSettled([
    fetchAihubmix(),
    fetchGoogle(),
    fetchOpenAI(),
    fetchAnthropic(),
  ]);

  const fetched = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      fetched.push(...r.value);
    } else if (r.status === "rejected") {
      console.log("❌ Fetch failed:", r.reason?.message ?? r.reason);
    }
  }

  console.log(`\n📊 Total fetched from APIs: ${fetched.length}`);

  const merged = mergeWithExisting(fetched);
  const final  = markLatest(merged);

  // 按 provider 排序
  const ORDER = ["aihubmix","openai","anthropic","google","groq","xai","mistral","deepseek","zhipu","moonshot","qwen","baidu","ollama"];
  final.sort((a, b) => {
    const ai = ORDER.indexOf(a.apiProvider);
    const bi = ORDER.indexOf(b.apiProvider);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
  });

  writeFileSync(MODELS_PATH, JSON.stringify(final, null, 2) + "\n");
  console.log(`\n✅ Done! Written ${final.length} models to public/models.json`);
}

main().catch((e) => {
  console.error("💥 Fatal error:", e);
  process.exit(1);
});
