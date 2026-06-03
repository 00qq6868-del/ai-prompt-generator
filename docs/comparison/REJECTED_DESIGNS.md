# Rejected Designs

| Design | Rejection reason | Replacement |
| --- | --- | --- |
| Single giant prompt optimizer for every modality | Hard to test, hard to score, high drift risk | Routed engines per modality |
| Browser localStorage as primary feedback memory | Data silo, not reliable across devices | PostgreSQL primary, local cache only |
| Route handlers containing orchestration logic | Difficult to test and compare | Service-layer PromptOrchestrator |
| Blindly copying old prompt templates | Old strengths mixed with old bugs | Comparison Lab + golden cases |
| Blindly trusting new V3 templates | New does not mean better | Old/new/hybrid benchmark |
| Aggressive PWA service worker by default | Prior production errors and cache interference | Guarded opt-in registration |
| GitHub export without privacy validation | Risk of leaking secrets or private data | DatasetExportService privacy gate |
