# Old vs New Decisions

Decision rule:

- `new`: V3 average core score beats old by at least 0.5 and has no safety or stability regression.
- `old`: Old average core score beats V3 by at least 0.5.
- `hybrid`: Difference is under 0.5, or each side has clearly useful strengths.
- `redesign`: Either side has a core failure, or both are below the required threshold.

Core failure means:

- intent fidelity below 8
- hallucination resistance below 8
- stability below 8
- unclear safety boundary
- cannot be tested

## Initial decisions

| Module | Decision | Reason |
| --- | --- | --- |
| model_registry_classification | hybrid | Old registry has coverage; V3 needs typed capability boundaries. |
| prompt_orchestration | new | Old route handler is too large; V3 service orchestration is cleaner. |
| image_prompt_engine | hybrid | Old GPT Image 2 lessons are valuable; V3 needs dedicated engine. |
| reasoning_code_engine | hybrid | Old technique library is broad; V3 should be smaller and routed. |
| defensive_redteam_engine | new | Old system lacks dedicated safety classifier and defensive closure. |
| strict_scoring | hybrid | Keep dimensions; enforce them in QualityGateService. |
| feedback_loop | hybrid | Keep user choices; make PostgreSQL/server the source of truth. |
| local_test_panel | hybrid | Keep history UX; replace sync with Test Client SDK. |
| pwa_service_worker | old | Guarded registration is safer than aggressive PWA behavior. |
