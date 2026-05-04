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
