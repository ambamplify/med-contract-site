# Owner Runbook — MedContractIntel Pre-Launch

**For Claude:** This is a self-contained checklist of owner-only tasks. Walk the owner through each one in order. After each completion, run the verification step yourself before marking it done. Update `BUILD_STATUS.md` and `BLOCKERS.md` as items close.

**For owner:** This is your task list. Each section says exactly what to click and what to send Claude when done. Hand any output (URLs, IDs, screenshots) back to Claude — Claude will verify and update the codebase.

---

## How to use this document

1. Tell Claude: "Run the owner runbook starting at task 1."
2. Claude reads this file and asks you the first question.
3. You complete the task in the relevant tool, paste the result/confirmation in chat.
4. Claude verifies (via API where possible) and moves to the next task.
5. If you get stuck, paste the error or screenshot — Claude troubleshoots.

**Order matters.** Tasks 1–3 unblock other work. Tasks 4–7 are launch-day. Don't skip ahead.

---

## Pre-launch tasks (do anytime)

### Task 1 — Rebrand Stripe to "Contract Intel"
**Time:** 5 min · **Tool:** Stripe Dashboard · **Owner-only** (Stripe API blocks self-updates)

**Why:** Receipts currently say "EM Contract Intel," confusing MedCI customers and risking chargebacks. "Contract Intel" is a neutral umbrella that serves both EMCI and MedCI without naming either.

