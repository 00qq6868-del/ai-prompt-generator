#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "gpt-image2-live-review");
const HOST = "127.0.0.1";
const DEFAULT_IDEA =
  "为一款名叫「PromptForge」的 AI 提示词生成器制作一张高端科技感官网首屏海报。画面需要有深色背景、发光的提示词卡片、中文标题「让 AI 听懂你的想法」、清晰可读的小字说明、玻璃拟态界面、蓝紫色霓虹光、商业级构图。";
const DEFAULT_GENERATORS = "gpt-5.5,claude-opus-4-7,gemini-3.1-pro-preview,deepseek-v4-pro,gpt-4o";
const DEFAULT_EVALUATORS = "gpt-5.5,claude-opus-4-7,gemini-3.1-pro-preview,o3,gpt-4o";
const DEFAULT_IMAGE_JUDGES = "gpt-4o,gemini-3.1-pro-preview,claude-opus-4-7,gpt-5.5";

fs.mkdirSync(REPORT_DIR, { recursive: true });

const runs = new Map();

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function text(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function csv(value) {
  return String(value || "")
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
  const parsed = new URL(input || "https://naapi.cc");
  let pathname = parsed.pathname.replace(/\/+$/, "");
  pathname = pathname
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/images\/generations$/i, "")
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

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const textBody = await res.text();
  let data = null;
  try {
    data = textBody ? JSON.parse(textBody) : {};
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error?.message || data?.error || textBody.slice(0, 500);
    throw new Error(`${res.status} ${res.statusText}: ${message}`);
  }
  return data || {};
}

function chooseAvailable(requested, availableIds, fallback) {
  if (!availableIds.length) return requested.length ? requested : fallback;
  const available = new Set(availableIds);
  const chosen = requested.filter((id) => available.has(id));
  return chosen.length ? chosen : fallback.filter((id) => available.has(id));
}

function averagePromptScore(promptEvaluation) {
  const candidates = promptEvaluation?.candidates || [];
  const selectedId = promptEvaluation?.selectedCandidateId;
  const selected = candidates.find((item) => item.id === selectedId) || candidates[0];
  return typeof selected?.averageScore === "number" ? selected.averageScore : null;
}

function extractJsonMaybe(textValue) {
  if (!textValue) return null;
  const cleaned = String(textValue)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function addLog(run, message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  run.logs.push(line);
  console.log(line);
}

function openBrowser(url) {
  const platform = process.platform;
  const command =
    platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
    child.unref();
  } catch (error) {
    console.warn(`Could not open browser automatically: ${error.message}`);
  }
}

