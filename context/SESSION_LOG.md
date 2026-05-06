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

### Final verification

- Local `E:\AI工作台\AI-CHAIN.cmd typecheck` passed.
- Local `npm run build` passed.
- Pushed commit `e4382cf chore: auto-ensure latest model registry`.
- GitHub E2E run `25248153146` passed with `8/8` tests.
- Manually triggered `Auto Update Models`; run `25248197746` passed.
  - It fetched `226` AihubMix models and `50` Google models.
  - It wrote `266` models and created bot commit `f14da68 chore: auto-update models 2026-05-02`.
- Synced local worktree to `f14da68`.
- Production `/api/models` returned:
  - `266` total
  - categories `{ text: 245, video: 7, image: 7, tts: 7 }`
  - zero-cost `9`
  - latest IDs present: `gpt-5.5`, `gpt-5.5-pro`, `gpt-image-2`, `deepseek-v4-pro`, `deepseek-v4-flash`, `gemini-3.1-pro-preview`, `claude-opus-4-7`, `claude-haiku-4-5`.
- Local production smoke passed homepage/models/analytics, then stopped because local environment has no generation API key.
- GitHub `Production Smoke Test` run `25248233632` passed using repository secrets:
  - homepage ok
  - models ok
  - analytics ok
  - probe ok: `226`
  - real generation ok through Groq fallback

---

## Follow-up Feature/QA Checks — 2026-05-02 (Codex)

### User concern

User asked whether the previous feature/code-review tasks had really been pushed to GitHub and whether project memory/context had been interrupted.

### GitHub status checked

- Local branch `codex/safe-audit-20260501-232542` was aligned with `origin/main`.
- Latest commit before this memory update:
  - `b38b2ff fix: export recommendation type`
- GitHub Actions:
  - `25248567893` for `b38b2ff` passed with `8/8`.
  - Previous latest-model rollout E2E, Auto Update Models, and Production Smoke Test were also successful.

### Follow-up requests checked

- **ResultPanel comparison UI**
  - Already implemented in `src/components/ResultPanel.tsx`.
  - `PromptGenerator.tsx` already passes `originalPrompt={idea}`.
  - No code change needed.

- **Smart model recommender**
  - `src/lib/model-recommender.ts` already existed and `PromptGenerator.tsx` already displayed the recommendation chip between the textarea and `ModelSelector`.
  - One real gap was fixed: `Recommendation` is now exported.
  - Commit pushed: `b38b2ff fix: export recommendation type`.
  - Kept live model IDs (`gpt-image-2`, `sora-2-pro`, `deepseek-v4-pro`) because the older requested IDs (`dall-e-3`, `sora`, `elevenlabs-tts`, `suno`) are not present in the 266-model registry.

- **History/favorites**
  - `src/lib/history.ts` and `src/components/HistoryPanel.tsx` already exist.
  - `PromptGenerator.tsx` already imports `HistoryPanel` and `saveHistory`.
  - All three successful generation paths already call `saveHistory`.
  - No code change needed.

- **`/api/generate` type cleanup**
  - `src/app/api/generate/route.ts` already imports `ModelInfo`.
  - `models.find()` callbacks are typed as `(m: ModelInfo)`.
  - `targetCategory` uses `targetModel.category ?? "text"`.
  - No `targetModel as any` remains.
  - Local typecheck passed.

- **ARIA accessibility labels**
  - Requested labels already exist in `ResultPanel.tsx`, `PromptGenerator.tsx`, and `HistoryPanel.tsx`.
  - Streaming preview already has `role="status"` and `aria-live="polite"`.
  - No code change needed.

### Memory repair

- `context/PROGRESS.md` and `context/SESSION_LOG.md` were missing this follow-up verification.
- Added this entry and a matching progress summary so the next Codex/Claude session knows which tasks were pushed and which were no-op verifications.

---

## Shared Toolchain Audit + Visual QA Upgrade — 2026-05-02 (Codex)

### User request

User asked Codex to continue the original free AI workbench setup, verify all free tools/plugins/software are ready for large projects, ensure any AI in VS Code can call the shared toolchain, test website functionality/visual quality, and remove only useless generated junk from E drive.

### Local toolchain checks

- `E:\AI工作台\AI-CHAIN.cmd doctor` confirmed:
  - Git `2.53.0`
  - GitHub CLI `2.92.0`
  - Node `24.14.1`
  - npm/npx `11.11.0`
  - Python `3.13.1`
  - uv `0.11.8`
  - VS Code `1.118.1`
  - Docker/Rancher `29.1.4-rd`
  - Ollama `0.22.0`
  - Claude Code `2.1.100`
  - Codex CLI `0.120.0`
  - PowerShell `7.6.1`
  - curl `8.18.0`
  - Gitleaks `8.30.1`
- Fixed `E:\AI工作台\工具 Tools\ai-chain.ps1` so VS Code CLI resolves to `E:\vscode\Microsoft VS Code\bin\code.cmd`.
- Installed free VS Code extensions:
  - `bradlc.vscode-tailwindcss`
  - `sonarsource.sonarlint-vscode`
  - `deque-systems.vscode-axe-linter`
  - `vitest.explorer`
  - `streetsidesoftware.code-spell-checker`
  - `yoavbls.pretty-ts-errors`
  - `gruntfuggly.todo-tree`
  - `christian-kohler.path-intellisense`
  - `ms-edgedevtools.vscode-edge-devtools`

### Project changes

- Added `@axe-core/playwright`.
- Added `npm run test:quality`.
- Added `tests/e2e/quality.spec.ts` for desktop/mobile visual-health screenshots, no-horizontal-overflow checks, console-error checks, and axe WCAG scanning.
- Added `quality` command to `AI-CHAIN`.
- Disabled PWA generation in development mode while keeping production PWA builds enabled, so dev/E2E runs no longer write temporary service-worker files into `public/`.
- Added generated build/cache outputs to `.gitignore` and removed them from Git tracking:
  - `public/sw.js`
  - `public/workbox-*.js`
  - `public/fallback-*.js`
  - PWA source maps
  - `tsconfig.tsbuildinfo`
- Fixed the first quality-test findings:
  - Removed mobile zoom lock from `src/app/layout.tsx`.
  - Added aria labels to header icon controls and GitHub link.
  - Raised low-contrast dark-theme text from `text-white/20-45` to `text-white/60-70`.
- Updated toolchain docs:
  - `E:\AI工作台\AI_TOOLCHAIN.md`
  - `E:\AI工作台\AI工具链说明.md`
  - `context/AI_TOOLCHAIN.md`
  - `AGENTS.md`
  - `context/QUICK_START.md`

### Cleanup

- Removed ignored Playwright output folders: `test-results/`, `playwright-report/`.
- Removed build-generated PWA junk after verification.
- Removed local `tsconfig.tsbuildinfo` after verification.
- Kept useful folders/tools: `node_modules`, `.next`, caches, logs, Ollama `bge-m3`, VS Code/Cursor/Trae/opencode folders, and the tiny old `E:\免费神器控制台`.

### Verification

- `E:\AI工作台\AI-CHAIN.cmd quality` passed: 2/2.
- `E:\AI工作台\AI-CHAIN.cmd test-all` passed:
  - `npx tsc --noEmit`
  - `npm run build`
  - Playwright Chromium E2E: 10/10
- `E:\AI工作台\AI-CHAIN.cmd security` passed: no leaks found across 116 commits.
- `E:\AI工作台\AI-CHAIN.cmd docker` passed.
- `E:\AI工作台\AI-CHAIN.cmd ollama` passed and showed `bge-m3:latest`.
- Local `smoke-prod` passed homepage/models/analytics and stopped at real generation because no local generation API key env var is configured. GitHub Production Smoke Test should be used after push because repo secrets exist there.

