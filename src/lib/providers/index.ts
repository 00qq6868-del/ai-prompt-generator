// ============================================================
//  Provider adapters — unified interface for all AI APIs
// ============================================================

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

export interface GenerateOptions {
  model: string;
  apiProvider: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  userKeys?: Record<string, string>;
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// ── Constants ─────────────────────────────────────────────────

const API_TIMEOUT = 260_000;

const KEY_MAP: Record<string, string> = {
  custom:       "CUSTOM_API_KEY",
  aihubmix:     "AIHUBMIX_API_KEY",
  openai:       "OPENAI_API_KEY",
  anthropic:    "ANTHROPIC_API_KEY",
  google:       "GOOGLE_API_KEY",
  groq:         "GROQ_API_KEY",
  xai:          "XAI_API_KEY",
  mistral:      "MISTRAL_API_KEY",
  deepseek:     "DEEPSEEK_API_KEY",
  zhipu:        "ZHIPU_API_KEY",
  moonshot:     "MOONSHOT_API_KEY",
  qwen:         "QWEN_API_KEY",
  baidu:        "BAIDU_API_KEY",
  baidu_secret: "BAIDU_SECRET_KEY",
};

const OPENAI_COMPAT_ENDPOINTS: Record<string, string | undefined> = {
  openai:   undefined,
  xai:      "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  moonshot: "https://api.moonshot.cn/v1",
};

const AXIOS_ENDPOINTS: Record<string, string> = {
  groq:    "https://api.groq.com/openai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  zhipu:   "https://open.bigmodel.cn/api/paas/v4/chat/completions",
};

// ── Utility functions ─────────────────────────────────────────

function resolveKey(provider: string, userKeys?: Record<string, string>): string {
  const envVar = KEY_MAP[provider];
  if (!envVar) return "";
  const userKey = userKeys?.[envVar]?.trim();
  if (userKey) return userKey;
  return process.env[envVar] ?? "";
}

function assertKey(provider: string, userKeys?: Record<string, string>): void {
  const envVar = KEY_MAP[provider];
  if (envVar && !resolveKey(provider, userKeys)) {
    throw new Error(
      `Missing ${provider} API Key. 缺少 ${provider} 的 API Key，请点击右上角🔑图标填入你的 ${envVar}`
    );
  }
}

function validateBaseURL(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "Invalid Base URL format. 无效的 Base URL 格式，请检查是否以 https:// 开头"
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      "Base URL must use HTTP(S). Base URL 必须使用 HTTP 或 HTTPS 协议"
    );
  }
  const host = parsed.hostname;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal")
  ) {
    throw new Error(
      "Base URL must not point to private/internal networks. Base URL 不能指向内网地址"
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

function handleRelayError(err: unknown, model: string): never {
  if (typeof err === "object" && err !== null) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const msg = e.message ?? e.error?.message ?? "";
    if (e.status === 403 || msg.includes("无权访问") || msg.includes("permission denied")) {
      throw new Error(
        `Access denied for model ${model}. 当前 API Key 无权访问模型 ${model}，请换一个模型试试，或升级中转站套餐以解锁该模型分组。`
      );
    }
  }
  throw err;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function timeoutFor(opts: GenerateOptions, fallback = API_TIMEOUT): number {
  const value = Number(opts.timeoutMs);
  return Number.isFinite(value) && value >= 1_000 ? value : fallback;
}

function maxRetriesFor(opts: GenerateOptions): number | undefined {
  return Number.isFinite(Number(opts.timeoutMs)) ? 0 : undefined;
}

function extractMessageContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const block = part as { type?: string; text?: unknown; content?: unknown };
        if (typeof block.text === "string") return block.text;
        if (typeof block.content === "string") return block.content;
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

function extractOpenAIText(response: unknown, provider: string, model: string): string {
  const data = response as {
    choices?: Array<{ text?: string | null; message?: { content?: unknown } }>;
    output_text?: string;
  };
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
  if (typeof choice?.text === "string" && choice.text.trim()) return choice.text;
  const text = extractMessageContentText(choice?.message?.content);
  if (text.trim()) return text;
  throw new Error(
    `Empty or invalid chat completion response from ${provider}/${model}. 上游模型或中转站返回了空 choices 或非标准响应，请换一个模型、刷新中转站模型列表，或检查该模型是否支持 chat/completions。`
  );
}

function extractAxiosText(responseData: unknown, provider: string, model: string): string {
  const data = responseData as {
    choices?: Array<{ text?: string | null; message?: { content?: unknown } }>;
    output_text?: string;
  };
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
  if (typeof choice?.text === "string" && choice.text.trim()) return choice.text;
  const text = extractMessageContentText(choice?.message?.content);
  if (text.trim()) return text;
  throw new Error(
    `Empty or invalid chat completion response from ${provider}/${model}. 上游模型或中转站返回了空 choices 或非标准响应，请换一个模型、刷新中转站模型列表，或检查该模型是否支持 chat/completions。`
  );
}

// ── OpenAI-compatible (OpenAI / xAI / DeepSeek / Moonshot) ────

async function callOpenAICompatible(
  provider: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  assertKey(provider, opts.userKeys);
  const clientOpts: { apiKey: string; baseURL?: string; timeout: number; maxRetries?: number } = {
    apiKey: resolveKey(provider, opts.userKeys),
    timeout: timeoutFor(opts),
    maxRetries: maxRetriesFor(opts),
  };
  const baseURL = OPENAI_COMPAT_ENDPOINTS[provider];
  if (baseURL) clientOpts.baseURL = baseURL;

  const client = new OpenAI(clientOpts);
  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user",   content: opts.userPrompt },
    ],
  });
  return {
    text: extractOpenAIText(res, provider, opts.model),
    inputTokens:  res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ── Axios-based OpenAI-compatible (Groq / Mistral / Zhipu) ───

async function callAxiosOpenAI(
  provider: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  assertKey(provider, opts.userKeys);
  const url = AXIOS_ENDPOINTS[provider];
  const t0 = Date.now();
  const res = await axios.post(
    url,
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    },
    {
      headers: { Authorization: `Bearer ${resolveKey(provider, opts.userKeys)}` },
      timeout: timeoutFor(opts),
    }
  );
  return {
    text: extractAxiosText(res.data, provider, opts.model),
    inputTokens:  res.data.usage?.prompt_tokens ?? 0,
    outputTokens: res.data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ── Anthropic ────────────────────────────────────────────────

async function callAnthropic(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("anthropic", opts.userKeys);
  const client = new Anthropic({
    apiKey: resolveKey("anthropic", opts.userKeys),
    timeout: timeoutFor(opts),
    maxRetries: maxRetriesFor(opts),
  });
  const t0 = Date.now();
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const text = res.content
    .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("");
  return {
    text,
    inputTokens:  res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    latencyMs: Date.now() - t0,
  };
}

// ── Google Gemini ─────────────────────────────────────────────

async function callGoogle(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("google", opts.userKeys);
  const genAI = new GoogleGenerativeAI(resolveKey("google", opts.userKeys));
  const t0 = Date.now();
  const model = genAI.getGenerativeModel({
    model: opts.model,
    systemInstruction: opts.systemPrompt,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
    },
  });
  const result = await model.generateContent(opts.userPrompt, { timeout: timeoutFor(opts) });
  const text   = result.response.text();
  const usage  = result.response.usageMetadata;
  return {
    text,
    inputTokens:  usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ── Alibaba Qwen ──────────────────────────────────────────────

async function callQwen(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("qwen", opts.userKeys);
  const t0 = Date.now();
  const res = await axios.post(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    },
    {
      headers: { Authorization: `Bearer ${resolveKey("qwen", opts.userKeys)}` },
      timeout: timeoutFor(opts),
    }
  );
  return {
    text: extractAxiosText(res.data, "qwen", opts.model),
    inputTokens:  res.data.usage?.input_tokens ?? 0,
    outputTokens: res.data.usage?.output_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ── Baidu ERNIE ───────────────────────────────────────────────

async function getBaiduToken(userKeys?: Record<string, string>, timeoutMs = API_TIMEOUT): Promise<string> {
  const apiKey    = resolveKey("baidu", userKeys);
  const secretKey = resolveKey("baidu_secret", userKeys);
  if (!apiKey || !secretKey) {
    throw new Error(
      "Missing Baidu API Key/Secret. 缺少百度 API Key，请填入 BAIDU_API_KEY 和 BAIDU_SECRET_KEY"
    );
  }
  const res = await axios.post(
    "https://aip.baidubce.com/oauth/2.0/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: secretKey,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: timeoutMs,
    }
  );
  return res.data.access_token;
}

async function callBaidu(opts: GenerateOptions): Promise<GenerateResult> {
  const requestTimeout = timeoutFor(opts);
  const token = await getBaiduToken(opts.userKeys, requestTimeout);
  const ENDPOINT_MAP: Record<string, string> = {
    "ernie-4.0-8k":       "completions_pro",
    "ernie-4.0-turbo-8k": "ernie-4.0-turbo-8k",
    "ernie-3.5-8k":       "completions",
    "ernie-3.5-128k":     "ernie-3.5-128k",
    "ernie-speed-8k":     "ernie_speed",
    "ernie-speed-128k":   "ernie-speed-128k",
    "ernie-lite-8k":      "ernie-lite-8k",
  };
  const endpoint = ENDPOINT_MAP[opts.model] ?? "completions_pro";
  const t0 = Date.now();
  const res = await axios.post(
    `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${endpoint}?access_token=${token}`,
    {
      messages: [
        { role: "user", content: `${opts.systemPrompt}\n\n${opts.userPrompt}` },
      ],
      max_output_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
    },
    { timeout: requestTimeout }
  );
  return {
    text: res.data.result ?? "",
    inputTokens:  res.data.usage?.prompt_tokens ?? 0,
    outputTokens: res.data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ── Ollama (local, no API key required) ───────────────────────

async function callOllama(opts: GenerateOptions): Promise<GenerateResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const t0 = Date.now();
  const res = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
      stream: false,
      options: { temperature: opts.temperature ?? 0.7 },
    },
    { timeout: timeoutFor(opts, 120_000) }
  );
  return {
    text:         res.data.message?.content ?? "",
    inputTokens:  res.data.prompt_eval_count  ?? 0,
    outputTokens: res.data.eval_count          ?? 0,
    latencyMs:    res.data.total_duration
      ? Math.round(res.data.total_duration / 1_000_000)
      : Date.now() - t0,
  };
}

// ── Custom relay / 中转站 ─────────────────────────────────────

async function callCustom(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("custom", opts.userKeys);
  const rawURL = opts.userKeys?.["CUSTOM_BASE_URL"]?.trim() || process.env.CUSTOM_BASE_URL || "";
  if (!rawURL) {
    throw new Error(
      "Missing Base URL. 请在设置中填入中转站 Base URL（如 https://aihubmix.com/v1）"
    );
  }
  const baseURL = validateBaseURL(rawURL);
  const client = new OpenAI({
    apiKey: resolveKey("custom", opts.userKeys),
    baseURL,
    timeout: timeoutFor(opts),
    maxRetries: maxRetriesFor(opts),
  });
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    });
    return {
      text: extractOpenAIText(res, "custom", opts.model),
      inputTokens:  res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - t0,
    };
  } catch (err: unknown) {
    handleRelayError(err, opts.model);
  }
}

