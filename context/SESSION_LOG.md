# Session Log

> This file records each AI session's work for seamless handoff between sessions.
> New sessions should read this first to understand where work left off.

---

## Codex Safety Setup — 2026-05-01 (Codex)

### What was done

Created a separate Codex-safe worktree so Codex can inspect, evaluate, and implement without overwriting Claude's local workspace.

### Workspaces

- Claude/original workspace: `E:\vscode Claude\ai-prompt-generator`
- Codex workspace: `E:\AI工作台\项目 Projects\ai-prompt-generator-codex`

### Git state found

- Claude/original workspace was on `main` at `b44163d`, behind `origin/main` by 2 commits.
- Claude/original workspace had local uncommitted/generated changes:
  - `public/sw.js`
  - `tsconfig.tsbuildinfo`
  - `.claude/`
  - `public/*.map`
  - `public/workbox-7144475a.js`
- Codex worktree was created from GitHub latest `origin/main` at `c009e0e`.

### Safety branches/files

- Backup branch: `backup/claude-main-20260501-232542`
- Codex branch: `codex/safe-audit-20260501-232542`
- Added `AGENTS.md`
- Added `context/CODEX_HANDOFF.md`

### Rule for future sessions

Read `AGENTS.md` and `context/CODEX_HANDOFF.md` before editing. Do not touch the Claude workspace unless explicitly approved by the user.

---

## Session #4 — 2026-04-30 (Claude Sonnet 4.6, Claude Code)

### 9 tasks completed and pushed to GitHub:

| Commit | Task |
|--------|------|
| `0e9f176` | 依赖升级 + npmmirror 镜像 |
| `0368e29` | Provider 安全加固 + WCAG a11y + ModelSelector 搜索排序 |
| `5506383` | BUNDLED_MODELS 添加 GPT-5-Pro + Qwen3-235B |
| `1254671` | BUNDLED_MODELS 添加 GPT-Image-2 |
| `cbcbf99` | 模型更新流水线：retry + 健康检查 + Issue 通知 |
| `aa89818` | Electron：托盘 + macOS DMG + 自启 + 窗口记忆 + 自动更新 |
| `1e64dc0` | PWA：离线页 + 缓存策略 + 安装/更新提示 |
| `28161d3` | 性能监控：Web Vitals + ErrorBoundary + analytics API |

### Pending for next session:
1. **prompt-optimizer.ts Phase 2/3** — 全模态 SYSTEM_PROMPT 重写（plan 已就绪：`C:\Users\zero\.claude\plans\floating-conjuring-treasure.md`）
2. **trackApiCall/trackTTFT 接入** — 在 PromptGenerator.tsx 的 fetch/SSE 处调用
3. **颜色对比度** — text-white/30 → text-white/45（WCAG AA）

---

## Session #3 — 2026-04-26 (Claude Sonnet 4.6, Claude Code)

### What was done
7-task comprehensive upgrade, all verified with `npx tsc --noEmit` and `npm run build`:

1. **Provider name consistency**: ModelPicker "深度求索"→"DeepSeek", ModelSelector added "Ollama" tab
2. **BUNDLED_MODELS expanded**: 25→35 models. Added gpt-4.1 family, gemini-2.5-flash, llama-4 family, claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5, grok-4
3. **mergeWithExisting() safety fix**: Rewrote to Map-based "only add, never delete" strategy with 20% shrink warning
4. **GENERATOR_AFFINITY**: New export in models-registry.ts (13 prefix rules). PromptGenerator.tsx selectBestFromProbe uses affinity-first, then scoreModel fallback
5. **prompt-optimizer.ts v4**: estimateTokens() now CJK-aware, SYSTEM_PROMPT expanded with reverse engineering, grounded persona, prompt chaining, anti-hallucination guards, adaptive verbosity. Model tuning updated to latest models
6. **Auto-update safety**: fetch-models.mjs main() aborts on 0 models fetched. patch-models.cjs added claude-haiku-4-5 META
7. **UI copy fixes**: Header "250+ 大模型", 3 bilingual toast messages in PromptGenerator

