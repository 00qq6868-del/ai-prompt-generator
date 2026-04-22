# META Object Maintenance Guide

## What is META?

The `META` object in `.github/scripts/fetch-models.mjs` maps model IDs to their pricing, speed, accuracy, tags, and release dates. This data isn't available from model listing APIs — it must be maintained manually.

## Format

```javascript
"model-id": { i: inputCost, o: outputCost, s: speed, a: accuracy, t: [tags], d: "YYYY-MM-DD" }
```

| Field | Type | Values |
|-------|------|--------|
| `i` | number | USD per 1M input tokens |
| `o` | number | USD per 1M output tokens |
| `s` | string | `"ultrafast"` / `"fast"` / `"medium"` / `"slow"` |
| `a` | string | `"supreme"` / `"high"` / `"medium"` / `"low"` |
| `t` | string[] | Feature tags like `["vision","code","reasoning"]` |
| `d` | string | Release date `"YYYY-MM-DD"` |

## How lookupMeta() Works

1. Exact match: `META["gpt-4o"]` → returns directly
2. Prefix match: `META` doesn't have `"gemini-2.5-pro-preview-03-25"`, but has `"gemini-2.5-pro"` → matches because the ID starts with that key
3. Longest prefix wins: keys are sorted by length (descending) before matching

## Adding a New Model

1. Find the model's pricing on the provider's website
2. Add an entry to META with the shortest unique prefix (e.g., `"gpt-5"` will match `"gpt-5"`, `"gpt-5-turbo"`, etc.)
3. If the model is a new type (image/video/etc.), check that `classifyModel()` regex covers its naming pattern
4. Run `node .github/scripts/fetch-models.mjs` locally to verify (needs at least `AIHUBMIX_API_KEY`)

## Impact of Missing META

Models without META get: cost=0, speed="medium", accuracy="high", tags=[]. This makes `scoreModel()` give them high token scores (since cost=0 = cheap) but generic accuracy/speed, leading to poor recommendations.

## Speed Rating Guidelines

- `ultrafast`: <1s first token, streaming start almost instant (e.g., GPT-4o-mini, Haiku)
- `fast`: 1-3s first token (e.g., GPT-4o, Sonnet)
- `medium`: 3-10s first token (e.g., Gemini 2.5 Pro, DeepSeek R1)
- `slow`: >10s first token, often reasoning models (e.g., o1, Opus)

## Accuracy Rating Guidelines

- `supreme`: SOTA on benchmarks, best-in-class reasoning (e.g., GPT-4o, Claude Opus, Gemini 2.5 Pro)
- `high`: Strong general capability (e.g., Llama 70B, Mistral Large, GLM-4)
- `medium`: Good for simple tasks, may struggle with complex reasoning (e.g., Llama 8B, Qwen Turbo)
- `low`: Basic capability, suitable for classification/extraction only
