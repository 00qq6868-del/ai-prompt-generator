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

Verification and deployment:

- Code commits pushed:
  - `9142663 feat: add GPT Image 2 source ensemble`
  - `76dd157 test: stabilize accessibility audit`
- GitHub E2E run `25281333634` passed cleanly: 12/12.
- Vercel production deployment for `76dd157` succeeded, deployment id `4561806192`.
- Production smoke test run `25281462814` passed:
  - homepage ok
  - models ok: 266 total
  - analytics ok
  - relay probe ok: 221 models
  - real generation ok through Groq fallback
- Live site check: `https://www.myprompt.asia` returns HTTP 200 and `/api/models` includes `gpt-image-2`.

Next step after this handoff: for future GPT Image 2 updates, run `npm run sources:gpt-image2`, re-distill only changed strategy if needed, then run full local validation before pushing.

## Latest Local Work — Auto-Sync and Standalone Desktop, 2026-05-03

User asked for long-term automatic syncing of the four GPT Image 2 source repositories and a desktop build that keeps working even if the domain/server expires.

Implemented locally:

- `.github/workflows/sync-prompt-sources.yml`
  - scheduled every 6 hours
  - manual trigger supported
  - commits `src/lib/gpt-image-2-source-status.ts` when upstream commits change
- `context/PROMPT_SOURCE_AUTOSYNC.md`
  - rules and steps for adding future GitHub prompt-source groups
- Desktop independence:
  - packaged app serves itself from local loopback `http://127.0.0.1:3748`
  - `electron/main.js` can find packaged standalone server layouts
  - no dependency on `www.myprompt.asia` in the Electron main process
  - portable mode uses `PORTABLE_EXECUTABLE_DIR` and stores data in `AI-Prompt-Generator-Data`
  - first-run settings support custom relay / AihubMix keys
- Download changes:
  - `/api/download/windows` prefers setup installer
  - `/api/download/windows/portable` redirects to portable EXE
  - `/download` shows both installer and portable choices
- Packaging:
  - Windows build now targets `nsis` and `portable`
  - `scripts/verify-desktop-standalone.cjs`
  - `npm run desktop:verify`
  - build scripts include `--config.win.signAndEditExecutable=false` to avoid local Windows symlink-permission failures during Electron Builder's winCodeSign extraction

Local verification passed:

- `npx tsc --noEmit`
- `npm run build`
- `npm run desktop:verify`
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium` — 4/4
- `npx playwright test --project=chromium` — 12/12
- `npm run sources:gpt-image2`
- Electron Builder produced local installer and portable EXE after disabling Windows executable edit/sign step:
  - `dist-electron/AI-Prompt-Generator-Setup-1.0.0-win-x64.exe`
  - `dist-electron/AI-Prompt-Generator-Portable-1.0.0-win-x64.exe`

Remote verification and release are complete:

- Pushed `d06486e feat: automate prompt source sync and portable desktop`.
- GitHub E2E run `25282442312` passed cleanly: 12/12.
- Vercel production deployment for `d06486e` succeeded.
- Desktop Release workflow run `25282500662` passed.
- GitHub Release `desktop-v1.0.0` contains:
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-Portable-1.0.0-win-x64.exe`
  - `AI-Prompt-Generator-Setup-1.0.0-win-x64.exe.blockmap`
- `https://www.myprompt.asia/download` returns HTTP 200 and shows both installer and portable options.
- `/api/download/windows` redirects to the setup installer.
- `/api/download/windows/portable` redirects to the portable EXE.
- Manual Sync Prompt Sources workflow run `25282673189` passed.
- Production Smoke Test run `25282673405` passed, including real generation through Groq fallback.

## Latest Local Work — Scroll Fix, Android APK, Real GPT Image 2 QA, 2026-05-04

User's current complaint was that model pages could still feel stuck/unscrollable after opening generator/target/evaluator model areas. This has been fixed locally in the Codex-safe worktree.

Changed locally:

- `src/components/ModelPicker.tsx`
  - Generator/evaluator full-screen picker now uses one main scroll container containing sticky search/filter controls and model cards.
  - The dialog forwards vertical wheel events into the model list so the pointer can be over the header/search/filter area without trapping scroll.
  - Body/html scroll locks are restored to previous values on close.
- `src/components/ModelSelector.tsx`
  - Target model grid now has reliable `maxHeight: "min(520px, 65vh)"`, `overflow-y-auto`, `overscroll-y-contain`, and `touch-pan-y`.
- `tests/e2e/quality.spec.ts`
  - Scroll regression test covers target model list, generator picker dialog, and evaluator picker dialog.
  - Desktop path uses real wheel scrolling; mobile path verifies scrollability without relying on a mouse wheel.
- Android:
  - Added `android/` native WebView project.
  - Added `.github/workflows/android-release.yml`.
  - Added `/api/download/android`.
  - Download page now lists Android APK + PWA.
  - Added `android/gradle.properties`; local Gradle build passes from the current Chinese E-drive path.
- Real API QA:
  - Added `scripts/real-gpt-image2-quality-test.cjs` and `npm run test:gpt-image2:real`.
  - The script uses env vars only for keys, masks secrets, calls the live app, records prompt score, optionally generates an actual `gpt-image-2` image, optionally scores the image with a vision model, and writes ignored reports under `reports/gpt-image2-real-tests/`.

Use for the user's NAAPI/relay key:

```powershell
cd "E:\AI工作台\项目 Projects\ai-prompt-generator-codex"
$env:CUSTOM_BASE_URL="https://naapi.cc"
$env:CUSTOM_API_KEY="sk-用户的key"
npm run test:gpt-image2:real
```

To create a real image:

```powershell
$env:MAKE_IMAGE="1"
npm run test:gpt-image2:real
```

To also run vision scoring:

```powershell
$env:JUDGE_IMAGE="1"
$env:IMAGE_JUDGE_MODEL="gpt-4o"
npm run test:gpt-image2:real
```

Local validation already completed:

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run test:quality` passed: 5/5 Chromium.
- `npx playwright test tests/e2e/quality.spec.ts --project=chromium --project=mobile` passed: 10/10.
- `npx playwright test --project=chromium` passed: 13/13.
- `npx playwright test --project=mobile` passed: 13/13.
- `gradle -p android :app:assembleDebug --no-daemon` passed.
- `node --check scripts/real-gpt-image2-quality-test.cjs` passed.

Known boundary:

- Android APK is currently debug-signed and wraps the live website through WebView. It requires internet and is not yet a production-signed Play Store style release.
- Do not commit local API keys or generated reports/images.

Next step: when the user gives more GitHub prompt-source projects, follow `context/PROMPT_SOURCE_AUTOSYNC.md`; keep new source groups separate and add their own sync/status/runtime integration.

## Latest Work — Multi-Generator Evaluation and Cross-Platform Downloads, 2026-05-04

User asked to fix the generator picker scroll issue, add multi-generator and manual judge-model selection, sync 10 more prompt-source repositories, and expand downloads to macOS / all computer systems / Android.

What changed:

- `src/components/ModelPicker.tsx`
  - Multi-select support.
  - Header/filter wheel events now scroll the model list.
  - Selected count and Done button for multi-select.
- `src/components/ModelSelector.tsx`
  - Generator models: up to 6.
  - Evaluator models: up to 6.
- `src/components/PromptGenerator.tsx`
  - Tracks `generatorModelIds` and `evaluatorModelIds`.
  - Sends both arrays to `/api/generate`.
- `src/app/api/generate/route.ts`
  - Runs a prompt tournament for normal targets when multiple generators or evaluators are selected.
  - Keeps GPT Image 2 on the four-source ensemble path.
- `src/lib/prompt-evaluator.ts`
  - Generates candidates from selected generators.
  - Scores with selected/auto judge models.
  - Aggregates 0-100 scores and returns the best candidate.
- `src/components/ResultPanel.tsx`
  - Shows visual score bars and selected candidate.
- `scripts/sync-prompt-library-sources.cjs`
  - Syncs 10 new prompt-library repos into `E:\AI工作台\资料 Sources\prompt-library`.
- `src/lib/prompt-source-library-status.ts`
  - Generated status and scoring rubric.
- `.github/workflows/sync-prompt-sources.yml`
  - Runs `npm run sources:all`.
- Download / release:
  - Added mac routes: `/api/download/mac`, `/api/download/mac/portable`.
  - Added Linux route: `/api/download/linux`.
  - Download page shows Windows installer, Windows portable, macOS DMG/ZIP, Linux AppImage, Android PWA.
  - Desktop Release workflow has Windows, macOS, and Linux jobs.

Important boundary:

- There is no true one-file portable app that works unchanged on every OS. Current implementation uses platform-specific packages: Windows EXE, macOS ZIP/DMG, Linux AppImage, Android PWA.
- Native Android APK is not built yet.

Validated locally:

- `npx tsc --noEmit`
- `git diff --check`
- `npm run build`
- `npm run desktop:verify`
- `npm run test:quality` — 4/4
- `npx playwright test --project=chromium` — 12/12

Workbench updates outside git:

- `E:\AI工作台\AI自我改进工作流.md`
- `E:\AI工作台\工具 Tools\ai-chain.ps1` gained `prompt-sources` and `self-improve`.

Remote:

- Pushed `e7f5411 feat: add prompt tournament and source library sync`.
- GitHub E2E run `25285272937` passed: 12/12.
- Production smoke with `SMOKE_SKIP_GENERATE=1` passed for homepage, models, and analytics. Real generation was skipped because no local smoke API secret was available in this shell.

## Desktop Release Status — 2026-05-03

Latest remote/main:

- `134ea07 fix: avoid electron mirror for mac dmg assets`

What happened:

- macOS release initially failed because `ELECTRON_MIRROR` leaked into dmg-builder's generic artifact download URL.
- The working fix is to leave the mac job without `ELECTRON_MIRROR` and only set:
  - `ELECTRON_BUILDER_BINARIES_MIRROR=https://github.com/electron-userland/electron-builder-binaries/releases/download/`

Verified:

- `npx tsc --noEmit` passed before push.
- `git diff --check` passed before push.
- GitHub E2E run `25286900416` passed.
- Desktop Release run `25286900540` passed for all desktop platforms.
- Release `desktop-v1.0.0` includes Windows installer/portable, macOS DMG/ZIP, and Linux AppImage.
- `https://www.myprompt.asia/download` returned HTTP 200.

Future caution:

- If someone edits `.github/workflows/desktop-release.yml`, do not put `ELECTRON_MIRROR` back into the mac job unless the dmg-builder artifact URL is checked in the Actions log.