// ── AihubMix / 中转站（一个 Key 访问所有模型）──────────────────

async function callAihubmix(opts: GenerateOptions): Promise<GenerateResult> {
  const rawUrl    = opts.userKeys?.["CUSTOM_BASE_URL"]?.trim() || process.env.CUSTOM_BASE_URL || "";
  const customKey = opts.userKeys?.["CUSTOM_API_KEY"]?.trim() || "";
  const aihubKey  = resolveKey("aihubmix", opts.userKeys);

  let baseURL = rawUrl ? validateBaseURL(rawUrl) : "https://aihubmix.com/v1";
  if (!baseURL.endsWith("/v1") && !baseURL.endsWith("/v1/")) {
    baseURL = baseURL.replace(/\/+$/, "") + "/v1";
  }
  const apiKey = customKey || aihubKey;

  if (!apiKey) {
    throw new Error(
      "Missing API Key. 请点击🔑设置，填入中转站的 Base URL 和 API Key"
    );
  }

  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutFor(opts), maxRetries: maxRetriesFor(opts) });
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    });
    return {
      text: extractOpenAIText(res, "aihubmix", opts.model),
      inputTokens:  res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - t0,
    };
  } catch (err: unknown) {
    handleRelayError(err, opts.model);
  }
}

// ── Streaming helpers ─────────────────────────────────────────

