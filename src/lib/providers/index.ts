// ============================================================
//  Provider adapters — unified interface for all AI APIs
//  [S3] All adapters validate API key existence before calling
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
  userKeys?: Record<string, string>; // keys supplied by the user at runtime
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// ── [S3 FIX] Key validation map ───────────────────────────────
const KEY_MAP: Record<string, string> = {
  openai:    "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google:    "GOOGLE_API_KEY",
  groq:      "GROQ_API_KEY",
  xai:       "XAI_API_KEY",
  mistral:   "MISTRAL_API_KEY",
  deepseek:  "DEEPSEEK_API_KEY",
  zhipu:     "ZHIPU_API_KEY",
  moonshot:  "MOONSHOT_API_KEY",
  qwen:      "QWEN_API_KEY",
  baidu:     "BAIDU_API_KEY",
};

/** Resolve an API key: user-supplied key takes priority over server env var */
function resolveKey(provider: string, userKeys?: Record<string, string>): string {
  const envVar = KEY_MAP[provider];
  if (!envVar) return "";
  // User's own key wins
  const userKey = userKeys?.[envVar]?.trim();
  if (userKey) return userKey;
  // Fall back to server env (admin default)
  return process.env[envVar] ?? "";
}

function assertKey(provider: string, userKeys?: Record<string, string>): void {
  const envVar = KEY_MAP[provider];
  if (envVar && !resolveKey(provider, userKeys)) {
    throw new Error(
      `缺少 ${provider} 的 API Key，请点击右上角钥匙图标填入你的 ${envVar}`
    );
  }
}

