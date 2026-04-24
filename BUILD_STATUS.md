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
- Analyzer audit — `public/pages/analyzer.html` + `client/src/pages/index.tsx` + `client/src/pages/report.tsx`. Palette drift swept, same-color-hover gold buttons fixed, stale upsell prices corrected. Commit `c8133f6`.
- Calculator audit — `/calculator/index.html` (palette + hero + H1 casing) + wire-contract verified against `server/routes.ts::buildCalculatorResultsEmail`. Commit `72d112a`.
- Product + supporting pages :root token restoration — v2→v3 sed over-collapse bug fixed on 7 pages (billing-breakdown, rvu-playbook, negotiation-scripts, bundle, checklist, about, thank-you, pages/thank-you). Commits `a8f5f41`, `8b4deba`.

## In progress
- Homepage data/numbers triple-confirmation pass (IMDATA2026.md-only).

## Next 3 tasks
1. Homepage numeric fact audit — every $ figure, every percentile, every wRVU number verified against `/Users/ambamplify/MedContractIntel/med-contract-ops/state/IMDATA2026.md` or Perplexity triple-source.
2. Responsiveness pass — check mobile/tablet breakpoints on homepage, analyzer (React), calculator, thank-you, checklist.
3. WCAG AA/AAA contrast audit on v3 palette (focus states, muted text, gold-on-dark CTAs).

## Owner-blocked (not in scope to resolve autonomously)
- Domain `medcontractintel.com` CNAME in Cloudflare — DNS currently unbound (DNS returns 0 records).
- Kit sequence 2705057 activation (7 emails approved, 8+ drafts to delete).
- YouTube video `fXy6k0R2x-Y` not set public.
- New sample analysis PDF (homepage CTA currently references EMCI sample).
- Manual delete of 4 unauthorized Kit sequences: 2705600, 2702881, 2706887, 2706901.

## Notes
- GitHub → Railway auto-deploy webhook did NOT fire on commit `cca0575`. Manual `railway up --service med-contract-site --ci` was required. Investigate webhook status on a future pass.
- EMCI residuals (sample PDFs, YouTube embed, `@EMContractIntel` handle) are owner-directed "do not touch — new material coming". Tracked in BLOCKERS.md.
