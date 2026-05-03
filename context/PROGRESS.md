# Task Progress Tracker

> Last updated: 2026-05-02
> Updated by: Codex (completion pass)

## Codex Safety Setup — 2026-05-01

Codex created a safe worktree to avoid overwriting Claude's existing workspace.

- **Claude/original workspace**: `E:\vscode Claude\ai-prompt-generator`
- **Codex workspace**: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`
- **Backup branch for original main pointer**: `backup/claude-main-20260501-232542`
- **Codex branch**: `codex/safe-audit-20260501-232542`
- **Base**: GitHub latest `origin/main` at `c009e0e chore: auto-update models 2026-05-01`

Rules:

- Do not edit the Claude workspace unless the user explicitly approves.
- Codex changes should happen in the Codex worktree first.
- Compare Claude and Codex versions before adopting or merging.
- Push to `main` only after tests pass and the user approves.

---

## Codex E2E Repair — 2026-05-01

Codex fixed the failing GitHub E2E assertions in the Codex-safe worktree.

- **Workspace**: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`
- **Branch**: `codex/safe-audit-20260501-232542`
- **File changed**: `tests/e2e/prompt-generator.spec.ts`
- **Follow-up files changed**: `playwright.config.ts` to block service workers in E2E and generate CI HTML reports; `src/components/ModelSelector.tsx` to add an accessible generator-picker button label
- **Workflow hardening**: `.github/workflows/test.yml` now uses Node 22 for project commands and current Node24-compatible GitHub actions; `.github/workflows/update-models.yml` also uses current checkout/setup-node/github-script actions
- **Root cause**: E2E tests were written against older UI assumptions:
  - `page.locator("h1")` became ambiguous after the header and hero both used `h1`
  - Character count expected `14`, but the real JavaScript string length for `Hello world 你好世界` is `16`
  - Target model selector is now an inline card grid, while the full-screen dialog belongs to the generator model picker
  - Placeholder copy changed to example-based text while the input keeps the intended `aria-label`
  - CI exposed repeated flaky retries around model card rendering, likely from timing/cache interaction around model loading
- **Fix**:
  - Scoped heading assertion to `header`
  - Updated character count expectation to `16`
  - Reworked model selector test to select `DALL·E 3` from the image tab and then open the generator picker dialog
  - Completed mock model objects with `contextWindow`, `maxOutput`, `speed`, `accuracy`, `supportsStreaming`, `tags`, and `releaseDate`
  - Updated placeholder/aria assertions to match current accessible UI
  - Added an explicit wait for loaded model cards before switching to the image tab
  - Configured CI reporters as `github + html` so the uploaded Playwright report path is populated
  - Blocked service workers during E2E so route mocks cannot be bypassed by PWA cache behavior
  - Made the generator-picker trigger addressable by a stable accessible label
- **Verified locally**:
  - `npx tsc --noEmit` passes
  - `npm run build` passes
  - `npx playwright test --project=chromium` passes: 8/8 tests
  - `npx playwright test --project=chromium --repeat-each=5` passes: 40/40 tests
- **Main push authorization**: user approved continuing to completion on 2026-05-02; push to `main` after local validation.

---

## Current Status: COMPREHENSIVE UPGRADE — PUSHED, CI PASSED, LOCAL SYNCED

Previous Claude upgrade tasks, Codex CI/E2E repair, and the Codex completion pass have been pushed to GitHub `main`.

Latest verified state on 2026-05-02:

- Codex feature commit: `db61b5e feat: complete prompt generator stabilization pass`
- Latest `origin/main` after automated model updates: `47e984b chore: auto-update models 2026-05-02`
- Local Codex worktree fast-forwarded to `origin/main`
- GitHub Actions E2E for the Codex completion pass succeeded: run `25225316579`, 8/8 tests
- Production site `https://www.myprompt.asia` returned HTTP 200
- Production `/api/models` returned 251 models from bundled data and includes `gpt-5.5`

## Shared AI Toolchain Launcher — 2026-05-02

Codex created a shared E-drive launcher so Codex, Claude, VS Code terminals, and other AI windows can use the same local toolchain instead of inventing separate commands.

Global files:

- `E:\AI工作台\工具 Tools\ai-chain.ps1`
- `E:\AI工作台\AI-CHAIN.cmd`
- `E:\AI工作台\打开AI工具链控制台.cmd`
- `E:\AI工作台\AI工具链说明.md`
- `E:\AI工作台\AI_TOOLCHAIN.md`

Project files:

- `context/AI_TOOLCHAIN.md`
- `AGENTS.md`
- `CLAUDE.md`

Main commands:

- `doctor`: check installed tools
- `explain`: explain each tool
- `status`: Git/project/GitHub status
- `sync`: locked fetch/rebase from `origin/main`
- `typecheck`: `npx tsc --noEmit`
- `build`: `npm run build`
- `e2e`: Playwright Chromium E2E
- `test-all`: typecheck + build + E2E
- `smoke-prod`: real production smoke test
- `ci` / `watch-ci`: GitHub Actions
- `memory`: print context files
- `compare-claude`: read-only comparison with Claude workspace
- `docker`: Docker/Rancher status
- `ollama`: Ollama status
- `security`: Gitleaks scan
- `new-session`: prompt for a new AI window