// ─── OpenAI ──────────────────────────────────────────────────
async function callOpenAI(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("openai", opts.userKeys);
  const client = new OpenAI({ apiKey: resolveKey("openai", opts.userKeys) });
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
    text: res.choices[0].message.content ?? "",
    inputTokens:  res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Anthropic ───────────────────────────────────────────────
async function callAnthropic(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("anthropic", opts.userKeys);
  const client = new Anthropic({ apiKey: resolveKey("anthropic", opts.userKeys) });
  const t0 = Date.now();
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const text = res.content
    .filter((c) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
  return {
    text,
    inputTokens:  res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    latencyMs: Date.now() - t0,
  };
}

// ─── Google Gemini ────────────────────────────────────────────
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
  const result = await model.generateContent(opts.userPrompt);
  const text   = result.response.text();
  const usage  = result.response.usageMetadata;
  return {
    text,
    inputTokens:  usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Groq (Meta Llama) ────────────────────────────────────────
async function callGroq(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("groq", opts.userKeys);
  const t0 = Date.now();
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    },
    { headers: { Authorization: `Bearer ${resolveKey("groq", opts.userKeys)}` } }
  );
  return {
    text: res.data.choices[0].message.content ?? "",
    inputTokens:  res.data.usage?.prompt_tokens ?? 0,
    outputTokens: res.data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── xAI Grok ─────────────────────────────────────────────────
async function callXAI(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("xai", opts.userKeys);
  const client = new OpenAI({
    apiKey: resolveKey("xai", opts.userKeys),
    baseURL: "https://api.x.ai/v1",
  });
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
    text: res.choices[0].message.content ?? "",
    inputTokens:  res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Mistral AI ───────────────────────────────────────────────
async function callMistral(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("mistral", opts.userKeys);
  const t0 = Date.now();
  const res = await axios.post(
    "https://api.mistral.ai/v1/chat/completions",
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    },
    { headers: { Authorization: `Bearer ${resolveKey("mistral", opts.userKeys)}` } }
  );
  return {
    text: res.data.choices[0].message.content ?? "",
    inputTokens:  res.data.usage?.prompt_tokens ?? 0,
    outputTokens: res.data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── DeepSeek ─────────────────────────────────────────────────
async function callDeepSeek(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("deepseek", opts.userKeys);
  const client = new OpenAI({
    apiKey: resolveKey("deepseek", opts.userKeys),
    baseURL: "https://api.deepseek.com/v1",
  });
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
    text: res.choices[0].message.content ?? "",
    inputTokens:  res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Zhipu GLM ────────────────────────────────────────────────
async function callZhipu(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("zhipu", opts.userKeys);
  const t0 = Date.now();
  const res = await axios.post(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
    },
    { headers: { Authorization: `Bearer ${resolveKey("zhipu", opts.userKeys)}` } }
  );
  return {
    text: res.data.choices[0].message.content ?? "",
    inputTokens:  res.data.usage?.prompt_tokens ?? 0,
    outputTokens: res.data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Moonshot Kimi ────────────────────────────────────────────
async function callMoonshot(opts: GenerateOptions): Promise<GenerateResult> {
  assertKey("moonshot", opts.userKeys);
  const client = new OpenAI({
    apiKey: resolveKey("moonshot", opts.userKeys),
    baseURL: "https://api.moonshot.cn/v1",
  });
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
    text: res.choices[0].message.content ?? "",
    inputTokens:  res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Alibaba Qwen ──────────────────────────────────────────────
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
      headers: {
        Authorization: `Bearer ${resolveKey("qwen", opts.userKeys)}`,
        "Content-Type": "application/json",
      },
    }
  );
  return {
    text: res.data.choices[0].message.content ?? "",
    inputTokens:  res.data.usage?.input_tokens ?? 0,
    outputTokens: res.data.usage?.output_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Baidu ERNIE ──────────────────────────────────────────────
async function getBaiduToken(userKeys?: Record<string, string>): Promise<string> {
  const apiKey    = userKeys?.["BAIDU_API_KEY"]?.trim()    || process.env.BAIDU_API_KEY;
  const secretKey = userKeys?.["BAIDU_SECRET_KEY"]?.trim() || process.env.BAIDU_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error(
      "缺少 baidu 的 API Key，请点击右上角钥匙图标填入 BAIDU_API_KEY 和 BAIDU_SECRET_KEY"
    );
  }
  const res = await axios.post(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  );
  return res.data.access_token;
}

async function callBaidu(opts: GenerateOptions): Promise<GenerateResult> {
  const token = await getBaiduToken(opts.userKeys);
  const t0 = Date.now();
  const res = await axios.post(
    `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions_pro?access_token=${token}`,
    {
      messages: [
        { role: "user", content: `${opts.systemPrompt}\n\n${opts.userPrompt}` },
      ],
      max_output_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
    }
  );
  return {
    text: res.data.result ?? "",
    inputTokens:  res.data.usage?.prompt_tokens ?? 0,
    outputTokens: res.data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

// ─── Ollama (local, no API key required) ─────────────────────
async function callOllama(opts: GenerateOptions): Promise<GenerateResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const t0 = Date.now();
  const res = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt   },
      ],
      stream: false,
      options: { temperature: opts.temperature ?? 0.7 },
    },
    { timeout: 120_000 }  // local inference can be slow on CPU
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

// ─── Dispatcher ───────────────────────────────────────────────
export async function callProvider(opts: GenerateOptions): Promise<GenerateResult> {
  switch (opts.apiProvider) {
    case "openai":    return callOpenAI(opts);
    case "anthropic": return callAnthropic(opts);
    case "google":    return callGoogle(opts);
    case "groq":      return callGroq(opts);
    case "xai":       return callXAI(opts);
    case "mistral":   return callMistral(opts);
    case "deepseek":  return callDeepSeek(opts);
    case "zhipu":     return callZhipu(opts);
    case "moonshot":  return callMoonshot(opts);
    case "qwen":      return callQwen(opts);
    case "baidu":     return callBaidu(opts);
    case "ollama":    return callOllama(opts);
    default:
      throw new Error(`Unknown API provider: ${opts.apiProvider}`);
  }
}