### GitHub verification after push

- Pushed commit `9b3abb9 test: add visual accessibility quality audit` to `main`.
- GitHub E2E run `25254262203` passed:
  - build ok
  - Playwright tests: 10/10
- GitHub Production Smoke Test run `25254319276` passed on `9b3abb9`:
  - homepage ok
  - models ok: `266` total, `{ text: 245, video: 7, image: 7, tts: 7 }`
  - analytics ok
  - relay probe ok: `224` models
  - real generation ok through Groq fallback after Google failed

---

## 2026-05-03 — Provider text clipping fix and desktop download page

User provided screenshots showing the homepage provider filter clipped `月之暗面` to `月之`, then asked for a page on the website where users can download the desktop software.

Actions:

- Read project memory and checked status with `E:\AI工作台\AI-CHAIN.cmd status`.
- Confirmed Codex-safe branch was aligned with `origin/main` before code changes.
- Changed provider filter rows in:
  - `src/components/ModelSelector.tsx`
  - `src/components/ModelPicker.tsx`
- Adjusted API key provider card header layout in `src/components/KeysSettings.tsx`.
- Added header download link in `src/components/Header.tsx`.
- Added:
  - `src/app/download/page.tsx`
  - `src/app/api/download/windows/route.ts`
  - `.github/workflows/desktop-release.yml`
- Added regression tests to `tests/e2e/quality.spec.ts`.

Verification:

- `E:\AI工作台\AI-CHAIN.cmd typecheck` passed.
- `E:\AI工作台\AI-CHAIN.cmd build` passed.
- `E:\AI工作台\AI-CHAIN.cmd quality` passed.
- Manual Playwright screenshot verification:
  - `月之暗面 1` was fully visible, bounding box inside viewport.
  - `/download` loaded and showed `下载 Windows 版`.
- Final `E:\AI工作台\AI-CHAIN.cmd test-all` passed, 12/12 Chromium tests.
- Removed generated `test-results/`, `playwright-report/`, `public/sw.js`, `public/fallback-*.js`, and `public/workbox-*.js`.

Notes for next AI:

- No dev server is left running on port 3100.
- The new download API route is forced dynamic so GitHub latest release lookup is not frozen at build time.
- The `Desktop Release` workflow is manual (`workflow_dispatch`) and should be run after push if a downloadable Windows installer is needed immediately.

Follow-up:

- The first desktop workflow run succeeded and produced an installer, but Electron Builder sanitized the Chinese product-name artifact into `AI.-1.0.0-win-x64.exe`.
- Updated `package.json` artifactName to use the clean ASCII name `AI-Prompt-Generator-${version}-${os}-${arch}.${ext}`.
- Updated `.github/workflows/desktop-release.yml` to delete old `.exe`/`.blockmap` release assets before uploading new files.
- Re-ran `E:\AI工作台\AI-CHAIN.cmd test-all`; 12/12 Chromium tests passed.

Final remote verification:

- Pushed `258d0e9 feat: add desktop download page`; GitHub E2E run `25267691625` passed, 12/12.
- Pushed `4eca4b7 chore: clean desktop release artifacts`; GitHub E2E run `25267887313` passed, 12/12.
- Re-ran `Desktop Release`; workflow run `25267934422` passed.
- GitHub Release `desktop-v1.0.0` now contains `AI-Prompt-Generator-1.0.0-win-x64.exe` and its `.blockmap`.
- Production `/download` returns HTTP 200.
- Production `/api/download/windows` redirects to `AI-Prompt-Generator-1.0.0-win-x64.exe`; following redirects reaches the 79,301,110 byte installer.

---

## 2026-05-03 — GPT Image 2 four-source ensemble integration

User supplied four GPT Image 2 prompt repositories and clarified that the full repositories should not be uploaded into this app repo. The upstream GitHub versions should be treated as the current source of truth, while the older extracted E-drive folders are only local references.

External upstream repos:

- `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts`
- `YouMind-OpenLab/awesome-gpt-image-2`
- `Anil-matcha/Awesome-GPT-Image-2-API-Prompts`
- `wuyoscar/gpt_image_2_skill`

Completed:

- Added `scripts/sync-gpt-image2-sources.cjs`.
- Added `npm run sources:gpt-image2`.
- Added shared workbench command `E:\AI工作台\AI-CHAIN.cmd gpt-image2-sync`.
- Synced the four upstream repos into `E:\AI工作台\资料 Sources\gpt-image-2`.
- Added `src/lib/gpt-image-2-source-status.ts` with current upstream short commits:
  - `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts@c0a069d`
  - `YouMind-OpenLab/awesome-gpt-image-2@3c2dd22`
  - `Anil-matcha/Awesome-GPT-Image-2-API-Prompts@1123572`
  - `wuyoscar/gpt_image_2_skill@44ea0fa`
- Added `context/GPT_IMAGE2_SOURCES.md` to document source handling rules.
- Added `src/lib/gpt-image-2-ensemble.ts`.
- Updated `/api/generate` so GPT Image 2 target prompts run a special ensemble:
  1. generate four independent source-strategy candidates,
  2. generate one four-source hybrid candidate,
  3. choose up to three strongest callable judge models from the user's configured API/model list,
  4. score candidates,
  5. synthesize when the best single-source prompt and hybrid are close,
  6. return one final GPT Image 2 prompt plus judge metadata and estimated cost.
- Forwarded `availableModelIds` from the frontend to `/api/generate` so custom relay/AihubMix model availability can guide judge selection.
- Updated `ResultPanel` to show GPT Image 2 ensemble review metadata and estimated cost when present.
- Updated `prompt-optimizer.ts` GPT Image section with source-informed GPT Image 2 principles.
- Hardened `ModelSelector.tsx` provider/category chip contrast after the new quality audit exposed low-contrast states.
- Hardened `tests/e2e/quality.spec.ts` to wait for finite UI animations before axe contrast scanning.

Verification:

- `npm run sources:gpt-image2` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium` passed: 4/4.
- `npx playwright test --project=chromium` passed: 12/12.
- Cleaned generated Playwright/PWA build artifacts after verification.
- GitHub E2E initially passed only after retry because axe scanned during a UI opacity animation. Added an extra stable wait in `tests/e2e/quality.spec.ts` to remove that flake.

GitHub / production verification:

- Pushed `9142663 feat: add GPT Image 2 source ensemble`.
- Pushed `76dd157 test: stabilize accessibility audit`.
- GitHub E2E run `25281333634` passed cleanly: 12/12.
- Vercel production deployment for `76dd157` succeeded:
  - deployment id `4561806192`
  - target `https://ai-prompt-generator-s6bk3j0dt-00qq6868-dels-projects.vercel.app`
- Production smoke test run `25281462814` passed:
  - homepage ok
  - models ok: `266` total, `{ text: 245, video: 7, image: 7, tts: 7 }`
  - analytics ok
  - relay probe ok: `221` models
  - real generation ok through Groq fallback after Google failed
- `https://www.myprompt.asia` returned HTTP 200.
- `https://www.myprompt.asia/api/models` includes `gpt-image-2`.

---

## 2026-05-03 — Prompt source auto-sync and standalone desktop hardening

User asked whether the website and desktop app can keep GPT Image 2 prompt-source projects synced long term, and whether the downloaded desktop software can keep working if the domain/server expires.

Completed:

- Added `.github/workflows/sync-prompt-sources.yml`.
  - Runs every 6 hours.
  - Can be triggered manually.
  - Runs `npm run sources:gpt-image2`.
  - Commits `src/lib/gpt-image-2-source-status.ts` only when upstream commit hashes change.
  - The commit triggers the normal GitHub/Vercel pipeline.
