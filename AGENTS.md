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
   - `context/QUICK_START.md`
   - `context/PROJECT_CONTEXT.md`
   - `context/PROGRESS.md`
   - `context/SESSION_LOG.md`
   - `CLAUDE.md`
2. Run:
   - `git status -sb`
   - `git branch -vv`
3. State whether this Codex branch is ahead/behind `origin/main`.

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

