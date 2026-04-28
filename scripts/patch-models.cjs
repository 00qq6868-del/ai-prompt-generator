// Post-process models.json — apply META + reclassify
const fs = require("fs");
const path = require("path");

const META = {
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
  "gemini-2.5-pro":             { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning","long-context"], d: "2025-03-25" },
  "gemini-2.5-flash":           { i: 0.15, o: 0.6,  s: "fast",      a: "high",    t: ["fast","cheap","vision"],       d: "2025-04-17" },
  "gemini-2.0-flash":           { i: 0.1,  o: 0.4,  s: "ultrafast", a: "high",    t: ["fast","cheap","vision"],       d: "2025-02-05" },
  "gemini-2.0-flash-lite":      { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["ultra-cheap","fast"],          d: "2025-02-05" },
  "gemini-1.5-pro":             { i: 1.25, o: 5,    s: "medium",    a: "high",    t: ["long-context","vision"],       d: "2024-05-14" },
  "gemini-1.5-flash":           { i: 0.075,o: 0.3,  s: "ultrafast", a: "medium",  t: ["cheap","fast"],                d: "2024-05-14" },
  "gemini-3":                   { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning"],          d: "2025-06-01" },
  "gemini-3.1":                 { i: 1.25, o: 10,   s: "medium",    a: "supreme", t: ["vision","reasoning"],          d: "2025-08-01" },
  "grok-3":                     { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["reasoning","real-time-web"],   d: "2025-02-17" },
  "grok-3-mini":                { i: 0.3,  o: 0.5,  s: "ultrafast", a: "high",    t: ["cheap","fast"],                d: "2025-02-17" },
  "grok-4":                     { i: 5,    o: 20,   s: "fast",      a: "supreme", t: ["reasoning","real-time-web"],   d: "2025-06-01" },
  "llama-3.3-70b":              { i: 0.59, o: 0.79, s: "ultrafast", a: "high",    t: ["open-source","fast"],          d: "2024-12-06" },
  "llama-3.1-8b-instant":       { i: 0.05, o: 0.08, s: "ultrafast", a: "medium",  t: ["open-source","ultra-cheap"],   d: "2024-07-23" },
  "llama-4-scout":              { i: 0.11, o: 0.34, s: "ultrafast", a: "high",    t: ["open-source","multimodal"],    d: "2025-04-05" },
  "llama-4-maverick":           { i: 0.22, o: 0.88, s: "fast",      a: "supreme", t: ["open-source","flagship"],      d: "2025-04-05" },
  "deepseek-chat":              { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math","cheap"],         d: "2025-01-20" },
  "deepseek-reasoner":          { i: 0.55, o: 2.19, s: "medium",    a: "supreme", t: ["reasoning","math","code"],     d: "2025-01-20" },
  "deepseek-v3":                { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-03-15" },
  "deepseek-r1":                { i: 0.55, o: 2.19, s: "medium",    a: "supreme", t: ["reasoning","math"],            d: "2025-01-20" },
  "mistral-large":              { i: 2,    o: 6,    s: "fast",      a: "high",    t: ["multilingual","code"],         d: "2024-11-18" },
  "mistral-small":              { i: 0.1,  o: 0.3,  s: "ultrafast", a: "medium",  t: ["cheap","fast"],                d: "2024-09-18" },
  "codestral":                  { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["code"],                        d: "2024-05-29" },
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
  "gpt-image-1":                { i: 5,    o: 40,   s: "medium",    a: "supreme", t: ["image-gen"],                   d: "2025-04-23" },
  "gpt-5.5":                    { i: 10,   o: 40,   s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-11-01" },
  "gpt-5-mini":                 { i: 2,    o: 8,    s: "fast",      a: "supreme", t: ["reasoning","code"],            d: "2025-06-01" },
  "gpt-5-nano":                 { i: 0.4,  o: 1.6,  s: "ultrafast", a: "high",    t: ["fast","cheap"],                d: "2025-06-01" },
  "gpt-5-pro":                  { i: 20,   o: 80,   s: "medium",    a: "supreme", t: ["reasoning","code","vision"],   d: "2025-06-01" },
  "o3-pro":                     { i: 20,   o: 80,   s: "slow",      a: "supreme", t: ["reasoning","math","science"],  d: "2025-06-10" },
  "codex-mini":                 { i: 1.5,  o: 6,    s: "fast",      a: "high",    t: ["code"],                        d: "2025-05-16" },
  "deepseek-v4":                { i: 0.27, o: 1.1,  s: "fast",      a: "supreme", t: ["code","math","reasoning"],     d: "2025-07-01" },
  "DeepSeek-V3.1":              { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-04-01" },
  "deepseek-v3.2":              { i: 0.27, o: 1.1,  s: "fast",      a: "high",    t: ["code","math"],                 d: "2025-06-01" },
  "seedance-1.0":               { i: 0,    o: 0,    s: "medium",    a: "high",    t: ["video-gen"],                   d: "2025-03-01" },
  "seedance-2.0":               { i: 0,    o: 0,    s: "medium",    a: "supreme", t: ["video-gen"],                   d: "2025-06-01" },
  "claude-opus-4-0":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-01-01" },
  "claude-opus-4-1":            { i: 15,   o: 75,   s: "slow",      a: "supreme", t: ["reasoning","vision"],          d: "2025-02-01" },
  "claude-sonnet-4-0":          { i: 3,    o: 15,   s: "fast",      a: "supreme", t: ["vision","code"],               d: "2025-01-01" },
  "qwen3-max":                  { i: 0.4,  o: 1.2,  s: "fast",      a: "high",    t: ["chinese","code","reasoning"],  d: "2025-06-01" },
  "qwen3-coder":                { i: 0.2,  o: 0.6,  s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-07-01" },
  "glm-5":                      { i: 0.7,  o: 0.7,  s: "fast",      a: "high",    t: ["chinese","code","vision"],     d: "2025-06-01" },
  "ernie-5.0":                  { i: 0.2,  o: 0.2,  s: "medium",    a: "high",    t: ["chinese","reasoning"],         d: "2025-06-01" },
  "kimi-k2":                    { i: 2,    o: 2,    s: "fast",      a: "high",    t: ["chinese","code"],              d: "2025-09-01" },
  "minimax-m2":                 { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-06-01" },
  "grok-code":                  { i: 2,    o: 8,    s: "fast",      a: "high",    t: ["code"],                        d: "2025-04-01" },
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
  "minimax-m2":                 { i: 0.3,  o: 0.9,  s: "fast",      a: "high",    t: ["chinese"],                     d: "2025-06-01" },
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
  // ── gpt-oss (OpenAI open source) ─────────────────────────────
  "gpt-oss":                    { i: 0.15, o: 0.6,  s: "fast",      a: "high",    t: ["open-source"],                 d: "2025-06-01" },
  // ── Ollama local models ──────────────────────────────────────
  "llama3.2":                   { i: 0,    o: 0,    s: "fast",      a: "medium",  t: ["open-source","local"],         d: "2024-09-25" },
  "qwen2.5:7b":                 { i: 0,    o: 0,    s: "fast",      a: "medium",  t: ["chinese","local"],             d: "2024-09-19" },
  // ── aihubmix router ──────────────────────────────────────────
  "aihubmix-router":            { i: 0.5,  o: 2,    s: "fast",      a: "high",    t: ["router","auto-select"],        d: "2025-01-01" },
};

function lookupMeta(id) {
  if (META[id]) return META[id];
  const lower = id.toLowerCase();
  const keys = Object.keys(META).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (id.startsWith(k) || lower.startsWith(k.toLowerCase())) return META[k];
  }
  return null;
}

function classifyModel(id) {
  const lower = id.toLowerCase();
  if (/dall-e|flux|sd-|stable-diffusion|image-gen|midjourney|cogview|wanx|-image-|-image$|gpt-image|imagen|ideogram|playground-v|recraft|kolors|hidream|hunyuan-image|image-preview|jimeng|即梦|pixverse-image|leonardo/.test(lower)) return "image";
  if (/sora|wan2|video|luma|runway|vidu|kling|t2v|i2v|hailuo|mochi|ltx-video|seedance|pixverse|pika|minimax-video|jimeng-video/.test(lower)) return "video";
  if (/tts|audio-gen|speech-gen|voice-gen|fish-audio|cosyvoice|chattts|tts-preview|audio-preview|suno|udio|elevenlabs/.test(lower)) return "tts";
  if (/whisper|stt|audio-transcri|speech-to|paraformer/.test(lower)) return "stt";
  if (/embed|bge-|text-embedding|e5-|jina-embed/.test(lower)) return "embedding";
  if (/ocr|document-ai|vision-extract|doc-parse/.test(lower)) return "ocr";
  if (/rerank|reranker/.test(lower)) return "other";
  return "text";
}

const modelsPath = path.join("public", "models.json");
const models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));

let patched = 0;
for (const m of models) {
  const meta = lookupMeta(m.id);
  if (meta) {
    m.inputCostPer1M  = meta.i;
    m.outputCostPer1M = meta.o;
    m.speed           = meta.s;
    m.accuracy        = meta.a;
    m.tags            = meta.t;
    if (meta.d) m.releaseDate = meta.d;
    patched++;
  }
  if (m.releaseDate === "2021-07-20") m.releaseDate = meta?.d ?? "";
  m.category = classifyModel(m.id);
  if (m.provider === "深度求索") m.provider = "DeepSeek";
}

fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2) + "\n");

const cats = {};
models.forEach(x => { const c = x.category || "text"; cats[c] = (cats[c] || 0) + 1; });
const zeroCost = models.filter(x => x.inputCostPer1M === 0 && x.outputCostPer1M === 0).length;
console.log("Patched:", patched, "/", models.length);
console.log("Zero-cost remaining:", zeroCost);
console.log("Categories:", JSON.stringify(cats));
console.log("Non-text models:");
models.filter(x => x.category !== "text").forEach(x => console.log("  ", x.id, "->", x.category));
