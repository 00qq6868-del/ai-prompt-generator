#!/usr/bin/env node

const BASE_URL = (process.env.PRODUCTION_BASE_URL || "https://www.myprompt.asia").replace(/\/+$/, "");
const SKIP_GENERATE = process.env.SMOKE_SKIP_GENERATE === "1";

function log(message) {
  console.log(`[smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${url} did not return JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${text.slice(0, 300)}`);
  }

  return data;
}

function categoryCounts(models) {
  const counts = {};
  for (const model of models) {
    const category = model.category || "text";
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

function getGenerateCandidates(models) {
  const byId = new Map(models.map((m) => [m.id, m]));
  const candidates = [
    {
      name: "Google Gemini",
      keyName: "GOOGLE_API_KEY",
      key: process.env.GOOGLE_API_KEY,
      modelId: "gemini-2.0-flash",
      userKeys: () => ({ GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }),
    },
    {
      name: "Groq",
      keyName: "GROQ_API_KEY",
      key: process.env.GROQ_API_KEY || process.env.GROQ,
      modelId: "llama-3.1-8b-instant",
      userKeys: () => ({ GROQ_API_KEY: process.env.GROQ_API_KEY || process.env.GROQ }),
    },
    {
      name: "AihubMix",
      keyName: "AIHUBMIX_API_KEY",
      key: process.env.AIHUBMIX_API_KEY,
      modelId: "gpt-4o-mini",
      userKeys: () => ({ AIHUBMIX_API_KEY: process.env.AIHUBMIX_API_KEY }),
    },
  ];

  return candidates.filter((candidate) => candidate.key && byId.has(candidate.modelId));
}

function summarizeError(error) {
  return String(error?.message || error)
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

async function smokeGenerate(models, generateConfig) {
  log(`real generation using ${generateConfig.name} (${generateConfig.modelId}); key is present but never printed`);
  const res = await fetchWithTimeout(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userIdea: "把这句话优化成一个清晰的产品卖点提示词：AI 提示词生成器可以帮新手写出更好的 prompt。",
      targetModelId: models.some((m) => m.id === "gpt-4o") ? "gpt-4o" : generateConfig.modelId,
      generatorModelId: generateConfig.modelId,
      language: "zh",
      maxTokens: 512,
      userKeys: generateConfig.userKeys(),
      stream: true,
    }),
  }, 90_000);

  const text = await res.clone().text().catch(() => "");
  assert(res.ok, `/api/generate returned ${res.status}: ${text.slice(0, 300)}`);
  assert((res.headers.get("content-type") || "").includes("text/event-stream"), "/api/generate did not return SSE");

  const { chunks, donePayload } = await parseSSE(res);
  const finalText = donePayload?.optimizedPrompt || chunks;
  assert(typeof finalText === "string" && finalText.trim().length >= 30, "generation returned an empty/short prompt");
  assert(donePayload?.stats, "generation did not return final stats");
  log(`generation ok: provider=${generateConfig.name}, chars=${finalText.trim().length}, latencyMs=${donePayload.stats.latencyMs}`);
}

async function parseSSE(res) {
  assert(res.body, "SSE response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunks = "";
  let donePayload = null;
  let errorPayload = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6);
      if (!raw || raw === "[DONE]") continue;

      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      if (event.t === "chunk" && typeof event.c === "string") {
        chunks += event.c;
      } else if (event.t === "done") {
        donePayload = event.data;
      } else if (event.t === "error") {
        errorPayload = event.error || "unknown SSE error";
      }
    }
  }

  if (errorPayload) {
    throw new Error(`SSE error event: ${errorPayload}`);
  }

  return { chunks, donePayload };
}

async function main() {
  log(`base url: ${BASE_URL}`);

  const homepage = await fetchWithTimeout(`${BASE_URL}/`);
  assert(homepage.ok, `homepage returned ${homepage.status}`);
  log("homepage ok");

  const modelsData = await readJson(`${BASE_URL}/api/models?smoke=${Date.now()}`);
  const models = Array.isArray(modelsData) ? modelsData : modelsData.models;
  assert(Array.isArray(models), "/api/models did not return a model array");
  assert(models.length >= 200, `/api/models returned too few models: ${models.length}`);
  assert(models.some((m) => m.id === "gpt-5.5"), "/api/models missing gpt-5.5");
  assert(models.some((m) => m.id === "gpt-image-2"), "/api/models missing gpt-image-2");
  assert(models.some((m) => m.id === "deepseek-v4-pro"), "/api/models missing deepseek-v4-pro");
  assert(models.some((m) => m.id === "gemini-3.1-pro-preview"), "/api/models missing gemini-3.1-pro-preview");
  assert(models.some((m) => m.id === "claude-opus-4-7"), "/api/models missing claude-opus-4-7");

  const counts = categoryCounts(models);
  assert((counts.text || 0) >= 1, "/api/models missing text models");
  assert((counts.image || 0) >= 1, "/api/models missing image models");
  assert((counts.video || 0) >= 1, "/api/models missing video models");
  assert((counts.tts || 0) >= 1, "/api/models missing tts models");
  log(`models ok: total=${models.length}, categories=${JSON.stringify(counts)}`);

  const analytics = await readJson(`${BASE_URL}/api/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        name: "api_call",
        value: 1,
        meta: { endpoint: "/smoke", success: 1, status: 200 },
        ts: Date.now(),
      },
    ]),
  });
  assert(analytics.ok === true, "/api/analytics did not accept a valid metric batch");
  log(`analytics ok: sink=${analytics.sink || "unknown"}`);

  const aihubKey = process.env.AIHUBMIX_API_KEY;
  if (aihubKey && process.env.SMOKE_PROBE_RELAY !== "0") {
    const probe = await readJson(`${BASE_URL}/api/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: process.env.CUSTOM_BASE_URL || "https://aihubmix.com/v1",
        apiKey: aihubKey,
      }),
    });
    assert(Array.isArray(probe.models), "/api/probe did not return models");
    assert(probe.models.length > 0, "/api/probe returned zero models");
    log(`probe ok: total=${probe.total || probe.models.length}`);
  } else {
    log("probe skipped: AIHUBMIX_API_KEY not configured");
  }

  if (SKIP_GENERATE) {
    log("real generation skipped by SMOKE_SKIP_GENERATE=1");
    return;
  }

  const generateCandidates = getGenerateCandidates(models);
  assert(
    generateCandidates.length > 0,
    "No usable generation secret found. Configure GOOGLE_API_KEY, GROQ_API_KEY/GROQ, or AIHUBMIX_API_KEY.",
  );

  const failures = [];
  for (const candidate of generateCandidates) {
    try {
      await smokeGenerate(models, candidate);
      return;
    } catch (error) {
      failures.push(`${candidate.name}: ${summarizeError(error)}`);
      log(`generation failed with ${candidate.name}; trying next candidate`);
    }
  }

  throw new Error(`All generation candidates failed: ${failures.join(" | ")}`);
}

main().catch((err) => {
  console.error(`[smoke] FAILED: ${err.message}`);
  process.exit(1);
});
