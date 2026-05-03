# GPT Image 2 Source Integration

This project uses four public GPT Image 2 prompt repositories as external inspiration sources. The full upstream repositories stay outside the app repository to avoid bloating the bundle and mixing large prompt galleries/images into product code.

## Upstream Repositories

- `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts`
- `YouMind-OpenLab/awesome-gpt-image-2`
- `Anil-matcha/Awesome-GPT-Image-2-API-Prompts`
- `wuyoscar/gpt_image_2_skill`

Local synced source root:

```text
E:\AI工作台\资料 Sources\gpt-image-2
```

Manual sync:

```cmd
npm run sources:gpt-image2
```

Shared AI workbench sync:

```cmd
E:\AI工作台\AI-CHAIN.cmd gpt-image2-sync
```

Automatic sync:

```text
.github/workflows/sync-prompt-sources.yml
```

The workflow runs every 6 hours and commits `src/lib/gpt-image-2-source-status.ts` when upstream commit hashes change. That push triggers the normal GitHub/Vercel deployment pipeline, so the website and the next desktop release build use the latest recorded source versions.

## Product Behavior

When the target model is `gpt-image-2`, `/api/generate` now runs a GPT Image 2 source ensemble:

1. Generate four independent candidate prompts, one per upstream strategy.
2. Generate one four-source hybrid prompt.
3. Select up to three strongest available text/reasoning models from the user API setup.
4. Ask those models to score the five candidates.
5. If the best single-source candidate and hybrid are close, synthesize a final improved prompt.
6. Return only the final copy-pasteable GPT Image 2 prompt to the user.

The app does not expose the raw upstream galleries in the final prompt. It uses distilled prompt-engineering strategy:

- EvoLinkAI: task-specific commercial case patterns for e-commerce, ads, portraits, posters, UI/social mockups, character design, and comparisons.
- YouMind: broad taxonomy, category routing, JSON/config-style prompts, exact typography, grids, maps, stickers, UI overlays, and structured visuals.
- Anil-matcha: concise API-ready prompts that stay copy-pasteable and avoid unsupported syntax.
- wuyoscar: craft checklist and gallery routing, including exact text, canvas/layout first, fixed-region schemas, UI product specs, multi-panel consistency, diagram grammar, and edit invariants.

## Rules for Future AI Agents

- Do not upload the full four source repositories into this project.
- Do not copy large prompt galleries or generated image assets into `src/` or `public/`.
- Sync upstream sources before modifying GPT Image 2 behavior.
- If upstream patterns materially change, update the distilled strategy in `src/lib/gpt-image-2-ensemble.ts` and note it in `context/SESSION_LOG.md`.
- Keep source attribution in this context file and avoid presenting upstream community prompts as original work.
