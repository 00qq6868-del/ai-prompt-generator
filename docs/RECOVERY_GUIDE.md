# Domain & Service Recovery Guide

## Domain: myprompt.asia

- **Registrar**: Check with the owner
- **Expiry**: 2027 (approximate)
- **DNS**: Points to Vercel

### If Domain Expires

1. **Immediate**: The site is still live at the Vercel project URL (check Vercel dashboard)
2. **Short-term**: Add a new domain in Vercel → Settings → Domains
3. **Long-term**: Renew or register a new domain, update DNS to point to Vercel

### If Vercel Deployment Breaks

1. Check build logs at vercel.com dashboard
2. Common issues:
   - TypeScript errors: run `npx tsc --noEmit` locally
   - Missing env vars: check Vercel → Settings → Environment Variables
   - Build timeout: check for large assets or infinite loops in build scripts

## GitHub Actions (Model Auto-Update)

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `AIHUBMIX_API_KEY` | Primary — fetches 200+ models from relay |
| `GOOGLE_API_KEY` | Google Gemini models |
| `OPENAI_API_KEY` | Optional — OpenAI models |
| `ANTHROPIC_API_KEY` | Optional — Anthropic models |

### If Auto-Update Stops Working

1. Check Actions tab for errors
2. Verify secrets haven't expired (API keys rotate)
3. Check if the model listing API endpoints have changed
4. Run manually: Actions → "Auto Update Models" → "Run workflow"

## Model Data Recovery

If `public/models.json` is corrupted:
1. The app falls back to `BUNDLED_MODELS` in `src/lib/models-registry.ts` (25 models)
2. To regenerate: run `node .github/scripts/fetch-models.mjs` with appropriate API keys
3. Or revert to the last good commit: `git checkout HEAD~1 -- public/models.json`

## Environment Variables for Local Dev

Create `.env.local` with any of these (all optional — at least one needed for generation):

```
AIHUBMIX_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
```