- Added `context/PROMPT_SOURCE_AUTOSYNC.md` with the pattern for future prompt-source groups.
- Updated `context/GPT_IMAGE2_SOURCES.md` to document automatic sync.
- Hardened desktop independence:
  - Electron still starts a local Next server at `http://127.0.0.1:3748`.
  - `electron/main.js` no longer assumes only one packaged server layout; it can find both packaged standalone layouts.
  - The desktop main process does not depend on `www.myprompt.asia`.
  - Added portable data directory support via `PORTABLE_EXECUTABLE_DIR`; portable builds store settings next to the executable in `AI-Prompt-Generator-Data`.
  - First-run desktop settings now support custom relay / AihubMix keys, matching the user's actual API setup better.
- Added Windows portable build target in addition to the installer target.
- Added `/api/download/windows/portable`.
- Updated `/download` to expose both:
  - Windows installer
  - Windows portable EXE for USB use
- Added `scripts/verify-desktop-standalone.cjs` and `npm run desktop:verify`.
- Updated Electron build scripts to use `--config.win.signAndEditExecutable=false` so local Windows builds do not fail when the current user lacks symlink privileges for Electron Builder's winCodeSign helper.

Verification:

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run desktop:verify` passed.
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium` passed: 4/4.
- `npx playwright test --project=chromium` passed: 12/12.
- `npm run sources:gpt-image2` passed.
- Local Electron Builder first failed because Windows could not create symlinks while extracting `winCodeSign`; rerunning with `--config.win.signAndEditExecutable=false` succeeded.
- Local desktop artifacts were produced:
  - `dist-electron/AI-Prompt-Generator-Setup-1.0.0-win-x64.exe`
  - `dist-electron/AI-Prompt-Generator-Portable-1.0.0-win-x64.exe`
  - `dist-electron/AI-Prompt-Generator-Setup-1.0.0-win-x64.exe.blockmap`
- Verified packaged resources include a local server at `dist-electron/win-unpacked/resources/app/server.js`.

Notes:

- The desktop app can run without the production domain because it serves the same app locally from the packaged Next standalone build.
- It still needs internet access to call cloud APIs or a reachable relay/base URL unless the user configures a local provider such as Ollama.
- Future source groups should follow `context/PROMPT_SOURCE_AUTOSYNC.md` and should not be blindly mixed into GPT Image 2 logic.

Final GitHub / production verification:

- Pushed `d06486e feat: automate prompt source sync and portable desktop`.
- GitHub E2E run `25282442312` passed cleanly: 12/12.
- Vercel production deployment for `d06486e` succeeded at `2026-05-03T14:57:37Z`.
- Desktop Release run `25282500662` passed.
- GitHub Release `desktop-v1.0.0` now contains:
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe` — 79,243,965 bytes
  - `AI-Prompt-Generator-Portable-1.0.0-win-x64.exe` — 79,050,371 bytes
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe.blockmap`
- Production `/download` returns HTTP 200 and contains both installer and portable download entries.
- Production `/api/download/windows` redirects to the setup installer.
- Production `/api/download/windows/portable` redirects to the portable EXE.
- Manual `Sync Prompt Sources` workflow run `25282673189` passed; no source-status commit was needed because upstream commits were unchanged.
- Production Smoke Test run `25282673405` passed:
  - homepage ok
  - models ok: `266` total, `{ text: 245, video: 7, image: 7, tts: 7 }`
  - analytics ok
  - relay probe ok: `221` models
  - real generation ok through Groq fallback after Google failed.

Rules for next AI:

- Do not copy the full four upstream repos into this project.
- Sync upstream sources before modifying GPT Image 2 behavior.
- If upstream prompt patterns materially change, update the distilled strategy in `src/lib/gpt-image-2-ensemble.ts` and this session log.
- If multiple judge models are unavailable from the user's API setup, the ensemble intentionally falls back to the best callable generator/model path instead of failing the whole prompt generation.

---

## 2026-05-04 — Multi-generator evaluation, prompt-library sources, cross-platform downloads

User reported that the generator model picker page could not scroll after opening it and asked for broader prompt-quality optimization:

- generator models should support multi-select
- judge/evaluator models should be manually selectable, up to 6
- prompt quality should be scored visually out of 100
- the scoring standard should reference the top 10 GitHub prompt-engineering repositories provided by the user
- the existing 4 GPT Image 2 sources must be preserved
- the 10 new prompt sources must sync from GitHub over time
- desktop downloads should include macOS and broader portable computer packages
- AI Workbench memory should preserve the workflow for future stronger AIs

Implemented:

- `src/components/ModelPicker.tsx`
  - Supports single-select and multi-select modes.
  - Multi-select shows selected count and a Done button.
  - Forwarded mouse-wheel scrolling from header/filter areas into the model list, so the full-screen picker remains scrollable even when the pointer is over filters.
  - Provider chips keep long Chinese names such as `月之暗面` un-clipped.
- `src/components/ModelSelector.tsx`
  - Generator model picker now supports selecting up to 6 generator models.
  - Added evaluator model picker, also up to 6 models.
  - Evaluator picker is optional; backend auto-selects judges if none are chosen.
- `src/components/PromptGenerator.tsx`
  - Stores `generatorModelIds` and `evaluatorModelIds`.
  - Sends both arrays to `/api/generate`.
  - Probed relay models still auto-select a primary generator and recommended evaluator models.
  - History reuse restores multi-generator IDs when available.
- `src/app/api/generate/route.ts`
  - Accepts `generatorModelIds` and `evaluatorModelIds`.
  - Runs the new prompt tournament for normal text targets when multiple generators or evaluators are selected.
  - Keeps GPT Image 2 on the existing four-source ensemble path, with manual evaluator-model support.
- `src/lib/prompt-evaluator.ts`
  - Generates one candidate per selected generator model.
  - Selects up to 6 manual evaluator models, or auto-selects strong available judge models.
  - Scores candidates from 0 to 100 using the prompt-library rubric.
  - Aggregates judge scores and returns the highest-scoring prompt.
- `src/components/ResultPanel.tsx`
  - Shows the AI evaluation score panel with 0-100 bars, candidate rank, selected candidate, and judge summary.
- `scripts/sync-prompt-library-sources.cjs`
  - Syncs the 10 user-provided prompt repositories into `E:\AI工作台\资料 Sources\prompt-library`.
  - Writes repo stars, focus, commit hashes, local paths, and rubric into `src/lib/prompt-source-library-status.ts`.
  - Handles Windows invalid-path checkout failures by preserving git metadata instead of failing the whole sync.
- `.github/workflows/sync-prompt-sources.yml`
  - Now runs `npm run sources:all`.
  - Commits both GPT Image 2 and prompt-library source status files.
- `context/PROMPT_LIBRARY_SOURCES.md`
  - Documents the new source group, safety boundary, scoring rubric usage, and future-AI handoff.
- `context/PROMPT_SOURCE_AUTOSYNC.md`
  - Updated to document both source groups.
- Desktop/download updates:
  - Added macOS download routes:
    - `/api/download/mac`
    - `/api/download/mac/portable`
  - Added Linux AppImage route:
    - `/api/download/linux`
  - Download page now lists Windows installer, Windows portable EXE, macOS DMG/ZIP, Linux AppImage, and Android PWA install entry.
  - `package.json` now has `electron:build:mac`, `electron:build:linux`, and mac ZIP / Linux AppImage targets.
  - `desktop-release.yml` now has Windows, macOS, and Linux jobs.
- AI Workbench updates outside the repo:
  - Added `E:\AI工作台\AI自我改进工作流.md`.
  - Updated `E:\AI工作台\工具 Tools\ai-chain.ps1` with:
    - `prompt-sources`
    - `self-improve`
    - memory output for prompt-source docs.

Important boundary:

