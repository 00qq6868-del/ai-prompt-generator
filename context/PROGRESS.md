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
- Pushed `e7f5411 feat: add prompt tournament and source library sync`.
- GitHub E2E run `25285272937` — 12/12 passed.
- Production smoke with `SMOKE_SKIP_GENERATE=1` passed for homepage, models, and analytics. Real generation was skipped because this local shell had no smoke API secret.

Remaining boundary:

- Android native APK is not implemented yet. Current Android path is PWA install. True APK needs a separate Android packaging implementation.

Update — 2026-05-03:

- Desktop Release is now complete for the current cross-platform desktop scope.
- Commit `134ea07 fix: avoid electron mirror for mac dmg assets` fixed macOS DMG/ZIP packaging.
- GitHub run `25286900540` passed for Windows, macOS, and Linux.
- Release `desktop-v1.0.0` now has Windows installer, Windows portable EXE, macOS DMG, macOS ZIP, and Linux AppImage.
- Production `/download` returns HTTP 200.
- Keep Android as PWA until a native APK packaging flow is implemented.

---

## Model Picker Scroll, Android APK, and Real GPT Image 2 QA — 2026-05-04

User reported that opening the generator model, target model, or evaluator model area could leave the page feeling stuck and unscrollable. Codex fixed and verified the scroll behavior across desktop and mobile.

Implemented:

- `src/components/ModelPicker.tsx`
  - The full-screen generator/evaluator picker now locks only the document body while preserving/restoring previous body/html overflow and overscroll styles.
  - The dialog captures vertical wheel events and forwards them into the internal model list.
  - Search/filter/header areas now live inside the same scroll container as the model cards, with sticky filters, so wheel/touch cannot get trapped in a non-scrollable header.
  - The internal list uses `overflow-y-auto`, `overscroll-y-contain`, and `touch-pan-y`.
- `src/components/ModelSelector.tsx`
  - Target model grid now uses browser `maxHeight: "min(520px, 65vh)"` instead of a Tailwind arbitrary class that did not reliably generate CSS.
  - Target list is now an explicit scroll container with `data-testid="target-model-scroll"`.
- `tests/e2e/quality.spec.ts`
  - Added regression coverage for target model list, generator picker dialog, and evaluator picker dialog scrolling.
  - Desktop verifies real mouse-wheel scrolling.
  - Mobile verifies the containers are truly scrollable and can advance scrollTop in touch-device mode.
- Android APK chain:
  - Added native Android WebView source under `android/`.
  - Added `.github/workflows/android-release.yml` to build a debug APK and upload it to the GitHub Release.
  - Added `/api/download/android` route.
  - Updated `/download` page to show Android APK + PWA.
  - Added `android/gradle.properties` with `android.overridePathCheck=true` so the project can build from the current Chinese E-drive path.
- Real GPT Image 2 QA:
  - Added `scripts/real-gpt-image2-quality-test.cjs`.
  - Added `npm run test:gpt-image2:real`.
  - The script accepts relay keys via env vars only, masks keys in reports, calls the live app `/api/generate`, records the app's internal prompt score, can optionally generate a real `gpt-image-2` image, and can optionally ask a vision model to score the generated image.
  - Reports/images are written under `reports/gpt-image2-real-tests/` and ignored by Git.

Important usage for real image QA:

```powershell
cd "E:\AI工作台\项目 Projects\ai-prompt-generator-codex"
$env:CUSTOM_BASE_URL="https://naapi.cc"
$env:CUSTOM_API_KEY="sk-你的key"
npm run test:gpt-image2:real
```

Generate an actual image:

```powershell
$env:MAKE_IMAGE="1"
npm run test:gpt-image2:real
```

Generate image + AI vision score:

```powershell
$env:MAKE_IMAGE="1"
$env:JUDGE_IMAGE="1"
$env:IMAGE_JUDGE_MODEL="gpt-4o"
npm run test:gpt-image2:real
```