### Files modified
- `src/lib/models-registry.ts` — BUNDLED_MODELS +10 models, GENERATOR_AFFINITY export
- `src/lib/prompt-optimizer.ts` — v4 rewrite
- `src/components/PromptGenerator.tsx` — GENERATOR_AFFINITY integration, bilingual toasts
- `src/components/ModelPicker.tsx` — "DeepSeek" provider tab
- `src/components/ModelSelector.tsx` — "Ollama" tab
- `src/components/Header.tsx` — "250+" copy
- `.github/scripts/fetch-models.mjs` — mergeWithExisting rewrite, safety guards
- `scripts/patch-models.cjs` — claude-haiku-4-5 META

### State at end of session
- All changes committed and pushed to GitHub
- Build passes with 0 errors
- Vercel should auto-deploy from `main`

---

## Session #2 — 2026-04-24 (Claude Sonnet 4.6, Claude Code)

### What was done
1. Resolved git rebase merge conflict in `public/models.json` (caused by GitHub Actions auto-update during our work)
2. Re-ran `node scripts/patch-models.cjs` on merged data: 134/251 models patched
3. Successfully pushed all changes to GitHub (commit `1b89bd1`)
4. Created persistent context system:
   - `context/PROGRESS.md` — task progress tracker
   - `context/MEMORIES.md` — all memories and decisions
   - `context/SESSION_LOG.md` — this file
   - Updated `CLAUDE.md` with cross-session instructions
   - Created `scripts/save-context.sh` for one-click context save

### State at end of session
- All core fixes deployed and pushed
- Vercel should auto-deploy from `main`
- 251 models in models.json, 134 with META data
- 8 non-text models correctly classified (3 image, 5 tts)

### What to verify next
- Check https://www.myprompt.asia to confirm deployment
- `/api/models` should return 251+ models
- Non-text models should appear in target model selector

---

## Session #1 — 2026-04-23 (Claude Sonnet 4.6, Claude Code)

### What was done
1. **Model system overhaul**:
   - Expanded META from 8 to 55+ entries in `fetch-models.mjs`
   - Created `lookupMeta()` with prefix matching
   - Enhanced `classifyModel()` for image/video/tts/stt/embedding/ocr
   - Added category tabs to ModelSelector (target shows all types)
   - ModelPicker filters generator to `category === "text"` only

2. **Root cause fix for "auto-update has no effect"**:
   - Discovered `model-cache.ts` never read `public/models.json` without `MODELS_REGISTRY_URL`
   - Added local file reading as second tier fallback
   - This was THE fix — without it, 239 models were invisible

3. **Bug fixes**:
   - `fetchAnthropic` using `META[m.id]` instead of `lookupMeta(m.id)`
   - Missing `category` field in fetchGoogle/fetchOpenAI/fetchAnthropic
   - OpenAI KEEP regex missing `gpt-5` pattern
   - gpt-4o pricing wrong (5→2.5 input, 15→10 output)

4. **Post-processing**:
   - Created `scripts/patch-models.cjs` for one-time META application
   - Ran it: 115/239 → later 134/251 models patched

5. **Other improvements**:
   - `selectBestFromProbe` adapts scoring mode by target category
   - KeysSettings clears probe cache on save
   - GitHub Actions cron: 6 hours → 2 hours
   - Added `SYSTEM_STATE.json` generation in workflow
   - Bilingual error messages (中文/English)

### Git conflict resolution
- GitHub Actions committed auto-updates while we were working
- Rebase failed with conflict in `public/models.json`
- Resolved with `git pull --no-rebase -X ours` then re-patched

### Key commits
- `da7163e` feat: 全面改造模型系统
- `ef3810a` fix: 修复自动更新模型无效的根本原因
- `1b89bd1` chore: re-patch models.json after merge
