# Session Log

> This file records each AI session's work for seamless handoff between sessions.
> New sessions should read this first to understand where work left off.

---

## Shared AI Toolchain Launcher — 2026-05-02 (Codex)

### What was done

Created a universal local launcher for all AI windows and IDE terminals. The goal is that Codex, Claude, VS Code, Cursor/Trae-style tools, and future AI windows can call the same toolchain commands and read the same instructions.

### Global files created

- `E:\AI工作台\工具 Tools\ai-chain.ps1`
- `E:\AI工作台\AI-CHAIN.cmd`
- `E:\AI工作台\打开AI工具链控制台.cmd`
- `E:\AI工作台\AI工具链说明.md`
- `E:\AI工作台\AI_TOOLCHAIN.md`

### Project files changed

- `context/AI_TOOLCHAIN.md`
- `AGENTS.md`
- `CLAUDE.md`
- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

### Important implementation notes

- The launcher computes the E-drive workbench path from its own location instead of hardcoding Chinese paths in the PowerShell source.
- The `.cmd` wrapper uses `*Tools` wildcard discovery instead of hardcoding the Chinese `工具 Tools` folder name.
- This avoids Windows PowerShell 5/cmd encoding failures with UTF-8 Chinese path literals.
- Git-mutating commands use a lock directory so multiple AI windows do not run `sync` at the same time.
- Every launcher run writes an independent transcript under `E:\AI工作台\日志 Logs\ai-chain`.

### Verified commands

- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" doctor -NoPause`
- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" explain -NoPause`
- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" status -NoPause`
- `cmd /c "E:\AI工作台\AI-CHAIN.cmd status"`
- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" memory -NoPause`

### Installed tools detected

- Git
- GitHub CLI
- Node.js
- npm / npx
- Python / py
- uv
- VS Code
- Docker via Rancher Desktop
- Ollama
- Claude CLI
- Codex CLI
- Windows PowerShell
- PowerShell 7
- curl.exe
- Gitleaks

### Use in future sessions

Ask any AI window to start with:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" status
```

For a full local validation:

```cmd
E:\AI工作台\AI-CHAIN.cmd test-all
```

For real production validation:

```cmd
E:\AI工作台\AI-CHAIN.cmd smoke-prod
```

---

## Production Generation Chain Hardening — 2026-05-02 (Codex)

### What was done

Added a real production smoke-test workflow and free baseline protections around the live generation chain.

### Files changed

- `src/lib/rate-limit.ts`
- `src/lib/safe-url.ts`
- `src/app/api/generate/route.ts`
- `src/app/api/probe/route.ts`
- `src/app/api/analytics/route.ts`
- `scripts/production-smoke.cjs`
- `.github/workflows/production-smoke.yml`
- `package.json`
- `.env.example`
- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

### Implementation details

1. Added per-IP in-memory rate limiting with configurable env values.
2. Added `/api/generate` limits:
   - 20 requests per IP per minute by default.
   - 12000 input characters by default.
   - 4096 max output tokens by default.
3. Added `/api/probe` limits and public URL validation to block localhost/private/internal network probe targets.
4. Hardened `/api/analytics`:
   - metric allowlist and sanitization.
   - optional `ANALYTICS_WEBHOOK_URL` forwarding.
   - Vercel-compatible fallback that accepts metrics and logs counts instead of trying to write `.analytics` into the deployment directory.
5. Added `scripts/production-smoke.cjs`:
   - checks homepage.
   - checks `/api/models` total/category/gpt-5.5.
   - checks `/api/analytics`.
   - checks `/api/probe` when `AIHUBMIX_API_KEY` is available.
   - checks real `/api/generate` SSE with `GOOGLE_API_KEY`, then `GROQ_API_KEY`/`GROQ`, then `AIHUBMIX_API_KEY`.
6. Added `.github/workflows/production-smoke.yml` as a manual workflow using GitHub Secrets without printing key values.

### Verification before push

- `node --check scripts/production-smoke.cjs` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npx playwright test --project=chromium` passed: 8/8.
- `git diff --check` passed.

### Production observation before deploy

Running the smoke script with `SMOKE_SKIP_GENERATE=1` against current production passed homepage and model checks, then failed `/api/analytics` with HTTP 500. This confirms the old production analytics route had a Vercel file-write problem; the new analytics route is expected to fix it after deployment.

### Next verification

Completed after pushing:

1. GitHub E2E run `25244046888` passed for commit `e9dce5a`: 8/8.
2. Production `/api/analytics` returned HTTP 200 with `{ ok: true, sink: "stdout" }`, confirming the Vercel file-write issue was fixed after deploy.
3. First `Production Smoke Test` run `25244090217` failed because Google Gemini free-tier quota returned 429.
4. Added fallback-provider logic in `scripts/production-smoke.cjs` and pushed `2fefac6 fix: try fallback providers in production smoke`.
5. GitHub E2E run `25244119954` passed for commit `2fefac6`: 8/8.
6. Second `Production Smoke Test` run `25244163971` succeeded.

Final production smoke facts:

- homepage ok
- `/api/models` ok: 251 models with `{ text: 240, video: 2, image: 4, tts: 5 }`
- `/api/analytics` ok: sink `stdout`
- `/api/probe` ok: 227 models discovered
- real `/api/generate` SSE ok through Groq after Google quota 429; generated 752 chars with `latencyMs=1051`

### Remaining risks

- Google Secret exists but currently has free-tier quota exhausted for `gemini-2.0-flash`; smoke falls back to Groq successfully.
- Analytics is Vercel-compatible now, but without `ANALYTICS_WEBHOOK_URL` it is not durable storage. Add a free/cheap webhook, KV, or database for long-term commercial analytics.

---

## Model Auto-Update Classification Fix — 2026-05-02 (Codex)

### What was done

Found a follow-up regression caused by scheduled model auto-updates after the Codex completion pass. Production `/api/models` was live and included `gpt-5.5`, but the latest scheduled update had downgraded category counts to `image=1, tts=2` instead of the intended `image=4, tts=5`.

### Root cause

- `.github/scripts/fetch-models.mjs` had `classifyModel()` scoped only inside `fetchAihubmix()`.
- Later official provider fetches, especially Google/OpenAI, wrote duplicate model IDs with `category: "text"`.
- The merge step lets later fetched records update existing IDs, so Google/OpenAI official records overwrote correct AihubMix category metadata.

### Files changed

- `.github/scripts/fetch-models.mjs`
- `scripts/patch-models.cjs`
- `public/models.json`
- `context/SYSTEM_STATE.json`
- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

### Fix

- Promoted `classifyModel()` to shared top-level scope in `.github/scripts/fetch-models.mjs`.
- Updated Google/OpenAI/Anthropic/DeepSeek/xAI/Mistral/Groq fetchers to call `classifyModel()` instead of forcing `category: "text"`.
- Updated Google fetches to use `meta?.d` release dates when available.
- Updated `scripts/patch-models.cjs` so manual post-processing also writes `context/SYSTEM_STATE.json`.
- Re-ran `node scripts/patch-models.cjs`.

### Verification

- `node --check .github/scripts/fetch-models.mjs` passed.
- `node --check scripts/patch-models.cjs` passed.
- `node scripts/patch-models.cjs` passed and restored categories to `{ text: 240, video: 2, image: 4, tts: 5 }`.

### Notes for next session

- After this is pushed, wait for GitHub E2E and verify production `/api/models` again.
- If the scheduled model updater runs later, it should preserve image/TTS classification instead of reverting those models to text.

---

## Deployment Sync Check — 2026-05-02 (Codex)

### What was done

Answered the user's question about whether Codex's fixes will sync to the live site and performed a read-only verification, then fast-forwarded the local Codex worktree to the latest `origin/main`.

### Workspace / branch

- Workspace: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`
- Branch: `codex/safe-audit-20260501-232542`
- Latest local/remote commit after sync: `47e984b chore: auto-update models 2026-05-02`
- Codex feature commit included in history: `db61b5e feat: complete prompt generator stabilization pass`

### Verification

- `git fetch origin --prune` showed GitHub `main` had advanced after the Codex feature commit through scheduled model-update commits.
- `git merge --ff-only origin/main` fast-forwarded the local Codex worktree from `db61b5e` to `47e984b`.
- `gh run view 25225316579 --repo 00qq6868-del/ai-prompt-generator --json status,conclusion,headSha,displayTitle,url` returned success for the Codex completion pass E2E run.
- `curl.exe -I https://www.myprompt.asia` returned HTTP 200.
- Production `/api/models` returned `total=251`, `source=bundled`, and includes `gpt-5.5`.

### Notes for next session

- Vercel should auto-deploy GitHub `main` if the project is connected to the repository, which appears consistent with the production site responding and serving the latest bundled model data.
- Real generation still needs a production test using the user's relay/API key; Playwright E2E currently mocks generation.
- Continue protecting Claude's workspace: inspect it read-only first if comparison is needed, and do not overwrite its local changes.

