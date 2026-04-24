# med-contract-site — Build Status

**Last updated:** 2026-04-24

## Completed
- Palette v3 migration (single-tier primary `#0a2d20` + bronzed gold `#9c7e2e` + vivid teal `#1db5b5` + warm cream `#f7f4ec`) — commits `a996acd` → `c8133f6`.
- Logo recolor — navy interior → `#0a2d20` across brand-mark-approved.jpg, brand-icon.png, brand_mark.png, brand_symbol.png. `.v1.bak` backups kept.
- `tailwind.config.js` rewritten to v3 tokens.
- `/Users/ambamplify/MedContractIntel/med-contract-ops/state/brand-palette.md` rewritten as authoritative palette doc.
- OG image + YouTube thumbnail Python scripts updated + corrected brand-mark path.
- Stripe live mode wired (5 products, 5 payment links, webhook `we_1TKhobRS3QYs0eSMpSvc4O8u` registered before `express.json()`, lazy init inside handler).
- Build command copies `server/pdfs → dist/server/pdfs`.
- `public/thank-you/` and `public/checklist-thank-you/` are distinct directories.
- Legal pages (disclaimer, terms, privacy, dmca, refund) all production-quality, MedCI-branded, include "not legal advice / not medical advice / not financial advice" disclaimers + AEBMD LLC contact block.
- Homepage audit (`public/index.html`) — palette + grammar pass + blend-from-cream transitions on all dark sections.
- Analyzer audit — `public/pages/analyzer.html` (static product page) + `client/src/pages/index.tsx` (React form) + `client/src/pages/report.tsx` (React report). Palette drift swept, 3× same-color-hover gold buttons fixed, stale upsell prices ($47 text on $37 product; $247/$311 crossed on 3-PDF bundle) corrected to CLAUDE.md canonical ($37 and $197/$248). Commit `c8133f6`.

## In progress
- Calculator page audit (`/calculator/index.html` + `server/routes.ts`).

## Next 3 tasks
1. Calculator page audit — palette verify, form field names match `server/routes.ts` handler (`hourly`, `comp`, `profRev`, `facRev`, `share`, `wrvus`), email delivery wired.
2. Product pages palette sweep (`public/pages/products/*.html`: billing-breakdown, rvu-playbook, negotiation-scripts, bundle).
3. Checklist + thank-you + about pages palette/grammar/legal-footer pass.

## Owner-blocked (not in scope to resolve autonomously)
- Domain `medcontractintel.com` CNAME in Cloudflare — DNS currently unbound (DNS returns 0 records).
- Kit sequence 2705057 activation (7 emails approved, 8+ drafts to delete).
- YouTube video `fXy6k0R2x-Y` not set public.
- New sample analysis PDF (homepage CTA currently references EMCI sample).
- Manual delete of 4 unauthorized Kit sequences: 2705600, 2702881, 2706887, 2706901.

## Notes
- GitHub → Railway auto-deploy webhook did NOT fire on commit `cca0575`. Manual `railway up --service med-contract-site --ci` was required. Investigate webhook status on a future pass.
- EMCI residuals (sample PDFs, YouTube embed, `@EMContractIntel` handle) are owner-directed "do not touch — new material coming". Tracked in BLOCKERS.md.