Concurrency/safety:

- Every run writes a separate log under `E:\AI工作台\日志 Logs\ai-chain`.
- Git-mutating operations use a lock under `E:\AI工作台\日志 Logs\ai-chain\locks`.
- The `.ps1` and `.cmd` launchers were made ASCII-safe so Windows PowerShell 5 and cmd can call them even though parent folders have Chinese names.

Verified:

- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" doctor -NoPause`
- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" explain -NoPause`
- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" status -NoPause`
- `cmd /c "E:\AI工作台\AI-CHAIN.cmd status"`
- `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" memory -NoPause`

Detected installed tools:

- Git, GitHub CLI, Node.js, npm, npx, Python, py, uv, VS Code, Docker/Rancher, Ollama, Claude CLI, Codex CLI, Windows PowerShell, PowerShell 7, curl.exe, Gitleaks.

## Codex Completion Pass — 2026-05-02

Codex continued after user requested completing the whole current section before reporting back.

- **Analytics integration completed**:
  - `src/components/PromptGenerator.tsx` now calls `trackApiCall()` for `/api/generate` success/failure.
  - Streaming generation now calls `trackTTFT()` on the first SSE `chunk`.
  - Generation failures now call `trackError()`.
  - E2E mocks `/api/analytics` to keep tests hermetic and avoid local `.analytics` JSONL writes.
- **Prompt optimizer v5 audit/补强 completed**:
  - Confirmed `src/lib/prompt-optimizer.ts` is already a multi-modal v5 implementation.
  - `buildSystemPrompt()` now scopes the huge system prompt to the target category instead of always sending every module.
  - Category routing includes text, image, video, audio/TTS, plus adaptive fallback.
  - `buildUserPrompt()` now includes explicit STT, embedding, and OCR branches instead of treating them like generic text prompts.
- **Model metadata/classification refresh completed**:
  - Ran `node scripts/patch-models.cjs`.
  - `public/models.json` now has improved Google image/TTS release dates and category classification.
  - `context/SYSTEM_STATE.json` updated to match: 251 total models, categories `{ text: 240, video: 2, image: 4, tts: 5 }`, zero-cost remaining `6`.
- **Contrast TODO completed**:
  - Replaced remaining `text-white/30` usages in `src/` with `text-white/45`.
- **Electron updater note resolved as intentional**:
  - `electron-updater` remains in `optionalDependencies`; this is the intended setup so Vercel web deploys do not require desktop updater binaries.
- **Verified locally before push**:
  - `npx tsc --noEmit` passes
  - `node scripts/patch-models.cjs` passes and reports `Patched: 249 / 251`
  - `npm run build` passes
  - `npx playwright test --project=chromium --repeat-each=3` passes: 24/24
- **Verified after push/sync**:
  - `gh run view 25225316579 --repo 00qq6868-del/ai-prompt-generator --json status,conclusion,headSha,displayTitle,url` returned `completed/success`
  - `curl.exe -I https://www.myprompt.asia` returned HTTP 200
  - `Invoke-RestMethod https://www.myprompt.asia/api/models` returned `total=251`, `source=bundled`, `has_gpt_5_5=True`

---

## 🔄 Active Task

Codex found and fixed a follow-up model auto-update regression before closing this session.

## Model Auto-Update Classification Fix — 2026-05-02

After syncing the Codex completion pass, production `/api/models` showed the scheduled GitHub model updater had reduced non-text categories from the intended `image=4, tts=5` to `image=1, tts=2`.

Root cause:

- `.github/scripts/fetch-models.mjs` had a good classifier inside `fetchAihubmix()`, but that function was local to the AihubMix fetch.
- Later official provider fetches, especially Google/OpenAI, overwrote matching model IDs with `category: "text"` and blank Google release dates during merge.

Fix:

- Moved `classifyModel()` to shared top-level scope in `.github/scripts/fetch-models.mjs`.
- Google/OpenAI/Anthropic/DeepSeek/xAI/Mistral/Groq fetchers now classify fetched model IDs instead of forcing `text`.
- Google fetches now preserve `meta.d` release dates.
- `scripts/patch-models.cjs` now updates `context/SYSTEM_STATE.json` after patching `public/models.json`.
- Re-ran `node scripts/patch-models.cjs`, restoring local categories to `{ text: 240, video: 2, image: 4, tts: 5 }`.

Verified before push:

- `node --check .github/scripts/fetch-models.mjs` passes
- `node --check scripts/patch-models.cjs` passes
- `node scripts/patch-models.cjs` passes and reports `Patched: 249 / 251`

---

## Production Generation Chain Hardening — 2026-05-02

Codex added a real production smoke-test path and free baseline protections for the live generation chain.

Implemented:

- Added per-IP in-memory rate limiting helper in `src/lib/rate-limit.ts`.
- Added `/api/generate` safeguards:
  - default 20 requests/IP/minute
  - `GENERATE_MAX_INPUT_CHARS` default 12000
  - `GENERATE_MAX_TOKENS` default 4096
  - bilingual `429` and `413` errors
- Added `/api/probe` safeguards:
  - default 30 requests/IP/10 minutes
  - shared public URL validation to block localhost/private/internal relay probe targets
