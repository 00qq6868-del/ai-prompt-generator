// src/app/api/keys/route.ts
// GET /api/keys — returns which providers have API keys configured
// Never exposes actual key values — only boolean presence

import { NextResponse } from "next/server";

const PROVIDER_KEYS: Record<string, string[]> = {
  openai:    ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google:    ["GOOGLE_API_KEY"],
  groq:      ["GROQ_API_KEY"],
  xai:       ["XAI_API_KEY"],
  mistral:   ["MISTRAL_API_KEY"],
  deepseek:  ["DEEPSEEK_API_KEY"],
  zhipu:     ["ZHIPU_API_KEY"],
  moonshot:  ["MOONSHOT_API_KEY"],
  qwen:      ["QWEN_API_KEY"],
  baidu:     ["BAIDU_API_KEY", "BAIDU_SECRET_KEY"], // both required
};

export async function GET() {
  const configured: string[] = [];
  const missing: string[]    = [];

  for (const [provider, vars] of Object.entries(PROVIDER_KEYS)) {
    const allSet = vars.every((v) => !!process.env[v]);
    if (allSet) configured.push(provider);
    else        missing.push(provider);
  }

  return NextResponse.json({
    configured,
    missing,
    total: Object.keys(PROVIDER_KEYS).length,
    hints: Object.fromEntries(missing.map((p) => [p, PROVIDER_KEYS[p]])),
  });
}