async function streamOpenAICompatible(
  client: OpenAI,
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  const t0 = Date.now();
  const stream = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user",   content: opts.userPrompt },
    ],
    stream: true,
    stream_options: { include_usage: true },
  });

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      onChunk(delta);
    }
    if (chunk.usage) {
      inputTokens  = chunk.usage.prompt_tokens ?? 0;
      outputTokens = chunk.usage.completion_tokens ?? 0;
    }
  }

  if (inputTokens === 0 && outputTokens === 0 && text.length > 0) {
    inputTokens  = estimateTokens(opts.systemPrompt + opts.userPrompt);
    outputTokens = estimateTokens(text);
  }

  return { text, inputTokens, outputTokens, latencyMs: Date.now() - t0 };
}

async function callOpenAICompatibleStream(
  provider: string,
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  assertKey(provider, opts.userKeys);
  const clientOpts: { apiKey: string; baseURL?: string; timeout: number; maxRetries?: number } = {
    apiKey: resolveKey(provider, opts.userKeys),
    timeout: timeoutFor(opts),
    maxRetries: maxRetriesFor(opts),
  };
  const baseURL = OPENAI_COMPAT_ENDPOINTS[provider];
  if (baseURL) clientOpts.baseURL = baseURL;
  const client = new OpenAI(clientOpts);
  return streamOpenAICompatible(client, opts, onChunk);
}

