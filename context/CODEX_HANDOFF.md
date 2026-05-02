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

Latest verified GitHub/production state on 2026-05-02:

- Codex completion commit on GitHub: `db61b5e feat: complete prompt generator stabilization pass`
- Latest `origin/main` after scheduled model updates: `47e984b chore: auto-update models 2026-05-02`
- Local Codex worktree has been fast-forwarded to `47e984b`
- GitHub Actions E2E run `25225316579` for the Codex completion pass succeeded
- `https://www.myprompt.asia` returned HTTP 200
- Production `/api/models` returned 251 bundled models and includes `gpt-5.5`

Follow-up fix in progress/completed locally on 2026-05-02:

- The scheduled model updater had overwritten some image/TTS categories back to text.
- `.github/scripts/fetch-models.mjs` now shares `classifyModel()` across provider fetchers so Google/OpenAI official records do not downgrade categories during merge.
- `scripts/patch-models.cjs` now also writes `context/SYSTEM_STATE.json`.
- Local patched state is 251 models with `{ text: 240, video: 2, image: 4, tts: 5 }`.

Production chain hardening added locally on 2026-05-02:

- `src/lib/rate-limit.ts` adds free per-IP in-memory rate limiting.
- `/api/generate` now has request rate, input length, and max-token limits.
- `/api/probe` now rate-limits and validates public relay URLs before fetching `/models`.
- `/api/analytics` now sanitizes metrics and avoids Vercel deployment-directory file writes; optional durable forwarding is `ANALYTICS_WEBHOOK_URL`.
- `scripts/production-smoke.cjs` plus `.github/workflows/production-smoke.yml` provide a real production smoke test using GitHub Secrets.
- Before deploy, current production `/api/analytics` returned 500, confirming the old analytics persistence issue.

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
