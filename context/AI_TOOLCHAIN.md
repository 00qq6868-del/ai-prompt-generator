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
- `test-all` — typecheck + build + E2E.
- `smoke-prod` — real production smoke test for `https://www.myprompt.asia`.
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
