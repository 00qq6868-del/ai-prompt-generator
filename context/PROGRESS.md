# Task Progress Tracker

> Last updated: 2026-05-01
> Updated by: Codex (E2E repair)

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

## Current Status: COMPREHENSIVE UPGRADE — 9 MAJOR TASKS COMPLETE + E2E GREEN LOCALLY

Previous Claude upgrade tasks were type-checked and pushed to GitHub. The Codex E2E repair is verified locally but not pushed/merged yet.

---

## 🔄 Active Task

Codex E2E repair completed locally. User approved continuing to completion on 2026-05-02; push to GitHub/main after final validation.

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

1. **trackApiCall/trackTTFT 尚未接入** — 需要在 `PromptGenerator.tsx` 的 fetch 和 SSE 解析处调用
2. **prompt-optimizer.ts v5 审计/补强** — 文档旧计划说 Phase 2/3 未开始，但当前代码已包含全模态 v5 和 `targetCategory` 路由；继续前先对账实际质量与缺口
3. **颜色对比度** — `text-white/30`(~3.3:1) 未达 WCAG AA 4.5:1，待用户确认是否改为 `text-white/45`
4. **electron-updater** 是 optionalDependencies，Vercel 部署不会安装

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
│   ├── prompt-optimizer.ts — SYSTEM_PROMPT + buildUserPrompt（待 Phase 2 重写）
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
