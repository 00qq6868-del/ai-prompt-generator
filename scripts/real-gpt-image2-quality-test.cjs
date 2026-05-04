#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "gpt-image2-real-tests");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const eq = part.indexOf("=");
    if (eq >= 0) {
      args[part.slice(2, eq)] = part.slice(eq + 1);
      continue;
    }
    const key = part.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function bool(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").toLowerCase());
}

function csv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeOpenAiBase(input) {
  const parsed = new URL(input);
  let pathname = parsed.pathname.replace(/\/+$/, "");
  pathname = pathname
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/images\/generations$/i, "")
    .replace(/\/images\/edits$/i, "")
    .replace(/\/models$/i, "");
  if (!pathname.endsWith("/v1")) pathname = `${pathname}/v1`;
  parsed.pathname = pathname.replace(/\/{2,}/g, "/");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function endpoint(baseUrl, suffix) {
  return `${baseUrl.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}

function readJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = readJsonSafe(text);
  if (!res.ok) {
    const message = data?.error?.message || data?.error || text.slice(0, 500);
    throw new Error(`${res.status} ${res.statusText}: ${message}`);
  }
  return data ?? {};
}

async function checkPage(url) {
  try {
    const res = await fetch(url, { method: "GET" });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function listRelayModels(baseUrl, apiKey) {
  try {
    const data = await fetchJson(endpoint(baseUrl, "/models"), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const ids = Array.isArray(data.data)
      ? data.data.map((item) => item.id).filter(Boolean)
      : [];
    return { ok: true, ids };
  } catch (error) {
    return { ok: false, ids: [], error: error.message };
  }
}

function chooseAvailable(requested, availableIds, fallback) {
  if (!availableIds.length) return requested.length ? requested : fallback;
  const available = new Set(availableIds);
  const chosen = requested.filter((id) => available.has(id));
  return chosen.length ? chosen : fallback.filter((id) => available.has(id)).slice(0, 1);
}

function averagePromptScore(promptEvaluation) {
  const candidates = promptEvaluation?.candidates ?? [];
  const selectedId = promptEvaluation?.selectedCandidateId;
  const selected = candidates.find((item) => item.id === selectedId) ?? candidates[0];
  return selected?.averageScore ?? null;
}

async function generateOptimizedPrompt({
  appUrl,
  relayBaseUrl,
  apiKey,
  idea,
  language,
  targetModelId,
  generatorModelIds,
  evaluatorModelIds,
  availableModelIds,
}) {
  return fetchJson(endpoint(appUrl, "/api/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userIdea: idea,
      targetModelId,
      generatorModelId: generatorModelIds[0],
      generatorModelIds,
      evaluatorModelIds,
      language,
      maxTokens: 4096,
      stream: false,
      userKeys: {
        CUSTOM_BASE_URL: relayBaseUrl,
        CUSTOM_API_KEY: apiKey,
      },
      availableModelIds,
    }),
  });
}

async function generateImage({
  relayBaseUrl,
  apiKey,
  model,
  prompt,
  imageSize,
  quality,
  background,
  responseFormat,
}) {
  const body = {
    model,
    prompt,
    size: imageSize,
    quality,
    n: 1,
  };
  if (background) body.background = background;
  if (responseFormat) body.response_format = responseFormat;

  return fetchJson(endpoint(relayBaseUrl, "/images/generations"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function extractImageArtifact(imageData, timestamp) {
  const first = imageData?.data?.[0];
  if (!first) return null;
  if (first.b64_json) {
    const fileName = `gpt-image2-${timestamp}.png`;
    const filePath = path.join(REPORT_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(first.b64_json, "base64"));
    return { type: "b64_json", fileName, filePath };
  }
  if (first.url) {
    return { type: "url", url: first.url };
  }
  return { type: "unknown", rawKeys: Object.keys(first) };
}

async function judgeImageWithVision({
  relayBaseUrl,
  apiKey,
  judgeModel,
  userIdea,
  optimizedPrompt,
  imageArtifact,
}) {
  let imageUrl = imageArtifact?.url;
  if (!imageUrl && imageArtifact?.filePath) {
    const b64 = fs.readFileSync(imageArtifact.filePath, "base64");
    imageUrl = `data:image/png;base64,${b64}`;
  }
  if (!imageUrl) return null;

  const data = await fetchJson(endpoint(relayBaseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: judgeModel,
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You are a strict image quality evaluator. Return strict JSON only with scores from 0 to 100.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Evaluate whether this generated image satisfies the original user intent and optimized GPT Image 2 prompt. Return JSON: {\"overall\":0,\"intentFidelity\":0,\"promptAdherence\":0,\"composition\":0,\"textRendering\":0,\"commercialQuality\":0,\"issues\":[\"...\"],\"verdict\":\"...\"}\n\nOriginal user intent:\n" +
                userIdea +
                "\n\nOptimized prompt:\n" +
                optimizedPrompt,
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  const text = data?.choices?.[0]?.message?.content ?? "";
  return readJsonSafe(text) ?? { raw: text };
}

function writeReport(report, optimizedPrompt) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, `report-${report.timestamp}.json`);
  const mdPath = path.join(REPORT_DIR, `report-${report.timestamp}.md`);
  const promptPath = path.join(REPORT_DIR, `optimized-prompt-${report.timestamp}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(promptPath, optimizedPrompt, "utf8");

  const score = report.promptScore == null ? "无评分" : `${report.promptScore.toFixed(1)}/100`;
  const imageScore = report.imageJudge?.overall == null ? "未执行" : `${report.imageJudge.overall}/100`;
  const md = `# GPT Image 2 Real Quality Test

- Time: ${report.timestamp}
- App URL: ${report.appUrl}
- Relay Base URL: ${report.relayBaseUrl}
- API Key: ${report.maskedApiKey}
- Target model: ${report.targetModelId}
- Generator models: ${report.generatorModelIds.join(", ")}
- Evaluator models: ${report.evaluatorModelIds.join(", ") || "auto/none"}
- Prompt score: ${score}
- Image generation: ${report.imageGeneration?.ok ? "ok" : "not run or failed"}
- Image vision judge: ${imageScore}

## Original User Idea

${report.userIdea}

## Optimized GPT Image 2 Prompt

${optimizedPrompt}

## Prompt Evaluation Summary

${report.promptEvaluationSummary || "No prompt evaluation summary returned."}

## Image Result

${report.imageArtifact?.fileName ? `Saved image: ${report.imageArtifact.fileName}` : ""}
${report.imageArtifact?.url ? `Image URL: ${report.imageArtifact.url}` : ""}
${report.imageGeneration?.error ? `Image generation error: ${report.imageGeneration.error}` : ""}

## Manual Test

Open https://im.naapi.cc/ and paste the optimized prompt into Image Generate -> Prompt. Use:

- API Host: ${report.relayHostForImageMaker}
- Model: ${report.imageModel}
- Size: ${report.imageOptions.imageSize}
- Quality: ${report.imageOptions.quality}

## Files

- JSON report: ${path.basename(jsonPath)}
- Prompt text: ${path.basename(promptPath)}
`;
  fs.writeFileSync(mdPath, md, "utf8");
  return { jsonPath, mdPath, promptPath };
}

