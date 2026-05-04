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
- `android-apk` — build the local Android debug APK for this project.
- `ci` — recent GitHub Actions.
- `watch-ci` — watch latest or `-RunId <id>`.
- `memory` — print handoff/context files.
- `compare-claude` — read-only status comparison with Claude workspace.
- `security` — Gitleaks secret scan.
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
