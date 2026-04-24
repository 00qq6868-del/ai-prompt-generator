# Task Progress Tracker

> Last updated: 2026-04-24
> Updated by: Claude Sonnet 4.6 (Session #2)

## Current Status: ALL CORE FIXES DEPLOYED

All critical fixes have been pushed to GitHub and should be live on Vercel.

---

## Completed Tasks

### [DONE] 1. Fix "auto-update models has no effect" (ROOT CAUSE)
- **Problem**: `model-cache.ts` required `MODELS_REGISTRY_URL` env var (never configured), so frontend always showed only 25 BUNDLED_MODELS instead of 239+ models in `public/models.json`
- **Fix**: Added local `public/models.json` reading as fallback tier in `model-cache.ts`
- **Three-tier loading**: remote URL → local `public/models.json` → BUNDLED_MODELS
- **Commit**: `ef3810a`

### [DONE] 2. META expansion for new model families
- Added META entries for: gpt-5, gpt-5.1-5.4, grok-4, gemini-3, gemini-3.1
- `lookupMeta()` prefix matching ensures variants (gpt-5.4-nano, grok-4-20-reasoning) all match
- **File**: `.github/scripts/fetch-models.mjs`

### [DONE] 3. Enhanced model classification
- `classifyModel()` now catches: `image-preview`, `tts-preview`, `audio-preview` patterns
- Result: 3 image models + 5 TTS models correctly classified
- **File**: `.github/scripts/fetch-models.mjs`

### [DONE] 4. Fixed legacy bugs
- `fetchAnthropic` line 304: `META[m.id]` → `lookupMeta(m.id)`
- Added `category: "text"` to fetchGoogle, fetchOpenAI, fetchAnthropic
- Fixed OpenAI KEEP regex: added `gpt-5` pattern
- **File**: `.github/scripts/fetch-models.mjs`

### [DONE] 5. Post-processed models.json
- Created `scripts/patch-models.cjs` for local post-processing
- 251 models total, 134 patched with correct META data
- 8 non-text models correctly classified
- **Commit**: `1b89bd1`

### [DONE] 6. Model system overhaul (Session #1)
- BUNDLED_MODELS: all 25 entries have `category: "text"`
- gpt-4o price corrected: 5→2.5 input, 15→10 output
- `selectBestFromProbe` now adapts scoring mode by target category
- ModelSelector shows ALL categories for target models
- ModelPicker filters to `category === "text"` for generator
- KeysSettings clears probe cache on save
- GitHub Actions cron increased to every 2 hours

---

## Pending / Future Tasks

### [ ] Monitor deployment
- After Vercel deploys, verify `/api/models` returns 251+ models (not 25)
- Check that non-text models appear in target model selector

### [ ] Improve META coverage
- 116 models still have zero cost data (no META entry)
- Could add more META entries or fetch pricing from provider APIs

### [ ] Consider adding more providers
- Current probe flow works for OpenAI-compatible relays
- Could add native support for more Chinese providers

---

## Known Issues

1. **116 zero-cost models**: Models without META entries default to cost=0, speed="medium", accuracy="high". This makes scoring non-deterministic among unpatched models.
2. **AihubMix fake dates**: `m.created` is always 1626739200 (2021-07-20, platform launch date), not actual model release date. The `releaseDate` field comes from META, not from the API.
3. **No test framework**: No automated tests exist. Changes are verified manually.
