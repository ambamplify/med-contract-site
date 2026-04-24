# med-contract-site — Blockers

## Real blockers (owner-action required — hard stops per charter)

### Domain DNS unbound
- **Issue:** `medcontractintel.com` A/CNAME records not set in Cloudflare. Live site only reachable via Railway URL.
- **Attempted workaround:** Railway URL used for audits; all code paths use relative URLs or the Railway host where absolute URLs are needed.
- **Real or bypassed:** Real for public launch. Bypassed for dev/audit.
- **Escalation:** Cloudflare account access → owner only.

### Kit sequence activation
- **Issue:** Welcome sequence `2705057` INACTIVE; 4 unauthorized sequences need manual Kit-UI deletion (API doesn't support).
- **Real or bypassed:** Bypassed — site functions without Kit active; checklist form still captures emails.
- **Escalation:** Owner Kit-login required.

### YouTube video not public
- **Issue:** Video `fXy6k0R2x-Y` is private; homepage video embed returns error.
- **Real or bypassed:** Bypassed at palette level; still blocks video-embed UX on homepage.
- **Escalation:** Owner YouTube Studio access required.

### Missing MedCI sample analysis PDF
- **Issue:** `public/sample-analysis.pdf` missing; homepage "Download Sample Analysis" CTA will 404.
- **Attempted workaround:** Leave EMCI sample per explicit owner directive ("do not touch EMCI residuals — new material coming").
- **Real or bypassed:** Bypassed by owner directive. Will be resolved when owner supplies redacted MedCI sample.

## Non-blockers (not hard stops — being worked around)

### GitHub → Railway auto-deploy webhook didn't fire on `cca0575`
- **Attempted workaround:** `railway up --service med-contract-site --ci` manual redeploy succeeded.
- **Real or bypassed:** Bypassed. Investigate webhook in a later pass.

### EMCI residuals on homepage/analyzer
- Owner directive: "do not touch the EMCI residuals. We will be generating new material to replace the data."
- Tracked: YouTube embed ID, `@EMContractIntel` handle, `em-contract-red-flag-checklist.pdf`, sample-analysis-*.pdf, sample card images in `public/images/`.
- **Real or bypassed:** Bypassed by owner directive — DO NOT touch.

### Stale password-gate claim in CLAUDE.md
- `CLAUDE.md` says there is an HTTP Basic Auth gate in `server/index.ts` with password `emci2026`. Verified no such gate exists in current `server/index.ts`.
- **Action:** Will correct CLAUDE.md as part of a doc-cleanup pass.

### Stale calculator field-name claim in CLAUDE.md
- CLAUDE.md says calculator JS sends `hourly`, `comp`, `profRev`, `facRev`, `share`, `wrvus`. Verified: frontend (`public/calculator/index.html:1151`) actually sends `{email, tag, results:{annualComp, effectiveHourly, groupRevenue, gapVsMedian}}` which matches `server/routes.ts::buildCalculatorResultsEmail` reads. Frontend + backend are in sync; CLAUDE.md is stale.
- **Action:** Correct CLAUDE.md in doc-cleanup pass.

### IMDATA2026.md missing
- Charter requires all numeric claims on the site to be verified against `/Users/ambamplify/MedContractIntel/med-contract-ops/state/IMDATA2026.md` or Perplexity triple-source.
- File does NOT exist at that path. `med-contract-ops/state/` has `site.md`, `stripe-ids.md`, `content-review-day3.md`, etc. but no IM data dossier.
- **Real or bypassed:** Blocks the homepage numeric-fact audit. Bypassed by deferring that audit until owner provides IMDATA2026.md or approves a proxy source (MGMA 2025 dataset, etc.). Continuing with non-numeric audits (responsiveness, a11y) in the meantime.
- **Escalation:** Needs owner to either (a) produce IMDATA2026.md or (b) bless the existing `med-contract-ops/state/content-review-day3.md` + equivalent as the canonical source.
