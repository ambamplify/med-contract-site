# MedContractIntel — Numeric Claims Audit

**Date:** 2026-04-26
**Source of truth:** `med-contract-content/ops/IM_DATA_2026.md`
**Auditor:** Claude (autonomous pre-launch pass)

Every dollar figure, percentile, and wRVU number that appears on the public site is listed below with its source status.

---

## Legend

- ✅ **Verified** — value matches IM_DATA_2026.md exactly or is a transparent derivation
- ⚠ **Owner verify** — claim is plausible/defensible but doesn't trace cleanly; needs owner sign-off or source addition
- ❌ **Bug** — claim contradicts IM_DATA, contains math errors, or is internally inconsistent
- 🚩 **Testimonial** — quoted speech; needs to be a real customer quote or relabeled as illustrative

---

## Homepage (`public/index.html`)

| Line | Claim | Status | Notes |
|---|---|---|---|
| 494 | "$26.50/wRVU → 25th percentile is $52/wRVU" | ⚠ | IM_DATA says hospitalist median ~$320K. At 6,000 wRVU that's $53.33/wRVU median, not 25th. 25th would be ~$46.50/wRVU. **$52 likely overstates the 25th percentile** — owner: confirm or change to $46. |
| 496 | "$194,150/year gap • $582,450 over 3 years" | ❌ | Math doesn't reconcile. ($52 − $26.50) × 6,000 wRVU = **$153,000**, not $194,150. The $194K figure implies ~7,613 wRVU production, not the 6,000 cited elsewhere. **Either change gap to $153K or change wRVU to 7,613 (and update 3-yr to 3× the gap).** |
| 547 | "APC Shared RVU Credit — 25% Is Far Below Market — estimated $75,900/year" | ⚠ | Illustrative scenario; IM_DATA doesn't track APC shared-RVU benchmarks explicitly. Defensible as a hypothetical but should be marked as such. |
| 551 | "$20,000–$30,000/year" APC supervision stipend ask | ⚠ | Illustrative negotiation ask. Not in IM_DATA. Defensible. |
| 660 | "6,000 wRVUs produces roughly $333,000 in professional fee revenue" | ⚠ | At Medicare CF $33.40, 6,000 wRVU = $200,400. To reach $333K requires a ~1.66× weighted commercial mix. IM_DATA shows commercial:Medicare ratio for hospitalists at 1.1–1.3× (line 188). **$333K appears high; defensible $266K (1.33× × 200K) is closer.** |
| 687 | "25th / median / 75th percentile for your employer type" | ✅ | Methodology claim, no specific number. |
| 878 | "RVU multiplier was $21 below market median... $120k/year... got to $56/wRVU" | 🚩 | Self-described "Internal Medicine & Hospitalist Attending" testimonial. $56/wRVU = current; minus $21 = $35/wRVU original; $21 × 6,000 = $126K (close to $120K). **Math works but: is this a real customer quote or composite?** If composite, label as "illustrative" or remove. |

## About page (`public/about/index.html`)

| Line | Claim | Status | Notes |
|---|---|---|---|
| 147 | "$21/wRVU below median... at 6,000 wRVUs that's $120,000" | ⚠ | Math is correct internally. But "average IM/hospitalist working for a national staffing company earns $21/wRVU below median" is a strong factual claim with no source in IM_DATA. **Owner: source this or soften to "many" / "commonly".** |

## Calculator (`public/calculator/index.html`)

| Line | Claim | Status | Notes |
|---|---|---|---|
| 32 / 875 | "2026 non-QP Medicare CF: $33.40" | ✅ | Exact match to IM_DATA line 32. |
| 721 | "MGMA 2025 Median: $222/hr" | ❌ | **Mislabeled.** $222/hr × 2,184 typical hospitalist hours = $485K/yr (75th–90th percentile, not median). The actual MGMA-aligned median is ~$146/hr ($320K ÷ 2,184). **$222/hr matches the locum hospitalist midpoint** ($180–$260 from IM_DATA line 131). **Either relabel as "Locum 2025 midpoint" or change to ~$146/hr employed median.** |
| 876 | "Commercial: 1.8x Medicare post-NSA" | ⚠ | IM_DATA line 188 says hospitalist commercial:Medicare = 1.1–1.3×. **1.8× contradicts IM_DATA.** Owner: confirm which is right. |

## Product pages

| File | Claim | Status | Notes |
|---|---|---|---|
| `rvu-playbook.html` line 62 | "$20/wRVU difference = $120,000/year at median IM + hospitalist production" | ⚠ | $120,000 / $20 = 6,000 wRVU. Internally consistent with the rest of the site. Plausible. |
| `negotiation-scripts.html` line 64 | "$X/wRVU shortfall... market median conversion factor is $Y" | ✅ | All values are template placeholders `[X]`, `[Y]`, `[gap]` — no committed numbers. |

---

## Most-urgent fixes (rank-ordered by liability)

1. **Homepage line 494/496** — the $194,150 gap math. Buyer with a calculator will catch this in 30 seconds. **High chargeback risk.**
2. **Calculator line 721** — "$222/hr MGMA Median" is wrong; either relabel as locum or change to $146 employed median. **Direct misrepresentation of MGMA data.**
3. **Calculator line 876** — 1.8× commercial multiplier contradicts our own data file. **Pick one: either correct the comment or correct IM_DATA.**
4. **Homepage line 660** — $333K from 6,000 wRVU implies revenue multiplier well above what IM_DATA says hospitalists actually achieve. **Soften to "$200K–$300K depending on payer mix."**
5. **Homepage line 878 testimonial** — confirm real customer or remove/relabel. **Compliance + FTC endorsement-rule risk if invented.**
6. **Homepage line 494** — $52/wRVU as 25th percentile likely overstated. **Soften to $46 or add "in some markets" qualifier.**
7. **About line 147** — "$21/wRVU below median" claim about staffing companies — needs source or hedge.

---

## What does NOT need fixing

- Calculator $33.40 CF ✅
- Stripe prices ($37/$47/$67/$97/$197) — verified in CLAUDE.md, all correct
- Bundle savings math ($248 sum, $51 saved, $197 bundle) — checks out
- Footer / legal page numerics (none)
- Negotiation script placeholder values ($[X], $[Y]) — by design

---

## Owner action

Review each ❌ and ⚠ row. For each, reply to Claude:

- **"keep as-is"** → Claude leaves it, marks ✅ in this audit
- **"change to $X"** → Claude updates the site copy
- **"add source: [citation]"** → Claude adds source attribution

Once all rows are ✅ or owner-approved-as-is, this audit becomes the launch readiness checkpoint for numeric claims.
