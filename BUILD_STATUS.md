# med-contract-site — Build Status

**Last updated:** 2026-04-23

## Completed
- Palette v2 migration (dark green + dark gold + teal, zero blue) — commit `cca0575`, deployed via `railway up`.
- Logo recolor — navy interior → `#0f3d2e` across brand-mark-approved.jpg, brand-icon.png, brand_mark.png, brand_symbol.png. `.v1.bak` backups kept.
- `tailwind.config.js` rewritten to v2 tokens.
- `/Users/ambamplify/MedContractIntel/med-contract-ops/state/brand-palette.md` rewritten as authoritative v2 palette (WCAG AA audit inline).
- OG image + YouTube thumbnail Python scripts updated to v2 palette + corrected brand-mark path.
- Stripe live mode wired (5 products, 5 payment links, webhook `we_1TKhobRS3QYs0eSMpSvc4O8u` registered before `express.json()`, lazy init inside handler).
- Build command copies `server/pdfs → dist/server/pdfs`.
- `public/thank-you/` and `public/checklist-thank-you/` are distinct directories.
- Legal pages (disclaimer, terms, privacy, dmca, refund) all production-quality, MedCI-branded, include "not legal advice / not medical advice / not financial advice" disclaimers + AEBMD LLC contact block.

## In progress
- Homepage audit (`public/index.html`) — palette consistency, grammar pass, EMCI residual link sweep.

## Next 3 tasks
1. Homepage audit + fix.
2. Analyzer page (`/app` + `/pages/analyzer.html`) audit.
3. Calculator page (`/calculator/index.html`) audit — verify palette, form field names match `server/routes.ts` (`hourly`, `comp`, `profRev`, `facRev`, `share`, `wrvus`), email delivery wired.

## Owner-blocked (not in scope to resolve autonomously)
- Domain `medcontractintel.com` CNAME in Cloudflare — DNS currently unbound (DNS returns 0 records).
- Kit sequence 2705057 activation (7 emails approved, 8+ drafts to delete).
- YouTube video `fXy6k0R2x-Y` not set public.
- New sample analysis PDF (homepage CTA currently references EMCI sample).
- Manual delete of 4 unauthorized Kit sequences: 2705600, 2702881, 2706887, 2706901.

## Notes
- GitHub → Railway auto-deploy webhook did NOT fire on commit `cca0575`. Manual `railway up --service med-contract-site --ci` was required. Investigate webhook status on a future pass.
- EMCI residuals (sample PDFs, YouTube embed, `@EMContractIntel` handle) are owner-directed "do not touch — new material coming". Tracked in BLOCKERS.md.
