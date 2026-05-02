# Codex Collaboration Rules

## Workspace Ownership

This worktree is the Codex-safe workspace:

```text
E:\AI工作台\项目 Projects\ai-prompt-generator-codex
```

Do not directly edit the Claude workspace unless the user explicitly asks:

```text
E:\vscode Claude\ai-prompt-generator
```

The Claude workspace may contain unfinished local changes. Treat it as another contributor's working copy.

## Before Any Code Change

1. Read:
   - `context/AI_TOOLCHAIN.md`
   - `context/QUICK_START.md`
   - `context/PROJECT_CONTEXT.md`
   - `context/PROGRESS.md`
   - `context/SESSION_LOG.md`
   - `CLAUDE.md`
2. Run:
   - `powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" status`
3. State whether this Codex branch is ahead/behind `origin/main`.

## Shared AI Toolchain

All AI windows should use the shared launcher when possible:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" <command>
```

Short wrapper:

```cmd
E:\AI工作台\AI-CHAIN.cmd <command>
```

Common commands:

- `doctor`: installed tool check.
- `status`: Git/project/GitHub status.
- `test-all`: TypeScript + build + Playwright E2E.
- `smoke-prod`: real production smoke test.
- `memory`: print handoff/context files.
- `compare-claude`: read-only comparison with the Claude workspace.

The launcher writes independent logs to `E:\AI工作台\日志 Logs\ai-chain` and locks Git-mutating operations so multiple AI windows do not collide.

## During Work

- Work only on the current Codex branch.
- Keep changes small and reviewable.
- Do not overwrite Claude's uncommitted work.
- Do not push to `main` without explicit user approval.
- If comparing with Claude's version, use `git diff --no-index` or read-only inspection first.
- Prefer tests and build output over assumptions.

## Before Ending A Session

Update:

- `context/PROGRESS.md`
- `context/SESSION_LOG.md`

Include:

- What changed
- Files changed
- Tests run
- Known risks
- Git branch/status
- Whether anything must be reviewed against Claude's workspace

## Anti-Hallucination Rule

Every claim about project state must be grounded in one of:

- File contents
- Git status/log/diff
- Test output
- Build output
- Runtime output