---

## Codex Completion Pass — 2026-05-02 (Codex)

### What was done

Continued the current stabilization/commercial-readiness section after the user asked Codex to finish the whole section before reporting back.

### Files changed

- `src/components/PromptGenerator.tsx`
- `src/lib/prompt-optimizer.ts`
- `public/models.json`
- `context/SYSTEM_STATE.json`
- `tests/e2e/prompt-generator.spec.ts`
- Multiple UI files under `src/` for contrast-only `text-white/30` → `text-white/45`
- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

### Implementation details

1. Integrated analytics tracking into the real generation path:
   - `/api/generate` latency/success/failure is tracked with `trackApiCall()`.
   - Streaming TTFT is tracked from the first SSE `chunk` with `trackTTFT()`.
   - Generation failures are tracked with `trackError()`.
2. Hardened E2E analytics isolation:
   - `/api/analytics` is mocked in Playwright tests so tests do not write local `.analytics` JSONL files.
3. Completed prompt optimizer v5 audit/补强:
   - Confirmed the file is already a multi-modal v5 implementation.
   - `buildSystemPrompt()` now builds a scoped system prompt by target category instead of sending every module every time.
   - Added explicit `stt`, `embedding`, and `ocr` branches in `buildUserPrompt()`.
4. Refreshed model metadata/classification:
   - Ran `node scripts/patch-models.cjs`.
   - `public/models.json` now has improved Google image/TTS release dates and classifications.
   - `context/SYSTEM_STATE.json` now matches the refreshed model set: 251 total, 240 text, 4 image, 2 video, 5 tts, 6 zero-cost remaining.
5. Completed the contrast TODO:
   - Replaced `text-white/30` under `src/` with `text-white/45`.
6. Confirmed `electron-updater` optional dependency is intentional:
   - Keep it in `optionalDependencies` so desktop auto-update can work without forcing Vercel web deploys to install it.

### Verification

- `npx tsc --noEmit` passed.
- `node scripts/patch-models.cjs` passed and reported `Patched: 249 / 251`.
- `npm run build` passed.
- `npx playwright test --project=chromium --repeat-each=3` passed: 24/24.
- Build/test generated files were cleaned from the working tree before commit.

---

## Codex E2E Repair — 2026-05-01 (Codex)

### What was done

Fixed the GitHub Actions E2E failures in the Codex-safe worktree without touching the Claude/original workspace.

### Workspace / branch

- Workspace: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`
- Branch: `codex/safe-audit-20260501-232542`
- Status before commit: branch was already ahead of `origin/main` by 1 safety commit

### Files changed

- `tests/e2e/prompt-generator.spec.ts`
- `playwright.config.ts`
- `src/components/ModelSelector.tsx`
- `.github/workflows/test.yml`
- `.github/workflows/update-models.yml`
- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

### E2E fixes

1. Scoped the page title assertion to the `header` heading because the page currently has both header and hero `h1` elements.
2. Corrected the character-count assertion for `Hello world 你好世界` from `14` to `16`.
3. Reworked the model selector test to match the actual UI:
   - Target model selection is an inline card grid.
   - Generator model selection opens the full-screen `role="dialog"` picker.
4. Expanded mocked model objects so they match the real `ModelInfo` shape used by the components.
5. Updated input assertions to check the current `aria-label` and example-based placeholder.
6. After the first main pushes, GitHub CI passed but reported the model selector test as flaky on retry. Reworked the test so it waits for any target model card rather than relying on a specific image model path.
7. Blocked service workers in Playwright E2E so PWA cache behavior cannot bypass route mocks.
8. Added a stable accessible label to the generator model picker trigger.
9. Updated the Playwright CI reporter to generate both GitHub annotations and the HTML report artifact.
10. Updated workflow hardening:
    - E2E workflow project commands now run on Node 22, avoiding dependency engine warnings.
    - E2E workflow uses current GitHub actions (`checkout@v6`, `setup-node@v6`, `upload-artifact@v7`).
    - Model-update workflow uses current GitHub actions (`checkout@v6`, `setup-node@v6`, `github-script@v9`).

### Verification

- `npm ci` initially failed on Electron binary download with `ECONNRESET`; reran successfully with command-local mirror env vars.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npx playwright test --project=chromium` passed: 8/8 tests.
- `npx playwright test --project=chromium --repeat-each=5` passed: 40/40 tests after blocking service workers and stabilizing selectors.