- There is no single executable that can run unchanged on Windows, macOS, Linux, and Android. The implemented path is platform-specific portable packages: Windows Portable EXE, macOS ZIP, Linux AppImage, plus Android PWA for now.
- Native Android APK is not completed in this commit; the download page states APK will be added after the Android packaging chain is built.

Source sync notes:

- `npm run sources:all` completed.
- The prompt-library sync wrote `src/lib/prompt-source-library-status.ts`.
- `elder-plinius/L1B3RT4S` and `liyupi/ai-guide` contain Windows-invalid paths; the sync script preserves git metadata and continues.
- A transient TLS warning happened while updating `promptfoo/promptfoo`; the script continued using the existing local commit and completed.

Verification:

- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `npm run build` passed.
- `npm run desktop:verify` passed after build.
- `npm run test:quality` passed: 4/4.
- `npx playwright test --project=chromium` passed: 12/12.

Remote follow-up:

- Pushed feature commit `e7f5411 feat: add prompt tournament and source library sync` after rebasing over auto-model update `2a20899`.
- GitHub E2E run `25285272937` passed: 12/12.
- Production smoke without generation secrets passed with `SMOKE_SKIP_GENERATE=1`:
  - homepage ok
  - models ok: 266 total
  - analytics ok
  - generation deliberately skipped because no local smoke API secret was present in this shell.

---

## Desktop Release Follow-Up — 2026-05-03

Completed:

- Fixed the macOS Desktop Release packaging failure.
- Root cause: the mac job's `ELECTRON_MIRROR` value was being reused by the dmg-builder downloader, causing it to request `dmg-builder@1.2.0` from the wrong host.
- Final fix:
  - Removed `ELECTRON_MIRROR` from the mac job.
  - Kept `ELECTRON_BUILDER_BINARIES_MIRROR` pointed at the official electron-builder binaries release host.
- Rebased over auto-model update `f3bce9e chore: auto-update models 2026-05-03`.
- Pushed `134ea07 fix: avoid electron mirror for mac dmg assets`.

Remote verification:

- GitHub E2E run `25286900416` passed.
- Desktop Release run `25286900540` passed:
  - Windows job passed.
  - macOS job passed.
  - Linux job passed.
- GitHub Release `desktop-v1.0.0` now contains:
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-Portable-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-1.0.0-mac-universal.dmg`
  - `AI-Prompt-Generator-1.0.0-mac-universal.zip`
  - `AI-Prompt-Generator-1.0.0-linux-x86_64.AppImage`
- Production `/download` returned HTTP 200 after the release assets were uploaded.

Remember:

- Do not re-add `ELECTRON_MIRROR` to the mac release job unless the dmg-builder download path is also verified.

---

## 2026-05-04 — Scroll Deadlock Fix, Android APK Source, Real GPT Image 2 QA Script

User reported the screenshot problem again: after opening generator model / target model / evaluator model, scrolling could feel stuck. User also asked to finish unfinished work and create a real API-key-based test path for GPT Image 2 prompt quality.

Changes made:

- `src/components/ModelPicker.tsx`
  - Reworked generator/evaluator full-screen picker scroll behavior.
  - Filters/search are now inside the same scrollable region as the model cards.
  - Wheel events from the whole dialog are forwarded to the internal list, including header/filter/search regions.
  - Body/html overflow and overscroll styles are restored exactly after close.
- `src/components/ModelSelector.tsx`
  - Target model grid is now a real scroll container.
  - Fixed the max-height implementation by using inline `maxHeight: "min(520px, 65vh)"`.
- `tests/e2e/quality.spec.ts`
  - Added desktop and mobile scroll regression tests for target/generator/evaluator model areas.
  - Added Android APK download link assertion.
- Android:
  - Added native Android WebView project under `android/`.
  - Added `android/gradle.properties` to allow the current Chinese path and set UTF-8/JVM memory.
  - Added GitHub Actions workflow `.github/workflows/android-release.yml`.
  - Added route `src/app/api/download/android/route.ts`.
  - Updated `/download` page to include Android APK + PWA.
- Real GPT Image 2 QA:
  - Added `scripts/real-gpt-image2-quality-test.cjs`.
  - Added `npm run test:gpt-image2:real`.
  - Script supports:
    - prompt-only live app test through `/api/generate`
    - optional real `/v1/images/generations`
    - optional vision-model image scoring
    - report files under `reports/gpt-image2-real-tests/`
  - API keys are supplied through environment variables and masked in reports.
- `.gitignore`
  - Ignores `reports/`, Android Gradle/build outputs, and `*.apk`.

Validation run locally:

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run test:quality` passed: 5/5 Chromium.
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium --project=mobile` passed: 10/10.
- `npx playwright test --project=chromium` passed: 13/13.
- `npx playwright test --project=mobile` passed: 13/13.
- `gradle -p android :app:assembleDebug --no-daemon` passed and generated a debug APK.
- `node --check scripts/real-gpt-image2-quality-test.cjs` passed.
- No real image was generated in this session because the user has not provided the relay API key yet.

Remote verification:

- Pushed `5063a63 feat: harden model scrolling and add android qa workflows`.
- Pushed follow-up `cbbac83 fix: use available setup-java action for android release`.
- GitHub E2E run `25296187362` passed: 13/13.
- GitHub E2E run `25296280706` passed after the workflow fix: 13/13.
- Android Release run `25296284603` passed and uploaded `AI-Prompt-Generator-Android-1.0.0-debug.apk`.
- GitHub Release `desktop-v1.0.0` now contains Windows installer, Windows portable EXE, macOS DMG, macOS ZIP, Linux AppImage, and Android APK.
- Production `/download` returned HTTP 200 and contains `下载 Android APK`.
- Production `/api/download/android` redirects to the GitHub APK asset.

Remaining user-key step:

- If the user provides a relay key, run `npm run test:gpt-image2:real`; set `MAKE_IMAGE=1` for a real image and `JUDGE_IMAGE=1` for vision scoring.

Update — 2026-05-04:

- Added `scripts/gpt-image2-live-review-panel.cjs`.
- Added `npm run test:gpt-image2:panel`.
- Added shared launcher command `E:\AI工作台\AI-CHAIN.cmd gpt-image2-panel`.
- Added one-click local entry outside the repo: `E:\AI工作台\GPTImage2一键共同真实测试面板.cmd`.
- The panel opens `127.0.0.1` in the browser, accepts the relay API Key in a password field, then runs all three stages together:
  - prompt generation and prompt scoring
  - real GPT Image 2 image generation
  - multi-AI image scoring
- The panel then lets the user enter a human score and notes, saving the comparison into the ignored report files.
- Validation:
  - `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
  - Server startup was tested with `NO_OPEN_BROWSER=1`; it successfully bound to a local `127.0.0.1` URL.

---

## 2026-05-04 — Production Generation Stability + ETA

User showed a production failure toast and asked for unstable relay/API/model behavior to be handled automatically, plus faster perceived generation with an estimated wait/countdown.

Changes made:

- Added `src/lib/model-health.ts`.
  - Tracks model/provider health in memory.
  - Cooldown after unstable errors, timeouts, 429, 5xx, upstream/network failures, or access/model errors.
  - Success resets cooldown so the model can be used again.
  - Default timeouts: simple 60s, generator 45s, judge 30s.
- Updated `src/app/api/generate/route.ts`.
  - SSE now supports `progress` events.
  - Single-model generation can skip a cooling model and choose a healthy fallback.
  - If the primary single model fails before streaming text, it retries once with a healthy fallback.
  - Multi-model and GPT Image 2 routes now stream progress instead of staying silent until the final prompt.
- Updated `src/lib/prompt-evaluator.ts`.
  - Skips cooling generator/judge models.
  - Records successes/failures.
  - Continues when some models fail.
  - If all selected generators fail, tries one healthy fallback generator before returning an error.
