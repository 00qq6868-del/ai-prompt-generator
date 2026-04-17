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
  "gpt-4o":           { i: 2.5,  o: 10,  s: "fast",      a: "supreme", t: ["vision","code"] },
  "gpt-4o-mini":      { i: 0.15, o: 0.6, s: "ultrafast", a: "high",    t: ["cheap","fast"] },
  "o3":               { i: 10,   o: 40,  s: "slow",      a: "supreme", t: ["reasoning","math"] },
  "o4-mini":          { i: 1.1,  o: 4.4, s: "fast",      a: "supreme", t: ["reasoning","cheap"] },
  "claude-opus-4-5":  { i: 15,   o: 75,  s: "slow",      a: "supreme", t: ["reasoning","vision"] },
  "claude-sonnet-4-5":{ i: 3,    o: 15,  s: "fast",      a: "supreme", t: ["vision","code"] },
  "claude-3-5-haiku-20241022": { i: 0.8, o: 4, s: "ultrafast", a: "high", t: ["fast","cheap"] },
  "gemini-2.0-flash": { i: 0.1,  o: 0.4, s: "ultrafast", a: "high",    t: ["fast","cheap","vision"] },
};

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

  // Only keep chat models, skip embeddings/whisper/tts/image
  const SKIP = /embed|whisper|tts|dall-e|moderation|text-davinci|babbage|ada|curie|search|edit|insert|similarity|code-davinci|audio|realtime/i;

  return data
    .filter((m) => !SKIP.test(m.id))
    .map((m) => {
      // Detect provider from model ID prefix
      let provInfo = { provider: "Other", apiProvider: "aihubmix" };
      for (const [prefix, info] of Object.entries(PROVIDER_MAP)) {
        if (m.id.startsWith(prefix)) { provInfo = info; break; }
      }

      const meta = META[m.id];
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
        releaseDate:   m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : "",
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
      const meta = META[id];
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
      const meta = META[m.id];
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
