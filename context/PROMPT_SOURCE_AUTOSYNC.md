# Prompt Source Auto-Sync

This project supports external prompt-engineering source repositories without copying full upstream galleries into the app repository.

## Current Auto-Synced Group

GPT Image 2 sources:

- `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts`
- `YouMind-OpenLab/awesome-gpt-image-2`
- `Anil-matcha/Awesome-GPT-Image-2-API-Prompts`
- `wuyoscar/gpt_image_2_skill`

Local source root:

```text
E:\AI工作台\资料 Sources\gpt-image-2
```

Manual sync:

```cmd
E:\AI工作台\AI-CHAIN.cmd gpt-image2-sync
npm run sources:gpt-image2
```

GitHub auto-sync:

- Workflow: `.github/workflows/sync-prompt-sources.yml`
- Runs every 6 hours and can also be triggered manually.
- Commits only `src/lib/gpt-image-2-source-status.ts` when upstream commit hashes change.
- The commit triggers the normal GitHub/Vercel pipeline so the website and next desktop build use the latest recorded source versions.

## Rule

Do not copy full external repositories, screenshots, prompt galleries, or generated images into `src/` or `public/`.

The safe pattern is:

1. Sync upstream repositories outside the app bundle.
2. Record source commits in a small TypeScript status module.
3. Distill reusable prompt strategy into app code.
4. Update context files so future AI windows know where the source came from.

## Adding Future Prompt Source Groups

When the user finds more GitHub projects for prompt optimization:

1. Create a new external source folder under:

```text
E:\AI工作台\资料 Sources\<source-group-id>
```

2. Add a sync script under `scripts/`, following `scripts/sync-gpt-image2-sources.cjs`.
3. Generate a small `src/lib/<source-group-id>-source-status.ts` file with commit hashes.
4. Add a package script, for example:

```json
"sources:<source-group-id>": "node scripts/sync-<source-group-id>-sources.cjs"
```

5. Extend `.github/workflows/sync-prompt-sources.yml` or add a matching workflow.
6. Distill strategy into code only after reading the upstream changes.
7. Run typecheck, build, and Playwright before pushing.

Do not blindly merge unrelated source strategies. Keep each source group separate until the optimizer intentionally compares or ensembles them.