- Updated `src/lib/gpt-image-2-ensemble.ts`.
  - Skips cooling generator/judge models.
  - Switches to a healthy generator if the chosen one is cooling or fails early.
  - Judge and synthesis failures no longer kill the whole GPT Image 2 prompt result when a candidate exists.
- Updated `src/components/PromptGenerator.tsx`.
  - Shows phase, elapsed time, and estimated remaining time.
  - Shows a status panel even before text chunks arrive.
  - Toasts update with backend phase and ETA.
- Updated `src/components/ResultPanel.tsx`.
  - Shows when unstable models were cooled/skipped or failed without interrupting output.

Validation:

- `npx tsc --noEmit` passed.
- `npm run build` passed. Note: an earlier parallel build collided with Playwright's dev server cache and failed on `/_document`; rerunning build alone passed.
- `npm run test:quality` passed: 5/5 Chromium.
- `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` passed: 8/8.
- `npx playwright test --project=mobile` passed: 13/13.
- `npx playwright test --project=chromium` passed: 13/13.
- Production smoke with `SMOKE_SKIP_GENERATE=1` passed for homepage, models, and analytics.
- Pushed `ae15cfc feat: add generation health fallback and eta`.
- GitHub E2E run `25298235201` passed: 13/13.
- Vercel deployment status for `ae15cfc` completed successfully.

Known boundary:

- No database was added. The cooldown memory is per server process/instance, so it resets on server restart or Vercel instance replacement. This keeps the feature free and safe for now.

---

## 2026-05-04 — Fixed GPT Image 2 Panel 524 Timeout

User showed the `GPT Image 2 共同真实测试面板` failing with:

- `524 <none>: <!DOCTYPE html> ... myprompt.asia | 524: A timeout occurred`

Cause:

- The local panel was calling the production website `/api/generate` for the prompt-generation/score stage.
- Long GPT Image 2 prompt optimization can exceed the production timeout, so the test failed before real image generation.

Changes:

- Updated `scripts/gpt-image2-live-review-panel.cjs`.
  - Default mode is now local direct relay prompt optimization.
  - Added a prompt-mode dropdown:
    - local direct relay mode, recommended
    - website API mode, with automatic fallback to local direct mode
  - Added direct GPT Image 2 candidate generation using the four source strategies plus hybrid.
  - Added direct prompt judging and scoring through selected evaluator models.
  - Added final synthesis when hybrid/single-source scores are close.
  - Added clear timeout handling for prompt, judge, and image calls.
  - Added cleaner HTML error summaries for 524/Cloudflare pages.
- Restart handling:
  - Stopped the old local node process on port `61994`.
  - Updated the E-drive one-click panel launchers and AI-CHAIN command to stop stale port `61994` processes before launching.

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- `git diff --check` passed.
- Restarted the local panel.
- Confirmed `http://127.0.0.1:61994/` returns HTTP 200 and contains the new local-direct UI text.
- Pushed `0a4913b fix: make GPT Image 2 panel avoid site timeouts`.
- GitHub E2E run `25298874948` passed: 13/13.
- Vercel deployment for `0a4913b` completed successfully.
- Production smoke with `SMOKE_SKIP_GENERATE=1` passed for homepage, models, and analytics.

---

## 2026-05-04 — GPT Image 2 Panel History + Model Role Sync

User clarified that the test panel should keep history and human feedback, use that feedback for future prompt quality, keep API keys local only, and make target/generator/evaluator/image/judge model roles sync with the main AI prompt generator model list while remaining manually selectable.

Changes:

- Updated `scripts/gpt-image2-live-review-panel.cjs`.
  - Added persistent local history index under `reports/gpt-image2-live-review/history-index.json`.
  - Added persistent local learning memory under `reports/gpt-image2-live-review/learning-memory.json`.
  - User ratings and critique notes update reports and learning memory.
  - Learned feedback rules are inserted into future GPT Image 2 candidate prompt generation.
  - Added single-page history display with thumbnails and click-to-reopen.
  - Added direct text-to-image/image-to-image mode on the same page.
  - Added local browser settings storage, including optional local-only API key autofill.
  - Added model synchronization from `public/models.json`.
  - Added optional relay probing through `/v1/models`.
  - Added manual selectors for:
    - target model, all models
    - image model, image models
    - prompt generator models, text models
    - prompt evaluator models, text models
    - image judge models, vision/multimodal models

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- `git diff --check` passed.
- Restarted local panel at `http://127.0.0.1:61994/`.
- API verification returned `models=266 target=266 image=7 text=245 generators=245 evaluators=245 visionText=245`.
- History/learning verification returned `history=1 learningRules=5`.

---

## 2026-05-04 — Added Workbench Anti-Hallucination Guard

User complained that AI-generated scripts and workbench automation keep failing, and requested a complete free hallucination/toolchain workflow based on 9 GitHub projects.

Actions:

- Cloned/synced all 9 repos into `E:\AI工作台\资料 Sources\hallucination-guard\repos`.
- Created `E:\AI工作台\HALLUCINATION-GUARD.cmd`.
- Created `E:\AI工作台\工具 Tools\hallucination-guard.ps1`.
- Created `E:\AI工作台\HALLUCINATION_GUARD_WORKFLOW.md`.
- Added commands to `E:\AI工作台\工具 Tools\ai-chain.ps1`:
  - `hallucination`
  - `hallucination-sync`
  - `hallucination-check`
  - `hallucination-phoenix`
- Updated workbench memory docs:
  - `AI自我改进工作流.md`
  - `AI大项目记忆规则.md`
  - `AI_TOOLCHAIN.md`
- Created isolated Python 3.11 environments:
  - `.venv-core`
  - `.venv-lettuce`
- Registered scheduled task `AIWorkbenchHallucinationGuardSync` to sync every 6 hours.

Important debugging notes:

- The first PowerShell version hardcoded Chinese folder names and produced mojibake paths like `璧勬枡 Sources`. Fixed by discovering `*Sources`, `*Logs`, and `*Projects` directories dynamically, then safely removed the mojibake directories.
- Git writes normal fetch progress to stderr, which PowerShell can treat as an error when `$ErrorActionPreference = Stop`. Fixed `Invoke-Logged` to judge native command success by exit code instead of stderr text.
- One shared Python environment caused dependency conflicts: UQLM requires `numpy<2`, while LettuceDetect requires `numpy>=2.2`. Fixed by splitting into two isolated environments.

Validation:

- `HALLUCINATION-GUARD.cmd sync` succeeded for all 9 repos.
- `HALLUCINATION-GUARD.cmd status` showed both environments compatible.
- `HALLUCINATION-GUARD.cmd imports` imported all target libraries.
- `HALLUCINATION-GUARD.cmd check-script -Path "E:\AI工作台\工具 Tools\hallucination-guard.ps1"` passed.
- `AI-CHAIN.cmd hallucination` and `AI-CHAIN.cmd hallucination-sync` both ran successfully.

---

## 2026-05-04 — Fixed User-Reported Scroll/Test Panel Bugs

User screenshots showed:

- Main website model picker dialogs could not be dragged/scrolled comfortably.
- Local GPT Image 2 shared review panel showed empty model selectors.
- Start test button appeared unusable.

Debugging:

- Playwright console capture on `http://127.0.0.1:61994/` showed `PAGEERROR: Unexpected identifier 'none'`.
- Root cause was a history thumbnail string in `scripts/gpt-image2-live-review-panel.cjs`: `onerror='this.style.display="none"'` was embedded inside the panel's inline script and broke parsing.

Fixes:

- `scripts/gpt-image2-live-review-panel.cjs`
  - Removed the fragile inline `onerror`.
  - Added JS event listeners for `img.history-thumb` error handling after rendering.
