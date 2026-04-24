# NEXT_ACTION

**Current:** Audit homepage `public/index.html` for (a) v2 palette consistency, (b) grammar/copy bugs, (c) EMCI residual links that block production quality, (d) any placeholder Stripe IDs. Fix all items that don't require new numeric data. Log to CHANGELOG.md.

**Why this is highest-value right now:**
- Legal pages already production-quality (disclaimer/terms/privacy/dmca/refund all verified 2026-04-23).
- Build script already copies `server/pdfs → dist/server/pdfs`.
- `checklist-thank-you/` is already separate from `thank-you/`.
- Stripe webhook is already lazily-initialized inside the handler.
- Password gate claim in CLAUDE.md is stale — no gate exists in `server/index.ts`.
- Homepage is the primary conversion surface and has known palette-migration fallout + unreviewed copy from v1.

**After this:** audit `/app` analyzer page, then `/calculator`, then `/thank-you`, then `/checklist-thank-you`.
