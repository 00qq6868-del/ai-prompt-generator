# Shared AI Toolchain

All AI assistants working on this project should use the shared toolchain launcher instead of inventing separate local commands.

Global launcher:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" <command>
```

Short wrapper:

```cmd
E:\AI工作台\AI-CHAIN.cmd <command>
```

Important commands:

- `doctor` — check installed tools and versions.
- `status` — project git status, branch state, recent commits, GitHub Actions.
- `sync` — fetch/rebase this Codex-safe worktree from `origin/main`; uses a lock.
- `typecheck` — `npx tsc --noEmit`.
- `build` — `npm run build`.
- `e2e` — `npx playwright test --project=chromium`.
- `quality` — visual-health + accessibility audit with Playwright screenshots and axe.
- `test-all` — typecheck + build + E2E.
- `smoke-prod` — real production smoke test for `https://www.myprompt.asia`.
- `gpt-image2-real` — real relay/API quality test for GPT Image 2 prompts; requires an API key in env vars and can optionally generate an image.
- `gpt-image2-panel` — opens a local browser panel for shared GPT Image 2 testing: prompt score, real image generation, multi-AI image judging, and user score comparison.
- `android-apk` — build the local Android debug APK for this project.
- `ci` — recent GitHub Actions.
- `watch-ci` — watch latest or `-RunId <id>`.
- `memory` — print handoff/context files.
- `compare-claude` — read-only status comparison with Claude workspace.
- `security` — Gitleaks secret scan.
- `hallucination` — run the shared anti-hallucination workflow/status.
- `hallucination-sync` — sync the 9 external hallucination/eval GitHub sources.
- `hallucination-check -Path FILE` — syntax/static-check a generated script before running it.
- `hallucination-phoenix` — open local Phoenix observability dashboard.
- `new-session` — prompt for another AI window.

Concurrency rule:

- Read-only commands can run in parallel.
- Git-mutating commands such as `sync` use a lock under `E:\AI工作台\日志 Logs\ai-chain\locks`.
- Each run writes a separate log under `E:\AI工作台\日志 Logs\ai-chain`.

Workspace rule:

- Codex-safe project: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`
- Claude/original project: `E:\vscode Claude\ai-prompt-generator`
- Do not edit the Claude/original project unless the user explicitly asks.

Human-readable full guide:

```text
E:\AI工作台\AI工具链说明.md
```

Free VS Code quality extensions installed in the shared IDE include Tailwind CSS IntelliSense, axe Accessibility Linter, SonarQube/SonarLint, Vitest Explorer, Code Spell Checker, Pretty TypeScript Errors, TODO Tree, Path Intellisense, and Edge DevTools.

Anti-hallucination / script reliability toolchain:

```cmd
E:\AI工作台\HALLUCINATION-GUARD.cmd
E:\AI工作台\AI-CHAIN.cmd hallucination
E:\AI工作台\AI-CHAIN.cmd hallucination-sync
E:\AI工作台\AI-CHAIN.cmd hallucination-check -Path E:\path\to\script.ps1
E:\AI工作台\AI-CHAIN.cmd hallucination-phoenix
```

Sources and workflow:

```text
E:\AI工作台\资料 Sources\hallucination-guard
E:\AI工作台\HALLUCINATION_GUARD_WORKFLOW.md
```

Installed isolated environments:

- `E:\AI工作台\工具 Tools\hallucination-guard\.venv-core` for deepeval, Phoenix, TruLens, UpTrain, UQLM, and SelfCheckGPT.
- `E:\AI工作台\工具 Tools\hallucination-guard\.venv-lettuce` for LettuceDetect, isolated because it requires a different numpy range.

Rule for future AI windows: when factuality, hallucination risk, auto-installation, generated scripts, RAG, or long-form answer reliability matters, run `AI-CHAIN.cmd hallucination` first and `AI-CHAIN.cmd hallucination-check -Path FILE` before executing generated scripts.

GPT Image 2 real QA example:

```powershell
cd "E:\AI工作台\项目 Projects\ai-prompt-generator-codex"
$env:CUSTOM_BASE_URL="https://naapi.cc"
$env:CUSTOM_API_KEY="sk-你的key"
npm run test:gpt-image2:real
```

Equivalent shared launcher command:

```cmd
E:\AI工作台\AI-CHAIN.cmd gpt-image2-real
```

One-click shared review panel:

```cmd
E:\AI工作台\GPTImage2一键共同真实测试面板.cmd
```

or:

```cmd
E:\AI工作台\AI-CHAIN.cmd gpt-image2-panel
```

Add `$env:MAKE_IMAGE="1"` to generate a real image and `$env:JUDGE_IMAGE="1"` to request vision-model scoring. Reports go to `reports/gpt-image2-real-tests/` and are ignored by Git.

Android project:

```text
android/
```

Local debug APK build command:

```powershell
gradle -p android :app:assembleDebug --no-daemon
```

Equivalent shared launcher command:

```cmd
E:\AI工作台\AI-CHAIN.cmd android-apk
```

The Android APK is currently a debug-signed WebView wrapper for the live site. The GitHub workflow `.github/workflows/android-release.yml` can upload it into the project release.