Local verification:

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run test:quality` passed: 5/5 on Chromium.
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium --project=mobile` passed: 10/10.
- `npx playwright test --project=chromium` passed: 13/13.
- `npx playwright test --project=mobile` passed: 13/13.
- `gradle -p android :app:assembleDebug --no-daemon` passed and produced `android/app/build/outputs/apk/debug/app-debug.apk`.
- `node --check scripts/real-gpt-image2-quality-test.cjs` passed.
- Running `node scripts/real-gpt-image2-quality-test.cjs` without a key correctly stops with instructions; no real image generation was run because no API key was provided in this session.

Known boundary:

- The Android APK is currently a debug-signed WebView wrapper for the live site and requires internet. It is useful for free/manual install testing. A production signed APK would require adding a release keystore through GitHub Secrets.

Remote verification:

- Pushed `5063a63 feat: harden model scrolling and add android qa workflows`.
- Pushed `cbbac83 fix: use available setup-java action for android release`.
- GitHub E2E run `25296187362` passed: 13/13.
- GitHub E2E run `25296280706` passed: 13/13.
- Android Release run `25296284603` passed and uploaded `AI-Prompt-Generator-Android-1.0.0-debug.apk`.
- Release `desktop-v1.0.0` now includes the Android APK alongside Windows/macOS/Linux desktop assets.
- Production `/download` contains `下载 Android APK`.
- Production `/api/download/android` redirects to the GitHub APK asset.

## 2026-05-04 — Generation Stability, Auto Cooldown, Progress ETA

User reported production generation failures and slow waiting with no clear remaining time. Codex added a stability layer for relay/model failures and visible generation progress.

Implemented:

- `src/lib/model-health.ts`
  - New in-memory model health registry.
  - Records per-model/per-provider success and failure.
  - Automatically cools unstable models after timeouts, 429s, 5xx/upstream errors, network resets, access/model errors, or similar relay failures.
  - Cooldowns retry later automatically; a successful call clears the failure state.
  - Adds per-call timeouts: generator 45s, judge 30s, simple generation 60s by default, with env overrides.
- `src/lib/prompt-evaluator.ts`
  - Multi-generator tournament now skips cooling models before calling them.
  - Partial model failures no longer fail the whole generation if at least one candidate succeeds.
  - If every selected generator fails, it tries a healthy fallback model once.
  - Judge/evaluator calls also use cooldown and timeout handling.
  - Emits progress events for candidate generation, AI scoring, fallback, and final assembly.
- `src/lib/gpt-image-2-ensemble.ts`
  - GPT Image 2 prompt ensemble now uses the same cooldown and timeout handling.
  - If the main generator is cooling or fails before candidate generation, it switches to a healthy fallback model.
  - Judge failures no longer kill the output; the best generated candidate or hybrid is still returned.
  - Synthesis failure falls back to the best existing candidate instead of failing the whole request.
- `src/app/api/generate/route.ts`
  - Streaming responses now emit `progress` events before final `chunk`/`done`.
  - Normal generation, multi-model tournament, and GPT Image 2 ensemble all support progress events.
  - Single-model generation now detects a cooling primary model and can switch to a healthy text fallback.
  - If a single model fails before streaming any text, the request retries once with a healthy fallback model.
- `src/components/PromptGenerator.tsx`
  - Shows the current generation phase.
  - Shows elapsed waiting time and estimated remaining time.
  - Shows status even when tournament/GPT Image 2 paths have not produced final text chunks yet.
  - Toast text updates with the backend phase and estimated remaining time.
- `src/components/ResultPanel.tsx`
  - Displays a small warning note when models were cooled/skipped or failed without interrupting the final answer.

