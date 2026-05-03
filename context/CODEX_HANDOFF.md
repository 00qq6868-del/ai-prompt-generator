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

- Latest `origin/main` before this handoff memory repair: `b38b2ff fix: export recommendation type`
- Latest model rollout commits on GitHub:
  - `e4382cf chore: auto-ensure latest model registry`
  - `f14da68 chore: auto-update models 2026-05-02`
  - `3c54416 docs: record latest model rollout verification`
  - `b38b2ff fix: export recommendation type`
- Local Codex worktree was aligned with `origin/main` at `b38b2ff` before this context-only update.
- GitHub E2E run `25248567893` for `b38b2ff` succeeded with `8/8`.
- Production Smoke Test run `25248233632` succeeded.
- Production `/api/models` returned 266 bundled models with `{ text: 245, video: 7, image: 7, tts: 7 }`.
- Production includes `gpt-5.5`, `gpt-5.5-pro`, `gpt-image-2`, `deepseek-v4-pro`, `deepseek-v4-flash`, `gemini-3.1-pro-preview`, `claude-opus-4-7`, and `claude-haiku-4-5`.
- Follow-up checks confirmed ResultPanel compare UI, history/favorites, `/api/generate` ModelInfo typing, and ARIA labels were already implemented.
- The only follow-up code change was exporting `Recommendation` from `src/lib/model-recommender.ts`, pushed as `b38b2ff`.

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
- Final pushed commits: `e9dce5a feat: add production smoke checks and safeguards`, then `2fefac6 fix: try fallback providers in production smoke`.
- GitHub E2E passed for both commits; latest E2E run `25244119954` passed 8/8.
- Production Smoke Test run `25244163971` succeeded:
  - homepage ok
  - models ok: 251 total, `{ text: 240, video: 2, image: 4, tts: 5 }`
  - analytics ok, sink `stdout`
  - relay probe ok, 227 models
  - real generation ok through Groq after Google quota 429 fallback

Shared AI toolchain launcher added on 2026-05-02:

- Global script: `E:\AI工作台\工具 Tools\ai-chain.ps1`
- Short wrapper: `E:\AI工作台\AI-CHAIN.cmd`
- Double-click console: `E:\AI工作台\打开AI工具链控制台.cmd`
- Human guide: `E:\AI工作台\AI工具链说明.md`
- ASCII guide: `E:\AI工作台\AI_TOOLCHAIN.md`
- Project guide: `context/AI_TOOLCHAIN.md`
- Use `E:\AI工作台\AI-CHAIN.cmd status` at the start of any AI window.
- Use `E:\AI工作台\AI-CHAIN.cmd test-all` before claiming a full local validation.
- Use `E:\AI工作台\AI-CHAIN.cmd smoke-prod` for real production validation.
- The launcher logs every run and locks Git-mutating operations to reduce multi-AI collisions.

Shared toolchain audit and visual QA upgrade on 2026-05-02:

- `AI-CHAIN doctor` confirms the free chain is installed: Git, gh, Node/npm/npx, Python/py, uv, VS Code, Docker/Rancher, Ollama, Claude Code, Codex CLI, PowerShell 7, curl, and Gitleaks.
- `AI-CHAIN` now resolves VS Code to `E:\vscode\Microsoft VS Code\bin\code.cmd`, fixing extension install/list commands.
- Additional free VS Code quality extensions installed: Tailwind CSS IntelliSense, axe Accessibility Linter, SonarQube/SonarLint, Vitest Explorer, Code Spell Checker, Pretty TypeScript Errors, TODO Tree, Path Intellisense, and Edge DevTools.
- New project QA command: `E:\AI工作台\AI-CHAIN.cmd quality`.
- New project script: `npm run test:quality`.
- New Playwright audit: `tests/e2e/quality.spec.ts`.
- The quality audit checks desktop/mobile visual health, horizontal overflow, key controls, console errors, and axe WCAG results.
- PWA generation is disabled in development mode and still enabled in production builds, preventing dev/E2E runs from creating temporary service-worker files under `public/`.
- Generated PWA files and `tsconfig.tsbuildinfo` are now ignored and removed from Git tracking. Production `next build` still generates the service worker.
- Latest local verification passed:
  - `AI-CHAIN quality`: 2/2
  - `AI-CHAIN test-all`: typecheck + build + Chromium E2E 10/10
  - `AI-CHAIN security`: no leaks
- Pushed implementation commit: `9b3abb9 test: add visual accessibility quality audit`.
- GitHub E2E run `25254262203` passed with 10/10 tests.
- GitHub Production Smoke Test run `25254319276` passed on `9b3abb9`; real generation succeeded through Groq fallback.
- Local `smoke-prod` can only run public homepage/models/analytics without local API key env vars. Use GitHub Production Smoke Test after push for real generation because repository secrets are configured there.
- Cleanup removed only ignored/generated validation junk. Do not delete `E:\vscode Claude\ai-prompt-generator`, `node_modules`, `.next`, caches, logs, Ollama models, or IDE folders unless the user explicitly approves.

## Recommended Workflow

1. Codex makes changes in the Codex worktree only.
2. Claude can keep its existing workspace untouched.
3. When both versions exist, compare them with Git diff.
4. Keep the better implementation or merge selected parts.
5. Push only after tests pass and the user approves.

## Context Compression Recovery

If the chat context is compressed or lost, the next AI should read:

1. `AGENTS.md`
2. `context/AI_TOOLCHAIN.md`
3. `context/QUICK_START.md`
4. `context/PROJECT_CONTEXT.md`
5. `context/PROGRESS.md`
6. `context/SESSION_LOG.md`
7. `context/CODEX_HANDOFF.md`

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\AI工作台\工具 Tools\ai-chain.ps1" status
```

## Latest Local Work — GPT Image 2 Sources, 2026-05-03

User wants four GPT Image 2 GitHub repositories used for prompt optimization, but not copied wholesale into the app repository. Public upstream repos are synced to:

```text
E:\AI工作台\资料 Sources\gpt-image-2
```

Use:

```cmd
npm run sources:gpt-image2
E:\AI工作台\AI-CHAIN.cmd gpt-image2-sync
```

Current synced commits:

- `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts@c0a069d`
- `YouMind-OpenLab/awesome-gpt-image-2@3c2dd22`
- `Anil-matcha/Awesome-GPT-Image-2-API-Prompts@1123572`
- `wuyoscar/gpt_image_2_skill@44ea0fa`

New files in the app repo:

- `scripts/sync-gpt-image2-sources.cjs`
- `context/GPT_IMAGE2_SOURCES.md`
- `src/lib/gpt-image-2-ensemble.ts`
- `src/lib/gpt-image-2-source-status.ts`

Modified runtime:

- `src/app/api/generate/route.ts` detects GPT Image 2 targets and runs the ensemble.
- `src/components/PromptGenerator.tsx` forwards `availableModelIds`.
- `src/components/ResultPanel.tsx` displays ensemble review/cost metadata.
- `src/lib/prompt-optimizer.ts` includes source-informed GPT Image 2 prompt guidance.
- `src/components/ModelSelector.tsx` contrast fixes were added because axe caught low-contrast animated states.
- `tests/e2e/quality.spec.ts` waits for finite animations plus an extra stable interval before axe scanning and keeps the `月之暗面` clipping regression test.

Local verification already passed:

- `npm run sources:gpt-image2`
- `npx tsc --noEmit`
- `npm run build`
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium` — 4/4
- `npx playwright test --project=chromium` — 12/12

Next step after this handoff: commit and push, then verify GitHub Actions/Vercel before saying the live site is updated.
