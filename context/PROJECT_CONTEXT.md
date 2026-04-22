# AI Prompt Generator — Project Context

> Last updated: 2026-04-23
> Site: https://www.myprompt.asia
> Repo: https://github.com/00qq6868-del/ai-prompt-generator.git

## What This Project Does

A web app that takes a user's rough idea and generates an optimized, detailed prompt tailored to a specific target LLM. Users can select both a "generator model" (the AI that writes the prompt) and a "target model" (the AI the prompt is written for).

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + Framer Motion
- **Deployment**: Vercel (auto-deploy from `main`)
- **Domain**: myprompt.asia (expires 2027)

## Architecture Overview

```
src/
├── app/
│   ├── api/
│   │   ├── generate/route.ts    # Main prompt generation endpoint
│   │   ├── probe/route.ts       # Relay station model discovery
│   │   ├── models/route.ts      # Serve models.json to frontend
│   │   ├── keys/route.ts        # Check which env keys are configured
│   │   └── network/route.ts     # Network connectivity check
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Home page
├── components/
│   ├── PromptGenerator.tsx      # Main component — orchestrates generation
│   ├── ModelSelector.tsx        # Target + generator model UI
│   ├── ModelPicker.tsx          # Full-screen model selection modal
│   ├── KeysSettings.tsx         # API key management panel
│   └── ResultPanel.tsx          # Display generated prompt + stats
├── hooks/
│   ├── useModels.ts             # Fetch models with caching
│   └── useNetwork.ts            # Network status monitoring
└── lib/
    ├── models-registry.ts       # ModelInfo type, scoreModel(), BUNDLED_MODELS
    ├── model-cache.ts           # Server-side model list cache (1hr TTL)
    ├── prompt-optimizer.ts      # System/user prompt templates
    └── providers/
        └── index.ts             # 13 LLM provider adapters

.github/
├── scripts/fetch-models.mjs    # Auto-fetch models from APIs
└── workflows/update-models.yml # Cron: auto-update models.json

public/
└── models.json                 # ~240 models, auto-updated by CI
```

## Key Concepts

### META Object (fetch-models.mjs)
Maps model IDs to pricing/speed/accuracy metadata. Uses `lookupMeta()` for prefix matching so "gemini-2.5-pro-preview-03-25" matches the "gemini-2.5-pro" key.

### scoreModel() (models-registry.ts)
Weighted scoring with 4 modes: `token` (cheapest), `fast`, `accurate`, `aligned`. Used to auto-select the best generator model.

### Model Categories
Models are classified by `classifyModel()`: text, image, video, tts, stt, embedding, ocr, other.

### Relay Station (中转站)
Users can configure a custom OpenAI-compatible relay (like AihubMix) that provides access to 200+ models with a single API key. The `/api/probe` endpoint discovers available models.

## Provider Adapters

13 providers supported: OpenAI, Anthropic, Google, Groq, xAI, Mistral, DeepSeek, Zhipu (智谱), Moonshot (月之暗面), Qwen (通义千问), Baidu (百度), Ollama (local), Custom relay.

## Known Issues / Gotchas

- AihubMix's `m.created` timestamp is always `1626739200` (platform launch date), not model release date. We use `meta?.d` from META instead.
- `BUNDLED_MODELS` is the offline fallback when remote fetch fails — keep it reasonably up to date.
- All user-facing error messages must be bilingual (Chinese + English).
