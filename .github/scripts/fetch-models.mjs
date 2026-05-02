// .github/scripts/fetch-models.mjs
// 自动从各厂商 API 拉取最新模型列表，合并到 public/models.json
// 运行环境：Node.js 22+，GitHub Actions

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../..");
const MODELS_PATH = join(ROOT, "public/models.json");
const STATE_PATH = join(ROOT, "context/SYSTEM_STATE.json");

// ── Retry wrapper ────────────────────────────────────────────────────────
async function withRetry(fn, label, retries = 2, delayMs = 5000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < retries) {
        console.log(`🔄 ${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delayMs / 1000}s: ${err.message}`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.log(`❌ ${label} failed after ${retries + 1} attempts: ${err.message}`);
        return [];
      }
    }
  }
}

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
  "gpt-5":                      { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code","vision"],   d: "2025-06-01" },
  "gpt-5.1":                    { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-07-01" },
  "gpt-5.2":                    { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-08-01" },
  "gpt-5.3":                    { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-09-01" },
  "gpt-5.4":                    { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code","vision"],   d: "2025-10-01" },
  "gpt-5.5":                    { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-11-01" },
  "gpt-5-mini":                 { i: 2,    o: 8,    s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-06-01" },
  "gpt-5-nano":                 { i: 0.4,  o: 1.6,  s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2025-06-01" },
  "gpt-5-pro":                  { i: 20,   o: 80,   s: "medium",    a: "supreme", t: ["reasoning","code","vision"],   d: "2025-06-01" },
  "o3-pro":                     { i: 20,   o: 80,   s: "slow",      a: "supreme", t: ["reasoning","math","science"],  d: "2025-06-10" },
  "codex-mini":                 { i: 1.5,  o: 6,    s: "fast",      a: "high",    t: ["code"],                        d: "2025-05-16" },
  "gpt-image-1":                { i: 5,    o: 40,   s: "medium",    a: "supreme", t: ["image-gen"],                   d: "2025-04-23" },
  // ── Anthropic ───────────────────────────────────────────────
  "claude-opus-4-5":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-02-24" },
  "claude-opus-4-7":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-05-01" },
  "claude-opus-4-6":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-04-01" },
  "claude-sonnet-4-5":          { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2025-02-24" },
  "claude-sonnet-4-6":          { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2025-04-01" },
  "claude-3-5-sonnet-20241022": { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2024-10-22" },
  "claude-3-7-sonnet-20250219": { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code","thinking"],    d: "2025-02-19" },
  "claude-3-5-haiku-20241022":  { i: 0.8,  o: 4,    s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2024-10-22" },
  "claude-haiku-4-5":           { i: 1,    o: 5,    s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2025-04-15" },
  "claude-3-haiku-20240307":    { i: 0.25, o: 1.25, s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2024-03-07" },
  "claude-3-opus-20240229":     { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning"],                   d: "2024-02-29" },
  "claude-opus-4-0":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-01-01" },
  "claude-opus-4-1":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-02-01" },
  "claude-sonnet-4-0":          { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2025-01-01" },
  // ── Google ──────────────────────────────────────────────────
  "gemini-2.5-pro":             { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning","long-context"], d: "2025-03-25" },
  "gemini-2.5-flash":           { i: 0.15, o: 0.6,  s: "fast",      a: "high",    t: ["fast","cheap","vision"],       d: "2025-04-17" },
  "gemini-2.0-flash":           { i: 0.1,  o: 0.4,  s: "ultrafast", a: "high",    t: ["fast","cheap","vision"],       d: "2025-02-05" },
  "gemini-2.0-flash-lite":      { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["ultra-cheap","fast"],          d: "2025-02-05" },
  "gemini-1.5-pro":             { i: 1.25, o: 5,    s: "medium",    a: "high",    t: ["long-context","vision"],       d: "2024-05-14" },
  "gemini-1.5-flash":           { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["cheap","fast"],                d: "2024-05-14" },
  "gemini-3":                   { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning"],          d: "2025-06-01" },
  "gemini-3.1":                 { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning"],          d: "2025-08-01" },
  // ── xAI ─────────────────────────────────────────────────────
  "grok-3":                     { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["reasoning","real-time-web"],   d: "2025-02-17" },
  "grok-3-mini":                { i: 0.3,  o: 0.5,  s: "ultrafast", a: "high",    t: ["cheap","fast"],                d: "2025-02-17" },
  "grok-4":                     { i: 5,    o: 20,   s: "fast",      a: "supreme", t: ["reasoning","real-time-web"],   d: "2025-06-01" },
  "grok-code":                  { i: 2,    o: 8,    s: "fast",      a: "high",    t: ["code"],                        d: "2025-04-01" },
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
  "deepseek-v4":                { i: 0.27, o: 1.1,  s: "fast",      a: "supreme", t: ["code","math","reasoning"],     d: "2025-07-01" },
  "DeepSeek-V3.1":              { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-04-01" },
  "deepseek-v3.2":              { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-06-01" },
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
  "step-3.5":                   { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-03-01" },
  "qwen3-max":                  { i: 0.4,  o: 1.2,  s: "fast",      a: "high",    t: ["chinese","code","reasoning"],  d: "2025-06-01" },
  "qwen3-coder":                { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-07-01" },
  "glm-5":                      { i: 0.7,  o: 0.7,  s: "fast",      a: "high",    t: ["chinese","code","vision"],     d: "2025-06-01" },
  "ernie-5.0":                  { i: 0.2,  o: 0.2,  s: "medium",    a: "high",    t: ["chinese","reasoning"],         d: "2025-06-01" },
  "kimi-k2":                    { i: 2,    o: 2,    s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-09-01" },
  "minimax-m2":                 { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-06-01" },
  "seedance-1.0":               { i: 0,    o: 0,    s: "medium",    a: "high",    t: ["video-gen"],                   d: "2025-03-01" },
  "seedance-2.0":               { i: 0,    o: 0,    s: "medium",    a: "supreme", t: ["video-gen"],                   d: "2025-06-01" },
  // ── Qwen3 / 阿里巴巴 ─────────────────────────────────────────
  "qwen3-235b":                 { i: 0.4,  o: 1.2,  s: "fast",      a: "supreme", t: ["chinese","code","reasoning"],  d: "2025-04-28" },
  "qwen3-32b":                  { i: 0.1,  o: 0.3,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-04-28" },
  "qwen3-14b":                  { i: 0.06, o: 0.18, s: "ultrafast", a: "high",    t: ["chinese","cheap"],             d: "2025-04-28" },
  "qwen3-8b":                   { i: 0.04, o: 0.12, s: "ultrafast", a: "medium",  t: ["chinese","cheap"],             d: "2025-04-28" },
  "qwen3-4b":                   { i: 0.02, o: 0.06, s: "ultrafast", a: "medium",  t: ["chinese","ultra-cheap"],       d: "2025-04-28" },
  "qwen3-1.7b":                 { i: 0.01, o: 0.03, s: "ultrafast", a: "medium",  t: ["chinese","ultra-cheap"],       d: "2025-04-28" },
  "qwen3-0.6b":                 { i: 0.01, o: 0.03, s: "ultrafast", a: "low",     t: ["chinese","ultra-cheap"],       d: "2025-04-28" },
  "qwen3-next":                 { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["chinese","code","reasoning"],  d: "2025-07-01" },
  "qwen3-vl-plus":              { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese","vision"],            d: "2025-05-01" },
  "qwen3-vl-flash":             { i: 0.1,  o: 0.3,  s: "ultrafast", a: "high",    t: ["chinese","vision","cheap"],    d: "2025-05-01" },
  "qwen3-vl-235b":              { i: 0.4,  o: 1.2,  s: "fast",      a: "supreme", t: ["chinese","vision","reasoning"],d: "2025-05-01" },
  "qwen3-vl-30b":               { i: 0.1,  o: 0.3,  s: "fast",      a: "high",    t: ["chinese","vision"],            d: "2025-05-01" },
  "qwen-mt-":                   { i: 0.1,  o: 0.3,  s: "fast",      a: "high",    t: ["chinese","translation"],       d: "2025-03-01" },
  // ── MiniMax ───────────────────────────────────────────────────
  "cc-minimax-m2":              { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-06-01" },
  "mm-minimax-m2":              { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-06-01" },
  "coding-minimax-m2":          { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-06-01" },
  // ── Zhipu GLM ────────────────────────────────────────────────
  "glm-4.5v":                   { i: 0.5,  o: 0.5,  s: "fast",      a: "high",    t: ["chinese","vision"],            d: "2025-01-01" },
  "glm-4.7-flash":              { i: 0.05, o: 0.05, s: "ultrafast", a: "medium",  t: ["chinese","cheap"],             d: "2025-03-01" },
  "coding-glm-5":               { i: 0.5,  o: 0.5,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-06-01" },
  "coding-glm-4":               { i: 0.3,  o: 0.3,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-01-01" },
  "cc-glm-5":                   { i: 0.5,  o: 0.5,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-06-01" },
  "zai-glm-5":                  { i: 0.5,  o: 0.5,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-06-01" },
  // ── Baidu ERNIE ──────────────────────────────────────────────
  "ernie-4.5-turbo":            { i: 0.05, o: 0.05, s: "ultrafast", a: "high",    t: ["chinese","cheap"],             d: "2025-03-01" },
  "ernie-4.5-0.3b":             { i: 0.01, o: 0.01, s: "ultrafast", a: "low",     t: ["chinese","ultra-cheap"],       d: "2025-03-01" },
  "baidu/ERNIE-4.5":            { i: 0.1,  o: 0.1,  s: "fast",      a: "high",    t: ["chinese","reasoning"],         d: "2025-03-01" },
  // ── Cohere ───────────────────────────────────────────────────
  "command-a":                  { i: 2.5,  o: 10,   s: "fast",      a: "high",    t: ["multilingual","code"],         d: "2025-03-01" },
  "cohere-command-a":           { i: 2.5,  o: 10,   s: "fast",      a: "high",    t: ["multilingual","code"],         d: "2025-03-01" },
  "command-r-plus":             { i: 3,    o: 15,   s: "fast",      a: "high",    t: ["multilingual","reasoning"],    d: "2024-04-04" },
  "command-r":                  { i: 0.5,  o: 1.5,  s: "fast",      a: "medium",  t: ["multilingual"],                d: "2024-03-11" },
  "command":                    { i: 1,    o: 2,    s: "fast",      a: "medium",  t: ["legacy"],                      d: "2023-01-01" },
  // ── AihubMix relay mirrors ───────────────────────────────────
  "cc-deepseek-v3":             { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-04-01" },
  "cc-kimi-k2":                 { i: 2,    o: 2,    s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-09-01" },
  "cc-ernie-4.5":               { i: 0.1,  o: 0.1,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-03-01" },
  "sophnet-deepseek":           { i: 0.27, o: 1.1,  s: "fast",      a: "supreme", t: ["code","math","reasoning"],     d: "2025-07-01" },
  "DeepSeek-V3-Fast":           { i: 0.27, o: 1.1,  s: "ultrafast", a: "high",    t: ["code","math","fast"],          d: "2025-03-15" },
  "DeepSeek-R1":                { i: 0.55, o: 2.19, s: "medium",    a: "supreme", t: ["reasoning","math"],            d: "2025-01-20" },
  "Kimi-K2":                    { i: 2,    o: 2,    s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-09-01" },
  "k2.6-code":                  { i: 2,    o: 2,    s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-10-01" },
  "kimi-for-coding":            { i: 2,    o: 2,    s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-06-01" },
  // ── Older Claude ─────────────────────────────────────────────
  "claude-3-sonnet-20240229":   { i: 3,    o: 15,   s: "fast",      a: "high",    t: ["vision","code"],               d: "2024-02-29" },
  "claude-3-5-sonnet-20240620": { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2024-06-20" },
  // ── Google relay aliases ─────────────────────────────────────
  "gemini-flash-latest":        { i: 0.1,  o: 0.4,  s: "ultrafast", a: "high",    t: ["fast","cheap","vision"],       d: "2025-02-05" },
  "gemini-flash-lite-latest":   { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["ultra-cheap","fast"],          d: "2025-02-05" },
  "gemini-pro-latest":          { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning"],          d: "2025-03-25" },
  "gemini-2.0-pro":             { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning"],          d: "2025-02-05" },
  "gemini-robotics":            { i: 1,    o: 5,    s: "medium",    a: "high",    t: ["vision","robotics"],           d: "2025-06-01" },
  "gemini-2.5-computer-use":    { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","computer-use"],       d: "2025-10-01" },
  // ── InclusionAI / Ling / Ring ────────────────────────────────
  "inclusionAI/Ring":           { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["chinese","reasoning"],         d: "2025-06-01" },
  "inclusionAI/Ling":           { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-06-01" },
  "ling-2":                     { i: 0.1,  o: 0.3,  s: "ultrafast", a: "medium",  t: ["chinese","cheap"],             d: "2025-06-01" },
  // ── Phi / Microsoft ──────────────────────────────────────────
  "AiHubmix-Phi-4":             { i: 0.07, o: 0.14, s: "fast",      a: "high",    t: ["reasoning","code"],            d: "2025-01-01" },
  "aihub-Phi-4":                { i: 0.07, o: 0.14, s: "fast",      a: "high",    t: ["reasoning","code"],            d: "2025-01-01" },
  // ── ByteDance / Seed ─────────────────────────────────────────
  "ByteDance-Seed/Seed-OSS":    { i: 0.1,  o: 0.3,  s: "fast",      a: "high",    t: ["code"],                        d: "2025-05-01" },
  // ── xiaomi mimo ──────────────────────────────────────────────
  "xiaomi-mimo":                { i: 0.1,  o: 0.3,  s: "fast",      a: "high",    t: ["chinese","vision"],            d: "2025-06-01" },
  // ── Qwen misc ────────────────────────────────────────────────
  "Qwen/Qwen2.5-VL":           { i: 0.15, o: 0.6,  s: "fast",      a: "high",    t: ["vision","chinese"],            d: "2025-01-01" },
  "Qwen/QwQ":                   { i: 0.1,  o: 0.3,  s: "fast",      a: "high",    t: ["reasoning","chinese"],         d: "2025-03-01" },
  "bai-qwen3-vl-235b":          { i: 0.4,  o: 1.2,  s: "fast",      a: "supreme", t: ["chinese","vision","reasoning"],d: "2025-05-01" },
  // ── DeepInfra / Gemma mirrors ────────────────────────────────
  "deepinfra-gemma-4":          { i: 0.07, o: 0.34, s: "fast",      a: "high",    t: ["open-source","multilingual"],  d: "2025-06-01" },
  // ── Ollama local models ──────────────────────────────────────
  "llama3.2":                   { i: 0,    o: 0,    s: "fast",      a: "medium",  t: ["open-source","local"],         d: "2024-09-25" },
  "qwen2.5:7b":                 { i: 0,    o: 0,    s: "fast",      a: "medium",  t: ["chinese","local"],             d: "2024-09-19" },
  "gpt-oss":                    { i: 0.15, o: 0.6,  s: "fast",      a: "high",    t: ["open-source"],                 d: "2025-06-01" },
  "aihubmix-router":            { i: 0.5,  o: 2,    s: "fast",      a: "high",    t: ["router","auto-select"],        d: "2025-01-01" },
};

// 前缀匹配回退：精确 ID 优先，否则匹配最长前缀
function lookupMeta(id) {
  if (META[id]) return META[id];
  const lower = id.toLowerCase();
  const keys = Object.keys(META).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (id.startsWith(k) || lower.startsWith(k.toLowerCase())) return META[k];
  }
  return null;
}

// Classify model by category based on ID. Keep this shared across all sources
// so a later provider fetch cannot overwrite a non-text model back to text.
function classifyModel(id) {
  const lower = id.toLowerCase();
  if (/dall-e|flux|sd-|stable-diffusion|image-gen|midjourney|cogview|wanx|-image-|-image$|gpt-image|imagen|ideogram|playground-v|recraft|kolors|hidream|hunyuan-image|image-preview|jimeng|即梦|pixverse-image|leonardo|kandinsky|omnigen|omnihuman|sana-|aura-flow|seeart/.test(lower)) return "image";
  if (/sora|wan2|video|luma|runway|vidu|kling|t2v|i2v|hailuo|mochi|ltx-video|seedance|pixverse(?!-image)|pika|minimax-video|jimeng-video|genmo|animatediff|cog-video|hunyuan-video|vchitect|pyramid-flow/.test(lower)) return "video";
  if (/tts|audio-gen|speech-gen|voice-gen|fish-audio|cosyvoice|chattts|tts-preview|audio-preview|suno|udio|elevenlabs|parler-tts|bark|mars5|f5-tts|kokoro/.test(lower)) return "tts";
  if (/whisper|stt|audio-transcri|speech-to|paraformer|sensevoice|funasr/.test(lower)) return "stt";
  if (/embed|bge-|text-embedding|e5-|jina-embed|gte-|nomic-embed|voyage-/.test(lower)) return "embedding";
  if (/ocr|document-ai|vision-extract|doc-parse|got-ocr|surya/.test(lower)) return "ocr";
  if (/rerank|reranker/.test(lower)) return "other";
  return "text";
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
        releaseDate:   meta?.d ?? "",
        category:      classifyModel(id),
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
  const SKIP = /^(babbage|ada|curie|davinci|text-|whisper|tts-|canary-|ft:|chatgpt-4o-latest)/;

  return data
    .filter((m) => !SKIP.test(m.id) && !m.id.includes("instruct") && !m.id.includes("realtime"))
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
        releaseDate:   meta?.d ?? (m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : ""),
        category:      classifyModel(m.id),
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
    const meta = lookupMeta(m.id);
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
      releaseDate:   meta?.d ?? m.created_at?.slice(0, 10) ?? "",
      category:      classifyModel(m.id),
    };
  });
}

// ── DeepSeek ─────────────────────────────────────────────────────────────
async function fetchDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) { console.log("⚠ DEEPSEEK_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching DeepSeek models...");
  const res = await fetch("https://api.deepseek.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.log(`❌ DeepSeek API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  console.log(`✅ DeepSeek: found ${data.length} models`);

  return data
    .filter((m) => m.id.startsWith("deepseek-"))
    .map((m) => {
    const meta = lookupMeta(m.id);
    return {
      id:            m.id,
      name:          m.id,
      provider:      "DeepSeek",
      apiProvider:   "deepseek",
      contextWindow: 128000,
      maxOutput:     16384,
      inputCostPer1M:  meta?.i ?? 0,
      outputCostPer1M: meta?.o ?? 0,
      speed:         meta?.s ?? "fast",
      accuracy:      meta?.a ?? "high",
      supportsStreaming: true,
      isLatest:      false,
      tags:          meta?.t ?? [],
      releaseDate:   meta?.d ?? "",
      category:      classifyModel(m.id),
    };
  });
}

// ── xAI (Grok) ───────────────────────────────────────────────────────────
async function fetchXAI() {
  const key = process.env.XAI_API_KEY;
  if (!key) { console.log("⚠ XAI_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching xAI models...");
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.log(`❌ xAI API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  console.log(`✅ xAI: found ${data.length} models`);

  return data
    .filter((m) => m.id.startsWith("grok-"))
    .map((m) => {
    const meta = lookupMeta(m.id);
    return {
      id:            m.id,
      name:          m.id,
      provider:      "xAI",
      apiProvider:   "xai",
      contextWindow: 131072,
      maxOutput:     16384,
      inputCostPer1M:  meta?.i ?? 0,
      outputCostPer1M: meta?.o ?? 0,
      speed:         meta?.s ?? "fast",
      accuracy:      meta?.a ?? "high",
      supportsStreaming: true,
      isLatest:      false,
      tags:          meta?.t ?? [],
      releaseDate:   meta?.d ?? "",
      category:      classifyModel(m.id),
    };
  });
}

// ── Mistral AI ───────────────────────────────────────────────────────────
async function fetchMistral() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) { console.log("⚠ MISTRAL_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching Mistral models...");
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.log(`❌ Mistral API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  console.log(`✅ Mistral: found ${data.length} models`);

  const SKIP = /embed|moderation/i;
  return data
    .filter((m) => !SKIP.test(m.id))
    .map((m) => {
      const meta = lookupMeta(m.id);
      return {
        id:            m.id,
        name:          m.id,
        provider:      "Mistral AI",
        apiProvider:   "mistral",
        contextWindow: 128000,
        maxOutput:     16384,
        inputCostPer1M:  meta?.i ?? 0,
        outputCostPer1M: meta?.o ?? 0,
        speed:         meta?.s ?? "fast",
        accuracy:      meta?.a ?? "high",
        supportsStreaming: true,
        isLatest:      false,
        tags:          meta?.t ?? [],
        releaseDate:   meta?.d ?? "",
        category:      classifyModel(m.id),
      };
    });
}

// ── Groq (open-source model hosting) ─────────────────────────────────────
async function fetchGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) { console.log("⚠ GROQ_API_KEY not set, skipping"); return []; }

  console.log("📡 Fetching Groq models...");
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.log(`❌ Groq API error: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const data = json.data ?? [];
  console.log(`✅ Groq: found ${data.length} models`);

  const SKIP = /whisper|guard|tool-use/i;

  function detectProvider(id) {
    const lower = id.toLowerCase();
    if (lower.startsWith("llama")) return "Meta";
    if (lower.startsWith("gemma")) return "Google";
    if (lower.startsWith("mixtral") || lower.startsWith("mistral")) return "Mistral AI";
    if (lower.startsWith("deepseek")) return "DeepSeek";
    if (lower.startsWith("qwen")) return "Alibaba";
    return "Other";
  }

  return data
    .filter((m) => !SKIP.test(m.id))
    .map((m) => {
      const meta = lookupMeta(m.id);
      return {
        id:            m.id,
        name:          m.id,
        provider:      detectProvider(m.id),
        apiProvider:   "groq",
        contextWindow: m.context_window ?? 128000,
        maxOutput:     16384,
        inputCostPer1M:  meta?.i ?? 0,
        outputCostPer1M: meta?.o ?? 0,
        speed:         "ultrafast",
        accuracy:      meta?.a ?? "high",
        supportsStreaming: true,
        isLatest:      false,
        tags:          meta?.t ?? ["fast"],
        releaseDate:   meta?.d ?? "",
        category:      classifyModel(m.id),
      };
    });
}

// ── 合并：以 existing 为基础，用 fetched 更新/新增，永不删除 ──────────────
function mergeWithExisting(fetched) {
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(MODELS_PATH, "utf8"));
    console.log(`📄 Existing models.json: ${existing.length} models`);
  } catch (e) {
    console.log("⚠️ Could not read existing models.json:", e.message);
  }

  if (fetched.length === 0) {
    console.log("⚠️ No models fetched from any API. Keeping existing models.json unchanged.");
    return { models: existing, stats: { added: 0, updated: 0, total: existing.length, existingCount: existing.length } };
  }

  const existingIds = new Set(existing.map(m => m.id));
  const byId = new Map(existing.map(m => [m.id, m]));
  let added = 0;
  let updated = 0;

  for (const m of fetched) {
    if (byId.has(m.id)) {
      updated++;
    } else {
      added++;
    }
    byId.set(m.id, m);
  }

  const merged = [...byId.values()];

  // Health check: abort if count drops >20%
  if (existing.length > 0 && merged.length < existing.length * 0.8) {
    console.log(`🚨 HEALTH CHECK FAILED: merged count (${merged.length}) is >20% less than existing (${existing.length}). Aborting!`);
    return { models: null, stats: { added, updated, total: merged.length, existingCount: existing.length, healthCheckFailed: true } };
  }

  console.log(`📊 Merge result: +${added} new, ${updated} updated, ${merged.length} total`);
  return { models: merged, stats: { added, updated, total: merged.length, existingCount: existing.length } };
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

// ── Write SYSTEM_STATE.json ──────────────────────────────────────────────
function writeSystemState(models, stats) {
  const cats = {};
  for (const m of models) {
    const c = m.category || "text";
    cats[c] = (cats[c] || 0) + 1;
  }
  const zeroCost = models.filter(m => m.inputCostPer1M === 0 && m.outputCostPer1M === 0).length;
  const providers = {};
  for (const m of models) {
    providers[m.provider] = (providers[m.provider] || 0) + 1;
  }

  const state = {
    updatedAt: new Date().toISOString(),
    totalModels: models.length,
    byCategory: cats,
    byProvider: providers,
    zeroCostModels: zeroCost,
    metaCoverage: models.length - zeroCost,
    lastUpdate: {
      added: stats.added,
      updated: stats.updated,
      previousTotal: stats.existingCount,
    },
  };

  mkdirSync(join(ROOT, "context"), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
  console.log(`📋 Written SYSTEM_STATE.json (${models.length} models, +${stats.added} new)`);
}

// ── 主流程 ──────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Model auto-updater starting...\n");

  const results = await Promise.allSettled([
    withRetry(fetchAihubmix,  "AihubMix"),
    withRetry(fetchGoogle,    "Google"),
    withRetry(fetchOpenAI,    "OpenAI"),
    withRetry(fetchAnthropic, "Anthropic"),
    withRetry(fetchDeepSeek,  "DeepSeek"),
    withRetry(fetchXAI,       "xAI"),
    withRetry(fetchMistral,   "Mistral"),
    withRetry(fetchGroq,      "Groq"),
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

  if (fetched.length === 0) {
    console.log("⚠️ All API fetches returned 0 models. Aborting to prevent data loss.");
    process.exitCode = 1;
    return;
  }

  const { models: merged, stats } = mergeWithExisting(fetched);

  if (stats.healthCheckFailed || !merged) {
    console.log("🚨 Health check failed. models.json NOT updated. Creating alert.");
    // Write output for workflow to detect
    const summary = JSON.stringify({ alert: true, reason: "health_check", ...stats });
    console.log(`::set-output name=summary::${summary}`);
    process.exitCode = 1;
    return;
  }

  const final = markLatest(merged);

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

  // Write SYSTEM_STATE.json
  writeSystemState(final, stats);

  // Output summary for workflow (GitHub Actions)
  const needsIssue = stats.added >= 5;
  const summary = JSON.stringify({ alert: needsIssue, added: stats.added, updated: stats.updated, total: final.length, previousTotal: stats.existingCount });
  console.log(`::set-output name=summary::${summary}`);
  if (needsIssue) {
    console.log(`🔔 ${stats.added} new models added — workflow will create notification issue`);
  }
}

main().catch((e) => {
  console.error("💥 Fatal error:", e);
  process.exit(1);
});