async function callAnthropicStream(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  assertKey("anthropic", opts.userKeys);
  const client = new Anthropic({
    apiKey: resolveKey("anthropic", opts.userKeys),
    timeout: timeoutFor(opts),
    maxRetries: maxRetriesFor(opts),
  });
  const t0 = Date.now();

  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
  });

  let text = "";
  stream.on("text", (delta) => {
    text += delta;
    onChunk(delta);
  });

  const finalMessage = await stream.finalMessage();
  return {
    text,
    inputTokens:  finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    latencyMs: Date.now() - t0,
  };
}

async function callGoogleStream(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  assertKey("google", opts.userKeys);
  const genAI = new GoogleGenerativeAI(resolveKey("google", opts.userKeys));
  const t0 = Date.now();
  const model = genAI.getGenerativeModel({
    model: opts.model,
    systemInstruction: opts.systemPrompt,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
    },
  });

  const result = await model.generateContentStream(opts.userPrompt, { timeout: timeoutFor(opts) });
  let text = "";

  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      text += chunkText;
      onChunk(chunkText);
    }
  }

  const response = await result.response;
  const usage = response.usageMetadata;
  return {
    text,
    inputTokens:  usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
    latencyMs: Date.now() - t0,
  };
}

async function callCustomStream(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  assertKey("custom", opts.userKeys);
  const rawURL = opts.userKeys?.["CUSTOM_BASE_URL"]?.trim() || process.env.CUSTOM_BASE_URL || "";
  if (!rawURL) {
    throw new Error(
      "Missing Base URL. 请在设置中填入中转站 Base URL（如 https://aihubmix.com/v1）"
    );
  }
  const baseURL = validateBaseURL(rawURL);
  const client = new OpenAI({
    apiKey: resolveKey("custom", opts.userKeys),
    baseURL,
    timeout: timeoutFor(opts),
    maxRetries: maxRetriesFor(opts),
  });
  try {
    return await streamOpenAICompatible(client, opts, onChunk);
  } catch (err: unknown) {
    handleRelayError(err, opts.model);
  }
}

async function callAihubmixStream(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  const rawUrl    = opts.userKeys?.["CUSTOM_BASE_URL"]?.trim() || process.env.CUSTOM_BASE_URL || "";
  const customKey = opts.userKeys?.["CUSTOM_API_KEY"]?.trim() || "";
  const aihubKey  = resolveKey("aihubmix", opts.userKeys);

  let baseURL = rawUrl ? validateBaseURL(rawUrl) : "https://aihubmix.com/v1";
  if (!baseURL.endsWith("/v1") && !baseURL.endsWith("/v1/")) {
    baseURL = baseURL.replace(/\/+$/, "") + "/v1";
  }
  const apiKey = customKey || aihubKey;

  if (!apiKey) {
    throw new Error(
      "Missing API Key. 请点击🔑设置，填入中转站的 Base URL 和 API Key"
    );
  }

  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutFor(opts), maxRetries: maxRetriesFor(opts) });
  try {
    return await streamOpenAICompatible(client, opts, onChunk);
  } catch (err: unknown) {
    handleRelayError(err, opts.model);
  }
}

async function fallbackStream(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  const result = await callProvider(opts);
  onChunk(result.text);
  return result;
}

// ── Dispatchers ───────────────────────────────────────────────

export async function callProviderStream(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
): Promise<GenerateResult> {
  const p = opts.apiProvider;
  if (p in OPENAI_COMPAT_ENDPOINTS) return callOpenAICompatibleStream(p, opts, onChunk);
  switch (p) {
    case "custom":    return callCustomStream(opts, onChunk);
    case "aihubmix":  return callAihubmixStream(opts, onChunk);
    case "anthropic": return callAnthropicStream(opts, onChunk);
    case "google":    return callGoogleStream(opts, onChunk);
    default:          return fallbackStream(opts, onChunk);
  }
}

export async function callProvider(opts: GenerateOptions): Promise<GenerateResult> {
  const p = opts.apiProvider;
  if (p in OPENAI_COMPAT_ENDPOINTS) return callOpenAICompatible(p, opts);
  if (p in AXIOS_ENDPOINTS) return callAxiosOpenAI(p, opts);
  switch (p) {
    case "custom":    return callCustom(opts);
    case "aihubmix":  return callAihubmix(opts);
    case "anthropic": return callAnthropic(opts);
    case "google":    return callGoogle(opts);
    case "qwen":      return callQwen(opts);
    case "baidu":     return callBaidu(opts);
    case "ollama":    return callOllama(opts);
    default:
      throw new Error(
        `Unknown API provider: ${p}. 不支持的 API 提供商：${p}`
      );
  }
}