- Hardened `/api/analytics`:
  - validates/sanitizes metric batches
  - default 120 requests/IP/minute
  - supports `ANALYTICS_WEBHOOK_URL` for a durable free/cheap sink
  - on Vercel without a webhook, accepts metrics and logs counts instead of failing by writing to read-only deployment files
- Added production smoke script:
  - `scripts/production-smoke.cjs`
  - `npm run smoke:prod`
  - checks homepage, `/api/models`, `/api/analytics`, optional `/api/probe`, and real `/api/generate` SSE when a secret key is available
- Added manual GitHub Actions workflow:
  - `.github/workflows/production-smoke.yml`
  - uses GitHub Secrets without printing keys
  - prefers free `GOOGLE_API_KEY`, then `GROQ_API_KEY`/`GROQ`, then `AIHUBMIX_API_KEY`
- Updated `.env.example` with free safeguard and smoke-test env variables.

Verified locally before push:

- `node --check scripts/production-smoke.cjs` passes
- `npx tsc --noEmit` passes
- `npm run build` passes
- `npx playwright test --project=chromium` passes: 8/8
- `git diff --check` passes

Observed before deployment:

- Current production `/api/analytics` returned 500 with the old code path, confirming the Vercel analytics file-write issue. The new route fixes this by avoiding deployment-directory writes on Vercel.

Verified after push/deploy:

- GitHub E2E run `25244046888` for `e9dce5a` passed: 8/8.
- Follow-up smoke fallback commit `2fefac6` was pushed after the first production smoke found Google free-tier quota exhausted.
- GitHub E2E run `25244119954` for `2fefac6` passed: 8/8.
- Production `/api/analytics` returned HTTP 200 with `{ ok: true, sink: "stdout" }`.
- Manual GitHub Actions `Production Smoke Test` run `25244163971` succeeded.
- Production smoke results:
  - homepage ok
  - `/api/models`: 251 models, `{ text: 240, video: 2, image: 4, tts: 5 }`
  - `/api/analytics`: ok, sink `stdout`
  - `/api/probe`: ok, 227 models discovered via relay secret
  - real `/api/generate` SSE: Google Gemini failed due free-tier quota 429, smoke script automatically retried Groq, Groq succeeded with 752 generated characters and `latencyMs=1051`

---

No active code-fix task remains after the model auto-update classification fix and production chain hardening pass.

The real production generation chain has now been tested through GitHub Secrets and the live domain.

Remaining product-stage work:

- full user accounts/auth
- payment/subscription
- usage quotas/credits tied to accounts
- admin dashboard
- audit logs
- privacy policy / terms
- durable production analytics storage by configuring `ANALYTICS_WEBHOOK_URL` or adding a database/KV backend

**重要对账提醒**：
- `C:\Users\zero\.claude\plans\floating-conjuring-treasure.md` 里写的 Phase 2/3 是旧计划
- 当前代码中的 `src/lib/prompt-optimizer.ts` 已经是 `multi-modal meta-prompt engine v5`
- 当前 `src/app/api/generate/route.ts` 已经把 `targetCategory` 传给 `buildSystemPrompt()` 和 `buildUserPrompt()`
- 下一步做 prompt optimizer 前，先审计“代码实际完成度 vs 旧计划”，不要盲目重复重写

---

## ✅ Session #4 Completed Tasks (2026-04-30)

### Task 1: 依赖升级 + npm 镜像配置
- **Commits**: `0e9f176`
- **Files**: `package.json`, `.npmrc`
- **Summary**: 13个生产依赖 + 11个开发依赖升级到最新稳定版。创建项目级 `.npmrc` 配置 npmmirror.com 镜像

### Task 2: Provider 适配器安全加固
- **Commits**: included in `0368e29`
- **File**: `src/lib/providers/index.ts`（689→~530行）
- **Summary**:
  - SSRF 防护：`validateBaseURL()` 屏蔽内网地址
  - 代码去重：4个 OpenAI 兼容函数 → `callOpenAICompatible()`，3个 Axios 函数 → `callAxiosOpenAI()`（减少 ~160 行）
  - 表驱动分发：`OPENAI_COMPAT_ENDPOINTS` / `AXIOS_ENDPOINTS` 配置对象
  - 安全修复：百度 OAuth 凭证从 URL 移到 POST body
  - 类型安全：所有 `catch(err: any)` → `catch(err: unknown)` + `handleRelayError()`
  - 统一双语错误消息 + 60秒超时

### Task 3: WCAG 2.1 AA 无障碍修复
- **Commits**: included in `0368e29`
- **Files**: 所有 6 个组件（PromptGenerator, ModelSelector, ModelPicker, ResultPanel, HistoryPanel, KeysSettings）
- **Summary**: dialog role/aria-modal, tablist/tab aria-selected, Escape 键关闭, Enter/Space 键盘导航, aria-labels 双语

### Task 4: ModelSelector 搜索/排序优化
- **Commits**: included in `0368e29`
- **File**: `src/components/ModelSelector.tsx`
- **Summary**: 搜索框（名称/ID/供应商模糊匹配）, 空分类灰显 disabled, 4种排序（日期/价格/速度/精度）, 移动端横向滚动标签+单列卡片

