# Hybrid Design Records

## Image prompt engine

Accepted from old:

- GPT Image 2 specific failed dimensions: hands, face, text rendering, reference similarity, proportions, lighting, commercial finish.
- Strict scoring calibration: do not give high scores just because the image is pretty.
- Multi-model candidate/judge concept.

Accepted from new:

- Dedicated engine with stable sections.
- Explicit negative prompt and model parameter output.
- Quality checklist generated every time.

Rejected:

- One giant multi-modal system prompt.
- Vague quality terms without measurable constraints.

## Feedback loop

Accepted from old:

- User choices: new better, old better, blend, both bad.
- Browser-local resilience and immediate UI feedback.

Accepted from new:

- Server-first source of truth.
- Idempotent event sync.
- Optimization trigger stored as durable job.

Rejected:

- localStorage as the primary learning memory.