- `src/components/ModelPicker.tsx`
  - Added pointer drag-to-scroll behavior.
  - Keeps clicks working unless the pointer actually moved enough to scroll.
- `tests/e2e/quality.spec.ts`
  - Added drag-scroll regression coverage for model picker dialogs.

Validation:

- Restarted the local panel.
- Playwright state check returned:
  - `status=已同步项目模型 266 个`
  - `targetOptions=266`
  - `imageOptions=7`
  - `genOptions=245`
  - `evalOptions=245`
  - `judgeOptions=245`
  - no page errors
- Clicking `开始完整测试` without a key opens the expected alert `请先填 API Key` and leaves both buttons enabled.
- `npx tsc --noEmit` passed.
- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- `npm run test:quality` passed: 5/5.
- `npm run build` passed.

Follow-up after online drag check:

- Added a portal render path to `src/components/ModelPicker.tsx` with `createPortal(picker, document.body)`.
- Reason: production still had cases where a fixed dialog inside animated/transformed page containers would not receive reliable drag-scroll behavior.
- Local validation after portal:
  - `npx tsc --noEmit` passed.
  - `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
  - `npm run test:quality` passed: 5/5.
  - `npm run build` passed.
- Restarted `http://127.0.0.1:61994/` and verified the GPT Image 2 panel has populated model selectors and a clickable start button. With a fake local-only key, the button starts the run and logs `正在检查中转站模型列表...`.

PWA error follow-up:

- Production check surfaced `Cannot read properties of undefined (reading 'waiting')` from automatic PWA registration.
- Changed `next.config.js` to `register: false`.
- Added guarded manual service-worker registration in `src/components/PWAPrompts.tsx`.
- Verified with production `next start` on port `3100`: no page errors, no console errors, and model picker drag-scroll still worked.

---

## 2026-05-04 — Fixed Model Picker Selection Regression

User screenshot showed generator/evaluator model picker dialogs open and scrollable, but model cards could not be reliably selected.

Root causes:

- `PickerCard` used an outer button with an inner favorite button. Nested buttons are invalid HTML and Chromium can rewrite the DOM, causing clicks on card content to miss the selection handler.
- The drag-scroll code captured the pointer on every pointer down, so regular clicks could be delivered to the scroll container instead of the model card.

Fixes:

- Converted picker cards to `motion.div role="button"` with `aria-pressed`, `aria-disabled`, `tabIndex`, and keyboard Enter/Space activation.
- Kept the favorite star as a normal child button with click propagation stopped.
- Moved `setPointerCapture` so it only runs after actual drag movement begins.
- Extended Playwright quality coverage to click-select a card after scroll/drag behavior is exercised.

Validation:

- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `npm run test:quality` passed: 5/5.
- `npm run build` passed.
- Production-mode local check confirmed generator and evaluator model cards can be selected and no page errors occur.

---

## 2026-05-04 — GPT Image 2 Multi-Model Waiting Fix

User reported that GPT Image 2 optimization appeared to use only one selected generator model, skipped slow relay models too early, and displayed scores without understandable Chinese/English scoring criteria.

Changes:

- GPT Image 2 route now passes all selected generator models into `runGptImage2Ensemble`.
- GPT Image 2 ensemble now:
  - checks relay availability before calling custom/aihubmix models,
  - skips cooling/unavailable models,
  - waits for slow but responsive selected models,
  - runs selected generators concurrently,
  - collects candidates from every successful generator,
  - uses fallback only when selected generators return no usable candidates,
  - runs judge models with longer model-aware timeouts,
  - returns bilingual generator/judge/model-health summary.
- Added bilingual GPT Image 2 scoring rubric:
  - 意图保真 / Intent fidelity
  - GPT Image 2 适配 / GPT Image 2 fit
  - 视觉细节 / Visual specificity
  - 文字渲染可靠性 / Typography reliability
  - 构图和布局可控性 / Layout controllability
  - 商业可用性 / Commercial usability
- Result panel now renders `评分标准 Scoring Criteria`.
- General prompt evaluation rubric also gained Chinese labels and explanations.
- Provider timeout raised to 260s; default model call timeouts raised to 180s with extra wait time for likely slow high-capability models.

Validation:

- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `npm run test:quality` passed 5/5 after sequential rerun.
- `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` passed 9/9.
- `npm run build` passed.
- Commit `03a5532` pushed to `main`.
- GitHub Actions `25324089137` passed with 14/14 E2E tests.
- Production smoke passed on `https://www.myprompt.asia` with real generation skipped because no API key was configured in shell.
- Production browser smoke with mocked SSE verified bilingual scoring criteria render and no page errors occurred.

Important:

- The earlier parallel `npm run build` + Playwright run caused a temporary `.next` chunk mismatch in dev server (`Cannot find module './276.js'`). This was an environment/test-order issue. After stopping the stale dev server and rerunning sequentially, tests passed.
- Real multi-model generation was not run because no relay API key was available in the shell.

---

## 2026-05-05 — Local GPT Image 2 Panel Relaunch And Workbench Rules

User showed `127.0.0.1:61994` refusing connection after reopening the browser. Clarified and fixed the root cause: localhost requires the local Node server to be running; the browser address alone cannot resurrect it.

Implemented:

- Added workbench panel launcher:
  - `E:\AI工作台\工具 Tools\gpt-image2-panel-launcher.ps1`
  - starts/stops/status-checks the panel
  - writes PID/logs under `E:\AI工作台\日志 Logs\gpt-image2-panel`
  - waits for HTTP readiness before opening browser
- Updated:
  - `E:\AI工作台\GPTImage2一键共同真实测试面板.cmd`
  - `E:\AI工作台\工具 Tools\ai-chain.ps1`
- Added AI-CHAIN commands:
  - `gpt-image2-panel`
  - `gpt-image2-panel-status`
  - `gpt-image2-panel-stop`
- Updated `scripts/gpt-image2-live-review-panel.cjs`:
  - top image model field is now a dropdown selector
  - dropdown is populated from synced project model options
  - saved image model setting is preserved while model options load
- Added workbench docs:
  - `GPT_IMAGE2_LOCAL_PANEL_WORKFLOW.md`
  - `GITHUB_SITE_CONTROL.md`
  - `UNIVERSAL_PROJECT_R_AND_D_WORKFLOW.md`
  - `MULTI_AI_COLLABORATION_RULES.md`
  - `UNIVERSAL-PROJECT-CHAIN.cmd`
  - `工具 Tools\universal-project-chain.ps1`

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- PowerShell parser checks passed for:
  - `ai-chain.ps1`
  - `gpt-image2-panel-launcher.ps1`
  - `universal-project-chain.ps1`
- `UNIVERSAL-PROJECT-CHAIN.cmd help` passed.
- Local panel started and returned HTTP 200.
- Playwright verified:
  - title: `GPT Image 2 共同真实测试面板`
  - image model dropdown options: 7
  - target model options: 266
  - generator/evaluator model options: 245 each
  - no browser errors.

---

## 2026-05-05 — Fixed Local Panel Model UX And 502 Abort Behavior

User showed the local GPT Image 2 panel still had awkward model entry and a relay `502 Bad Gateway` from one selected model stopped the test.

Implemented:

- `scripts/gpt-image2-live-review-panel.cjs`
  - visible native multi-select controls are hidden
  - model selection now uses searchable click cards
  - generator/evaluator/image-judge roles have recommended / Key-available / clear actions
  - advanced comma model input remains collapsed for custom ids
  - relay `/models` is no longer a hard filter; selected ids are still attempted
  - local direct optimization now calls all selected generators concurrently and skips only the failed model
  - generator timeout default raised to 120s, judge timeout to 75s, image timeout to 300s
  - candidate IDs are namespaced by generator model
  - bilingual prompt/image scoring criteria are shown in the panel
  - added `/api/export-learning-summary`
