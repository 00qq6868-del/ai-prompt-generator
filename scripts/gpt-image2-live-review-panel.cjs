#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "gpt-image2-live-review");
const HISTORY_PATH = path.join(REPORT_DIR, "history-index.json");
const LEARNING_PATH = path.join(REPORT_DIR, "learning-memory.json");
const HOST = "127.0.0.1";
const PORT = Number(process.env.GPT_IMAGE2_PANEL_PORT || 61994);
const DEFAULT_IDEA =
  "为一款名叫「PromptForge」的 AI 提示词生成器制作一张高端科技感官网首屏海报。画面需要有深色背景、发光的提示词卡片、中文标题「让 AI 听懂你的想法」、清晰可读的小字说明、玻璃拟态界面、蓝紫色霓虹光、商业级构图。";
const DEFAULT_GENERATORS = "gpt-5.5,claude-opus-4-7,gemini-3.1-pro-preview,deepseek-v4-pro,gpt-4o";
const DEFAULT_EVALUATORS = "gpt-5.5,claude-opus-4-7,gemini-3.1-pro-preview,o3,gpt-4o";
const DEFAULT_IMAGE_JUDGES = "gpt-4o,gemini-3.1-pro-preview,claude-opus-4-7,gpt-5.5";
const PROMPT_TIMEOUT_MS = Number(process.env.GPT_IMAGE2_PANEL_PROMPT_TIMEOUT_MS || 55_000);
const JUDGE_TIMEOUT_MS = Number(process.env.GPT_IMAGE2_PANEL_JUDGE_TIMEOUT_MS || 35_000);
const IMAGE_TIMEOUT_MS = Number(process.env.GPT_IMAGE2_PANEL_IMAGE_TIMEOUT_MS || 180_000);

