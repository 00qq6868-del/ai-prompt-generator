# Prompt Library Source Group

This source group is separate from the GPT Image 2 source group.

## Upstream Repositories

The current tracked general prompt-quality sources are:

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

Local copies are kept outside the app repository:

```text
E:\AI工作台\资料 Sources\prompt-library
```

The committed app status file is:

```text
src/lib/prompt-source-library-status.ts
```

## How It Is Used

These repositories are used to maintain a scoring rubric for prompt quality and to give future AI agents a clear source map for deeper improvements.

The live generation flow now supports:

- multiple generator models, up to 6
- optional manual judge/evaluator models, up to 6
- 0-100 scoring
- visible score bars in the result panel
- automatic fallback judge selection when the user does not manually choose evaluators

The current rubric emphasizes:

- intent fidelity
- task decomposition
- context engineering
- specificity and controllability
- target-model fit
- output usability
- evaluation readiness
- hallucination and safety control
- efficiency

## Safety Boundary

Some source repositories contain leaked prompts, adversarial prompts, or jailbreak-like material.

Use those repositories only for defensive evaluation:

- detect prompt-injection risk
- avoid unsafe instruction patterns
- improve refusal and boundary handling
- compare robustness

Do not copy jailbreak payloads or system-prompt exfiltration text into the optimizer output.

## Sync Workflow

Run manually:

```bash
npm run sources:prompt-library
```

Run all prompt source sync tasks:

```bash
npm run sources:all
```

GitHub Actions checks the prompt sources every 6 hours using:

```text
.github/workflows/sync-prompt-sources.yml
```

If upstream commits change, the workflow commits only the generated source-status files. The full upstream repositories remain outside the app bundle.

## Future AI Handoff

When a stronger future AI works on this project:

1. Read `AGENTS.md`, `CLAUDE.md`, and all files in `context/`.
2. Run `npm run sources:all` to refresh upstream source commits.
3. Compare current prompt quality against the rubric in `src/lib/prompt-source-library-status.ts`.
4. Add new source groups separately instead of mixing unrelated domains.
5. Preserve the old working version before changing generation logic.
6. Run `npx tsc --noEmit`, `npm run build`, and Playwright tests before pushing.