Validation:

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run test:quality` passed: 5/5 Chromium.
- `npx playwright test tests/e2e/prompt-generator.spec.ts --project=chromium` passed: 8/8.
- `npx playwright test --project=mobile` passed: 13/13.
- `npx playwright test --project=chromium` passed: 13/13.
- Production smoke with `SMOKE_SKIP_GENERATE=1` passed for homepage, models, and analytics.
- Pushed `ae15cfc feat: add generation health fallback and eta`.
- GitHub E2E run `25298235201` passed: 13/13.
- Vercel status for `ae15cfc` completed successfully.

Known boundary:

- The health registry is intentionally free and in-memory. On Vercel it applies per running server instance and resets when the instance restarts. It is still useful for unstable relay/model retries without adding a database.

## 2026-05-04 — GPT Image 2 Local Test Panel 524 Fix

User screenshot showed the local `127.0.0.1:61994` GPT Image 2 review panel failing at step 1 with a Cloudflare `524: A timeout occurred` HTML response from `www.myprompt.asia`. Root cause: the panel was still calling the production website `/api/generate` for prompt optimization, so long GPT Image 2 prompt tournament requests could exceed the production timeout before image generation even started.

Implemented:

- `scripts/gpt-image2-live-review-panel.cjs`
  - Default prompt generation mode changed to local direct relay calls.
  - The panel now generates GPT Image 2 candidate prompts directly through the user's relay `/v1/chat/completions` instead of depending on `www.myprompt.asia/api/generate`.
  - Added the same four-source GPT Image 2 strategy set inside the panel: EvoLinkAI, YouMind, Anil-matcha, wuyoscar, plus a hybrid candidate.
  - Added direct AI prompt judging, 0-100 scoring, winner selection, and optional synthesis.
  - Added timeout handling:
    - prompt generation: 55s
    - prompt/image judges: 35s
    - image generation/editing: 180s
  - The website API mode is still available as an optional dropdown. If it fails, the panel automatically falls back to local direct mode.
  - HTML error pages such as Cloudflare 524 are summarized cleanly instead of dumping raw HTML into the status area.
  - Image generation and image judging remain in the same single page, including uploaded reference images.

Workbench launcher updates outside Git:

- `E:\AI工作台\GPTImage2一键共同真实测试面板.cmd`
- `E:\AIWB\GPTImage2_PANEL.cmd`
- `E:\AI工作台\工具 Tools\ai-chain.ps1`

These now stop any old local process listening on port `61994` before starting the panel, so the user does not keep reopening a stale old version.

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- `git diff --check` passed.
- Local panel restarted successfully on `http://127.0.0.1:61994/`.
- A local GET confirmed the new page contains `本地直连中转站` and `不怕网站 524`.
- Pushed `0a4913b fix: make GPT Image 2 panel avoid site timeouts`.
- GitHub E2E run `25298874948` passed: 13/13.
- Vercel deployment for `0a4913b` completed successfully.
- Production smoke with `SMOKE_SKIP_GENERATE=1` passed for homepage, models, and analytics.

## 2026-05-04 — GPT Image 2 Panel History, Local Learning, and Model Sync

User asked that the GPT Image 2 test panel preserve test history, keep the user's human scores/critiques, learn from those critiques, store API keys locally only, and let every major model role be synchronized from the main AI prompt generator model registry with manual selection.

Implemented:

- `scripts/gpt-image2-live-review-panel.cjs`
  - Added local history index at `reports/gpt-image2-live-review/history-index.json`.
  - Added local feedback memory at `reports/gpt-image2-live-review/learning-memory.json`.
  - Existing report JSON/Markdown/prompt files remain the source of truth; the history index can be rebuilt from reports.
  - User score and notes now update both the report and the local learning rules.
  - Learned rules are injected into later GPT Image 2 candidate prompt generation, so repeated user critiques influence future prompts.
  - Added one-page history UI with thumbnails, AI score, user score, user notes, and click-to-reopen reports.
  - Added direct image generation/editing mode on the same page, so the panel can test or simply generate images.
  - Added reference-image upload support for text-to-image and image-to-image/editing.
  - Added local-browser-only API key persistence checkbox. The key is not written to project files or reports.
  - Added model sync endpoints:
    - `GET /api/model-options`
    - `POST /api/probe-models`
  - Model selectors now synchronize with `public/models.json` first, and can optionally probe the relay `/v1/models` to mark which models the current API key can actually call.
  - Manual selectors now cover:
    - target model: all 266 registered/relay models
    - image model: image-generation models
    - prompt generator models: text models, multi-select up to 6
    - prompt evaluator models: text models, multi-select up to 6
    - image judge models: vision/multimodal text models, multi-select up to 6

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- `git diff --check` passed.
- Local panel restarted successfully on `http://127.0.0.1:61994/`.
- Local API check confirmed:
  - HTTP 200 for the page.
  - target models: 266
  - image models: 7
  - text/generator/evaluator models: 245
  - history entries: 1
  - learning rules: 5