**Steps:**
1. Log in at [dashboard.stripe.com](https://dashboard.stripe.com) (account `acct_1TEuuDRS3QYs0eSM`)
2. Settings → **Business settings** → **Public details**
3. Set:
   - Business name → `Contract Intel`
   - Statement descriptor → `CONTRACT INTEL` (must be ≤22 chars)
   - Support email → `service@emcontractintel.com`
   - Support URL → leave blank or set to whichever brand you prefer
4. Save

**Hand back to Claude:** "Stripe rebrand done."

**Claude verifies:**
```bash
SK=$(railway variables --service med-contract-site --json | python3 -c "import json,sys; print(json.load(sys.stdin)['STRIPE_SECRET_KEY'])")
curl -s https://api.stripe.com/v1/account -u "${SK}:" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['business_profile']['name'], '|', d['settings']['payments']['statement_descriptor'])"
```
Expected output: `Contract Intel | CONTRACT INTEL`

---

### Task 2 — Generate two sample analyzer PDFs
**Time:** 15 min · **Tool:** Live analyzer at `/analyzer` · **Requires:** Task 1 done OR admin bypass

**Why:** Homepage offers two free sample PDFs (`sample-analysis-rvu.pdf` and `sample-analysis-hourly.pdf`) as the lead-magnet CTA. Current files are EMCI-branded leftovers. Need fresh MedCI versions.

**Pre-step (Claude does this if owner approves):** Add a one-email admin bypass to `/api/analyze` and `/api/create-checkout` so owner can run two test contracts without paying $194. Delete bypass before launch.

**Steps:**
1. Open Railway URL or `medcontractintel.com` (after DNS) → `/analyzer`
2. Password: `emci2026`
3. **First sample (RVU contract):** Paste the Meridian Hospitalist contract Claude generated (see `med-contract-ops/state/test-contracts/rvu-contract.txt` — Claude will create this file before owner starts). Submit, wait, click "Download PDF".
4. **Second sample (hourly contract):** Paste the hourly contract Claude generated. Submit, wait, click "Download PDF".
5. Rename downloads:
   - First → `sample-analysis-rvu.pdf`
   - Second → `sample-analysis-hourly.pdf`

**Hand back to Claude:** Drop both PDFs in the chat OR save to `~/Downloads/` and say "samples ready in Downloads."

**Claude does:**
- Moves files to `public/assets/sample-analysis-{rvu,hourly}.pdf` (overwriting EMCI placeholders)
- Verifies files render with v3.1 palette
- Commits + deploys
- Tests homepage download buttons serve the new files

---

### Task 3 — Kit (ConvertKit) cleanup
**Time:** 10 min · **Tool:** [app.kit.com](https://app.kit.com) · **Owner-only** (UI delete not exposed via API)

**Why:** Welcome sequence has unauthorized drafts that must be removed before activation. Four parallel unauthorized sequences also need deletion. None of this is doable via API.

**Steps:**
1. Log into Kit (account `service@medcontractintel.com`)
2. **Sequences** → open **MedContractIntel — Welcome Sequence** (ID `2705057`):
   - Delete every email at position **8 or higher** (only emails 1–7 are approved)
   - For emails **2, 5, 6, 7**: open each → click "Publish" if it shows "Unpublished Changes"
   - **Do NOT activate the sequence yet** — that's a launch-day task
3. **Sequences** list → delete these four unauthorized sequences:
   - `2705600`
   - `2702881`
   - `2706887`
   - `2706901`

**Hand back to Claude:** "Kit cleanup done."

**Claude verifies:**
```bash
KIT=$(railway variables --service med-contract-site --json | python3 -c "import json,sys; print(json.load(sys.stdin)['KIT_API_SECRET'])")
curl -s "https://api.kit.com/v4/sequences" -H "X-Kit-Api-Key: $KIT" | python3 -c "import json,sys; data=json.load(sys.stdin); print('Sequences remaining:'); [print(f\"  {s['id']}: {s['name']} ({len(s.get('emails',[]))} emails)\") for s in data.get('sequences',[])]"
```
Expected: only `2705057` should appear, with 7 emails.

---

### Task 4 — Decide on YouTube video
**Time:** 2 min · **Decision-only**

**Why:** Homepage embeds video `fXy6k0R2x-Y`. It's currently set to private — the embed renders as a "Video unavailable" error block.

**Choose one:**
- **A. Keep it** → set to **Unlisted** now (so it works at launch). On launch day, set to **Public** for SEO.
- **B. Pull it** → tell Claude "remove the YouTube embed" and Claude deletes the homepage video block.

**Hand back to Claude:** "Keep video, set unlisted" OR "Pull it."

---

### Task 5 — Confirm or replace `IM_DATA_2026.md` numbers
**Time:** 30 min · **Decision/review**

**Why:** Site uses specific dollar/percentage figures (e.g., "$120,000/year gap at median production," "$32/wRVU below market," etc.) that must trace back to `med-contract-content/ops/IM_DATA_2026.md`. Claude will run an audit and surface every numeric claim with its source — owner approves or corrects.

**Pre-step (Claude does first):** Run a numeric-audit pass on homepage, calculator, RVU playbook page, analyzer page, about page. Output a table:
```
| Page                      | Claim              | Source in IM_DATA | Status |
| homepage hero             | "$120k/yr gap"     | line 47           | ✓      |
| rvu-playbook intro        | "$32/wRVU below"   | (not found)       | ⚠ owner verify |
```

**Hand back to Claude:** For each `⚠` row, owner says "yes, this is right" or "change to $X." Claude updates the site copy.

---

## Launch-day tasks (do in order, all on the same day)

### Task 6 — Bind DNS in Cloudflare
**Time:** 5 min + 5–60 min DNS propagation · **Tool:** Cloudflare dashboard

**Steps:**
1. Log into [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select `medcontractintel.com` zone
3. **DNS** → add records:
   - Type `CNAME`, name `@`, target `<your-railway-app>.up.railway.app`, proxy ON
   - Type `CNAME`, name `www`, target `medcontractintel.com`, proxy ON
4. Railway dashboard → med-contract-site service → **Settings** → **Custom Domain** → add `medcontractintel.com` and `www.medcontractintel.com` → Railway auto-provisions SSL

**Hand back to Claude:** "DNS bound."

**Claude verifies:**
```bash
dig +short medcontractintel.com A
curl -sI https://medcontractintel.com/ | head -3
```
Expected: returns Cloudflare IPs and `HTTP/2 200`.

---

### Task 7 — Resend domain auth (SPF/DKIM)
**Time:** 10 min · **Tool:** Resend dashboard + Cloudflare · **Requires:** Task 6

**Why:** Without domain auth, transactional emails (analyzer reports, PDF deliveries) get marked spam.

**Steps:**
1. [resend.com/domains](https://resend.com/domains) → Add domain `medcontractintel.com`
2. Resend shows 3 DNS records (SPF, DKIM, MX) — copy each
3. In Cloudflare DNS for `medcontractintel.com`, add all 3 records exactly as Resend shows them (proxy OFF for these)
4. Back in Resend → click "Verify"

**Hand back to Claude:** "Resend verified."

**Claude verifies:**
```bash
dig +short TXT medcontractintel.com | grep -i 'v=spf'
dig +short TXT resend._domainkey.medcontractintel.com
```

---

### Task 8 — Activate Kit welcome sequence
**Time:** 1 min · **Tool:** Kit dashboard · **Requires:** Task 3

**Steps:**
1. Kit → Sequences → MedContractIntel — Welcome Sequence (`2705057`)
2. Click **Activate** in top-right

**Hand back to Claude:** "Kit sequence active."

**Claude verifies:**
```bash
KIT=$(railway variables --service med-contract-site --json | python3 -c "import json,sys; print(json.load(sys.stdin)['KIT_API_SECRET'])")
curl -s "https://api.kit.com/v4/sequences/2705057" -H "X-Kit-Api-Key: $KIT" | python3 -c "import json,sys; print('Status:', json.load(sys.stdin)['sequence']['hold'] and 'INACTIVE' or 'ACTIVE')"
```

---

### Task 9 — Set YouTube video public (if keeping)
**Time:** 1 min · **Tool:** YouTube Studio · **Requires:** Task 4 = "keep"

1. [studio.youtube.com](https://studio.youtube.com) → Content → video `fXy6k0R2x-Y`
2. Visibility → **Public** → Save

**Hand back to Claude:** "YT live."

---

### Task 10 — Approve removal of password gate
**Time:** 30 sec · **Decision-only**

**Why:** Site is currently gated with HTTP Basic Auth (password `emci2026`) blocking all non-API routes. CLAUDE.md says: "Do not remove it without explicit owner approval."

**Hand back to Claude:** "Remove the gate."

**Claude does:**
- Edits `server/index.ts` to delete the `// PASSWORD GATE` block
- Builds, commits, pushes, deploys
- Verifies `curl -sI https://medcontractintel.com/` returns `HTTP/2 200` without WWW-Authenticate header

---

### Task 11 — Smoke test live site
**Time:** 10 min · **Tool:** Browser (incognito)

Walk through:
- [ ] Homepage loads, all images render, no console errors
- [ ] Click "Download Sample Analysis (RVU)" → PDF downloads, opens, looks branded
- [ ] Click "Download Sample Analysis (Hourly)" → same
- [ ] Calculator → enter values → submit → email arrives
- [ ] Checklist → enter email → submit → email arrives, lands in Kit, triggers welcome sequence
- [ ] Analyzer → paste a fake contract → checkout flow → see "Contract Intel" on Stripe page → use Stripe test card `4242 4242 4242 4242` (or your own card with refund) → analyzer runs → report renders → PDF downloads → letter DOCX downloads
- [ ] Each product page → Stripe link → "Contract Intel" branding visible

**Hand back to Claude:** Each item ✓ or note what failed. Claude debugs.

---

## What's already done (FYI, don't re-do)

- Brand palette v3.1 deployed across site, logos, generated PDFs/DOCX
- All 5 Stripe live products + payment links wired
- Stripe webhook registered (`we_1TKhobRS3QYs0eSMpSvc4O8u`) with raw-body middleware order correct
- `KIT_API_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` all set in Railway
- All 4 legal pages (terms, privacy, disclaimer, dmca) AEBMD-scrubbed
- sitemap.xml + robots.txt domain-corrected
- Internal link routing fixed (`/privacy`, `/terms`, `/disclaimer`, `/dmca` aliases added)
- Bundle upsell Stripe link corrected on thank-you page
- Build pipeline verified, Railway auto-deploys on push to `main`

---

## What Claude can do without you (run in parallel with your tasks)

While owner works on tasks above, Claude is grinding:
- End-to-end analyzer test once Stripe rebrand is done (Task 1)
- Calculator math verification — three hand-computed scenarios
- Thank-you page `?product=` branch verification (5 branches)
- Responsiveness pass on remaining pages
- Full WCAG AA contrast audit
- Numeric audit prep (parses IM_DATA_2026.md, builds the table for Task 5)
- CLAUDE.md cleanup (stale calculator field names, brand colors, password reference)

Tell Claude "keep grinding the autonomous list" and it'll work in parallel.
