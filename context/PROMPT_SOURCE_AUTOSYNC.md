# Prompt Source Auto-Sync

This project supports external prompt-engineering source repositories without copying full upstream galleries into the app repository.

## Current Auto-Synced Groups

### GPT Image 2 Sources

- `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts`
- `YouMind-OpenLab/awesome-gpt-image-2`
- `Anil-matcha/Awesome-GPT-Image-2-API-Prompts`
- `wuyoscar/gpt_image_2_skill`

Local source root:

```text
E:\AI工作台\资料 Sources\gpt-image-2
```

Project status:

```text
src/lib/gpt-image-2-source-status.ts
```

### Prompt Library Sources

- `x1xhlol/system-prompts-and-models-of-ai-tools`
- `dair-ai/Prompt-Engineering-Guide`
- `danielmiessler/Fabric`
- `JushBJJ/Mr.-Ranedeer-AI-Tutor`
- `linshenkx/prompt-optimizer`
- `elder-plinius/CL4R1T4S`
- `promptfoo/promptfoo`
- `elder-plinius/L1B3RT4S`
- `Nagi-ovo/gemini-voyager`
- `liyupi/ai-guide`

Local source root:

```text
E:\AI工作台\资料 Sources\prompt-library
```

Project status:

```text
src/lib/prompt-source-library-status.ts
```

This group powers the general prompt-quality rubric and the multi-generator / multi-evaluator scoring flow. Repositories that contain adversarial or leaked prompt material are defensive references only.

Manual sync:

```cmd
E:\AI工作台\AI-CHAIN.cmd gpt-image2-sync
npm run sources:all
```

GitHub auto-sync:

- Workflow: `.github/workflows/sync-prompt-sources.yml`
- Runs every 6 hours and can also be triggered manually.
- Commits only generated source status files when upstream commit hashes change.
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
