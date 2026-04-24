# med-contract-site — Changelog

## 2026-04-23

- **16:40** — Established website-only status loop: added `BUILD_STATUS.md`, `NEXT_ACTION.md`, `BLOCKERS.md`, `CHANGELOG.md`. Confirmed production-quality preconditions: build copies `server/pdfs`, thank-you pages are separate, Stripe webhook is lazy inside handler, no placeholder product IDs, legal pages complete with AEBMD LLC disclaimers.
- **Earlier today** — Palette v2 migration deployed (`cca0575`). Logo recolored (navy interior → `#0f3d2e`). OG/thumbnail generators fixed. Authoritative palette doc rewritten at `../med-contract-ops/state/brand-palette.md`.

_Entries above reconstructed from prior session context; earlier days tracked in `../med-contract-ops/BUILD_STATUS.md`._

## 2026-04-23 (PM — palette v3)

- Palette v3 deployed (`a996acd`). Single-tier primary `#0a2d20` + bronzed gold `#9c7e2e` + vivid teal `#1db5b5` + warm cream `#f7f4ec`. Multi-green contrast issue resolved by collapsing `#0f3d2e` and `#1f6e43` into one primary. Logo navy interior recolored to match banner primary.

## 2026-04-24

- **Analyzer audit** (`c8133f6`): `public/pages/analyzer.html` CSS vars rewritten to full v3 palette; hero gets radial center-lift + bottom cream fade; H1 sentence-case. React analyzer form (`client/src/pages/index.tsx`) gold CTA hover fixed (was self-noop, now `#6e5a20`). `report.tsx` palette drift swept: `#d4b85c → #b89a3e`, `#0f4f3a → #0a2d20`, `#28b0a3 → #189696`, `#fdf8ed → #f7f4ec`; 3× same-color-hover gold buttons corrected.
- **Pricing fixes** in `report.tsx` upsell cards: Shift Economics button showed $47 (text drift on $37 link) → $37; bottom PDF-bundle upsell $247/$311 crossed → $197/$248 crossed, stripe link retargeted to live Complete Bundle (archived PDF-only link `6oU28tb…ZK08` replaced with `eVq28tf…ZK0a`) — aligns with CLAUDE.md canonical pricing table.
- **Calculator audit** (`72d112a`): `/calculator/index.html` H1 title sentence-cased; hero upgraded to radial center-lift + cream-fade matching homepage/analyzer. Form field wire contract verified: frontend sends `{email, tag, results:{annualComp, effectiveHourly, groupRevenue, gapVsMedian}}`; backend `buildCalculatorResultsEmail()` reads same keys (with legacy fallbacks). CLAUDE.md calculator field list is stale — flagged for later correction.
- **Product pages + checklist/about/thank-you :root sweep** (`a8f5f41`, `8b4deba`): v2→v3 sed migration had over-collapsed `--teal` to equal `--navy` and `--gold-hover` to equal `--gold` across 7 pages (4 product + checklist + about + thank-you root + pages/thank-you). Restored proper v3 tokens: `--navy-dark=#051a12`, `--gold-hover=#6e5a20`, `--teal=#1db5b5`, `--teal-light=#2dd4bf`, `+--cream=#f7f4ec`. Fixed billing-breakdown `.btn-teal:hover` stale `#155858 → #189696`; thank-you analyzer-credit-banner gradient stale `#0a3d2e/#0f4f3a → #0a2d20/#051a12`.