const SOURCE_STRATEGIES = [
  {
    id: "evolink",
    label: "EvoLinkAI case-pattern route",
    guide:
      "Use task-specific gallery thinking. First identify whether the request is e-commerce, ad creative, portrait, poster, character, UI/social mockup, or comparison. Write a polished natural-language production prompt with concrete scene assets, commercial lighting, visible layout hierarchy, exact readable text, and style-consistency constraints. Strong for product ads, posters, UI cards, portraits, and storyboard-like boards.",
  },
  {
    id: "youmind",
    label: "YouMind taxonomy/config route",
    guide:
      "Use broad taxonomy and config-style structure. Put artifact type, canvas, aspect ratio, and layout before subject. For complex outputs, use a clean JSON-like visual spec with type, subject, style, layout, text, materials, lighting, and rendering fields. Preserve dynamic user slots as quoted literal copy when needed. Strong for multi-language typography, grids, product series, maps, UI overlays, stickers, diagrams, and structured prompts.",
  },
  {
    id: "anil",
    label: "Anil-matcha concise API route",
    guide:
      "Use direct OpenAI Images API prompt style: copy-pasteable, concise but rich, no unsupported negative-prompt syntax, no Midjourney flags. Emphasize photorealism, style fidelity, prompt adherence, screenshots/mockups, portraits, posters, game/UI/infographic use cases, and clear final image intent. Strong when the user wants a clean ready-to-call API prompt without overengineering.",
  },
  {
    id: "wuyoscar",
    label: "wuyoscar craft/skill route",
    guide:
      "Use the craft checklist: exact text in quotes, canvas/layout first, fixed-region schemas for infographics, diagram grammar for research/data figures, UI prompts as product specs, multi-panel consistency, capture context for photorealism, scene density over empty adjectives, bounded style anchors, and edit/reference-image invariants. Strong for typography, scientific boards, app screens, infographics, character sheets, and prompt debugging.",
  },
];

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
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > 80 * 1024 * 1024) {
        reject(new Error("Request body too large. Please use fewer or smaller reference images."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
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

function htmlErrorSummary(textBody) {
  const title = String(textBody || "").match(/<title>(.*?)<\/title>/i)?.[1];
  if (title) return title.replace(/\s+/g, " ").trim();
  return String(textBody || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function fetchJson(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(new Error(`请求超时 ${Math.round(timeoutMs / 1000)} 秒`)), timeoutMs)
    : null;
  let res;
  try {
    res = await fetch(url, controller ? { ...fetchOptions, signal: controller.signal } : fetchOptions);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const textBody = await res.text();
  let data = null;
  try {
    data = textBody ? JSON.parse(textBody) : {};
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error?.message || data?.error || htmlErrorSummary(textBody);
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

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function loadRegistryModels() {
  const registryPath = path.join(ROOT, "public", "models.json");
  const data = readJsonFile(registryPath, []);
  return Array.isArray(data)
    ? data.filter((model) => model && typeof model.id === "string")
    : [];
}

function uniqueById(models) {
  const seen = new Set();
  const out = [];
  for (const model of models) {
    if (!model?.id || seen.has(model.id)) continue;
    seen.add(model.id);
    out.push(model);
  }
  return out;
}

function registryWithRelayModels(relayIds = []) {
  const registry = loadRegistryModels();
  const known = new Set(registry.map((model) => model.id));
  const relayOnly = relayIds
    .filter((id) => id && !known.has(id))
    .map((id) => ({
      id,
      name: id,
      provider: "Relay",
      apiProvider: "custom",
      category: id.toLowerCase().includes("image") || id.toLowerCase().includes("dall-e") ? "image" : "text",
      tags: [],
      speed: "medium",
      accuracy: "medium",
      supportsStreaming: true,
    }));
  const available = new Set(relayIds);
  return uniqueById([...registry, ...relayOnly]).map((model) => ({
    id: model.id,
    name: model.name || model.id,
    provider: model.provider || model.apiProvider || "Unknown",
    category: model.category || "text",
    tags: Array.isArray(model.tags) ? model.tags : [],
    speed: model.speed || "medium",
    accuracy: model.accuracy || "medium",
    isLatest: Boolean(model.isLatest),
    available: relayIds.length ? available.has(model.id) : null,
  }));
}

function scoreModelOption(model) {
  const accuracy = { supreme: 40, high: 26, medium: 12, low: 0 }[model.accuracy] ?? 8;
  const speed = { ultrafast: 18, fast: 14, medium: 8, slow: 2 }[model.speed] ?? 6;
  const latest = model.isLatest ? 10 : 0;
  const vision = model.tags?.some((tag) => ["vision", "multimodal", "image-gen"].includes(tag)) ? 8 : 0;
  const available = model.available === true ? 25 : model.available === false ? -25 : 0;
  return accuracy + speed + latest + vision + available;
}

function modelOptionsPayload(relayIds = []) {
  const models = registryWithRelayModels(relayIds);
  const byScore = (a, b) => scoreModelOption(b) - scoreModelOption(a) || a.id.localeCompare(b.id);
  const sortedModels = [...models].sort(byScore);
  const textModels = models
    .filter((model) => (model.category || "text") === "text")
    .sort(byScore);
  const imageModels = models
    .filter((model) => (model.category || "text") === "image" || model.tags.includes("image-gen"))
    .sort(byScore);
  return {
    total: models.length,
    availableCount: relayIds.length,
    models: sortedModels,
    targetModels: sortedModels,
    imageModels,
    textModels,
    generatorModels: textModels,
    evaluatorModels: textModels,
    visionTextModels: models
      .filter((model) => (model.category || "text") === "text")
      .sort((a, b) => {
        const av = a.tags.some((tag) => ["vision", "multimodal"].includes(tag)) ? 1 : 0;
        const bv = b.tags.some((tag) => ["vision", "multimodal"].includes(tag)) ? 1 : 0;
        return bv - av || byScore(a, b);
      }),
  };
}

function reportPathForRun(runId) {
  return path.join(REPORT_DIR, `report-${runId}.json`);
}

function loadReport(runId) {
  return readJsonFile(reportPathForRun(runId), null);
}

function summarizeHistory(report) {
  if (!report?.runId) return null;
  return {
    runId: report.runId,
    savedAt: report.userReview?.savedAt || report.runId,
    userIdea: String(report.userIdea || "").slice(0, 220),
    optimizedPrompt: String(report.optimizedPrompt || "").slice(0, 260),
    promptScore: report.promptScore ?? null,
    imageJudgeAverage: report.imageJudgeAverage ?? null,
    userScore: report.userReview?.score ?? null,
    userNotes: report.userReview?.notes ? String(report.userReview.notes).slice(0, 260) : "",
    deltaFromAiAverage: report.userReview?.deltaFromAiAverage ?? null,
    imageBrowserUrl: report.imageArtifact?.browserUrl || `/artifact/${report.runId}/image`,
    imageFileName: report.imageArtifact?.fileName || "",
    mode: report.imageGeneration?.mode || "unknown",
    files: report.files || null,
  };
}

function rebuildHistoryIndex() {
  const reports = fs.existsSync(REPORT_DIR)
    ? fs.readdirSync(REPORT_DIR)
        .filter((name) => /^report-.+\.json$/.test(name))
        .map((name) => readJsonFile(path.join(REPORT_DIR, name), null))
        .filter(Boolean)
    : [];
  const entries = reports
    .map(summarizeHistory)
    .filter(Boolean)
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
    .slice(0, 300);
  writeJsonFile(HISTORY_PATH, { updatedAt: new Date().toISOString(), entries });
  return entries;
}

function loadHistoryEntries() {
  const index = readJsonFile(HISTORY_PATH, null);
  if (Array.isArray(index?.entries)) return index.entries;
  return rebuildHistoryIndex();
}

function deriveLearningRulesFromReview(report) {
  const review = report?.userReview;
  if (!review?.notes) return [];
  const textValue = String(review.notes);
  const rules = [];
  const add = (id, label, rule) => rules.push({ id, label, rule });
  if (/不像真人|真实感|相机|拍|真人|假|照片/.test(textValue)) {
    add("photorealism", "照片级真人感", "强调真实相机拍摄、自然皮肤纹理、真实鼻唇结构、真实光学景深、真实漫展现场抓拍，避免塑料感、AI感、过度磨皮和插画感。");
  }
  if (/头|脖子|比例|大小|怪/.test(textValue)) {
    add("anatomy_proportion", "头颈比例", "明确要求头部、脖子、肩宽和身体比例自然，避免头大身小、脖子过细/过长、肩颈连接异常。");
  }
  if (/手|手指|扇子/.test(textValue)) {
    add("hands_prop", "手部和道具", "如果出现手和道具，要求手指结构自然、握持动作合理；拿扇子时手部应有可见支撑，若不能保证则用构图遮挡异常手部。");
  }
  if (/服装|衣服|商心慈|角色|cos|COS|大爱仙尊/.test(textValue)) {
    add("character_costume", "角色服装识别", "对指定角色要写出可识别服装、发饰、气质、故事背景和角色性格，不要生成泛化和风写真。");
  }
  if (/提示词.*我自己写|看不出来|没有优化/.test(textValue)) {
    add("prompt_expansion", "提示词应明显增益", "不要只复述用户原文，要补足构图、镜头、材质、光线、角色识别点、负面规避和参考图保持规则。");
  }
  return rules;
}

function updateLearningMemory(report) {
  if (!report?.userReview) return null;
  const memory = readJsonFile(LEARNING_PATH, { updatedAt: null, rules: [], examples: [] });
  const rules = Array.isArray(memory.rules) ? memory.rules : [];
  for (const rule of deriveLearningRulesFromReview(report)) {
    const existing = rules.find((item) => item.id === rule.id);
    if (existing) {
      existing.count = (existing.count || 0) + 1;
      existing.lastSeenAt = new Date().toISOString();
      existing.lastRunId = report.runId;
      existing.rule = rule.rule;
    } else {
      rules.push({ ...rule, count: 1, lastSeenAt: new Date().toISOString(), lastRunId: report.runId });
    }
  }
  const examples = Array.isArray(memory.examples) ? memory.examples : [];
  examples.unshift({
    runId: report.runId,
    userScore: report.userReview.score,
    aiScore: report.imageJudgeAverage,
    delta: report.userReview.deltaFromAiAverage,
    notes: report.userReview.notes,
    idea: String(report.userIdea || "").slice(0, 500),
  });
  const next = {
    updatedAt: new Date().toISOString(),
    rules: rules.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 50),
    examples: examples.slice(0, 100),
  };
  writeJsonFile(LEARNING_PATH, next);
  return next;
}

function rebuildLearningMemoryFromReports() {
  const reports = fs.existsSync(REPORT_DIR)
    ? fs.readdirSync(REPORT_DIR)
        .filter((name) => /^report-.+\.json$/.test(name))
        .map((name) => readJsonFile(path.join(REPORT_DIR, name), null))
        .filter((report) => report?.userReview)
    : [];
  let memory = { updatedAt: null, rules: [], examples: [] };
  writeJsonFile(LEARNING_PATH, memory);
  for (const report of reports.sort((a, b) => String(a.runId).localeCompare(String(b.runId)))) {
    memory = updateLearningMemory(report) || memory;
  }
  return readJsonFile(LEARNING_PATH, memory);
}

function learningMemoryPrompt() {
  const memory = readJsonFile(LEARNING_PATH, { rules: [] });
  const rules = Array.isArray(memory.rules) ? memory.rules.slice(0, 8) : [];
  if (!rules.length) return "";
  return `\n\nLocal human feedback memory. Apply these learned rules because previous generated images were judged by the human user:\n${rules.map((rule, index) => `${index + 1}. ${rule.label}: ${rule.rule}`).join("\n")}`;
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
    timeoutMs: PROMPT_TIMEOUT_MS,
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

async function callChatCompletion({ relayBaseUrl, apiKey, model, systemPrompt, userPrompt, maxTokens, temperature, timeoutMs }) {
  const data = await fetchJson(endpoint(relayBaseUrl, "/chat/completions"), {
    method: "POST",
    timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  return {
    text: data?.choices?.[0]?.message?.content || "",
    usage: data?.usage || null,
  };
}

function buildDirectCandidatePrompt(userIdea, language) {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `User idea:
${userIdea}
${learningMemoryPrompt()}

Create GPT Image 2.0 prompt candidates using four independent source strategies plus one hybrid.

Rules:
- Preserve every user detail exactly.
- If reference images will be used, write the prompt as an image-edit/image-to-image instruction: preserve identity, pose-critical features, and useful visual traits from the reference while applying the requested changes.
- If the request asks for photorealistic cosplay or character transformation, add concrete constraints for real camera look, natural head-neck-body proportions, believable facial structure, realistic hands/props, recognizable role costume cues, and convention-scene realism.
- Do not merely restate the user idea. Add useful visual details, camera/lens/light/composition rules, reference-image preservation rules, and failure prevention.
- Do not mix the four strategies inside the four source candidates.
- The fifth candidate is the only hybrid.
- GPT Image 2 uses natural language and structured visual specs; do not add Midjourney flags, SD weights, or unsupported negative-prompt sections.
- Exact visible text must be wrapped in quotes and placed with font, size, color, and position.
- If the image has panels, UI, infographic, product layout, or typography, define canvas/aspect ratio/layout first.
- Output language for the final prompts: ${outputLanguage}.

Source strategies:
${SOURCE_STRATEGIES.map((source, index) => `${index + 1}. ${source.id} (${source.label}): ${source.guide}`).join("\n")}

Return STRICT JSON only:
{
  "candidates": [
    { "id": "evolink", "label": "EvoLinkAI case-pattern route", "prompt": "..." },
    { "id": "youmind", "label": "YouMind taxonomy/config route", "prompt": "..." },
    { "id": "anil", "label": "Anil-matcha concise API route", "prompt": "..." },
    { "id": "wuyoscar", "label": "wuyoscar craft/skill route", "prompt": "..." }
  ],
  "hybrid": { "id": "hybrid", "label": "four-source hybrid", "prompt": "..." }
}`;
}

function normalizeDirectCandidates(payload) {
  const candidates = [];
  for (const source of SOURCE_STRATEGIES) {
    const found = payload?.candidates?.find((candidate) => candidate?.id === source.id);
    if (found?.prompt?.trim()) {
      candidates.push({
        id: source.id,
        label: found.label?.trim() || source.label,
        prompt: found.prompt.trim(),
      });
    }
  }
  if (payload?.hybrid?.prompt?.trim()) {
    candidates.push({
      id: "hybrid",
      label: payload.hybrid.label?.trim() || "four-source hybrid",
      prompt: payload.hybrid.prompt.trim(),
    });
  }
  return candidates;
}

function buildDirectJudgePrompt(candidates, userIdea, language) {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `You are judging GPT Image 2.0 prompts.

Original user idea:
${userIdea}

Candidates:
${JSON.stringify(candidates, null, 2)}

Score every candidate from 0 to 100 using these criteria:
- intent fidelity: preserves every explicit and implicit user detail
- reference-image control: if images are used, preserves identity/important visual traits and clearly describes what changes
- GPT Image 2 fit: natural-language/structured prompt style, no unsupported flags
- visual specificity: subject, layout, lighting, material, camera, palette, mood
- typography reliability: exact quoted text, readable placement, no garbled text
- layout controllability: aspect ratio, panels, zones, UI/diagram structure when relevant
- commercial usability: polished, practical, avoids watermarks/logos unless user supplied them

If the top single-source candidate and the hybrid are close in quality, set shouldSynthesize=true.

Return STRICT JSON only in ${outputLanguage}:
{
  "scores": [
    { "id": "evolink", "score": 0, "reason": "short reason" }
  ],
  "winnerId": "candidate id",
  "shouldSynthesize": true,
  "summary": "short summary"
}`;
}

function buildDirectSynthesisPrompt(userIdea, bestSingle, hybrid, language) {
  const outputLanguage = language === "zh" ? "Chinese" : "English";
  return `Synthesize the best final GPT Image 2.0 prompt.

Original user idea:
${userIdea}

Best single-source prompt (${bestSingle.label}):
${bestSingle.prompt}

Hybrid prompt:
${hybrid.prompt}

Create one final prompt that beats both. Keep only the strongest compatible parts. Preserve every user detail. Use GPT Image 2 compatible natural language or a clean JSON-like visual spec. Do not include explanations, scores, source names, markdown fences, Midjourney flags, or SD negative-prompt sections.

Output only the final prompt in ${outputLanguage}.`;
}

function aggregateDirectPromptScores(candidates, judgeOutputs) {
  const buckets = new Map(candidates.map((candidate) => [
    candidate.id,
    { id: candidate.id, generatorModelId: candidate.id, generatorModelName: candidate.label, averageScore: 0, rank: 0, scores: [] },
  ]));

  let synthesizeVotes = 0;
  for (const output of judgeOutputs) {
    if (output.payload?.shouldSynthesize) synthesizeVotes += 1;
    for (const item of output.payload?.scores || []) {
      if (!item?.id || typeof item.score !== "number") continue;
      const bucket = buckets.get(item.id);
      if (!bucket) continue;
      bucket.scores.push({
        judgeModel: output.model,
        score: Math.max(0, Math.min(100, item.score)),
        reason: String(item.reason || ""),
      });
    }
  }

  const rows = [...buckets.values()].map((candidate) => ({
    ...candidate,
    averageScore: candidate.scores.length
      ? candidate.scores.reduce((sum, item) => sum + item.score, 0) / candidate.scores.length
      : 0,
  }));
  rows.sort((a, b) => b.averageScore - a.averageScore);
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return { rows, synthesizeVotes };
}

async function runDirectPromptOptimization({ relayBaseUrl, apiKey, idea, language, generatorModelIds, evaluatorModelIds, addLog }) {
  const startedAt = Date.now();
  const calls = [];
  let generatorModel = null;
  let candidateText = "";
  let candidates = [];
  const generatorErrors = [];

  for (const model of generatorModelIds) {
    try {
      addLog(`本地直连生成候选提示词: ${model}`);
      const result = await callChatCompletion({
        relayBaseUrl,
        apiKey,
        model,
        systemPrompt: "You generate candidate prompts for GPT Image 2. Output strict JSON only.",
        userPrompt: buildDirectCandidatePrompt(idea, language),
        maxTokens: 4096,
        temperature: 0.45,
        timeoutMs: PROMPT_TIMEOUT_MS,
      });
      calls.push({ model, usage: result.usage });
      candidateText = result.text.trim();
      const parsed = extractJsonMaybe(candidateText);
      candidates = normalizeDirectCandidates(parsed);
      if (candidates.length >= 2) {
        generatorModel = model;
        break;
      }
      generatorErrors.push(`${model}: 候选 JSON 解析失败`);
    } catch (error) {
      generatorErrors.push(`${model}: ${error.message}`);
      addLog(`${model} 生成失败，自动跳过: ${error.message}`);
    }
  }

  if (!candidates.length) {
    if (candidateText.trim()) {
      candidates = [{ id: "fallback", label: generatorModel || "fallback", prompt: candidateText.trim() }];
    } else {
      throw new Error(`本地直连提示词生成失败。${generatorErrors.join("；")}`);
    }
  }

  const judgeOutputs = [];
  for (const model of evaluatorModelIds.slice(0, 6)) {
    try {
      addLog(`本地直连提示词评分: ${model}`);
      const result = await callChatCompletion({
        relayBaseUrl,
        apiKey,
        model,
        systemPrompt: "You are a strict image-prompt evaluator. Output strict JSON only.",
        userPrompt: buildDirectJudgePrompt(candidates, idea, language),
        maxTokens: 1400,
        temperature: 0.1,
        timeoutMs: JUDGE_TIMEOUT_MS,
      });
      calls.push({ model, usage: result.usage });
      judgeOutputs.push({ model, payload: extractJsonMaybe(result.text) || {} });
    } catch (error) {
      addLog(`${model} 提示词评分失败，自动跳过: ${error.message}`);
    }
  }

  const { rows, synthesizeVotes } = aggregateDirectPromptScores(candidates, judgeOutputs);
  const fallbackWinner = candidates.find((candidate) => candidate.id === "hybrid") || candidates[0];
  const top = rows.find((row) => row.averageScore > 0) || rows[0] || {
    id: fallbackWinner.id,
    averageScore: 0,
  };
  const topCandidate = candidates.find((candidate) => candidate.id === top.id) || fallbackWinner;
  const hybrid = candidates.find((candidate) => candidate.id === "hybrid");
  const bestSingleRow = rows.find((row) => row.id !== "hybrid") || top;
  const bestSingle = candidates.find((candidate) => candidate.id === bestSingleRow.id) || topCandidate;
  const hybridScore = rows.find((row) => row.id === "hybrid")?.averageScore || 0;
  const shouldSynthesize = Boolean(hybrid) && (synthesizeVotes > 0 || Math.abs((bestSingleRow.averageScore || 0) - hybridScore) <= 3);

  let optimizedPrompt = topCandidate.prompt;
  let selectedStrategy = topCandidate.id;
  if (shouldSynthesize && hybrid && generatorModel) {
    try {
      addLog(`本地直连融合最终提示词: ${generatorModel}`);
      const result = await callChatCompletion({
        relayBaseUrl,
        apiKey,
        model: generatorModel,
        systemPrompt: "You synthesize the final GPT Image 2 prompt. Output only the final prompt.",
        userPrompt: buildDirectSynthesisPrompt(idea, bestSingle, hybrid, language),
        maxTokens: 2048,
        temperature: 0.35,
        timeoutMs: PROMPT_TIMEOUT_MS,
      });
      calls.push({ model: generatorModel, usage: result.usage });
      if (result.text.trim()) {
        optimizedPrompt = result.text.trim();
        selectedStrategy = `${bestSingle.id}+hybrid`;
      }
    } catch (error) {
      addLog(`最终融合失败，使用当前最高分候选: ${error.message}`);
    }
  }

  const promptEvaluation = {
    candidates: rows,
    judgeModels: judgeOutputs.map((output) => output.model),
    selectedCandidateId: topCandidate.id,
    summary: judgeOutputs.map((output) => output.payload?.summary).find(Boolean) || "Local direct GPT Image 2 prompt evaluation completed.",
    sourceCommits: [],
  };

  const inputTokens = calls.reduce((sum, call) => sum + (call.usage?.prompt_tokens || call.usage?.input_tokens || 0), 0);
  const outputTokens = calls.reduce((sum, call) => sum + (call.usage?.completion_tokens || call.usage?.output_tokens || 0), 0);

  return {
    optimizedPrompt,
    stats: {
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      tokensDelta: optimizedPrompt.length - idea.length,
      changePercent: idea.length ? Math.round(((optimizedPrompt.length - idea.length) / idea.length) * 100) : 0,
    },
    meta: {
      generatorModel,
      targetModel: "GPT Image 2",
      reviewSummary: `Local direct GPT Image 2 optimizer used ${generatorModel || "fallback"} and ${judgeOutputs.length} judge model(s).`,
      judgeModels: judgeOutputs.map((output) => output.model),
      selectedStrategy,
      promptEvaluation,
      localDirect: true,
    },
  };
}

async function generateImage({ relayBaseUrl, apiKey, model, prompt, imageSize, quality, background, responseFormat }) {
  const body = {
    model,
    prompt,
    size: imageSize,
    quality,
    n: 1,
    response_format: responseFormat,
  };
  if (background) body.background = background;
  return fetchJson(endpoint(relayBaseUrl, "/images/generations"), {
    method: "POST",
    timeoutMs: IMAGE_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function generateImageEdit({
  relayBaseUrl,
  apiKey,
  model,
  prompt,
  imageSize,
  quality,
  background,
  responseFormat,
  referenceImages,
}) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", imageSize);
  form.append("quality", quality);
  form.append("n", "1");
  if (background) form.append("background", background);
  if (responseFormat) form.append("response_format", responseFormat);

  for (const image of referenceImages) {
    const blob = new Blob([image.buffer], { type: image.mimeType || "image/png" });
    form.append("image", blob, image.fileName);
  }

  const res = await fetch(endpoint(relayBaseUrl, "/images/edits"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  const textBody = await res.text();
  let data = null;
  try {
    data = textBody ? JSON.parse(textBody) : {};
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error?.message || data?.error || htmlErrorSummary(textBody);
    throw new Error(`${res.status} ${res.statusText}: ${message}`);
  }
  return data || {};
}

function decodeReferenceImages(rawImages, run) {
  const images = Array.isArray(rawImages) ? rawImages.slice(0, 8) : [];
  const decoded = [];
  const dir = path.join(REPORT_DIR, `refs-${run.id}`);
  if (images.length) fs.mkdirSync(dir, { recursive: true });

  for (let i = 0; i < images.length; i += 1) {
    const item = images[i] || {};
    const dataUrl = String(item.dataUrl || "");
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) continue;
    const mimeType = match[1] || "image/png";
    const ext = mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("gif")
          ? "gif"
          : "png";
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) continue;
    const rawName = String(item.name || `reference-${i + 1}.${ext}`);
    const safeBase = rawName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || `reference-${i + 1}.${ext}`;
    const fileName = safeBase.includes(".") ? safeBase : `${safeBase}.${ext}`;
    const filePath = path.join(dir, `${String(i + 1).padStart(2, "0")}-${fileName}`);
    fs.writeFileSync(filePath, buffer);
    decoded.push({
      index: i,
      fileName,
      filePath,
      browserUrl: `/artifact/${run.id}/ref/${i}`,
      mimeType,
      buffer,
      size: buffer.length,
    });
  }

  return decoded;
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
    timeoutMs: JUDGE_TIMEOUT_MS,
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
- Prompt mode: ${report.promptMode}
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

## Reference Images

${(report.referenceImages || []).map((image) => `- ${image.fileName}`).join("\n") || "No reference images. This run used text-to-image."}

## AI Judge Results

${(report.imageJudges || [])
  .map((judge) => `- ${judge.model}: ${judge.ok ? `${judge.score ?? "n/a"}/100` : `failed - ${judge.error}`}`)
  .join("\n")}
`;
  fs.writeFileSync(mdPath, md, "utf8");
  run.result.files = { jsonPath, mdPath, promptPath };
  rebuildHistoryIndex();
  if (run.result.userReview) updateLearningMemory(run.result);
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
    const promptMode = input.promptMode || "direct";
    const targetModelId = input.targetModel || "gpt-image-2";
    const imageModel = input.imageModel || "gpt-image-2";
    const imageSize = input.imageSize || "1024x1024";
    const quality = input.quality || "auto";
    const background = input.background || "";
    const responseFormat = input.responseFormat || "b64_json";
    const userIdea = input.idea || DEFAULT_IDEA;
    const language = input.language || "zh";
    const referenceImages = decodeReferenceImages(input.referenceImages, run);
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
    addLog(
      run,
      promptMode === "app"
        ? `正在调用网站 API 生成 GPT Image 2 优化提示词，生成器: ${generatorModelIds.join(", ")}`
        : `正在本地直连中转站生成 GPT Image 2 优化提示词，生成器: ${generatorModelIds.join(", ")}`,
    );
    let generated;
    if (promptMode === "app") {
      try {
        generated = await generateOptimizedPrompt({
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
      } catch (error) {
        addLog(run, `网站 API 失败，自动切换本地直连模式: ${error.message}`);
      }
    }
    if (!generated) {
      generated = await runDirectPromptOptimization({
        relayBaseUrl,
        apiKey,
        idea: userIdea,
        language,
        generatorModelIds,
        evaluatorModelIds,
        addLog: (message) => addLog(run, message),
      });
    }
    const optimizedPrompt = String(generated.optimizedPrompt || "").trim();
    if (!optimizedPrompt) throw new Error("提示词生成返回了空的 optimizedPrompt。");
    const promptEvaluation = generated.meta?.promptEvaluation;
    const promptScore = averagePromptScore(promptEvaluation);
    addLog(run, `提示词阶段完成，网站内部评分: ${promptScore == null ? "n/a" : `${promptScore.toFixed(1)}/100`}`);

    run.phase = "2/3 真实图片生成";
    const imageMode = referenceImages.length ? "image-to-image" : "text-to-image";
    addLog(
      run,
      referenceImages.length
        ? `检测到 ${referenceImages.length} 张参考图，正在调用 ${imageModel} 做图生图/改图...`
        : `未上传参考图，正在调用 ${imageModel} 做文生图...`,
    );
    let imageArtifact = null;
    let imageGeneration = null;
    try {
      const imageData = referenceImages.length
        ? await generateImageEdit({
            relayBaseUrl,
            apiKey,
            model: imageModel,
            prompt: optimizedPrompt,
            imageSize,
            quality,
            background,
            responseFormat,
            referenceImages,
          })
        : await generateImage({
            relayBaseUrl,
            apiKey,
            model: imageModel,
            prompt: optimizedPrompt,
            imageSize,
            quality,
            background,
            responseFormat,
          });
      imageArtifact = saveImageArtifact(imageData, run);
      imageGeneration = { ok: true, mode: imageMode, usage: imageData.usage || null };
      addLog(run, `图片生成完成: ${imageArtifact?.fileName || imageArtifact?.url || "response received"}`);
    } catch (error) {
      imageGeneration = { ok: false, mode: imageMode, error: error.message };
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
      promptMode: generated.meta?.localDirect ? "direct" : promptMode,
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
      referenceImages: referenceImages.map(({ buffer, ...image }) => image),
      imageOptions: { imageSize, quality, background, responseFormat },
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

async function runImageOnly(run, input) {
  let apiKey = input.apiKey;
  try {
    const relayBaseUrl = normalizeOpenAiBase(input.baseUrl || "https://naapi.cc");
    const imageModel = input.imageModel || "gpt-image-2";
    const imageSize = input.imageSize || "1024x1024";
    const quality = input.quality || "auto";
    const background = input.background || "";
    const responseFormat = input.responseFormat || "b64_json";
    const userIdea = input.idea || "";
    const prompt = String(input.directPrompt || input.optimizedPrompt || input.idea || DEFAULT_IDEA).trim();
    const referenceImages = decodeReferenceImages(input.referenceImages, run);
    if (!prompt) throw new Error("请先填写直接生图提示词或测试需求。");

    run.phase = referenceImages.length ? "直接图生图/改图" : "直接文生图";
    addLog(run, referenceImages.length
      ? `直接生图：检测到 ${referenceImages.length} 张参考图，正在调用 /images/edits...`
      : "直接生图：未上传参考图，正在调用 /images/generations...");

    const imageData = referenceImages.length
      ? await generateImageEdit({
          relayBaseUrl,
          apiKey,
          model: imageModel,
          prompt,
          imageSize,
          quality,
          background,
          responseFormat,
          referenceImages,
        })
      : await generateImage({
          relayBaseUrl,
          apiKey,
          model: imageModel,
          prompt,
          imageSize,
          quality,
          background,
          responseFormat,
        });
    const imageArtifact = saveImageArtifact(imageData, run);
    run.result = {
      runId: run.id,
      appUrl: "",
      promptMode: "image-only",
      relayBaseUrl,
      maskedApiKey: maskSecret(apiKey),
      targetModelId: imageModel,
      imageModel,
      generatorModelIds: [],
      evaluatorModelIds: [],
      imageJudgeModels: [],
      userIdea,
      optimizedPrompt: prompt,
      promptScore: null,
      promptEvaluation: null,
      referenceImages: referenceImages.map(({ buffer, ...image }) => image),
      imageOptions: { imageSize, quality, background, responseFormat },
      imageGeneration: { ok: true, mode: referenceImages.length ? "image-to-image" : "text-to-image", usage: imageData.usage || null },
      imageArtifact,
      imageJudges: [],
      imageJudgeAverage: null,
      rawGenerateMeta: { imageOnly: true },
      rawGenerateStats: {},
    };
    writeRunFiles(run);
    run.status = "done";
    run.phase = "直接生图完成";
    addLog(run, `直接生图完成: ${imageArtifact?.fileName || imageArtifact?.url || "response received"}`);
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
    .ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; margin-top: 10px; }
    .ref-grid img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); }
    .file-hint { border: 1px dashed rgba(165,180,252,.45); border-radius: 14px; padding: 14px; background: rgba(99,102,241,.08); }
    .toolbox { border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 14px; background: rgba(255,255,255,.035); }
    .model-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .model-grid select { min-height: 190px; padding: 8px; }
    .small-btn { padding: 8px 10px; border-radius: 10px; font-size: 12px; background: rgba(99,102,241,.72); }
    .secondary { background: rgba(255,255,255,.11); }
    .history-list { display: grid; gap: 10px; max-height: 360px; overflow: auto; }
    .history-item { border: 1px solid rgba(255,255,255,.09); border-radius: 12px; padding: 10px; background: rgba(255,255,255,.035); cursor: pointer; }
    .history-item:hover { border-color: rgba(129,140,248,.55); background: rgba(99,102,241,.09); }
    .history-thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); float: left; margin-right: 10px; }
    .danger { color: #fca5a5; }
    .ok { color: #86efac; }
    @media (max-width: 900px) { .model-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .grid, .cols { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>GPT Image 2 共同真实测试面板</h1>
      <p>三步一起跑：1. 先测提示词质量；2. 真实生成图片；3. 多个 AI 评图。默认由本机面板直接调用中转站生成提示词，避开网站 524 超时；最后你再填人工评分，页面会把 AI 平均分和你的分数放一起比较。API Key 只发给本机 127.0.0.1 临时服务，不保存到文件。</p>
      <div class="grid">
        <div>
          <label>中转站 Base URL</label>
          <input id="baseUrl" value="https://naapi.cc" />
        </div>
        <div>
          <label>API Key，隐藏输入</label>
          <input id="apiKey" type="password" autocomplete="off" placeholder="粘贴 sk-...，不会显示" />
          <label style="margin-top:8px"><input id="rememberKey" type="checkbox" checked style="width:auto" /> 只保存到本机浏览器，下次自动填入</label>
        </div>
        <div>
          <label>提示词生成方式</label>
          <select id="promptMode">
            <option value="direct" selected>本地直连中转站，推荐，不怕网站 524</option>
            <option value="app">调用网站 API，失败后自动降级本地直连</option>
          </select>
        </div>
        <div>
          <label>图片模型</label>
          <input id="imageModel" value="gpt-image-2" />
        </div>
        <div class="full">
          <label>网站地址，仅在“调用网站 API”模式使用</label>
          <input id="appUrl" value="https://www.myprompt.asia" />
        </div>
        <div class="full toolbox">
          <div class="row">
            <strong>同步模型选择器</strong>
            <span id="modelSyncStatus" class="muted">读取项目模型注册表中...</span>
          </div>
          <p class="muted">这里同步主项目的 public/models.json；填入 Key 后可再探测中转站真实可用模型。下面可手动多选，仍然保留逗号输入作为高级自定义。</p>
          <div class="row" style="justify-content:flex-start">
            <button id="loadModelsBtn" type="button" class="small-btn secondary">同步项目模型</button>
            <button id="probeModelsBtn" type="button" class="small-btn">探测中转站可用模型</button>
            <button id="applyModelSelectBtn" type="button" class="small-btn secondary">把选择写入输入框</button>
          </div>
          <div class="model-grid" style="margin-top:12px">
            <div>
              <label>目标模型 Target，同步全部模型</label>
              <select id="targetModelSelect"></select>
              <input id="targetModel" value="gpt-image-2" style="margin-top:8px" />
            </div>
            <div>
              <label>生图模型 Image，只显示图片模型</label>
              <select id="imageModelSelect"></select>
            </div>
            <div>
              <label>图片评价模型 Image Judges，多选</label>
              <select id="imageJudgeModelSelect" multiple></select>
            </div>
            <div>
              <label>提示词生成器模型 Generators，多选</label>
              <select id="generatorModelSelect" multiple></select>
            </div>
            <div>
              <label>提示词评价模型 Evaluators，多选</label>
              <select id="evaluatorModelSelect" multiple></select>
            </div>
            <div>
              <label>本地学习记忆</label>
              <div id="learningSummary" class="muted logs" style="height:190px"></div>
            </div>
          </div>
        </div>
        <div class="full">
          <label>测试需求，也就是用户原始想法</label>
          <textarea id="idea">${DEFAULT_IDEA}</textarea>
        </div>
        <div class="full file-hint">
          <label>参考图，可选。上传 1 张或多张后会自动做图生图/改图，不上传则做文生图。</label>
          <input id="referenceImages" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          <p class="muted">建议每张图片先压到 10MB 以内。多图会一起传给 /v1/images/edits，用于测试提示词对参考图的保持、迁移、局部修改和风格优化能力。</p>
          <div id="referencePreview" class="ref-grid"></div>
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
        <div>
          <label>背景参数，可选</label>
          <input id="background" placeholder="auto / transparent / opaque，可留空" />
        </div>
        <div>
          <label>返回格式</label>
          <select id="responseFormat">
            <option value="b64_json" selected>b64_json，本地保存图片</option>
            <option value="url">url，如果中转站支持</option>
          </select>
        </div>
        <div class="full">
          <label>直接生图提示词，可选。填这里后可以不跑测评，直接文生图/图生图。</label>
          <textarea id="directPrompt" placeholder="可以粘贴任意生图提示词；空则用上面的测试需求。"></textarea>
        </div>
        <div class="full row">
          <label><input id="openFolder" type="checkbox" checked style="width:auto" /> 完成后自动打开报告文件夹</label>
          <div class="row">
            <button id="imageOnlyBtn" type="button" class="secondary">只生图/改图</button>
            <button id="startBtn">开始完整测试</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="row">
        <strong>历史记录与人工反馈学习</strong>
        <button id="refreshHistoryBtn" type="button" class="small-btn secondary">刷新历史</button>
      </div>
      <p class="muted">历史、图片、你的评分和评价都保存在本机 reports/gpt-image2-live-review。你的差评原因会沉淀成本地学习记忆，用于下次提示词优化。</p>
      <div id="historyList" class="history-list"></div>
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
          <p><strong>生成模式：</strong><span id="imageMode">--</span></p>
          <p><strong>本次参考图</strong></p>
          <div id="resultRefs" class="ref-grid"></div>
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
    let selectedReferenceImages = [];
    let modelOptions = { imageModels: [], textModels: [], visionTextModels: [] };
    const $ = (id) => document.getElementById(id);
    function formValue(id) { return $(id).value.trim(); }
    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }
    function csv(value) {
      return String(value || "").split(",").map(v => v.trim()).filter(Boolean);
    }
    function selectedValues(id) {
      return Array.from($(id).selectedOptions || []).map(option => option.value).filter(Boolean);
    }
    function setSelectedValues(id, values) {
      const wanted = new Set(values);
      Array.from($(id).options || []).forEach(option => { option.selected = wanted.has(option.value); });
    }
    function optionLabel(model) {
      const status = model.available === true ? "✓ " : model.available === false ? "· " : "";
      const tags = (model.tags || []).slice(0, 3).join("/");
      return status + model.name + " · " + model.id + " · " + model.provider + (tags ? " · " + tags : "");
    }
    function fillSelect(id, models, selectedIds, limit) {
      const select = $(id);
      const selected = new Set(selectedIds);
      select.innerHTML = models.slice(0, limit || 260).map(model =>
        "<option value='" + escapeHtml(model.id) + "'" + (selected.has(model.id) ? " selected" : "") + ">" + escapeHtml(optionLabel(model)) + "</option>"
      ).join("");
    }
    function syncInputsFromSelects() {
      if (selectedValues("targetModelSelect")[0]) $("targetModel").value = selectedValues("targetModelSelect")[0];
      if (selectedValues("imageModelSelect")[0]) $("imageModel").value = selectedValues("imageModelSelect")[0];
      const generators = selectedValues("generatorModelSelect").slice(0, 6);
      const evaluators = selectedValues("evaluatorModelSelect").slice(0, 6);
      const imageJudges = selectedValues("imageJudgeModelSelect").slice(0, 6);
      if (generators.length) $("generatorModels").value = generators.join(",");
      if (evaluators.length) $("evaluatorModels").value = evaluators.join(",");
      if (imageJudges.length) $("imageJudgeModels").value = imageJudges.join(",");
    }
    function syncSelectsFromInputs() {
      setSelectedValues("targetModelSelect", [formValue("targetModel") || "gpt-image-2"]);
      setSelectedValues("imageModelSelect", [formValue("imageModel") || "gpt-image-2"]);
      setSelectedValues("generatorModelSelect", csv(formValue("generatorModels")));
      setSelectedValues("evaluatorModelSelect", csv(formValue("evaluatorModels")));
      setSelectedValues("imageJudgeModelSelect", csv(formValue("imageJudgeModels")));
    }
    function renderModelOptions() {
      const targetId = formValue("targetModel") || "gpt-image-2";
      const imageId = formValue("imageModel") || "gpt-image-2";
      const targetModels = modelOptions.targetModels || modelOptions.models || [];
      const imageModels = modelOptions.imageModels && modelOptions.imageModels.length ? modelOptions.imageModels : modelOptions.models || [];
      const generatorModels = modelOptions.generatorModels || modelOptions.textModels || [];
      const evaluatorModels = modelOptions.evaluatorModels || modelOptions.textModels || [];
      fillSelect("targetModelSelect", targetModels, [targetId], 320);
      fillSelect("imageModelSelect", imageModels, [imageId], 220);
      fillSelect("generatorModelSelect", generatorModels, csv(formValue("generatorModels")), 260);
      fillSelect("evaluatorModelSelect", evaluatorModels, csv(formValue("evaluatorModels")), 260);
      fillSelect("imageJudgeModelSelect", modelOptions.visionTextModels || evaluatorModels, csv(formValue("imageJudgeModels")), 260);
      syncSelectsFromInputs();
    }
    async function loadModelOptions(probeRelay) {
      $("modelSyncStatus").textContent = probeRelay ? "正在探测中转站模型..." : "正在同步项目模型...";
      const apiKey = formValue("apiKey");
      const baseUrl = formValue("baseUrl");
      const res = await fetch(probeRelay ? "/api/probe-models" : "/api/model-options", {
        method: probeRelay ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: probeRelay ? JSON.stringify({ apiKey, baseUrl }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "模型同步失败");
      modelOptions = data;
      renderModelOptions();
      $("modelSyncStatus").textContent = probeRelay
        ? "已同步项目模型 " + data.total + " 个，中转站可用 " + data.availableCount + " 个"
        : "已同步项目模型 " + data.total + " 个";
    }
    function saveLocalSettings() {
      const data = {
        baseUrl: formValue("baseUrl"),
        appUrl: formValue("appUrl"),
        promptMode: formValue("promptMode"),
        targetModel: formValue("targetModel"),
        imageModel: formValue("imageModel"),
        generatorModels: formValue("generatorModels"),
        evaluatorModels: formValue("evaluatorModels"),
        imageJudgeModels: formValue("imageJudgeModels"),
        imageSize: formValue("imageSize"),
        quality: formValue("quality"),
        background: formValue("background"),
        responseFormat: formValue("responseFormat"),
        apiKey: $("rememberKey").checked ? formValue("apiKey") : "",
      };
      localStorage.setItem("gpt_image2_panel_settings", JSON.stringify(data));
    }
    function loadLocalSettings() {
      try {
        const data = JSON.parse(localStorage.getItem("gpt_image2_panel_settings") || "{}");
        for (const id of ["baseUrl", "appUrl", "promptMode", "targetModel", "imageModel", "generatorModels", "evaluatorModels", "imageJudgeModels", "imageSize", "quality", "background", "responseFormat"]) {
          if (data[id] && $(id)) $(id).value = data[id];
        }
        if (data.apiKey) $("apiKey").value = data.apiKey;
      } catch {}
    }
    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
    }
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
      $("imageMode").textContent = r.imageGeneration && r.imageGeneration.mode === "image-to-image" ? "图生图 / 改图" : "文生图";
      $("prompt").textContent = r.optimizedPrompt || "";
      if (r.imageArtifact && r.imageArtifact.browserUrl) $("image").src = r.imageArtifact.browserUrl;
      $("resultRefs").innerHTML = (r.referenceImages || []).length
        ? r.referenceImages.map(img => "<div><img src='" + img.browserUrl + "' alt='" + escapeHtml(img.fileName) + "' /><div class='muted'>" + escapeHtml(img.fileName) + "</div></div>").join("")
        : "<div class='muted'>未上传参考图，本次为文生图。</div>";
      $("judges").innerHTML = (r.imageJudges || []).map(j => {
        const body = j.ok
          ? "<div><strong>" + j.model + "</strong>: " + (j.score ?? "n/a") + "/100</div><div class='muted'>" + ((j.result && j.result.verdict) || "") + "</div>"
          : "<div class='danger'><strong>" + j.model + "</strong>: " + j.error + "</div>";
        const issues = j.result && Array.isArray(j.result.issues) ? "<div class='muted'>问题: " + j.result.issues.join("；") + "</div>" : "";
        return "<div class='judge'>" + body + issues + "</div>";
      }).join("");
      $("files").textContent = r.files ? "报告已保存: " + r.files.mdPath : "";
    }
    async function loadHistory() {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (!res.ok) return;
      $("learningSummary").textContent = (data.learning?.rules || []).length
        ? data.learning.rules.map((rule, index) => (index + 1) + ". " + rule.label + "：" + rule.rule).join("\\n")
        : "还没有人工反馈学习记忆。保存你的评分和评价后，这里会自动生成后续优化规则。";
      $("historyList").innerHTML = (data.entries || []).length
        ? data.entries.map(item => {
            const score = item.userScore == null ? "未评分" : "你 " + item.userScore + " / AI " + (item.imageJudgeAverage ?? "--");
            return "<div class='history-item' data-run='" + escapeHtml(item.runId) + "'>" +
              "<img class='history-thumb' src='" + escapeHtml(item.imageBrowserUrl) + "' onerror='this.style.display=\"none\"' />" +
              "<div><strong>" + escapeHtml(score) + "</strong><span class='muted'> · " + escapeHtml(item.mode) + " · " + escapeHtml(item.runId) + "</span></div>" +
              "<div class='muted'>" + escapeHtml(item.userIdea) + "</div>" +
              (item.userNotes ? "<div class='muted'>你的评价：" + escapeHtml(item.userNotes) + "</div>" : "") +
              "<div style='clear:both'></div></div>";
          }).join("")
        : "<div class='muted'>暂无历史。跑一次完整测试或直接生图后会出现在这里。</div>";
      Array.from(document.querySelectorAll(".history-item")).forEach(item => {
        item.onclick = async () => {
          const res = await fetch("/api/history/" + encodeURIComponent(item.dataset.run));
          const run = await res.json();
          if (res.ok) renderResult({ id: item.dataset.run, result: run.report });
        };
      });
    }
    async function poll() {
      if (!runId) return;
      const res = await fetch("/api/run/" + runId);
      const run = await res.json();
      setLogs(run);
      if (run.status === "done" || run.status === "failed") {
        clearInterval(pollTimer);
        $("startBtn").disabled = false;
        $("imageOnlyBtn").disabled = false;
        renderResult(run);
        loadHistory();
      }
    }
    $("startBtn").onclick = async () => {
      $("startBtn").disabled = true;
      $("imageOnlyBtn").disabled = true;
      syncInputsFromSelects();
      saveLocalSettings();
      $("result").style.display = "none";
      $("logs").textContent = "";
      $("error").textContent = "";
      const payload = {
        apiKey: formValue("apiKey"),
        baseUrl: formValue("baseUrl"),
        appUrl: formValue("appUrl"),
        promptMode: formValue("promptMode"),
        targetModel: formValue("targetModel"),
        idea: $("idea").value,
        generatorModels: formValue("generatorModels"),
        evaluatorModels: formValue("evaluatorModels"),
        imageJudgeModels: formValue("imageJudgeModels"),
        imageModel: formValue("imageModel"),
        imageSize: formValue("imageSize"),
        quality: formValue("quality"),
        background: formValue("background"),
        responseFormat: formValue("responseFormat"),
        referenceImages: selectedReferenceImages,
        openFolder: $("openFolder").checked
      };
      if (!payload.apiKey) {
        alert("请先填 API Key");
        $("startBtn").disabled = false;
        $("imageOnlyBtn").disabled = false;
        return;
      }
      const res = await fetch("/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "启动失败");
        $("startBtn").disabled = false;
        $("imageOnlyBtn").disabled = false;
        return;
      }
      if (!$("rememberKey").checked) $("apiKey").value = "";
      runId = data.runId;
      pollTimer = setInterval(poll, 1400);
      poll();
    };
    $("imageOnlyBtn").onclick = async () => {
      $("imageOnlyBtn").disabled = true;
      $("startBtn").disabled = true;
      syncInputsFromSelects();
      saveLocalSettings();
      $("result").style.display = "none";
      $("logs").textContent = "";
      $("error").textContent = "";
      const payload = {
        apiKey: formValue("apiKey"),
        baseUrl: formValue("baseUrl"),
        idea: $("idea").value,
        directPrompt: $("directPrompt").value,
        imageModel: formValue("imageModel"),
        imageSize: formValue("imageSize"),
        quality: formValue("quality"),
        background: formValue("background"),
        responseFormat: formValue("responseFormat"),
        referenceImages: selectedReferenceImages,
        openFolder: $("openFolder").checked
      };
      if (!payload.apiKey) {
        alert("请先填 API Key");
        $("imageOnlyBtn").disabled = false;
        $("startBtn").disabled = false;
        return;
      }
      const res = await fetch("/api/image-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "启动失败");
        $("imageOnlyBtn").disabled = false;
        $("startBtn").disabled = false;
        return;
      }
      if (!$("rememberKey").checked) $("apiKey").value = "";
      runId = data.runId;
      pollTimer = setInterval(poll, 1400);
      poll();
    };
    $("referenceImages").onchange = async () => {
      const files = Array.from($("referenceImages").files || []).slice(0, 8);
      selectedReferenceImages = [];
      $("referencePreview").innerHTML = files.map(file => "<div><div class='muted'>读取中...</div><div class='muted'>" + escapeHtml(file.name) + "</div></div>").join("");
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 15 * 1024 * 1024) {
          alert(file.name + " 超过 15MB，建议先压缩后再测。");
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        selectedReferenceImages.push({ name: file.name, type: file.type, size: file.size, dataUrl });
      }
      $("referencePreview").innerHTML = selectedReferenceImages.length
        ? selectedReferenceImages.map(item => "<div><img src='" + item.dataUrl + "' alt='" + escapeHtml(item.name) + "' /><div class='muted'>" + escapeHtml(item.name) + "</div></div>").join("")
        : "<div class='muted'>未选择参考图。</div>";
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
      await loadHistory();
    };
    $("loadModelsBtn").onclick = () => loadModelOptions(false).catch(error => alert(error.message));
    $("probeModelsBtn").onclick = () => {
      if (!formValue("apiKey")) return alert("先填 API Key，才能探测中转站可用模型。");
      saveLocalSettings();
      loadModelOptions(true).catch(error => alert(error.message));
    };
    $("applyModelSelectBtn").onclick = syncInputsFromSelects;
    $("targetModelSelect").onchange = syncInputsFromSelects;
    $("imageModelSelect").onchange = syncInputsFromSelects;
    $("generatorModelSelect").onchange = syncInputsFromSelects;
    $("evaluatorModelSelect").onchange = syncInputsFromSelects;
    $("imageJudgeModelSelect").onchange = syncInputsFromSelects;
    $("refreshHistoryBtn").onclick = loadHistory;
    loadLocalSettings();
    loadModelOptions(false).catch(error => { $("modelSyncStatus").textContent = error.message; });
    loadHistory();
  </script>
</body>
</html>`;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (req.method === "GET" && url.pathname === "/") return html(res, page());

    if (req.method === "GET" && url.pathname === "/api/model-options") {
      return json(res, 200, modelOptionsPayload([]));
    }

    if (req.method === "POST" && url.pathname === "/api/probe-models") {
      const input = await readBody(req);
      if (!input.apiKey || String(input.apiKey).trim().length < 8) {
        return json(res, 400, { error: "API key looks empty or too short." });
      }
      const relayBaseUrl = normalizeOpenAiBase(input.baseUrl || "https://naapi.cc");
      const relayModels = await listRelayModels(relayBaseUrl, input.apiKey);
      const payload = modelOptionsPayload(relayModels.ids);
      return json(res, relayModels.ok ? 200 : 502, { ...payload, relayError: relayModels.error });
    }

    if (req.method === "GET" && url.pathname === "/api/history") {
      const currentLearning = readJsonFile(LEARNING_PATH, { rules: [], examples: [] });
      return json(res, 200, {
        entries: loadHistoryEntries(),
        learning: currentLearning.rules?.length ? currentLearning : rebuildLearningMemoryFromReports(),
      });
    }

    const historyMatch = url.pathname.match(/^\/api\/history\/(.+)$/);
    if (req.method === "GET" && historyMatch) {
      const runId = decodeURIComponent(historyMatch[1]);
      const report = loadReport(runId);
      if (!report) return json(res, 404, { error: "History report not found" });
      return json(res, 200, { report });
    }

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

    if (req.method === "POST" && url.pathname === "/api/image-only") {
      const input = await readBody(req);
      if (!input.apiKey || String(input.apiKey).trim().length < 8) {
        return json(res, 400, { error: "API key looks empty or too short." });
      }
      const id = new Date().toISOString().replace(/[:.]/g, "-");
      const run = { id, status: "running", phase: "排队", logs: [], result: null, error: null };
      runs.set(id, run);
      json(res, 200, { runId: id });
      runImageOnly(run, input);
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
      let run = runs.get(body.runId);
      if (!run || !run.result) {
        const report = loadReport(body.runId);
        if (report) {
          run = { id: body.runId, status: "done", phase: "历史", logs: [], result: report, error: null };
          runs.set(body.runId, run);
        }
      }
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
      const runId = decodeURIComponent(artifactMatch[1]);
      const run = runs.get(runId);
      const report = run?.result || loadReport(runId);
      const filePath = report?.imageArtifact?.filePath;
      if (!filePath || !fs.existsSync(filePath)) return text(res, 404, "Image not found");
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const refMatch = url.pathname.match(/^\/artifact\/([^/]+)\/ref\/(\d+)$/);
    if (req.method === "GET" && refMatch) {
      const runId = decodeURIComponent(refMatch[1]);
      const run = runs.get(runId);
      const report = run?.result || loadReport(runId);
      const index = Number(refMatch[2]);
      const reference = report?.referenceImages?.find((image) => image.index === index);
      if (!reference?.filePath || !fs.existsSync(reference.filePath)) {
        return text(res, 404, "Reference image not found");
      }
      res.writeHead(200, { "Content-Type": reference.mimeType || "image/png", "Cache-Control": "no-store" });
      fs.createReadStream(reference.filePath).pipe(res);
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

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    const url = `http://${HOST}:${PORT}/`;
    console.log("");
    console.log(`GPT Image 2 live review panel is already running: ${url}`);
    console.log("Opening the existing single panel instead of starting another one.");
    if (process.env.NO_OPEN_BROWSER !== "1") openBrowser(url);
    process.exit(0);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log("");
  console.log("GPT Image 2 live review panel is ready:");
  console.log(url);
  console.log("");
  console.log("Close this terminal window to stop the local panel.");
  if (process.env.NO_OPEN_BROWSER !== "1") openBrowser(url);
});
