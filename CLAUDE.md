# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Cross-Session Context

This project uses a persistent context system. **Before starting any work, read these files:**

1. `context/AI_TOOLCHAIN.md` — shared launcher for Codex/Claude/other AI windows
2. `context/QUICK_START.md` — 30-second project overview
3. `context/PROGRESS.md` — Current task status (what's done, what's pending)
4. `context/MEMORIES.md` — All decisions, user preferences, technical gotchas
5. `context/SESSION_LOG.md` — What previous sessions did (read latest entry)

**Before ending your session or if context is getting long:**

1. Update `context/PROGRESS.md` with completed/pending tasks
2. Add a new entry to `context/SESSION_LOG.md` with what you did
3. Run: `git add context/ CLAUDE.md && git commit -m "chore: update session context" && git push`
4. Or run: `bash scripts/save-context.sh`

**The user works across multiple AI tools (Claude, GPT, Gemini, etc.).** All context must be persisted to GitHub so any AI can continue the work.

## Commands

```bash
npm run dev           # Start dev server at localhost:3000
npm run dev:lan       # Dev server accessible on LAN (0.0.0.0)
npm run build         # Production build
npm start             # Start production server (0.0.0.0)
npm run lint          # Run Next.js ESLint
npx tsc --noEmit      # Type check only
node scripts/patch-models.cjs          # Re-apply META data to models.json
node .github/scripts/fetch-models.mjs  # Manually run the model auto-updater (needs AIHUBMIX_API_KEY)
```

Shared AI toolchain launcher:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" status
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" test-all
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" smoke-prod
```

Short wrapper:

```cmd
E:\AI工作台\AI-CHAIN.cmd status
E:\AI工作台\AI-CHAIN.cmd test-all
```

Use the shared launcher for repeatable work across Codex, Claude, VS Code terminals, and other AI windows. It logs each run under `E:\AI工作台\日志 Logs\ai-chain` and locks Git-mutating operations.

## User Preferences

- Chinese speaker (中文), prefers execution over discussion
- Says "执行" = just do it immediately, don't ask questions
- Wants all latest models auto-updated from all major providers
- Generator models = text/reasoning only; Target models = ALL types (image, video, tts, etc.)
- All user-facing error messages must be bilingual (中文 / English)

## Architecture

This is a **Next.js 14 App Router** application. The core flow is:

1. User picks a **target model** (what the prompt will run on) and a **generator model** (the AI that writes the prompt)
2. User submits a rough idea → `/api/generate` calls the generator model with a meta-prompt → returns an optimized prompt

### Model Data Flow (THREE-TIER)

```
public/models.json          ← written by GitHub Actions every 2 hours
       ↓
src/lib/model-cache.ts      ← THREE-TIER: remote URL → local public/models.json → BUNDLED_MODELS
       ↓
/api/models                 ← consumed by useModels hook (client, 1-hour auto-refresh)
/api/generate               ← also calls getModels() to validate model IDs
       ↓
src/lib/models-registry.ts  ← BUNDLED_MODELS (hardcoded fallback), ModelInfo interface, scoreModel()
```

**CRITICAL**: `model-cache.ts` reads local `public/models.json` with `readFileSync`. This is the key mechanism that makes auto-updates work — GitHub Actions updates the file, Vercel redeploys, and the new models are served.

### Key Files

- **`src/lib/model-cache.ts`** — Server-only singleton cache. Three-tier: remote URL → local file → BUNDLED_MODELS. Called by `/api/models` and `/api/generate`.
- **`src/lib/models-registry.ts`** — `ModelInfo` interface, `BUNDLED_MODELS` array (25 models), `scoreModel(model, mode)`. Fallback when models.json unavailable.
- **`.github/scripts/fetch-models.mjs`** — Auto-fetches 250+ models from AihubMix, Google, OpenAI, Anthropic APIs. Contains META object (55+ entries) with pricing/speed/accuracy. Uses `lookupMeta()` for prefix matching and `classifyModel()` for categorization.
- **`scripts/patch-models.cjs`** — Post-processes `public/models.json` locally. Same META + classifyModel logic. Run after manual changes to models.json.
- **`src/lib/providers/index.ts`** — `callProvider()` dispatcher + 13 provider adapters. Keys resolved: user-supplied > server env var.
- **`src/lib/prompt-optimizer.ts`** — `buildSystemPrompt()` / `buildUserPrompt()` / `comparePrompts()`. CO-STAR meta-prompt framework.
- **`src/components/PromptGenerator.tsx`** — Top-level client component. Auto-selects generator via probe or provider priority.
- **`src/components/ModelSelector.tsx`** — Target model grid (category tabs + provider tabs) + generator trigger button.
- **`src/components/ModelPicker.tsx`** — Full-screen generator selection. Filters to `category === "text"` only.

### Model Scoring (`scoreModel`)

Four modes: `token` (cheapest), `fast` (speed), `accurate` (quality), `aligned` (balanced).

Generator auto-selection: `token` mode for text targets, `accurate` mode for image/video targets.

### Model Auto-Update Pipeline

`.github/workflows/update-models.yml` runs **every 2 hours**:
1. Runs `fetch-models.mjs` → fetches from 4 APIs
2. META object (55+ entries) provides cost/speed/accuracy/tags via `lookupMeta()` prefix matching
3. `classifyModel(id)` categorizes: text, image, video, tts, stt, embedding, ocr
4. Merges with existing `models.json`, preserving manually-maintained provider entries
5. Generates `context/SYSTEM_STATE.json` with model stats

### Custom Relay / Probe

`/api/probe` discovers models from OpenAI-compatible relays. Client caches in localStorage (1-hour TTL). Generator auto-selected from probe results.

### API Keys

Two layers:
1. **Server env** (`.env.local`): provider API keys + `MODELS_REGISTRY_URL`
2. **User-supplied** (localStorage): same keys + `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` for relay. Takes priority.

### Electron

`electron/main.js` wraps the Next.js server. Build with `npm run electron:build` (Win).