async function main() {
  loadDotEnv(path.join(ROOT, ".env.local"));
  const args = parseArgs(process.argv);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const rawRelayUrl =
    args.baseUrl ||
    process.env.CUSTOM_BASE_URL ||
    process.env.AIHUBMIX_BASE_URL ||
    process.env.NAAPI_BASE_URL ||
    "https://naapi.cc";
  const relayBaseUrl = normalizeOpenAiBase(rawRelayUrl);
  const relayHostForImageMaker = new URL(relayBaseUrl).origin;
  const apiKey =
    args.apiKey ||
    process.env.CUSTOM_API_KEY ||
    process.env.AIHUBMIX_API_KEY ||
    process.env.NAAPI_API_KEY ||
    "";

  if (!apiKey) {
    console.error("Missing API key. Set one of: CUSTOM_API_KEY, AIHUBMIX_API_KEY, NAAPI_API_KEY.");
    console.error("PowerShell example:");
    console.error('$env:CUSTOM_BASE_URL="https://naapi.cc"; $env:CUSTOM_API_KEY="sk-你的key"; npm run test:gpt-image2:real');
    process.exit(1);
  }

  const appUrl = (args.appUrl || process.env.APP_URL || "https://www.myprompt.asia").replace(/\/+$/, "");
  const targetModelId = args.target || process.env.TARGET_MODEL || "gpt-image-2";
  const imageModel = args.imageModel || process.env.IMAGE_MODEL || "gpt-image-2";
  const language = args.language || process.env.TEST_LANGUAGE || "zh";
  const idea =
    args.idea ||
    process.env.TEST_IDEA ||
    "为一款名叫「PromptForge」的 AI 提示词生成器制作一张高端科技感官网首屏海报。画面需要有深色背景、发光的提示词卡片、中文标题「让 AI 听懂你的想法」、清晰可读的小字说明、玻璃拟态界面、蓝紫色霓虹光、商业级构图。";
  const requestedGenerators = csv(
    args.generators ||
      process.env.GENERATOR_MODELS ||
      "gpt-5.5,claude-opus-4-7,gemini-3.1-pro-preview,deepseek-v4-pro,gpt-4o",
  ).slice(0, 6);
  const requestedEvaluators = csv(
    args.evaluators ||
      process.env.EVALUATOR_MODELS ||
      "gpt-5.5,claude-opus-4-7,gemini-3.1-pro-preview,o3,gpt-4o",
  ).slice(0, 6);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  console.log("[real-test] checking ImageMaker page...");
  const imageMakerPage = await checkPage("https://im.naapi.cc/");
  console.log(`[real-test] ImageMaker page: ${imageMakerPage.ok ? "ok" : "not ok"}`);

  console.log("[real-test] probing relay model list...");
  const relayModels = await listRelayModels(relayBaseUrl, apiKey);
  if (!relayModels.ok) console.warn(`[real-test] model probe failed: ${relayModels.error}`);
  else console.log(`[real-test] relay models: ${relayModels.ids.length}`);

  const generatorModelIds = chooseAvailable(requestedGenerators, relayModels.ids, requestedGenerators).slice(0, 6);
  const evaluatorModelIds = chooseAvailable(requestedEvaluators, relayModels.ids, requestedEvaluators).slice(0, 6);
  if (!generatorModelIds.length) {
    throw new Error("No generator model available after probing relay models.");
  }

  console.log(`[real-test] generating optimized GPT Image 2 prompt via ${appUrl}...`);
  const generated = await generateOptimizedPrompt({
    appUrl,
    relayBaseUrl,
    apiKey,
    idea,
    language,
    targetModelId,
    generatorModelIds,
    evaluatorModelIds,
    availableModelIds: relayModels.ids,
  });

  const optimizedPrompt = String(generated.optimizedPrompt || "").trim();
  if (!optimizedPrompt) throw new Error("The app returned an empty optimizedPrompt.");

  const promptEvaluation = generated.meta?.promptEvaluation;
  const promptScore = averagePromptScore(promptEvaluation);
  console.log(`[real-test] prompt score: ${promptScore == null ? "n/a" : promptScore.toFixed(1) + "/100"}`);

  const imageOptions = {
    imageSize: args.imageSize || process.env.IMAGE_SIZE || "1024x1024",
    quality: args.quality || process.env.IMAGE_QUALITY || "auto",
    background: args.background || process.env.IMAGE_BACKGROUND || "",
    responseFormat: args.responseFormat || process.env.IMAGE_RESPONSE_FORMAT || "b64_json",
  };

  let imageGeneration = { ok: false, skipped: true };
  let imageArtifact = null;
  if (bool(args.makeImage || process.env.MAKE_IMAGE || process.env.GENERATE_IMAGE)) {
    console.log("[real-test] generating real image through /v1/images/generations...");
    try {
      const imageData = await generateImage({
        relayBaseUrl,
        apiKey,
        model: imageModel,
        prompt: optimizedPrompt,
        imageSize: imageOptions.imageSize,
        quality: imageOptions.quality,
        background: imageOptions.background,
        responseFormat: imageOptions.responseFormat,
      });
      imageArtifact = extractImageArtifact(imageData, timestamp);
      imageGeneration = { ok: true, skipped: false, usage: imageData.usage ?? null };
      console.log(`[real-test] image generated: ${imageArtifact?.fileName || imageArtifact?.url || "response received"}`);
    } catch (error) {
      imageGeneration = { ok: false, skipped: false, error: error.message };
      console.warn(`[real-test] image generation failed: ${error.message}`);
    }
  }

  let imageJudge = null;
  const judgeImage = bool(args.judgeImage || process.env.JUDGE_IMAGE);
  if (judgeImage && imageArtifact) {
    const judgeModel = args.imageJudgeModel || process.env.IMAGE_JUDGE_MODEL || evaluatorModelIds[0] || generatorModelIds[0];
    console.log(`[real-test] judging generated image with ${judgeModel}...`);
    try {
      imageJudge = await judgeImageWithVision({
        relayBaseUrl,
        apiKey,
        judgeModel,
        userIdea: idea,
        optimizedPrompt,
        imageArtifact,
      });
      console.log(`[real-test] image judge score: ${imageJudge?.overall ?? "n/a"}`);
    } catch (error) {
      imageJudge = { error: error.message };
      console.warn(`[real-test] image judge failed: ${error.message}`);
    }
  }

  const report = {
    timestamp,
    appUrl,
    relayBaseUrl,
    relayHostForImageMaker,
    maskedApiKey: maskSecret(apiKey),
    imageMakerPage,
    relayModelProbe: {
      ok: relayModels.ok,
      count: relayModels.ids.length,
      error: relayModels.error,
    },
    targetModelId,
    imageModel,
    generatorModelIds,
    evaluatorModelIds,
    userIdea: idea,
    optimizedPrompt,
    promptScore,
    promptEvaluationSummary: generated.meta?.promptEvaluation?.summary || generated.meta?.reviewSummary || "",
    promptEvaluation,
    imageOptions,
    imageGeneration,
    imageArtifact,
    imageJudge,
    rawGenerateStats: generated.stats,
    rawGenerateMeta: generated.meta,
  };

  const files = writeReport(report, optimizedPrompt);
  console.log("[real-test] done");
  console.log(`[real-test] report: ${files.mdPath}`);
  console.log(`[real-test] prompt: ${files.promptPath}`);
}

main().catch((error) => {
  console.error(`[real-test] failed: ${error.message}`);
  process.exit(1);
});
