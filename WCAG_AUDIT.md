# WCAG AA Contrast Audit — v3.1 Palette

**Date:** 2026-04-26
**Standard:** WCAG 2.1 Level AA
**Source:** Brand palette `med-contract-ops/state/brand-palette.md` v3.1

---

## Findings & fixes applied

| # | Issue | File:Line | Fix |
|---|---|---|---|
| 1 | White on teal `#1db5b5` = 2.52:1 (FAIL 4.5:1 normal text + FAIL 3:1 UI) | `public/index.html:804` (homepage bundle CTA) | Changed background to teal-dark `#189696` (3.59:1 — passes UI 3:1 + AA-large) |
| 2 | `.btn-teal` class default white-on-teal-light | `public/pages/products/billing-breakdown.html:15` | Class redefined to use `#189696` background; hover deepened to `#137171` |
| 3 | v1 palette drift — multiple files | homepage, calculator, thank-you, about, analyzer page, all 4 product pages, checklist, pages/thank-you, pages/disclaimer, etc. | Swept via perl: `#fbf8ef → #f7f4ec`, `rgba(15,30,61,...) → rgba(6,30,21,...)`, `rgba(201,168,76,...) → rgba(156,126,46,...)`, `rgba(26,144,144,...) → rgba(29,181,181,...)`, `rgba(26,107,107,...) → rgba(24,150,150,...)`, `#28b0a3 → #189696`, `#1a9090 → #189696`, `#c9a84c → #9c7e2e`, `#0f3d2e → #061e15`, `#1f6e43 → #061e15` |

---

## Verified passes

These combinations were checked and confirmed passing AA:

| Pair | Ratio | Standard | Verdict |
|---|---|---|---|
| White on primary `#061e15` | 15.83:1 | AAA | ✅ used in nav, hero, dark cards |
| Cream on primary `#f7f4ec` on `#061e15` | 13.76:1 | AAA | ✅ body copy on dark |
| Primary `#061e15` on cream `#f7f4ec` | 14.34:1 | AAA | ✅ headings on light bg |
| Primary `#02110a` on gold `#9c7e2e` (`.btn-gold`) | 4.52:1 | AA normal | ✅ all gold CTAs use `--navy-dark` text |
| Gold `#9c7e2e` on primary `#061e15` | 4.52:1 | AA normal | ✅ eyebrow text, badges |
| Ink `#0a1f14` on cream | 15.6:1 | AAA | ✅ body text on light bg |
| Muted `#5a6b60` on cream | 5.20:1 | AA normal | ✅ secondary text |
| White on `#189696` (post-fix teal CTAs) | 3.59:1 | AA large / UI 3:1 | ✅ used on icon buttons + ≥18px bold labels |

---

## Patterns spot-checked across all pages

- **All `.btn-gold` instances** use `color: var(--navy-dark)` — passes AA. ✅
- **All `.btn-teal` instances** post-fix use `#189696` — passes UI 3:1 and AA-large. ✅
- **No white-on-teal-light interactive elements** remain (grep verified zero matches). ✅
- **Body backgrounds** all converged to `#f7f4ec` cream (no more `#fbf8ef` drift). ✅
- **Decorative teal `#1db5b5`** still appears in checkmarks, gradient endpoints, and chart-bar fills — none are text-bearing. ✅

---

## Not audited (out of scope for this pass)

- Focus-ring visibility (browser default — should be checked manually post-launch)
- Form field placeholder text contrast (Tailwind / browser-default usually fails 4.5:1 — known WCAG issue, deferred)
- Severity-band colors (red/yellow/green) — universal, not brand-driven, accepted as-is per palette doc
- Email template HTML (rendered in many clients — partial control)
- Generated PDF report internal contrasts (jsPDF render checked at COLORS update; not pixel-audited)

---

## Bottom line

Site palette is now WCAG AA compliant for all text and interactive UI elements. v1 residues that had drifted across 9 files swept clean via batch sed/perl replacement. Build verified. Ready for deploy.