- Workbench:
  - added `AI-CHAIN.cmd gpt-image2-export-learning`
  - updated GPT Image 2 workflow docs and startup docs
- Added generated project memory:
  - `context/GPT_IMAGE2_LOCAL_LEARNING_SUMMARY.md`

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs`
- `git diff --check`
- PowerShell parse check for `工具 Tools\ai-chain.ps1`
- `AI-CHAIN.cmd gpt-image2-panel-stop`
- `AI-CHAIN.cmd gpt-image2-panel`
- `AI-CHAIN.cmd gpt-image2-panel-status`
- HTTP 200 from `http://127.0.0.1:61994/`
- Playwright page test:
  - target cards 120
  - image cards 7
  - generator cards 160
  - evaluator cards 160
  - image judge cards 160
  - legacy selects hidden
  - card clicks update payload fields
  - no page errors
- `AI-CHAIN.cmd gpt-image2-export-learning` wrote `context/GPT_IMAGE2_LOCAL_LEARNING_SUMMARY.md`.

Follow-up after push:

- GitHub Actions run `25343795020` failed in `Build app`.
- Root cause was a TypeScript mismatch in `src/lib/prompt-evaluator.ts`: the prompt rubric source can be auto-generated without optional `labelZh` and `guideZh`, while the result mapper accessed those fields directly.
- Fixed by casting rubric items to a local optional bilingual type before reading `labelZh`/`guideZh`.
- Local validation after the fix:
  - `npx tsc --noEmit` passed.
  - `npm run build` passed.
- Pushed commit `7a01057`.
- GitHub Actions run `25344080204` passed:
  - Build app passed.
  - 14 E2E tests passed.

---

## 2026-05-05 — Follow-Up: Fixed Missing Run Argument In Local Panel Logger

User screenshot showed:

```text
中转站返回 96 个模型。
失败: Cannot read properties of undefined (reading 'push')
```

Cause:

- `scripts/gpt-image2-live-review-panel.cjs` had one incorrect call:
  - `addLog("中转站模型列表只作为排序提示...")`
- It should have been:
  - `addLog(run, "中转站模型列表只作为排序提示...")`
- Because `addLog()` expects `run.logs.push(...)`, that missing argument caused the crash.

Fix:

- Passed `run` into the call.
- Hardened `addLog()` so future accidental string-only calls no longer crash the whole run.

Regression validation:

- Started a local fake relay on port 61995.
- Fake relay returned exactly 96 model ids.
- `test-bad` returned fake 502.
- `test-good` returned valid prompt candidates.
- Panel completed with status `done`, with logs proving failed model skip:
  - `test-bad 生成失败，自动跳过`
  - `test-good 已输出 3 个候选提示词`
  - `提示词生成器完成: 1/2 成功`
- Deleted the fake regression report/history entry afterward.
- Pushed commit `e38fc29`.
- GitHub Actions run `25345151965` passed:
  - Build app passed.
  - 14 E2E tests passed.

---

## 2026-05-05 — Main Website Feedback Loop And Relay Model Selection Fix

User request:

- Fix the main prompt generator selecting/reselecting target models incorrectly.
- Let the user rate and review generated prompts.
- Use user feedback and GPT Image 2 test-panel learning as optimization material.
- Make scoring stricter because previous AI scores were too high.

Changes:

- `src/lib/relay-models.ts`
  - new helper for case-insensitive relay model matching
  - creates temporary `ModelInfo` entries for relay-only model ids returned by `/api/probe`
  - infers provider/category/speed/accuracy from model id patterns
- `src/components/PromptGenerator.tsx`
  - persists target model under `ai_prompt_target_model_id`
  - locks manual/history target choices under `ai_prompt_target_model_locked`
  - auto-selects recommended target only while not manually locked
  - sends local feedback memory into `/api/generate`
  - saves user prompt feedback locally and posts it to `/api/feedback`
- `src/components/ModelSelector.tsx`
  - merges relay-only model ids into the UI
  - shows a persistent selected-target panel
  - category follows the selected target so the selected model remains visible
- `src/components/ModelPicker.tsx`
  - relay `/models` list is a hint, not a hard selector lock
  - relay-only ids can be selected from searchable cards
- `src/components/ResultPanel.tsx`
  - added prompt score slider, feedback notes, and preference buttons
  - previous prompt preview appears when available
- `src/lib/prompt-feedback.ts`
  - localStorage feedback history, previous-prompt lookup, and feedback-memory builder
- `src/app/api/feedback/route.ts`
  - sanitized feedback endpoint with optional GitHub JSONL append
- `src/app/api/generate/route.ts`
  - merges relay-only model ids before resolving target/generator/evaluator models
  - summarizes feedback memory for prompt builders and GPT Image 2 ensemble
- `src/lib/prompt-evaluator.ts`, `src/lib/gpt-image-2-ensemble.ts`, `scripts/gpt-image2-live-review-panel.cjs`
  - stricter score calibration for prompt and image judging

New/updated tests:

- image request auto-selects GPT Image 2 and persists after reload
- relay-only probed model ids are selectable
- user can save strict prompt feedback after generation

Validation:

- `npx tsc --noEmit`
- `node --check scripts\gpt-image2-live-review-panel.cjs`
- `git diff --check`
- `npm run build`
- `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` -> 12 passed
- `npm run test:quality` -> 5 passed

Important deployment note:

- GitHub feedback sync requires a server-side token on Vercel or the hosting environment:
  - `PROMPT_FEEDBACK_GITHUB_TOKEN` or `GITHUB_TOKEN`
  - optional `PROMPT_FEEDBACK_GITHUB_REPO`
  - optional `PROMPT_FEEDBACK_GITHUB_BRANCH`
- Without the token, feedback is still saved in the user's browser and used by that browser for later generations, but the API response reports GitHub sync as not configured.

## 2026-05-06 — Main Site MLOps Feedback Loop Upgrade

User request:

- Implement the large AI prompt platform restructuring plan, not just write a document.
- Fix target model reselection by adding durable model preferences.
- Add 1-5 star feedback, text notes, A/B decisions, synthetic blend logic, strict scoring, test-run ingestion, GitHub dataset export, PostgreSQL/Redis/Docker/Python worker scaffolding.
- Keep the 14 external prompt repositories read-only; user data only writes to own/private dataset repo.

Implemented:

- Server-side/local dual persistence:
  - `src/lib/server/storage.ts`
  - Uses PostgreSQL when `DATABASE_URL` exists.
  - Falls back to ignored `.local-data/` JSON/JSONL when no database is configured, so the website still runs locally/Vercel without a DB.
- Model preferences:
  - `GET/PUT /api/model-preferences`
  - Browser device id: `ai_prompt_device_id`
  - Persists target, generator, evaluator selections and manual lock state.
  - Frontend waits for preference hydration before writing defaults, preventing the old bug where `gpt-4o` could overwrite the user's selected target during startup.
- Prompt versioning:
  - `/api/generate` now returns `promptId`, `versionId`, `versionNumber`, and `strictScore`.
  - Each generation is stored as prompt + prompt_version in DB or local JSON fallback.
- Feedback loop:
  - `ResultPanel` now uses 1-5 star rating instead of only a 0-100 slider.
  - Feedback payload includes `starRating`, `promptId`, `promptVersionId/versionId`, strict score, notes, and normalized decisions:
    - `new_better`
    - `old_better`
    - `blend_needed`
    - `both_bad`
  - `POST /api/feedback` writes feedback into DB/local fallback and exports sanitized JSONL to own GitHub repo if token exists.
  - If user chooses blend/both_bad, API builds a synthetic prompt using old/new prompt, notes, and failed strict-score dimensions.