### Notes for next session

- Build generated PWA/TypeScript artifacts were cleaned from the working tree and not included.
- `src/lib/prompt-optimizer.ts` appears to already be a multi-modal v5 implementation, while older context text still described Phase 2/3 as not started. Before further prompt optimizer work, audit the actual code against the old Claude plan instead of blindly rewriting it.
- User approved continuing to completion on 2026-05-02; pushing to `main` is authorized after final local validation.

---

## Codex Safety Setup — 2026-05-01 (Codex)

### What was done

Created a separate Codex-safe worktree so Codex can inspect, evaluate, and implement without overwriting Claude's local workspace.

### Workspaces

- Claude/original workspace: `E:\vscode Claude\ai-prompt-generator`
- Codex workspace: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`

### Git state found

- Claude/original workspace was on `main` at `b44163d`, behind `origin/main` by 2 commits.
- Claude/original workspace had local uncommitted/generated changes:
  - `public/sw.js`
  - `tsconfig.tsbuildinfo`
  - `.claude/`
  - `public/*.map`
  - `public/workbox-7144475a.js`
- Codex worktree was created from GitHub latest `origin/main` at `c009e0e`.

### Safety branches/files

- Backup branch: `backup/claude-main-20260501-232542`
- Codex branch: `codex/safe-audit-20260501-232542`
- Added `AGENTS.md`
- Added `context/CODEX_HANDOFF.md`

### Rule for future sessions

Read `AGENTS.md` and `context/CODEX_HANDOFF.md` before editing. Do not touch the Claude workspace unless explicitly approved by the user.

---

## Session #4 — 2026-04-30 (Claude Sonnet 4.6, Claude Code)

### 9 tasks completed and pushed to GitHub:

| Commit | Task |
|--------|------|
| `0e9f176` | 依赖升级 + npmmirror 镜像 |
| `0368e29` | Provider 安全加固 + WCAG a11y + ModelSelector 搜索排序 |
| `5506383` | BUNDLED_MODELS 添加 GPT-5-Pro + Qwen3-235B |
| `1254671` | BUNDLED_MODELS 添加 GPT-Image-2 |
| `cbcbf99` | 模型更新流水线：retry + 健康检查 + Issue 通知 |
| `aa89818` | Electron：托盘 + macOS DMG + 自启 + 窗口记忆 + 自动更新 |
| `1e64dc0` | PWA：离线页 + 缓存策略 + 安装/更新提示 |
| `28161d3` | 性能监控：Web Vitals + ErrorBoundary + analytics API |

### Pending for next session:
1. **prompt-optimizer.ts Phase 2/3** — 全模态 SYSTEM_PROMPT 重写（plan 已就绪：`C:\Users\zero\.claude\plans\floating-conjuring-treasure.md`）
2. **trackApiCall/trackTTFT 接入** — 在 PromptGenerator.tsx 的 fetch/SSE 处调用
3. **颜色对比度** — text-white/30 → text-white/45（WCAG AA）

---

## Session #3 — 2026-04-26 (Claude Sonnet 4.6, Claude Code)

### What was done
7-task comprehensive upgrade, all verified with `npx tsc --noEmit` and `npm run build`:

1. **Provider name consistency**: ModelPicker "深度求索"→"DeepSeek", ModelSelector added "Ollama" tab
2. **BUNDLED_MODELS expanded**: 25→35 models. Added gpt-4.1 family, gemini-2.5-flash, llama-4 family, claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5, grok-4
3. **mergeWithExisting() safety fix**: Rewrote to Map-based "only add, never delete" strategy with 20% shrink warning
4. **GENERATOR_AFFINITY**: New export in models-registry.ts (13 prefix rules). PromptGenerator.tsx selectBestFromProbe uses affinity-first, then scoreModel fallback
5. **prompt-optimizer.ts v4**: estimateTokens() now CJK-aware, SYSTEM_PROMPT expanded with reverse engineering, grounded persona, prompt chaining, anti-hallucination guards, adaptive verbosity. Model tuning updated to latest models
6. **Auto-update safety**: fetch-models.mjs main() aborts on 0 models fetched. patch-models.cjs added claude-haiku-4-5 META
7. **UI copy fixes**: Header "250+ 大模型", 3 bilingual toast messages in PromptGenerator

### Files modified
- `src/lib/models-registry.ts` — BUNDLED_MODELS +10 models, GENERATOR_AFFINITY export
- `src/lib/prompt-optimizer.ts` — v4 rewrite
- `src/components/PromptGenerator.tsx` — GENERATOR_AFFINITY integration, bilingual toasts
- `src/components/ModelPicker.tsx` — "DeepSeek" provider tab
- `src/components/ModelSelector.tsx` — "Ollama" tab
- `src/components/Header.tsx` — "250+" copy
- `.github/scripts/fetch-models.mjs` — mergeWithExisting rewrite, safety guards
- `scripts/patch-models.cjs` — claude-haiku-4-5 META

### State at end of session
- All changes committed and pushed to GitHub
- Build passes with 0 errors
- Vercel should auto-deploy from `main`

---

## Session #2 — 2026-04-24 (Claude Sonnet 4.6, Claude Code)

### What was done
1. Resolved git rebase merge conflict in `public/models.json` (caused by GitHub Actions auto-update during our work)
2. Re-ran `node scripts/patch-models.cjs` on merged data: 134/251 models patched
3. Successfully pushed all changes to GitHub (commit `1b89bd1`)
4. Created persistent context system:
   - `context/PROGRESS.md` — task progress tracker
   - `context/MEMORIES.md` — all memories and decisions
   - `context/SESSION_LOG.md` — this file
   - Updated `CLAUDE.md` with cross-session instructions
   - Created `scripts/save-context.sh` for one-click context save

### State at end of session
- All core fixes deployed and pushed
- Vercel should auto-deploy from `main`
- 251 models in models.json, 134 with META data
- 8 non-text models correctly classified (3 image, 5 tts)

### What to verify next
- Check https://www.myprompt.asia to confirm deployment
- `/api/models` should return 251+ models
- Non-text models should appear in target model selector

---

## Session #1 — 2026-04-23 (Claude Sonnet 4.6, Claude Code)

### What was done
1. **Model system overhaul**:
   - Expanded META from 8 to 55+ entries in `fetch-models.mjs`
   - Created `lookupMeta()` with prefix matching
   - Enhanced `classifyModel()` for image/video/tts/stt/embedding/ocr
   - Added category tabs to ModelSelector (target shows all types)
   - ModelPicker filters generator to `category === "text"` only

2. **Root cause fix for "auto-update has no effect"**:
   - Discovered `model-cache.ts` never read `public/models.json` without `MODELS_REGISTRY_URL`
   - Added local file reading as second tier fallback
   - This was THE fix — without it, 239 models were invisible

3. **Bug fixes**:
   - `fetchAnthropic` using `META[m.id]` instead of `lookupMeta(m.id)`
   - Missing `category` field in fetchGoogle/fetchOpenAI/fetchAnthropic
   - OpenAI KEEP regex missing `gpt-5` pattern
   - gpt-4o pricing wrong (5→2.5 input, 15→10 output)

4. **Post-processing**:
   - Created `scripts/patch-models.cjs` for one-time META application
   - Ran it: 115/239 → later 134/251 models patched

5. **Other improvements**:
   - `selectBestFromProbe` adapts scoring mode by target category
   - KeysSettings clears probe cache on save
   - GitHub Actions cron: 6 hours → 2 hours
   - Added `SYSTEM_STATE.json` generation in workflow
   - Bilingual error messages (中文/English)

### Git conflict resolution
- GitHub Actions committed auto-updates while we were working
- Rebase failed with conflict in `public/models.json`
- Resolved with `git pull --no-rebase -X ours` then re-patched

### Key commits
- `da7163e` feat: 全面改造模型系统
- `ef3810a` fix: 修复自动更新模型无效的根本原因
- `1b89bd1` chore: re-patch models.json after merge

---

## Model META Coverage Repair — 2026-05-02 (Codex)

### What was done

Improved model pricing metadata coverage in the Codex-safe workspace.

### Files changed

- `scripts/patch-models.cjs`
- `.github/scripts/fetch-models.mjs`
- `public/models.json`
- `context/SYSTEM_STATE.json`

### Details

- Confirmed `lookupMeta()` already performs case-insensitive longest-prefix matching after exact lookup.
- Confirmed the requested META groups were already present in both scripts except for fetch-side Ollama local aliases.
- Added active uncovered aliases:
  - `bai-qwen3-vl-235b`
  - `deepinfra-gemma-4`
- Added fetch-side Ollama entries:
  - `llama3.2`
  - `qwen2.5:7b`
- Re-ran `node scripts/patch-models.cjs`.

### Verification

- `node --check scripts/patch-models.cjs` passed.
- `node --check .github/scripts/fetch-models.mjs` passed.
- `node scripts/patch-models.cjs` patched `251 / 251`.
- Coverage is now `247 / 251`, or `98.41%`.
- Zero-cost remaining models are intentional/non-token-priced local or video entries: `seedance-1.0`, `seedance-2.0`, `llama3.2`, `qwen2.5:7b`.

---

## Media Model Ensure Script — 2026-05-02 (Codex)

### What was done

Added and ran a Node.js script to ensure important image/video models are present in `public/models.json` without creating duplicates.

### Files changed

- `scripts/add-missing-media-models.cjs`
- `public/models.json`
- `context/SYSTEM_STATE.json`
- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

### Details

- The script checks for `gpt-image-1`, `seedance-1.0`, and `seedance-2.0`.
- If a model exists, it merges the requested ModelInfo object into the existing entry.
- If a model is missing, it appends it to the JSON array.
- It throws if duplicate IDs are detected.
- In the current repository state, all three models already existed, so the run reported `Added: 0`, `Updated: 3`.
- The only model data change after merge was `gpt-image-1.isLatest: false -> true`.

### Verification

- `node --check scripts/add-missing-media-models.cjs` passed.
- `node scripts/add-missing-media-models.cjs` reported `251` total, categories `{ text: 240, video: 2, image: 4, tts: 5 }`, zero-cost `4`.
- `node scripts/patch-models.cjs` passed and patched `251 / 251`.

---

## Latest Model Auto-Update Upgrade — 2026-05-02 (Codex)

### User request

User reported that the site was missing current market models such as DeepSeek V4 and GPT Image 2.0, and requested automatic updates for the latest GPT/OpenAI, DeepSeek, Gemini, and Claude models as of 2026-05-02 and going forward.

### What was done

- Used official/API-backed model references before editing:
  - OpenAI model/pricing docs for GPT-5.5 and GPT Image 2.
  - DeepSeek pricing docs for `deepseek-v4-pro` and `deepseek-v4-flash`.
  - Google Gemini model/pricing docs for Gemini 3.1 and Veo 3.1 preview models.
  - Anthropic model overview for Claude Opus 4.7, Sonnet 4.6, and Haiku 4.5.
- Added `scripts/latest-model-ensures.cjs`, shared by:
  - `.github/scripts/fetch-models.mjs`
  - `scripts/patch-models.cjs`
- The shared latest-model list keeps official latest models present even when a provider API/relay omits them, while API fetching remains the primary source.
- Changed model update workflow cadence from every 2 hours to every 30 minutes.
- Changed latest marking from provider-only to provider + category, so OpenAI can mark text/image/video latest models at the same time.
- Added/updated model data in `public/models.json`:
  - `gpt-5.5-pro`
  - `gpt-image-2`
  - `gpt-image-1.5`
  - `gpt-image-1-mini`
  - `sora-2`
  - `sora-2-pro`
  - `gpt-realtime-1.5`
  - `deepseek-v4-pro`
  - `deepseek-v4-flash`
  - `gemini-3.1-flash-live-preview`
  - `veo-3.1-generate-preview`
  - `veo-3.1-fast-generate-preview`
  - `veo-3.1-lite-generate-preview`
  - `claude-haiku-4-5`
  - `claude-haiku-4-5-20251001`
- Corrected metadata for existing latest entries:
  - `gpt-5.5`
  - `gpt-5.4*`
  - `sophnet-deepseek-v4-pro`
  - `gemini-3.1*`
  - `gemini-3-pro-image-preview`
  - `claude-opus-4-7`
  - `claude-sonnet-4-6`
- Updated recommendation rules:
  - image -> `gpt-image-2`
  - video -> `sora-2-pro`
  - code -> `deepseek-v4-pro`
- Updated production smoke checks to require:
  - `gpt-5.5`
  - `gpt-image-2`
  - `deepseek-v4-pro`
  - `gemini-3.1-pro-preview`
  - `claude-opus-4-7`

### Verification

- `node --check scripts/latest-model-ensures.cjs` passed.
- `node --check scripts/patch-models.cjs` passed.
- `node --check .github/scripts/fetch-models.mjs` passed.
- `node scripts/patch-models.cjs` passed and reported:
  - `266` total models
  - categories `{ text: 245, video: 7, image: 7, tts: 7 }`
  - zero-cost `9`
  - no duplicate IDs

### Still to do

- Run project typecheck/build.
- Commit and push to GitHub `main`.
- Watch GitHub Actions.
- Verify production `/api/models` after Vercel deploy.
