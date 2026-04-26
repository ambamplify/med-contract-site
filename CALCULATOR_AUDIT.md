# Calculator Math Audit

**Date:** 2026-04-26
**File audited:** `public/calculator/index.html` lines 866–1110
**Method:** Three hand-computed scenarios traced through every formula

---

## Constants used (from code)

| Constant | Value | Source on line | Notes |
|---|---|---|---|
| Medicare CF | $33.40 | 879 | ✅ Matches IM_DATA_2026.md exactly |
| Commercial multiplier | **1.80×** | 880 | ❌ Contradicts IM_DATA line 188 (hospitalist 1.1–1.3×) |
| Medicaid multiplier | 0.70× of Medicare | 880 | ✅ Defensible (national average) |
| Uninsured multiplier | 0.07× of Medicare | 880 | ✅ Defensible (collection rate) |
| Default state payer mix | 37/17/38/8 | 870 | Medicare/Medicaid/Commercial/Uninsured. TX uses this. |
| Facility revenue multiplier | 3.5× professional | 1069 | ⚠ Source unclear; plausible for inpatient DRG. Should be sourced. |
| wRVU calc (productivity mode) | pph × hrs × shifts/mo × 12 × **2.74** | 1051 | 2.74 = wRVU/encounter — reasonable for outpatient IM, high for hospitalist (better avg 2.0–2.4) |
| Hourly→wRVU estimate | hrs/mo × **2.0** × 2.74 × 12 | 1099 | 2.0 = patients/hour — aggressive. Typical hospitalist 1.0–1.5 pt/hr |

---

## Scenario 1 — Mid-market wRVU hospitalist

**Inputs:**
- wRVU rate: $50
- Annual wRVUs (known): 6,000 (MGMA median)
- Shift hours: 12 · Shifts/mo: 14 (default 7-on/7-off)
- State: TX (default mix)
- No base/threshold

**Expected results:**

| Output | Hand calc | Code result | Match |
|---|---|---|---|
| annualComp | 6,000 × $50 = **$300,000** | `annualWRVUs × rate` = $300,000 | ✅ |
| annualHours | 12 × 14 × 12 = **2,016** | `shiftHrs × shiftsPerMonth × 12` | ✅ |
| effectiveHourly | $300,000 / 2,016 = **$148.81/hr** | `annualComp / annualHours` | ✅ |
| blendedRate | (0.37 × 33.40) + (0.17 × 33.40 × 0.70) + (0.38 × 33.40 × 1.80) + (0.08 × 33.40 × 0.07) = **$39.37/wRVU** | code formula identical | ✅ |
| groupProfRevenue | 6,000 × $39.37 = **$236,190** | `annualWRVUs × blendedRate` | ✅ |
| facilityRevenue | $236,190 × 3.5 = **$826,665** | `groupProfRevenue × 3.5` | ✅ |
| physicianShare | $300,000 / ($236,190 + $826,665) = **28.2%** | `(annualComp / (groupProf + facility)) × 100` | ✅ |
| MGMA percentile | 6,000 wRVU → "25th–50th" | `getMGMAPercentile(6000)` returns "25th–50th" | ✅ |

**Verdict:** Math internally consistent ✅. Display numbers will show ~$236K group prof + ~$827K facility revenue. The 28% share reads "system captures 72% of value you generate" — high but defensible for inpatient settings.

---

## Scenario 2 — Below-market wRVU + base/threshold contract

**Inputs:**
- Base salary: $250,000
- Threshold: 4,500 wRVUs
- Rate above threshold: $30/wRVU
- Annual wRVUs: 6,000
- State: TX

**Expected results:**

| Output | Hand calc | Code result | Match |
|---|---|---|---|
| annualComp | $250,000 + max(0, (6,000 − 4,500) × $30) = **$295,000** | `base + Math.max(0, (annualWRVUs − threshold) × rate)` | ✅ |
| effectiveHourly | $295,000 / 2,016 = **$146.33/hr** | computed as above | ✅ |
| Group rev / facility rev / share | unchanged (driven by wRVUs not pay) | unchanged | ✅ |