### Task 5: BUNDLED_MODELS 更新
- **Commits**: `5506383`, `1254671`
- **File**: `src/lib/models-registry.ts`（当前 45 个模型）
- **Summary**: 添加 GPT-5-Pro, Qwen3-235B, GPT-Image-2。全部 26 个必要模型确认存在

### Task 6: 模型自动更新流水线增强
- **Commits**: `cbcbf99`
- **Files**: `.github/scripts/fetch-models.mjs`, `.github/workflows/update-models.yml`
- **Summary**:
  - `withRetry(fn, label, 2, 5000)` 每个 API 源失败重试 2 次
  - 健康检查：模型数下降 >20% 时中止提交
  - `SYSTEM_STATE.json` 生成（含 byCategory/byProvider/lastUpdate 统计）
  - `classifyModel()` 增加 30+ 新 ID 模式
  - GitHub Issue 通知：≥5 新模型或健康检查失败时自动创建 Issue

### Task 7: Electron 桌面应用优化
- **Commits**: `aa89818`
- **Files**: `electron/main.js`, `electron/preload.js`, `electron/entitlements.mac.plist`, `package.json`
- **Summary**:
  - 系统托盘：关闭→隐藏到托盘，右键菜单（显示/开机自启/退出）
  - macOS DMG universal binary + hardened runtime
  - 开机自启：`app.setLoginItemSettings()` + 托盘 checkbox
  - 窗口状态记忆：`window-state.json` 存位置/大小/最大化
  - 自动更新：`electron-updater` 检查 GitHub Releases
  - 包体积优化：排除 .cache/@swc/typescript/eslint + .map 文件

### Task 8: PWA 离线体验增强
- **Commits**: `1e64dc0`
- **Files**: `next.config.js`, `src/app/offline/page.tsx`, `src/components/PWAPrompts.tsx`, `src/app/layout.tsx`
- **Summary**:
  - 离线页面 `/offline` 匹配深色主题
  - 缓存策略：CacheFirst(static) / StaleWhileRevalidate(models,1h) / NetworkOnly(generate) / NetworkFirst(HTML,10s)
  - PWA 安装 banner（底部）+ 更新通知（顶部）

### Task 9: 轻量级性能监控
- **Commits**: `28161d3`
- **Files**: `src/lib/analytics.ts`, `src/components/ErrorBoundary.tsx`, `src/components/WebVitals.tsx`, `src/app/api/analytics/route.ts`
- **Summary**:
  - Web Vitals：LCP/CLS/TTFB/INP（web-vitals v5，FID 已移除用 INP 替代）
  - `trackApiCall()` / `trackTTFT()` 供 PromptGenerator 手动调用（尚未接入）
  - ErrorBoundary 包裹 children，友好错误页 + 重试
  - `/api/analytics` JSONL 追加到 `.analytics/`，5MB/天上限
  - sendBeacon 批量发送，页面隐藏时 flush

---

## 🔧 Known TODOs / Tech Debt

1. **真实线上生成链路仍需人工密钥验证** — E2E 使用 mock API；生产中转站 Key/余额/模型权限需要真实账号验证
2. **商业化下一阶段** — 需要补用户账号/支付/额度/审计日志/隐私条款/滥用风控，这些不属于当前代码修复范围
3. **Claude 原工作区仍未合并** — `E:\vscode Claude\ai-prompt-generator` 保持未触碰；继续协作前应以 GitHub `main` 为基准再比较 Claude 本地改动

---

## 📁 Architecture Quick Reference

```
src/
├── app/
│   ├── layout.tsx          — ErrorBoundary + WebVitals + PWAPrompts + Toaster
│   ├── page.tsx            — Hero + PromptGenerator
│   ├── offline/page.tsx    — PWA 离线页面
│   └── api/
│       ├── generate/       — LLM 调用（流式 SSE）
│       ├── analytics/      — 性能指标接收（JSONL）
│       ├── models/         — 模型列表
│       └── probe/          — 中转站探测
├── components/
│   ├── PromptGenerator.tsx — 核心业务组件
│   ├── ModelSelector.tsx   — 目标模型选择（搜索/排序/分类）
│   ├── ModelPicker.tsx     — 生成器模型选择（全屏 picker）
│   ├── ResultPanel.tsx     — 优化结果展示 + 对比
│   ├── HistoryPanel.tsx    — 历史记录
│   ├── KeysSettings.tsx    — API Key 管理
│   ├── PWAPrompts.tsx      — 安装/更新提示
│   ├── ErrorBoundary.tsx   — 错误边界
│   └── WebVitals.tsx       — 性能指标收集
├── lib/
│   ├── providers/index.ts  — 11 个 LLM provider 适配器
│   ├── models-registry.ts  — BUNDLED_MODELS（45个）+ scoreModel + affinity
│   ├── prompt-optimizer.ts — scoped multi-modal v5 SYSTEM_PROMPT + category-aware buildUserPrompt
│   ├── analytics.ts        — 指标队列 + batch flush
│   └── history.ts          — localStorage 历史管理
electron/
├── main.js                 — 主进程（托盘/自启/窗口记忆/自动更新）
├── preload.js              — IPC bridge
└── entitlements.mac.plist  — macOS 签名权限
.github/
├── scripts/fetch-models.mjs — 8 源 API 抓取 + retry + 健康检查
└── workflows/update-models.yml — 每 2h 自动更新 + Issue 通知
```

