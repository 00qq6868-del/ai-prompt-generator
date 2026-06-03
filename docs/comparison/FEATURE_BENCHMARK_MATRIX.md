# V3 Feature Benchmark Matrix

This matrix prevents subjective rewrites. Each module must compare old behavior, new candidate behavior, and hybrid options before final adoption.

| Module | Old baseline | V3 candidate | Required cases | Current decision | Notes |
| --- | --- | --- | --- | --- | --- |
| model_registry_classification | Old `models-registry` + patched `models.json` | Typed V3 registry with explicit capability tags | `model-registry-basic`, `relay-alias-visibility` | hybrid | Keep old coverage; rewrite typed boundaries. |
| model_auto_recommend_lock | Old browser persistence + manual lock | Server-first preference with local cache | `manual-model-lock-refresh`, `image-idea-auto-gpt-image` | hybrid | Keep UX; move source of truth server-side. |
| provider_adapters | Old provider adapters | V3 adapter interface with health/cost tracing | `slow-model-does-not-abort`, `relay-502-skip` | hybrid | Keep provider knowledge; rewrite orchestration. |
| prompt_orchestration | Old generate route + tournament | V3 PromptOrchestrator service | `multi-generator-selection`, `quality-rewrite-on-low-score` | new | Old route too large; keep tournament lessons. |
| image_prompt_engine | Old GPT Image 2 ensemble prompt logic | Dedicated ImagePromptEngine | `image-hands-text-reference-strict`, `commercial-poster-quality` | hybrid | New structure; old failed dimensions. |
| reasoning_code_engine | Old text module | Dedicated ReasoningCodePromptEngine | `code-refactor-no-hallucinated-files`, `architecture-decision-tot` | hybrid | Preserve broad technique library; reduce giant prompt. |
| defensive_redteam_engine | No dedicated old engine | Dedicated DefensiveRedTeamPromptEngine | `redteam-defensive-sqli`, `redteam-disallowed-exploit` | new | New safety classifier required. |
| strict_scoring | Old 11 prompt + 10 image dimensions | QualityGateService + evaluator/deterministic mix | `score-inflation-hands-text`, `intent-fidelity-low-rewrite` | hybrid | Keep dimensions; improve enforcement. |
| feedback_loop | Old feedback API + local memory | Server-first FeedbackLoopService | `low-score-triggers-optimization`, `blend-needed-synthetic` | hybrid | Keep UX choices; server source of truth. |
| version_compare | Old prompt_versions compare/decision | V3 PromptVersionService | `abc-compare-synthetic`, `old-better-retains-old` | hybrid | Keep semantics; typed service. |
| local_test_panel | Old GPT Image 2 panel | V3 Test Client SDK + rebuilt panel | `offline-feedback-flush`, `empty-model-list-not-blocking` | hybrid | Keep history UX; replace sync. |
| github_dataset_export | Old JSONL export | V3 DatasetExportService + privacy gate | `no-secrets-jsonl`, `dataset-schema-valid` | hybrid | Keep directories; add validation. |
| rate_limit_security | Old rate limit + safe URL | V3 middleware/service guard | `probe-blocks-private-url`, `generate-rate-limit` | hybrid | Keep proven guards; centralize. |
| anti_hallucination_guard | Workbench guard | V3 Quality + workbench guard integration | `factual-unknown-not-guessed`, `generated-script-check` | hybrid | Local guard remains external support. |
| e2e_quality | Old Playwright regressions | V3 golden/regression E2E | `model-picker-drag-click`, `pwa-no-registration-crash` | hybrid | Preserve every old bug as regression. |
| pwa_service_worker | Old guarded registration | V3 opt-in PWA | `service-worker-no-undefined-waiting` | old | Old guarded approach is safer initially. |
| storage_fallback | Old Postgres/local-json | V3 Postgres primary + dev fallback | `postgres-local-parity`, `local-json-not-main-memory` | hybrid | Keep fallback; demote localStorage. |
| docker_compose | Old compose with web/postgres/redis/worker | V3 compose from day one | `compose-up-health` | new | Rebuild clean, preserve service list. |
| ci_cd_smoke | Old Actions + smoke scripts | V3 CI gate | `typecheck-build-e2e-smoke` | hybrid | Keep smoke lessons; rewrite paths. |
