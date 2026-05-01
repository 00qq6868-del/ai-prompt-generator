# Codex Handoff

## Current Safety Setup

Created a Codex-safe worktree from GitHub latest `origin/main`.

Codex workspace:

```text
E:\AI工作台\项目 Projects\ai-prompt-generator-codex
```

Claude/original workspace:

```text
E:\vscode Claude\ai-prompt-generator
```

Backup branch created for the original local `main` pointer:

```text
backup/claude-main-20260501-232542
```

Codex branch:

```text
codex/safe-audit-20260501-232542
```

## Important State

The original Claude workspace had local uncommitted/generated changes and was behind GitHub.

Do not edit or clean the Claude workspace unless the user explicitly approves.

## Recommended Workflow

1. Codex makes changes in the Codex worktree only.
2. Claude can keep its existing workspace untouched.
3. When both versions exist, compare them with Git diff.
4. Keep the better implementation or merge selected parts.
5. Push only after tests pass and the user approves.

## Context Compression Recovery

If the chat context is compressed or lost, the next AI should read:

1. `AGENTS.md`
2. `context/QUICK_START.md`
3. `context/PROJECT_CONTEXT.md`
4. `context/PROGRESS.md`
5. `context/SESSION_LOG.md`
6. `context/CODEX_HANDOFF.md`

Then run:

```powershell
git status -sb
git branch -vv
git log -5 --oneline --decorate
```