## 🔑 Key Dependencies
- next 14.2.35 (standalone output)
- framer-motion 11.x, lucide-react 0.577
- @anthropic-ai/sdk 0.91, openai 4.104, @google/generative-ai 0.24
- web-vitals 5.2, electron 31.7, electron-builder 26.8
- electron-updater 6.6 (optional)

---

## Model META Coverage Repair — 2026-05-02

Codex improved model pricing metadata coverage after the user requested a 97%+ coverage pass.

Completed:

- Confirmed `lookupMeta()` in both `scripts/patch-models.cjs` and `.github/scripts/fetch-models.mjs` uses longest-prefix matching with case-insensitive fallback.
- Confirmed the requested Qwen3, MiniMax, GLM, ERNIE, Cohere, AihubMix mirror, Claude, Google alias, InclusionAI, Phi, ByteDance, Xiaomi, Qwen misc, gpt-oss, Ollama, and router META groups were already present.
- Added missing active aliases:
  - `bai-qwen3-vl-235b` for `bai-qwen3-vl-235b-a22b-instruct`
  - `deepinfra-gemma-4` for `deepinfra-gemma-4-26b-a4b-it`
- Added missing Ollama local META entries to `.github/scripts/fetch-models.mjs` so it matches `scripts/patch-models.cjs`.
- Ran `node scripts/patch-models.cjs`.

Verification:

- `node --check scripts/patch-models.cjs` passed.
- `node --check .github/scripts/fetch-models.mjs` passed.
- `node scripts/patch-models.cjs` patched `251 / 251`.
- `public/models.json` now has `247 / 251` non-zero-cost covered models, `98.41%` nominal coverage.
- Zero-cost remaining: `seedance-1.0`, `seedance-2.0`, `llama3.2`, `qwen2.5:7b`.

---

## Media Model Ensure Script — 2026-05-02

Codex added a reusable Node.js maintenance script for ensuring key media models exist in `public/models.json`.

Completed:

- Added `scripts/add-missing-media-models.cjs`.
- Script reads `public/models.json`, checks duplicate IDs, merges existing `gpt-image-1`, `seedance-1.0`, and `seedance-2.0`, appends only if missing, and writes JSON back.
- Ran `node scripts/add-missing-media-models.cjs`; current result was `Added: 0`, `Updated: 3` because all three models already existed.
- Updated `gpt-image-1` to `isLatest: true` to match the requested model object.
- Ran `node scripts/patch-models.cjs`.

Verification:

- `node --check scripts/add-missing-media-models.cjs` passed.
- `node scripts/patch-models.cjs` patched `251 / 251`.
- Current model totals: `251` total, categories `{ text: 240, video: 2, image: 4, tts: 5 }`, zero-cost `4`.

---

## Latest Model Auto-Update Upgrade — 2026-05-02

Codex upgraded the model refresh pipeline so the site keeps up with the latest OpenAI/GPT, DeepSeek, Google Gemini, and Anthropic Claude model families.

Completed:

- Added `scripts/latest-model-ensures.cjs`, a shared verified latest-model fallback list used by both the GitHub updater and the local patch script.
- Updated `.github/scripts/fetch-models.mjs` to:
  - apply the verified fallback list after API fetch/merge,
  - mark latest models per provider + category instead of only one model per provider,
  - classify `sora`, `veo`, realtime, and live-preview models correctly,
  - preserve relay routing for already-fetched AihubMix models.