- A/B/version APIs:
  - `GET /api/prompts/[promptId]/compare`
  - `POST /api/prompts/[promptId]/decision`
  - `POST /api/optimization/jobs`
- Strict scoring:
  - `src/lib/strict-scoring.ts`
  - Prompt dimensions: intent fidelity, detail coverage, target model fit, structure, specificity, negative constraints, output clarity, evaluation readiness, hallucination resistance, generation stability, reference-image consistency.
  - Image dimensions: composition, color, texture, object proportion, lighting, reference similarity, text rendering, identity preservation, artifact control, commercial finish.
  - 60/100 is the pass line; core dimensions below 3/10 fail directly.
- Test data APIs:
  - `POST /api/test-runs`
  - `POST /api/scoring/image`
  - Both can write strict score reports and sanitized dataset rows.
- GitHub dataset service:
  - `src/lib/server/github-dataset.ts`
  - Sanitizes device id as hash and never writes raw API keys/photos.
  - Uses `GITHUB_DATA_TOKEN` / `GITHUB_DATA_REPO` / `GITHUB_DATA_BRANCH` or falls back to local `.local-data/data/...`.
- Infrastructure:
  - `database/schema.sql` with PostgreSQL DDL for users, model_preferences, prompts, prompt_versions, feedback, test_runs, test_images, score_reports, github_repos, github_sync_events.
  - `Dockerfile`
  - `docker-compose.yml` with web + postgres + redis + worker.
  - `workers/Dockerfile`
  - `workers/requirements.txt`
  - `workers/scoring/strict_score.py`
  - `workers/optimization/optimizer.py`
  - `.github/workflows/prompt-data-sync.yml`
  - `scripts/validate-feedback-data.cjs`
  - `npm run data:validate`
- Env docs:
  - `.env.example` now documents DB/Redis/GitHub dataset/Object Storage variables.

Important operational boundary:

- The 14 prompt-source GitHub repositories remain read-only. Never push user feedback, real photos, generated images, API keys, or raw personal data to those repos.
- Real feedback export must target the user's own repo/private data repo via server-side `GITHUB_DATA_TOKEN` or `PROMPT_FEEDBACK_GITHUB_TOKEN`.
- Raw photos/generated images should go to object storage or ignored local reports; GitHub JSONL stores metadata and scores only.

Implementation lesson / common error:

- During this turn, `apply_patch` initially wrote files under the wrong cwd `E:\vscode Claude` instead of the project root. The mistaken files were cleaned, then recreated under `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`.
- Do not run copy and cleanup of the same temporary path in parallel; one parallel command deleted source files before another copied them. Use explicit project absolute paths for future patches.

Final validation for 2026-05-06 MLOps upgrade:

- Commit pushed to GitHub main: `e3412e9 feat: add mlops feedback pipeline`.
- GitHub Actions run `25431727555` passed:
  - Build app succeeded.
  - E2E tests succeeded.
- Local validation passed:
  - `npx tsc --noEmit`
  - `npm run data:validate`
  - `python -m py_compile workers\scoring\strict_score.py workers\optimization\optimizer.py`
  - `git diff --check` (only Windows line-ending warnings)
  - `npm run build`
  - `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` -> 12 passed
  - `npm run test:quality` -> 5 passed
- Production smoke passed with `SMOKE_SKIP_GENERATE=1`:
  - homepage ok
  - `/api/models` ok: total=270, categories text=249 image=7 video=7 tts=7
  - analytics ok
- Production new endpoint check passed:
  - `https://www.myprompt.asia/api/model-preferences` returned HTTP 200 and JSON fallback.
- One unrelated older scheduled workflow still shows failure:
  - `Sync Prompt Sources` run `25425140852` failed before this commit. Latest push E2E passed.

## 2026-05-07 — Fix Vercel read-only .local-data failure after token-consuming generation

User reported screenshot error on production:

- `ENOENT: no such file or directory, mkdir '/var/task/.local-data'`
- The error appeared in both Chinese/English flows and caused failures after API token had already been spent.

Root cause:

- The local JSON fallback introduced for prompt/model preference persistence used `process.cwd()/.local-data`.
- On Vercel/serverless, `process.cwd()` is `/var/task`, which is read-only. Creating `/var/task/.local-data` fails.
- In `/api/generate`, persistence happened after the model returned text. A persistence failure then threw out of `makeDonePayload()`, so the user lost the generated result even though tokens were consumed.

Fix:

- `src/lib/server/storage.ts`
  - Added `localDataRoot` resolver.
  - Uses `LOCAL_DATA_DIR` when configured.
  - Uses `/tmp/ai-prompt-generator/.local-data` on Vercel/AWS Lambda or when cwd is `/var/task`.
  - Keeps project-root `.local-data` for normal local development.
- `src/app/api/generate/route.ts`
  - Wrapped createPrompt/createPromptVersion persistence in try/catch.
  - Generation result is returned even if server-side history persistence fails.
  - Adds bilingual `persistenceWarning` in metadata instead of surfacing raw ENOENT to the user.
- `src/app/api/test-runs/[testRunId]/images/route.ts`
  - Image upload fallback storage now also uses `localDataRoot`.
- `.env.example`
  - Documented `LOCAL_DATA_DIR` and serverless `/tmp` fallback.

Validation:

- `npx tsc --noEmit` passed.
- `npm run data:validate` passed.
- `npm run build` passed when run alone. Do not run build concurrently with Playwright because both touch `.next` and can cause a false `/_document` PageNotFoundError.
- `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` passed: 12/12.
- `npm run test:quality` passed: 5/5.
- `git diff --check` passed with Windows line-ending warnings only.

## 2026-05-07 — Harden network/stream failures and local fallback writes

User reported that network errors still fail generation in both Chinese and English, and failures may still waste tokens.

Fix:

- Added `src/lib/error-messages.ts`
  - Central bilingual error normalizer.
  - Converts `fetch failed`, `Network Error`, EOF, connection reset, timeout, rate limit, invalid key, permission, unavailable model, and `.local-data` failures into readable Chinese/English messages.
  - Masks API-key-like strings in errors.
- `src/app/api/generate/route.ts`
  - SSE now sends heartbeat `ping` events every 12 seconds so slow models do not look idle to the browser/proxy.
  - SSE and JSON error responses use the bilingual normalizer instead of raw provider errors.
  - Simple-generation timeouts now use per-model slow-model-aware `getModelTimeoutMs()`.
- `src/components/PromptGenerator.tsx`
  - Handles `ping` events without breaking the stream.
  - If an SSE error arrives after partial chunks, the partial prompt is preserved as the result instead of being discarded.
  - If the stream ends without `done` but has partial content, the partial result is kept with a warning.
  - If the stream ends without any content, user sees a clear bilingual retry/switch-model message.
  - Displays persistence warnings from generation metadata.
- `src/components/ResultPanel.tsx`
  - Shows `meta.persistenceWarning` visibly in the result panel.
- `src/lib/server/storage.ts`
  - Local JSON fallback writes are serialized per file.
  - Copy/write operations retry short-term Windows/serverless file lock errors (`EBUSY`, `EPERM`, `EACCES`).
  - This removed the model-preferences `EBUSY` warning seen during quality tests.
- `tests/e2e/prompt-generator.spec.ts`
  - Added coverage for SSE `ping`.
  - Added test that an SSE error after partial output keeps the received prompt.

Validation:

- `npx tsc --noEmit` passed.
- `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` passed: 13/13.
- `npm run build` passed when run alone.
- `npm run test:quality` passed: 5/5.
- `npm run data:validate` passed.
- `git diff --check` passed with Windows line-ending warnings only.

Operational note:

- Running `npm run build` concurrently with Playwright still causes a false `/_document` PageNotFoundError because both touch `.next`; always run build alone.