## 2026-05-04 — Workbench Anti-Hallucination Guard

User asked for a full free toolchain/workflow to reduce hallucinations and script failures across all future AI work.

Implemented outside the repo in the shared E-drive workbench:

- `E:\AI工作台\HALLUCINATION-GUARD.cmd`
- `E:\AI工作台\工具 Tools\hallucination-guard.ps1`
- `E:\AI工作台\HALLUCINATION_GUARD_WORKFLOW.md`
- `E:\AI工作台\资料 Sources\hallucination-guard`

Synced 9 external sources:

- deepeval, Phoenix, TruLens, UpTrain, WikiChat, UQLM, SelfCheckGPT, LettuceDetect, VCD.

Installed isolated Python 3.11 environments:

- `.venv-core` for deepeval, Phoenix, TruLens, UpTrain, UQLM, SelfCheckGPT.
- `.venv-lettuce` for LettuceDetect because of incompatible numpy requirements.

Validation:

- All 9 repos synced successfully and `source-status.json` records commit IDs.
- `uv pip check` passed in both environments.
- Import smoke passed for all installed libraries.
- Script checker passed for `hallucination-guard.ps1`.
- `AI-CHAIN.cmd hallucination-sync` works through the universal launcher.
- Scheduled task `AIWorkbenchHallucinationGuardSync` registered every 6 hours.

Boundary:

- This reduces hallucination risk with source sync, evidence gates, script checks, evals, and logs. It does not guarantee hallucination rate is mathematically zero.

## 2026-05-04 — Fixed Model Picker Drag Scroll and GPT Image 2 Panel Startup

User showed screenshots where the website model picker dialog still could not be moved/scrolled by dragging, and the local GPT Image 2 test panel had empty model selectors and unusable start buttons.

Implemented:

- `src/components/ModelPicker.tsx`
  - Added pointer drag-to-scroll support for the full-screen model picker dialog.
  - Preserved normal click-to-select behavior by suppressing click only after an actual drag.
  - Kept existing wheel/touch scrolling.
- `tests/e2e/quality.spec.ts`
  - Added a regression check that drags the model picker scroller with the mouse and verifies `scrollTop` changes.
- `scripts/gpt-image2-live-review-panel.cjs`
  - Removed an inline image `onerror` attribute that broke the page script as `Unexpected identifier 'none'`.
  - Replaced it with a safe event listener after history HTML is rendered.

Validation:

- `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `npm run test:quality` passed: 5/5 Chromium.
- `npm run build` passed.
- Restarted local panel at `http://127.0.0.1:61994/`.
- Browser console check for the panel returned no page errors.
- Local panel model options loaded:
  - target: 266
  - image: 7
  - generators: 245
  - evaluators: 245
  - image judges: 245
- Clicking the start button with no API key now correctly shows `请先填 API Key` and re-enables buttons.

Follow-up fix:

- Production testing showed drag-scroll could still fail online because the model picker was rendered inside animated/transformed ancestors. Fixed by rendering `ModelPicker` through a React portal into `document.body`, so the fixed overlay and scroll container are no longer trapped by page transforms.
- Revalidated locally after the portal change:
  - `npx tsc --noEmit` passed.
  - `node --check scripts/gpt-image2-live-review-panel.cjs` passed.
  - `npm run test:quality` passed: 5/5 Chromium.
  - `npm run build` passed.
- Restarted the local GPT Image 2 panel again and verified in Playwright:
  - model sync status: `已同步项目模型 266 个`
  - target select: 266
  - image select: 7
  - generator/evaluator/judge selects: 245 each
  - `开始完整测试` button is clickable and enters the running state.

Additional bug fixed in the same user report:

- Production browser checks also showed an uncaught PWA registration error: `Cannot read properties of undefined (reading 'waiting')`.
- Disabled the package's automatic service-worker registration and moved registration into `PWAPrompts` with guarded `navigator.serviceWorker.register("/sw.js")` logic.
- Production-mode local verification on `http://127.0.0.1:3100/` passed with:
  - no page errors
  - no console errors
  - model picker drag-scroll still working