- Updated `scripts/patch-models.cjs` to use the same fallback list and latest marking.
- Changed `.github/workflows/update-models.yml` schedule from every 2 hours to every 30 minutes.
- Added verified latest/missing models including:
  - OpenAI: `gpt-5.5-pro`, `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`, `sora-2`, `sora-2-pro`, `gpt-realtime-1.5`
  - DeepSeek: `deepseek-v4-pro`, `deepseek-v4-flash`, corrected `sophnet-deepseek-v4-pro`
  - Gemini/Google: `gemini-3.1-flash-live-preview`, `veo-3.1-*` and corrected Gemini 3.1 pricing/category metadata
  - Claude: `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, corrected Opus/Sonnet/Haiku pricing metadata
- Updated `src/lib/model-recommender.ts` recommendations to prefer `gpt-image-2`, `sora-2-pro`, and `deepseek-v4-pro`.
- Updated production smoke checks to assert the latest core model IDs are visible.

Verification so far:

- `node --check scripts/latest-model-ensures.cjs` passed.
- `node --check scripts/patch-models.cjs` passed.
- `node --check .github/scripts/fetch-models.mjs` passed.
- `node scripts/patch-models.cjs` patched `266 / 266`.
- Current local model totals: `266` total, categories `{ text: 245, video: 7, image: 7, tts: 7 }`, zero-cost `9`, no duplicate IDs.

Final verification:

- Committed and pushed:
  - `e4382cf chore: auto-ensure latest model registry`
  - `f14da68 chore: auto-update models 2026-05-02` (bot follow-up from manual Auto Update Models run)
- GitHub E2E for `e4382cf` passed: `8/8`.
- Manual `Auto Update Models` workflow passed and wrote `266` models.
- Production `/api/models` now returns `266` models with `{ text: 245, video: 7, image: 7, tts: 7 }`.
- Production includes `gpt-5.5`, `gpt-5.5-pro`, `gpt-image-2`, `deepseek-v4-pro`, `deepseek-v4-flash`, `gemini-3.1-pro-preview`, `claude-opus-4-7`, and `claude-haiku-4-5`.
- GitHub `Production Smoke Test` passed on run `25248233632`; homepage, models, analytics, probe, and real generation all passed.

---

## Follow-up Feature/QA Checks — 2026-05-02

Codex checked the user's follow-up requests after the latest-model rollout and filled the missing handoff memory.

Completed:

- Confirmed `src/components/ResultPanel.tsx` already has the original-vs-optimized comparison UI:
  - `originalPrompt?: string`
  - `showDiff`
  - `ArrowLeftRight` compare toggle
  - responsive side-by-side comparison
  - `PromptGenerator.tsx` passes `originalPrompt={idea}`
- Confirmed the history/favorites system already exists and is integrated:
  - `src/lib/history.ts`
  - `src/components/HistoryPanel.tsx`
  - `PromptGenerator.tsx` imports `HistoryPanel` and `saveHistory`
  - all three success branches save generated prompts to local history
- Confirmed `/api/generate` type cleanup is already present:
  - imports `ModelInfo`
  - typed `models.find((m: ModelInfo) => ...)`
  - uses `targetModel.category ?? "text"` without `as any`
- Confirmed requested accessibility labels are already present in `ResultPanel`, `PromptGenerator`, and `HistoryPanel`.
- Fixed the only real missing TypeScript API detail: exported `Recommendation` from `src/lib/model-recommender.ts`.

Verification:

- Commit pushed: `b38b2ff fix: export recommendation type`.
- GitHub E2E run `25248567893` passed with `8/8`.
- Local `E:\AI工作台\AI-CHAIN.cmd typecheck` passed during the checks.
- Current local branch is aligned with `origin/main` at `b38b2ff`; worktree was clean before this memory update.

Notes:

- The user-provided old recommended IDs `dall-e-3`, `sora`, `elevenlabs-tts`, and `suno` are not present in the current 266-model registry, so the live recommender intentionally keeps available IDs such as `gpt-image-2`, `sora-2-pro`, and `deepseek-v4-pro`.

---

## Shared Toolchain Audit + Visual QA Upgrade — 2026-05-02

Codex continued the free E-drive AI workbench setup and verified the shared chain for future large projects.

Completed:

- Ran `E:\AI工作台\AI-CHAIN.cmd doctor`.
  - Confirmed Git, GitHub CLI, Node/npm/npx, Python/py, uv, VS Code, Docker/Rancher, Ollama, Claude Code, Codex CLI, PowerShell 7, curl, and Gitleaks are installed.
  - Fixed the launcher so `code` resolves to `E:\vscode\Microsoft VS Code\bin\code.cmd` instead of `Code.exe`.
- Installed additional free VS Code quality extensions:
  - Tailwind CSS IntelliSense
  - axe Accessibility Linter
  - SonarQube/SonarLint
  - Vitest Explorer
  - Code Spell Checker
  - Pretty TypeScript Errors
  - TODO Tree
  - Path Intellisense
  - Edge DevTools
- Added project visual/accessibility QA:
  - New dependency: `@axe-core/playwright`
  - New script: `npm run test:quality`
  - New test: `tests/e2e/quality.spec.ts`
  - New launcher command: `E:\AI工作台\AI-CHAIN.cmd quality`
- Disabled PWA generation in development mode while keeping it enabled for production builds, preventing Next dev/test runs from writing temporary service-worker files into `public/`.
- Added generated build/cache files to `.gitignore` and removed them from Git tracking:
  - `public/sw.js`
  - `public/workbox-*.js`
  - `public/fallback-*.js`
  - `public/*.map` for PWA outputs
  - `tsconfig.tsbuildinfo`
- Fixed accessibility findings from the new quality test:
  - Removed `maximumScale: 1` so mobile users can zoom.
  - Added accessible names to header icon controls/links.
  - Increased low-contrast dark-theme secondary text from `text-white/20-45` to readable `text-white/60-70`.
- Cleaned only generated validation junk:
  - Removed Playwright `test-results/` and `playwright-report/`.
  - Removed build-generated PWA files after verification.
  - Removed local `tsconfig.tsbuildinfo` after verification.

Verification:

- `E:\AI工作台\AI-CHAIN.cmd quality` passed: 2/2.
- `E:\AI工作台\AI-CHAIN.cmd test-all` passed:
  - TypeScript check passed.
  - `next build` passed.
  - Chromium Playwright E2E passed: 10/10.
- `E:\AI工作台\AI-CHAIN.cmd security` passed: Gitleaks scanned 116 commits, no leaks found.
- `E:\AI工作台\AI-CHAIN.cmd docker` passed: Rancher/Docker engine available, no running containers.
- `E:\AI工作台\AI-CHAIN.cmd ollama` passed: Ollama 0.22.0 installed, `bge-m3:latest` present.
- Local `smoke-prod` passed homepage/models/analytics but could not test real generation because this shell has no generation API key env var. Use GitHub `Production Smoke Test` after push because repository secrets are configured there.
- Pushed implementation commit:
  - `9b3abb9 test: add visual accessibility quality audit`
- GitHub verification after push:
  - E2E run `25254262203` passed, 10/10.
  - Production Smoke Test run `25254319276` passed on `9b3abb9`.
  - Production smoke checked homepage, models (`266` total), analytics, relay probe (`224` models), and real generation through Groq fallback.

Notes:

- Do not delete `E:\vscode Claude\ai-prompt-generator`; it remains the Claude/original workspace.
- Do not delete `node_modules`, `.next`, caches, logs, Ollama models, or IDE folders by default. They are useful for future work.
- The old `E:\免费神器控制台` folder is tiny and harmless; keep it unless the user explicitly approves consolidation/removal.

---

## Provider Filter + Desktop Download Page — 2026-05-03

User reported from production screenshots that the provider filter text `月之暗面` was clipped to `月之` on the homepage model selector and asked for a website download page for the desktop app.

Completed:

- Fixed provider filter clipping in `src/components/ModelSelector.tsx` by changing the provider tab row from horizontal overflow scrolling to wrapping chips with stable height.
- Applied the same long-provider-name hardening in `src/components/ModelPicker.tsx`.
- Hardened API key provider card headers in `src/components/KeysSettings.tsx` so `Kimi (月之暗面)` can wrap instead of crowding the "获取 Key" link.
- Added a header download entry in `src/components/Header.tsx`.
- Added `/download` at `src/app/download/page.tsx`.
- Added `/api/download/windows` at `src/app/api/download/windows/route.ts`; it dynamically redirects to the latest GitHub Release `.exe` asset when present, otherwise to the latest release page.
- Added `.github/workflows/desktop-release.yml` so a Windows desktop installer can be built and uploaded to GitHub Releases from Actions.
- Extended `tests/e2e/quality.spec.ts` with regression coverage for:
  - `月之暗面` provider tab visibility and viewport fit.
  - `/download` page and Windows download button.

Verification:

- `E:\AI工作台\AI-CHAIN.cmd typecheck` passed.
- `E:\AI工作台\AI-CHAIN.cmd build` passed; `/download` is static and `/api/download/windows` is dynamic.
- `E:\AI工作台\AI-CHAIN.cmd quality` passed before the final test addition.
- Manual Playwright screenshot check confirmed:
  - provider tab text reads `月之暗面 1` and is fully visible.
  - `/download` opens and shows `下载 Windows 版`.
- Final `E:\AI工作台\AI-CHAIN.cmd test-all` passed:
  - TypeScript passed.
  - Next production build passed.
  - Chromium Playwright E2E passed: 12/12.
- Removed generated Playwright and PWA build artifacts after verification.

Pending:

- The website download page is implemented in code. To make the live site show it, push this change to `main` and let Vercel deploy.
- To make the Windows button download an installer directly, run the new `Desktop Release` GitHub Actions workflow once so a `.exe` asset exists on the latest GitHub Release.

Follow-up packaging polish:

- Set Electron Builder artifact name to `AI-Prompt-Generator-${version}-${os}-${arch}.${ext}` instead of deriving it from the Chinese product name.
- Updated the `Desktop Release` workflow to delete old `.exe` and `.blockmap` release assets before uploading fresh ones.
- Re-ran `E:\AI工作台\AI-CHAIN.cmd test-all`; Chromium E2E passed: 12/12.

Final deployment/publish results:

- Pushed implementation commit `258d0e9 feat: add desktop download page`; GitHub E2E run `25267691625` passed with 12/12 tests.
- Pushed packaging cleanup commit `4eca4b7 chore: clean desktop release artifacts`; GitHub E2E run `25267887313` passed with 12/12 tests.
- Triggered `Desktop Release` workflow run `25267934422`; it passed and uploaded:
  - `AI-Prompt-Generator-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-1.0.0-win-x64.exe.blockmap`
- Verified production:
  - `https://www.myprompt.asia/download` returns HTTP 200 and contains `下载 AI 提示词生成器`.
  - `https://www.myprompt.asia/api/download/windows` redirects to the clean GitHub Release installer and final asset returns HTTP 200 with `Content-Length: 79301110`.

---

## GPT Image 2 Source Ensemble — 2026-05-03

Completed locally:

- Four public GPT Image 2 prompt repositories are synced outside the app repo at `E:\AI工作台\资料 Sources\gpt-image-2`.
- The app repo keeps only distilled strategy, not the full upstream galleries/assets.
- New sync paths:
  - `npm run sources:gpt-image2`
  - `E:\AI工作台\AI-CHAIN.cmd gpt-image2-sync`
- New documentation:
  - `context/GPT_IMAGE2_SOURCES.md`
  - `src/lib/gpt-image-2-source-status.ts`
- New GPT Image 2 runtime:
  - `src/lib/gpt-image-2-ensemble.ts`
  - `/api/generate` uses it automatically when the target model is `gpt-image-2` / GPT Image 2.
- Frontend now forwards probed `availableModelIds` so the backend can pick callable judge models from the user's relay/API setup.
- Result panel shows GPT Image 2 judge summary, selected strategy, and ensemble estimated cost when available.
- Quality audit now waits for finite UI animations before axe contrast scanning.
- Model selector contrast was hardened.

Verified locally:

- `npm run sources:gpt-image2`
- `npx tsc --noEmit`
- `npm run build`
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium` — 4/4 passed
- `npx playwright test --project=chromium` — 12/12 passed
- After GitHub marked the first E2E run as flaky, `tests/e2e/quality.spec.ts` was hardened with an additional stable wait before axe scanning.

Pending:

- Completed. Code commits pushed:
  - `9142663 feat: add GPT Image 2 source ensemble`
  - `76dd157 test: stabilize accessibility audit`
- GitHub E2E run `25281333634` passed cleanly: 12/12.
- Vercel production deployment for `76dd157` succeeded.
- Production smoke run `25281462814` passed, including real generation through Groq fallback.
- Public checks:
  - `https://www.myprompt.asia` HTTP 200
  - `/api/models` returns 266 models and includes `gpt-image-2`

---

## Prompt Source Auto-Sync + Desktop Standalone — 2026-05-03

Completed locally:

- Added automatic GPT Image 2 source sync workflow:
  - `.github/workflows/sync-prompt-sources.yml`
  - every 6 hours plus manual trigger
  - commits source status changes when upstream repos update
- Added future source-group instructions:
  - `context/PROMPT_SOURCE_AUTOSYNC.md`
- Desktop app hardening:
  - Still runs the packaged app on local loopback `http://127.0.0.1:3748`.
  - Does not depend on `www.myprompt.asia` to open or generate.
  - Supports custom relay / AihubMix keys in first-run settings.
  - Supports portable mode data next to the portable EXE.
  - Adds Windows portable target alongside the installer.
- Download page/API:
  - `/api/download/windows` prefers installer assets.
  - `/api/download/windows/portable` prefers portable assets.
  - `/download` shows installer and portable options.
- Added desktop packaging verification script:
  - `scripts/verify-desktop-standalone.cjs`
  - `npm run desktop:verify`

Verified locally:

- `npx tsc --noEmit`
- `npm run build`
- `npm run desktop:verify`
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium` — 4/4 passed
- `npx playwright test --project=chromium` — 12/12 passed
- `npm run sources:gpt-image2`
- Electron Builder produced:
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-Portable-1.0.0-win-x64.exe`

Completed remotely:

- Pushed `d06486e feat: automate prompt source sync and portable desktop`.
- GitHub E2E run `25282442312` passed cleanly: 12/12.
- Vercel production deployment for `d06486e` succeeded.
- Desktop Release workflow run `25282500662` passed.
- Release `desktop-v1.0.0` now has both installer and portable EXE:
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-Portable-1.0.0-win-x64.exe`
- Production `/download` returns HTTP 200 and includes both download choices.
- `/api/download/windows` redirects to the setup installer.
- `/api/download/windows/portable` redirects to the portable EXE.
- Manual `Sync Prompt Sources` workflow run `25282673189` passed.
- Production Smoke Test run `25282673405` passed, including real generation through Groq fallback.

---

## Multi-Generator Prompt Evaluation + Prompt Library Sources — 2026-05-04

Completed:

- Fixed/improved generator picker scroll behavior:
  - `ModelPicker` remains full-screen and now forwards wheel events from header/filter areas into the scrollable model list.
  - Long provider names such as `月之暗面` remain visible.
- Added generator model multi-select:
  - Up to 6 selected generator models.
  - `PromptGenerator` sends `generatorModelIds` to `/api/generate`.
- Added evaluator model multi-select:
  - Up to 6 selected evaluator/judge models.
  - If none are chosen, backend auto-selects strong callable judge models.
- Added backend prompt tournament:
  - New file: `src/lib/prompt-evaluator.ts`.
  - Generates one optimized prompt candidate per selected generator model.
  - Scores candidates from 0-100 using judge models.
  - Selects the highest-scoring candidate.
  - Result panel visualizes candidate scores and selected winner.
- Kept GPT Image 2 special handling:
  - Existing four-source GPT Image 2 ensemble remains.
  - Added manual evaluator-model support for GPT Image 2.
- Added 10 prompt-library GitHub sources:
  - New script: `scripts/sync-prompt-library-sources.cjs`.
  - New status/rubric file: `src/lib/prompt-source-library-status.ts`.
  - New docs: `context/PROMPT_LIBRARY_SOURCES.md`.
  - `npm run sources:all` now syncs both GPT Image 2 and prompt-library sources.
- Updated prompt-source GitHub workflow:
  - `.github/workflows/sync-prompt-sources.yml` now commits both source status files.
- Expanded desktop/download targets:
  - macOS DMG and macOS ZIP routes.
  - Linux AppImage route.
  - Download page now shows Windows, macOS, Linux, and Android PWA options.
  - `desktop-release.yml` now includes Windows, macOS, and Linux jobs.
- Updated AI Workbench outside the repo:
  - `E:\AI工作台\AI自我改进工作流.md`
  - `E:\AI工作台\工具 Tools\ai-chain.ps1` commands: `prompt-sources`, `self-improve`.

Validation:

- `npx tsc --noEmit` — passed
- `git diff --check` — passed
- `npm run build` — passed
- `npm run desktop:verify` — passed after build
- `npm run test:quality` — 4/4 passed
- `npx playwright test --project=chromium` — 12/12 passed

Remaining boundary:

- Android native APK is not implemented yet. Current Android path is PWA install. True APK needs a separate Android packaging implementation.