function openFolder(folderPath) {
  try {
    if (process.platform === "win32") {
      spawn("explorer.exe", [folderPath], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [folderPath], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [folderPath], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Opening the folder is a convenience only.
  }
}

async function listRelayModels(relayBaseUrl, apiKey) {
  try {
    const data = await fetchJson(endpoint(relayBaseUrl, "/models"), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const ids = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
    return { ok: true, ids };
  } catch (error) {
    return { ok: false, ids: [], error: error.message };
  }
}

async function generateOptimizedPrompt(options) {
  const {
    appUrl,
    relayBaseUrl,
    apiKey,
    idea,
    language,
    targetModelId,
    generatorModelIds,
    evaluatorModelIds,
    availableModelIds,
  } = options;
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

async function generateImage({ relayBaseUrl, apiKey, model, prompt, imageSize, quality, responseFormat }) {
  return fetchJson(endpoint(relayBaseUrl, "/images/generations"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: imageSize,
      quality,
      n: 1,
      response_format: responseFormat,
    }),
  });
}

function saveImageArtifact(imageData, run) {
  const first = imageData?.data?.[0];
  if (!first) return null;
  if (first.b64_json) {
    const fileName = `gpt-image2-${run.id}.png`;
    const filePath = path.join(REPORT_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(first.b64_json, "base64"));
    return {
      type: "b64_json",
      fileName,
      filePath,
      browserUrl: `/artifact/${run.id}/image`,
    };
  }
  if (first.url) {
    return { type: "url", url: first.url, browserUrl: first.url };
  }
  return { type: "unknown", rawKeys: Object.keys(first) };
}

async function judgeImageWithModel({ relayBaseUrl, apiKey, judgeModel, userIdea, optimizedPrompt, imageArtifact }) {
  let imageUrl = imageArtifact?.url;
  if (!imageUrl && imageArtifact?.filePath) {
    const b64 = fs.readFileSync(imageArtifact.filePath, "base64");
    imageUrl = `data:image/png;base64,${b64}`;
  }
  if (!imageUrl) throw new Error("No image URL or local image data available for judging.");

  const data = await fetchJson(endpoint(relayBaseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: judgeModel,
      temperature: 0.1,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "You are a strict commercial AI image evaluator. Return JSON only. Use scores from 0 to 100.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Evaluate this generated image against the user's original request and the optimized GPT Image 2 prompt. Return exactly this JSON shape: {\"overall\":0,\"intentFidelity\":0,\"promptAdherence\":0,\"composition\":0,\"textRendering\":0,\"visualQuality\":0,\"commercialQuality\":0,\"issues\":[\"...\"],\"strengths\":[\"...\"],\"verdict\":\"...\"}\n\nOriginal request:\n" +
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

  const content = data?.choices?.[0]?.message?.content || "";
  return extractJsonMaybe(content) || { raw: content };
}

function writeRunFiles(run) {
  const report = run.result || {};
  const jsonPath = path.join(REPORT_DIR, `report-${run.id}.json`);
  const mdPath = path.join(REPORT_DIR, `report-${run.id}.md`);
  const promptPath = path.join(REPORT_DIR, `optimized-prompt-${run.id}.txt`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(promptPath, report.optimizedPrompt || "", "utf8");
  const aiImageScore =
    report.imageJudgeAverage == null ? "not available" : `${report.imageJudgeAverage.toFixed(1)}/100`;
  const md = `# GPT Image 2 Live Review

- Time: ${run.id}
- App URL: ${report.appUrl}
- Relay Base URL: ${report.relayBaseUrl}
- API Key: ${report.maskedApiKey}
- Target model: ${report.targetModelId}
- Image model: ${report.imageModel}
- Generator models: ${(report.generatorModelIds || []).join(", ")}
- Evaluator models: ${(report.evaluatorModelIds || []).join(", ")}
- Prompt score: ${report.promptScore == null ? "not available" : `${report.promptScore.toFixed(1)}/100`}
- AI image score average: ${aiImageScore}

## User Request

${report.userIdea || ""}

## Optimized Prompt

${report.optimizedPrompt || ""}

## Image

${report.imageArtifact?.fileName ? report.imageArtifact.fileName : report.imageArtifact?.url || "No image artifact."}

## AI Judge Results

${(report.imageJudges || [])
  .map((judge) => `- ${judge.model}: ${judge.ok ? `${judge.score ?? "n/a"}/100` : `failed - ${judge.error}`}`)
  .join("\n")}
`;
  fs.writeFileSync(mdPath, md, "utf8");
  run.result.files = { jsonPath, mdPath, promptPath };
}

function safeRunView(run) {
  return {
    id: run.id,
    status: run.status,
    phase: run.phase,
    logs: run.logs,
    error: run.error,
    result: run.result,
  };
}

async function runFullReview(run, input) {
  let apiKey = input.apiKey;
  try {
    const relayBaseUrl = normalizeOpenAiBase(input.baseUrl || "https://naapi.cc");
    const appUrl = String(input.appUrl || "https://www.myprompt.asia").replace(/\/+$/, "");
    const targetModelId = input.targetModel || "gpt-image-2";
    const imageModel = input.imageModel || "gpt-image-2";
    const imageSize = input.imageSize || "1024x1024";
    const quality = input.quality || "auto";
    const userIdea = input.idea || DEFAULT_IDEA;
    const language = input.language || "zh";
    const requestedGenerators = csv(input.generatorModels || DEFAULT_GENERATORS).slice(0, 6);
    const requestedEvaluators = csv(input.evaluatorModels || DEFAULT_EVALUATORS).slice(0, 6);
    const requestedImageJudges = csv(input.imageJudgeModels || DEFAULT_IMAGE_JUDGES).slice(0, 6);

    run.phase = "准备";
    addLog(run, "正在检查中转站模型列表...");
    const relayModels = await listRelayModels(relayBaseUrl, apiKey);
    if (relayModels.ok) {
      addLog(run, `中转站返回 ${relayModels.ids.length} 个模型。`);
    } else {
      addLog(run, `模型列表检查失败，将按手动填写模型继续: ${relayModels.error}`);
    }

    const generatorModelIds = chooseAvailable(requestedGenerators, relayModels.ids, requestedGenerators).slice(0, 6);
    const evaluatorModelIds = chooseAvailable(requestedEvaluators, relayModels.ids, requestedEvaluators).slice(0, 6);
    const imageJudgeModels = chooseAvailable(
      requestedImageJudges,
      relayModels.ids,
      [...requestedImageJudges, ...requestedEvaluators, ...requestedGenerators],
    ).slice(0, 6);

    if (!generatorModelIds.length) throw new Error("没有可用的生成器模型。请检查模型名称或中转站模型权限。");

    run.phase = "1/3 提示词生成和评分";
    addLog(run, `正在让网站生成 GPT Image 2 优化提示词，生成器: ${generatorModelIds.join(", ")}`);
    const generated = await generateOptimizedPrompt({
      appUrl,
      relayBaseUrl,
      apiKey,
      idea: userIdea,
      language,
      targetModelId,
      generatorModelIds,
      evaluatorModelIds,
      availableModelIds: relayModels.ids,
    });
    const optimizedPrompt = String(generated.optimizedPrompt || "").trim();
    if (!optimizedPrompt) throw new Error("网站返回了空的 optimizedPrompt。");
    const promptEvaluation = generated.meta?.promptEvaluation;
    const promptScore = averagePromptScore(promptEvaluation);
    addLog(run, `提示词阶段完成，网站内部评分: ${promptScore == null ? "n/a" : `${promptScore.toFixed(1)}/100`}`);

    run.phase = "2/3 真实图片生成";
    addLog(run, `正在调用 ${imageModel} 真实生成图片...`);
    let imageArtifact = null;
    let imageGeneration = null;
    try {
      const imageData = await generateImage({
        relayBaseUrl,
        apiKey,
        model: imageModel,
        prompt: optimizedPrompt,
        imageSize,
        quality,
        responseFormat: "b64_json",
      });
      imageArtifact = saveImageArtifact(imageData, run);
      imageGeneration = { ok: true, usage: imageData.usage || null };
      addLog(run, `图片生成完成: ${imageArtifact?.fileName || imageArtifact?.url || "response received"}`);
    } catch (error) {
      imageGeneration = { ok: false, error: error.message };
      addLog(run, `图片生成失败: ${error.message}`);
      throw error;
    }

    run.phase = "3/3 多 AI 图片评分";
    const imageJudges = [];
    addLog(run, `正在用 ${imageJudgeModels.length || 1} 个 AI 评图: ${imageJudgeModels.join(", ") || "fallback"}`);
    for (const judgeModel of imageJudgeModels.length ? imageJudgeModels : [generatorModelIds[0]]) {
      try {
        const judge = await judgeImageWithModel({
          relayBaseUrl,
          apiKey,
          judgeModel,
          userIdea,
          optimizedPrompt,
          imageArtifact,
        });
        const score = typeof judge.overall === "number" ? judge.overall : null;
        imageJudges.push({ model: judgeModel, ok: true, score, result: judge });
        addLog(run, `${judgeModel} 评分: ${score == null ? "n/a" : `${score}/100`}`);
      } catch (error) {
        imageJudges.push({ model: judgeModel, ok: false, error: error.message });
        addLog(run, `${judgeModel} 评分失败: ${error.message}`);
      }
    }

    const scores = imageJudges
      .map((judge) => judge.score)
      .filter((score) => typeof score === "number" && Number.isFinite(score));
    const imageJudgeAverage = scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null;

    run.result = {
      runId: run.id,
      appUrl,
      relayBaseUrl,
      maskedApiKey: maskSecret(apiKey),
      relayModelProbe: { ok: relayModels.ok, count: relayModels.ids.length, error: relayModels.error },
      targetModelId,
      imageModel,
      generatorModelIds,
      evaluatorModelIds,
      imageJudgeModels,
      userIdea,
      optimizedPrompt,
      promptScore,
      promptEvaluation,
      imageOptions: { imageSize, quality },
      imageGeneration,
      imageArtifact,
      imageJudges,
      imageJudgeAverage,
      rawGenerateMeta: generated.meta,
      rawGenerateStats: generated.stats,
    };
    writeRunFiles(run);
    run.status = "done";
    run.phase = "完成";
    addLog(run, "完整测试完成。你可以在页面里看图、看 AI 评分，再填写你的人工评分。");
    if (input.openFolder !== false) openFolder(REPORT_DIR);
  } catch (error) {
    run.status = "failed";
    run.error = error.message;
    addLog(run, `失败: ${error.message}`);
  } finally {
    apiKey = null;
  }
}

function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GPT Image 2 共同真实测试面板</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; background: #08080f; color: #f8fafc; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(99,102,241,.18), transparent 34rem), #08080f; }
    main { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 48px; }
    h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 40px); }
    p { color: rgba(255,255,255,.68); line-height: 1.7; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .full { grid-column: 1 / -1; }
    label { display: block; font-size: 12px; color: rgba(255,255,255,.64); margin: 0 0 6px; }
    input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(255,255,255,.055); color: #fff; padding: 11px 12px; outline: none; }
    textarea { min-height: 118px; resize: vertical; }
    input:focus, textarea:focus { border-color: rgba(129,140,248,.72); }
    button { border: 0; border-radius: 12px; padding: 12px 16px; color: white; background: #6366f1; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .card { border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: rgba(255,255,255,.04); padding: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.22); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .muted { color: rgba(255,255,255,.58); font-size: 12px; }
    .logs { height: 220px; overflow: auto; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; background: rgba(0,0,0,.28); border-radius: 12px; padding: 12px; }
    .result { display: none; margin-top: 18px; }
    .image { width: 100%; max-height: 760px; object-fit: contain; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
    .score { font-size: 30px; font-weight: 900; color: #a5b4fc; }
    .cols { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: 16px; align-items: start; }
    .prompt { max-height: 360px; overflow: auto; white-space: pre-wrap; font-size: 13px; line-height: 1.65; background: rgba(0,0,0,.24); border-radius: 12px; padding: 14px; }
    .judge { border-top: 1px solid rgba(255,255,255,.08); padding-top: 12px; margin-top: 12px; }
    .danger { color: #fca5a5; }
    .ok { color: #86efac; }
    @media (max-width: 760px) { .grid, .cols { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>GPT Image 2 共同真实测试面板</h1>
      <p>三步一起跑：1. 先测提示词质量；2. 真实生成图片；3. 多个 AI 评图。最后你再填人工评分，页面会把 AI 平均分和你的分数放一起比较。API Key 只发给本机 127.0.0.1 临时服务，不保存到文件。</p>
      <div class="grid">
        <div>
          <label>中转站 Base URL</label>
          <input id="baseUrl" value="https://naapi.cc" />
        </div>
        <div>
          <label>API Key，隐藏输入</label>
          <input id="apiKey" type="password" autocomplete="off" placeholder="粘贴 sk-...，不会显示" />
        </div>
        <div>
          <label>网站地址</label>
          <input id="appUrl" value="https://www.myprompt.asia" />
        </div>
        <div>
          <label>图片模型</label>
          <input id="imageModel" value="gpt-image-2" />
        </div>
        <div class="full">
          <label>测试需求，也就是用户原始想法</label>
          <textarea id="idea">${DEFAULT_IDEA}</textarea>
        </div>
        <div class="full">
          <label>提示词生成器模型，最多 6 个，逗号分隔</label>
          <input id="generatorModels" value="${DEFAULT_GENERATORS}" />
        </div>
        <div class="full">
          <label>提示词评价模型，最多 6 个，逗号分隔</label>
          <input id="evaluatorModels" value="${DEFAULT_EVALUATORS}" />
        </div>
        <div class="full">
          <label>图片评价模型，最多 6 个，逗号分隔。你的 Key 里没有的会自动跳过。</label>
          <input id="imageJudgeModels" value="${DEFAULT_IMAGE_JUDGES}" />
        </div>
        <div>
          <label>图片尺寸</label>
          <input id="imageSize" value="1024x1024" />
        </div>
        <div>
          <label>质量参数</label>
          <input id="quality" value="auto" />
        </div>
        <div class="full row">
          <label><input id="openFolder" type="checkbox" checked style="width:auto" /> 完成后自动打开报告文件夹</label>
          <button id="startBtn">开始完整测试</button>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="row"><strong>运行状态</strong><span id="phase" class="muted">等待开始</span></div>
      <div id="logs" class="logs"></div>
      <div id="error" class="danger"></div>
    </section>

    <section id="result" class="result card">
      <div class="row">
        <h2>测试结果</h2>
        <div><span class="muted">AI 图片平均分</span> <span id="aiImageScore" class="score">--</span></div>
      </div>
      <div class="cols">
        <div>
          <img id="image" class="image" alt="生成图片" />
          <div class="card" style="margin-top:12px">
            <label>你的人工评分，0-100</label>
            <input id="userScore" type="number" min="0" max="100" placeholder="比如 82" />
            <label style="margin-top:10px">你的观察，哪里好哪里不好</label>
            <textarea id="userNotes" placeholder="例如：文字很清楚，但人物手部有问题，商业感够不够..."></textarea>
            <button id="saveReview">保存我的评分并对比</button>
            <p id="compare" class="muted"></p>
          </div>
        </div>
        <div>
          <p><strong>网站提示词评分：</strong><span id="promptScore">--</span></p>
          <p><strong>优化后的 GPT Image 2 提示词</strong></p>
          <div id="prompt" class="prompt"></div>
          <div id="judges"></div>
          <p id="files" class="muted"></p>
        </div>
      </div>
    </section>
  </main>
  <script>
    let runId = null;
    let pollTimer = null;
    let currentRun = null;
    const $ = (id) => document.getElementById(id);
    function formValue(id) { return $(id).value.trim(); }
    function setLogs(run) {
      $("phase").textContent = run.phase || run.status || "running";
      $("logs").textContent = (run.logs || []).join("\\n");
      $("logs").scrollTop = $("logs").scrollHeight;
      $("error").textContent = run.error || "";
    }
    function renderResult(run) {
      if (!run.result) return;
      currentRun = run;
      $("result").style.display = "block";
      const r = run.result;
      $("aiImageScore").textContent = r.imageJudgeAverage == null ? "--" : r.imageJudgeAverage.toFixed(1);
      $("promptScore").textContent = r.promptScore == null ? "--" : r.promptScore.toFixed(1) + "/100";
      $("prompt").textContent = r.optimizedPrompt || "";
      if (r.imageArtifact && r.imageArtifact.browserUrl) $("image").src = r.imageArtifact.browserUrl;
      $("judges").innerHTML = (r.imageJudges || []).map(j => {
        const body = j.ok
          ? "<div><strong>" + j.model + "</strong>: " + (j.score ?? "n/a") + "/100</div><div class='muted'>" + ((j.result && j.result.verdict) || "") + "</div>"
          : "<div class='danger'><strong>" + j.model + "</strong>: " + j.error + "</div>";
        const issues = j.result && Array.isArray(j.result.issues) ? "<div class='muted'>问题: " + j.result.issues.join("；") + "</div>" : "";
        return "<div class='judge'>" + body + issues + "</div>";
      }).join("");
      $("files").textContent = r.files ? "报告已保存: " + r.files.mdPath : "";
    }
    async function poll() {
      if (!runId) return;
      const res = await fetch("/api/run/" + runId);
      const run = await res.json();
      setLogs(run);
      if (run.status === "done" || run.status === "failed") {
        clearInterval(pollTimer);
        $("startBtn").disabled = false;
        renderResult(run);
      }
    }
    $("startBtn").onclick = async () => {
      $("startBtn").disabled = true;
      $("result").style.display = "none";
      $("logs").textContent = "";
      $("error").textContent = "";
      const payload = {
        apiKey: formValue("apiKey"),
        baseUrl: formValue("baseUrl"),
        appUrl: formValue("appUrl"),
        idea: $("idea").value,
        generatorModels: formValue("generatorModels"),
        evaluatorModels: formValue("evaluatorModels"),
        imageJudgeModels: formValue("imageJudgeModels"),
        imageModel: formValue("imageModel"),
        imageSize: formValue("imageSize"),
        quality: formValue("quality"),
        openFolder: $("openFolder").checked
      };
      if (!payload.apiKey) {
        alert("请先填 API Key");
        $("startBtn").disabled = false;
        return;
      }
      const res = await fetch("/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "启动失败");
        $("startBtn").disabled = false;
        return;
      }
      $("apiKey").value = "";
      runId = data.runId;
      pollTimer = setInterval(poll, 1400);
      poll();
    };
    $("saveReview").onclick = async () => {
      if (!currentRun) return;
      const score = Number($("userScore").value);
      const notes = $("userNotes").value;
      const res = await fetch("/api/user-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: currentRun.id, score, notes }) });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "保存失败");
        return;
      }
      const ai = currentRun.result.imageJudgeAverage;
      const delta = Number.isFinite(ai) && Number.isFinite(score) ? Math.abs(ai - score).toFixed(1) : "--";
      $("compare").textContent = "已保存。AI 平均分 " + (ai == null ? "--" : ai.toFixed(1)) + "，你的评分 " + score + "，差距 " + delta + " 分。";
    };
  </script>
</body>
</html>`;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (req.method === "GET" && url.pathname === "/") return html(res, page());

    if (req.method === "POST" && url.pathname === "/api/start") {
      const input = await readBody(req);
      if (!input.apiKey || String(input.apiKey).trim().length < 8) {
        return json(res, 400, { error: "API key looks empty or too short." });
      }
      const id = new Date().toISOString().replace(/[:.]/g, "-");
      const run = { id, status: "running", phase: "排队", logs: [], result: null, error: null };
      runs.set(id, run);
      json(res, 200, { runId: id });
      runFullReview(run, input);
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/run\/(.+)$/);
    if (req.method === "GET" && runMatch) {
      const run = runs.get(decodeURIComponent(runMatch[1]));
      if (!run) return json(res, 404, { error: "Run not found" });
      return json(res, 200, safeRunView(run));
    }

    if (req.method === "POST" && url.pathname === "/api/user-review") {
      const body = await readBody(req);
      const run = runs.get(body.runId);
      if (!run || !run.result) return json(res, 404, { error: "Run not found or not finished" });
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        return json(res, 400, { error: "Score must be a number from 0 to 100" });
      }
      run.result.userReview = {
        score,
        notes: String(body.notes || ""),
        savedAt: new Date().toISOString(),
        deltaFromAiAverage:
          run.result.imageJudgeAverage == null ? null : Math.abs(run.result.imageJudgeAverage - score),
      };
      writeRunFiles(run);
      return json(res, 200, { ok: true, userReview: run.result.userReview, files: run.result.files });
    }

    const artifactMatch = url.pathname.match(/^\/artifact\/([^/]+)\/image$/);
    if (req.method === "GET" && artifactMatch) {
      const run = runs.get(decodeURIComponent(artifactMatch[1]));
      const filePath = run?.result?.imageArtifact?.filePath;
      if (!filePath || !fs.existsSync(filePath)) return text(res, 404, "Image not found");
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    return text(res, 404, "Not found");
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(0, HOST, () => {
  const address = server.address();
  const url = `http://${HOST}:${address.port}/`;
  console.log("");
  console.log("GPT Image 2 live review panel is ready:");
  console.log(url);
  console.log("");
  console.log("Close this terminal window to stop the local panel.");
  if (process.env.NO_OPEN_BROWSER !== "1") openBrowser(url);
});