**Edge case:** if `annualWRVUs < threshold`, `Math.max(0, ...)` correctly clamps to base only. ✅

**Edge case:** if `threshold = 0` and `base = 0`, expression is `(0 && 0) ? ... : annualWRVUs × rate` → falls through to pure rate × wRVU. ✅ (Though this is the bare-rate case, both branches give same result.)

---

## Scenario 3 — Hourly hospitalist

**Inputs:**
- Hourly rate: $200
- Hours/month: 168 (7-on/7-off, 7 shifts × 12 hrs × 2 cycles)
- State: TX

**Expected results:**

| Output | Hand calc | Code result | Match |
|---|---|---|---|
| annualComp | $200 × 168 × 12 = **$403,200** | `hourlyRate × hoursPerMonth × 12` | ✅ |
| annualHours | 168 × 12 = **2,016** | `hoursPerMonth × 12` | ✅ |
| estimatedWRVUs | 168 × 2.0 × 2.74 × 12 = **11,047** | `hoursPerMonth × 2.0 × 2.74 × 12` | ✅ |
| effectiveHourly | $200 (input) | `hourlyRate` | ✅ |
| groupProfRevenue | 11,047 × $39.37 = **$434,955** | `estimatedWRVUs × blendedRate` | ✅ |
| facilityRevenue | $434,955 × 3.5 = **$1,522,343** | `groupProfRevenue × 3.5` | ✅ |
| physicianShare | $403,200 / ($434,955 + $1,522,343) = **20.6%** | computed as above | ✅ |
| MGMA percentile | 11,047 wRVU → "90th+" | `getMGMAPercentile(11047)` returns "90th+" | ✅ |

**Verdict:** Math internally consistent ✅. **But the 2.0 pt/hr default makes a 168-hr/mo hospitalist look like a 90th-percentile producer**, which inflates the group revenue calculation. A real hospitalist at 1.2 pt/hr would generate 6,628 wRVUs (not 11,047) and have a 32% share, not 21%. The current default skews results toward "you're being underpaid relative to the value you generate."

---

## Bugs & concerns

| # | Severity | Issue |
|---|---|---|
| 1 | High | Commercial multiplier 1.80× contradicts IM_DATA_2026.md (1.1–1.3× for hospitalists). Inflates `groupProfRevenue` by ~30%. |
| 2 | Medium | 2.0 patients/hour default in hourly→wRVU is aggressive. Should be 1.2–1.5 for hospitalist defaults. |
| 3 | Medium | Facility revenue 3.5× multiplier has no source citation in code or IM_DATA. Plausible for inpatient DRG settings but should be documented. |
| 4 | Low | 2.74 wRVU/encounter is mixed-setting average. For pure inpatient hospitalist, weighted average closer to 2.2 (admissions 1.63–3.50, rounds 1.00–2.40). |
| 5 | Low | "MGMA 2025 Median: $222/hr" header on the calculator page (line 721) is mislabeled — that's locum midpoint, not employed median. (Already flagged in NUMERIC_AUDIT.md row.) |

---

## Recommendation

Before launch, owner needs to either:

A. **Reconcile commercial multiplier with IM_DATA** — change calculator constant from 1.80× to 1.30× (midpoint of IM_DATA 1.1–1.3×). This will make group revenue numbers more conservative and accurate.

OR

B. **Update IM_DATA_2026.md** to reflect a higher commercial multiplier with sourcing — if you have data showing 1.8× is correct for the calculator's target audience, document it in IM_DATA so the two stay in sync.

For 2/3/4, decisions are owner-facing — none are bugs per se, but they all push the calculator toward "you're being shortchanged" which is brand-aligned but should be deliberate.

Math itself is **bug-free**. All formulas execute correctly given their inputs. The audit concerns are about **input assumptions**, not calculation errors.
