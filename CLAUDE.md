# MedContractIntel — Claude Coworker Instructions

## What this project is

MedContractIntel (`medcontractintel.com`) is a B2C site selling contract education tools to internal medicine & hospitalist physicians. Products: three PDF guides, a Contract Analyzer web app, and a bundle.

**Live URL:** https://medcontractintel.com (DNS not yet bound — currently behind password gate on Railway URL)
**Repo:** https://github.com/ambamplify/med-contract-site
**Deployed on:** Railway (auto-deploys on `git push origin main`)
**Companion docs:** `OWNER_RUNBOOK.md` (owner pre-launch tasks), `NUMERIC_AUDIT.md` (data-claim audit), `BUILD_STATUS.md` / `BLOCKERS.md` / `NEXT_ACTION.md` / `CHANGELOG.md` (status loop)
**Authoritative palette:** `../med-contract-ops/state/brand-palette.md`
**Authoritative data:** `../med-contract-content/ops/IM_DATA_2026.md`

---

## Tech stack

- **Frontend:** React + TypeScript, built with Vite → `dist/`
- **Backend:** Node.js + Express (`server/index.ts`) served from same process
- **Static pages:** Plain HTML in `public/` — copied into `dist/public/` at build time
- **Build command:** `vite build && esbuild server/index.ts --bundle --platform=node --outfile=dist/server.js && cp -r public dist/public`
- **`dist/` is gitignored** — Railway runs the build on deploy
- **Database:** None (stateless; Stripe handles transactions, Kit handles email)

---

## Critical middleware order in `server/index.ts`

```
registerStripeWebhook(app)   ← MUST be first (needs raw body)
app.use(express.json())
// password gate (remove before launch)
registerRoutes(app)
app.use(express.static('dist'))
```

Do not reorder these. Stripe webhook verification breaks if `express.json()` runs first.

---

## Prices — these are the canonical correct prices

| Product | Price | Stripe product ID |
|---|---|---|
| Hospitalist Shift Economics | $37 | `prod_UIVNFDZzok4SZf` |
| IM wRVU Playbook | $47 | `prod_UIVN9EesbBvLid` |
| Negotiation Script Pack | $67 | `prod_UIVNEWo3geIr7s` |
| Contract Analyzer | $97 | `prod_UIVN19KQR0IZB3` |
| Complete Bundle (all 3 PDFs + Analyzer) | $197 | `prod_UJqJP9Zksl0AA7` |
| PDF Bundle (archived) | — | `prod_UIVN7avX9UwmZ1` |

If you see $47 for Billing, $67 for RVU, $197 for Scripts, or $247 for Bundle anywhere on the site — those are **old prices, fix them**.

---

## Stripe payment links (live mode)

| Product | Payment link |
|---|---|
| Hospitalist Shift Economics ($37) | `https://buy.stripe.com/eVqdRb694cAM7gN9St3ZK05` |
| IM wRVU Playbook ($47) | `https://buy.stripe.com/8x2bJ3550cAMdFb0hT3ZK06` |
| Negotiation Script Pack ($67) | `https://buy.stripe.com/28E14pdBw8kw7gN0hT3ZK07` |
| Contract Analyzer ($97) | `https://buy.stripe.com/4gM3cxetA5mm4YF2op3ZK03` (note: `/analyzer` flow uses dynamic Checkout Sessions, not this fixed link) |
| Complete Bundle ($197) | `https://buy.stripe.com/eVq28tfJE7gs9oV8Op3ZK0a` |

**Stripe account:** `acct_1TEuuDRS3QYs0eSM`. Shared with EM Contract Intel — owner has separate ToDo to rebrand the receipt to "Contract Intel" (umbrella). See `OWNER_RUNBOOK.md` Task 1.

---

## File map — where things live

```
public/
  index.html                        ← Homepage (main landing page)
  thank-you/index.html              ← Post-purchase page (renders by purchased products)
  calculator/index.html             ← wRVU value calculator
  checklist/index.html              ← Free checklist lead magnet (Kit form)
  about/index.html                  ← About page
  pages/
    analyzer.html                   ← Analyzer marketing page
    disclaimer.html  terms.html  privacy.html  dmca.html  ← Legal pages
    products/
      billing-breakdown.html        ← $37 product page
      rvu-playbook.html             ← $47 product page
      negotiation-scripts.html      ← $67 product page
      bundle.html                   ← $197 bundle page
  assets/
    sample-analysis-rvu.pdf         ← Free RVU sample (homepage CTA) — currently EMCI placeholder, owner needs to replace
    sample-analysis-hourly.pdf      ← Free hourly sample — currently EMCI placeholder
    images/
      brand_symbol.png              ← Small nav icon
      brand_mark.png                ← Full brand mark
  images/
    brand-mark-approved.jpg         ← Used by analyzer report
    brand-icon.png                  ← Legacy
  sitemap.xml  robots.txt           ← SEO files (medcontractintel.com domain)

client/src/pages/
  index.tsx                         ← React analyzer entry form
  report.tsx                        ← Analyzer results page

server/
  index.ts                          ← Express entry point + password gate + clean-URL aliases
  routes.ts                         ← API routes (analyzer, calculator email, purchase summary)
  stripe-webhook.ts                 ← Stripe webhook + PDF email delivery
  email-service.ts                  ← Resend email wrapper
  pdf-report.ts                     ← Analyzer report → PDF (jsPDF, v3.1 palette)
  letter-docx.ts                    ← Negotiation letter → DOCX (v3.1 palette)
  analysis-prompt.ts                ← Claude API prompt for contract analysis
  storage.ts                        ← In-memory analysis storage (90-day TTL)
  pdfs/                             ← 4 product PDFs (committed, not in releases)
```

---

## Stripe webhook

- **Active webhook ID:** `we_1TKhobRS3QYs0eSMpSvc4O8u`
- **Event:** `checkout.session.completed`
- **Endpoint:** `https://medcontractintel.com/api/stripe/webhook`
- **Env var:** `STRIPE_WEBHOOK_SECRET` (set in Railway)
- PDFs are fetched from GitHub releases at build/send time: `https://github.com/ambamplify/med-contract-site/releases/download/pdfs-v1/<filename>`
- Complete Bundle (`prod_UJqJP9Zksl0AA7`) also triggers `sendAnalyzerAccessEmail()` with a link to `/analyzer`
- Contract Analyzer (`prod_UIVN19KQR0IZB3`) has `pdfs: []` — no PDF delivery, access is via the web app

---

## Kit (ConvertKit) email

- **Account:** service@medcontractintel.com
- **API secret:** in Railway env as `KIT_API_SECRET`
- **Welcome sequence ID:** `2705057` (MedContractIntel — Welcome Sequence)
- **Checklist form ID:** `9272218` — used in `public/checklist/index.html`
- **Status:** Sequence is INACTIVE — do not activate without owner approval
- Sequence has 7 approved emails; emails 8+ are unauthorized drafts to delete
- 4 unauthorized parallel sequences need manual deletion in Kit UI: 2705600, 2702881, 2706887, 2706901

---

## Password gate

`server/index.ts` has an HTTP Basic Auth gate (password: `emci2026`) that blocks all non-API routes. Marked `// PASSWORD GATE — remove before launch`. **Do not remove without explicit owner approval.**

---

## Thank-you page logic (`public/thank-you/index.html`)

Reads `?session_id=<stripe_session>` (modern) or `?product=<slug>` (legacy fallback). Renders four screens based on what was purchased:

| Purchase | Screen | Upsell |
|---|---|---|
| Bundle (`bundle`) | "Your bundle is on its way" + analyzer credit banner + 3 PDF tiles | None — they have everything |
| Analyzer only (`analyzer`) | "Your analysis is running" | $197 Complete Bundle |
| One or more PDFs (`billing` / `rvu` / `scripts`) | "Your guide is on its way" + PDF tiles | $197 Complete Bundle |
| Unknown / no params | Generic "You're in!" | $97 Analyzer |

Bundle upsell link: `https://buy.stripe.com/eVq28tfJE7gs9oV8Op3ZK0a` (canonical $197 Complete Bundle).

No countdown timer in current implementation. Mobile breakpoint at ≤640px.

---

## Calculator email (`server/routes.ts`)

The wRVU calculator (`/calculator`) POSTs `{email, tag, results}` to `/api/calculator-email`. The `results` object contains: `annualComp`, `effectiveHourly`, `groupRevenue`, `gapVsMedian`. Use these field names in `buildCalculatorResultsEmail()` — do not rename. (Older docs referenced `hourly`/`comp`/`profRev`/`facRev`/`share`/`wrvus` — those were the legacy field names; current wire contract is the structured `results` object.)

---

## Analyzer (`client/src/pages/report.tsx` + `index.tsx`)

- Full React app — edit via `client/src/`, not `public/`
- Entry form (`index.tsx`) uploads PDF or text contract, creates Stripe Checkout Session via `/api/create-checkout`
- Webhook fires on payment success → analyzer runs via Anthropic API → results stored in memory
- Report page (`report.tsx`) polls `/api/analyze/:id` for status, renders when ready
- Brand mark: `brand-mark-approved.jpg`
- Product upsell prices in report: RVU $47, Billing $37, Scripts $67, Bundle $197
- Bundle crossed-out price shown as "$248" (sum of 4 products), saving "$51"

---

## Routing (`server/index.ts`)

Clean-URL aliases mapped to `pages/*.html` files:
- `/about` → `about/index.html`
- `/checklist` → `checklist/index.html`
- `/calculator` → `calculator/index.html`
- `/privacy` → `pages/privacy.html`
- `/terms` → `pages/terms.html`
- `/disclaimer` → `pages/disclaimer.html`
- `/dmca` → `pages/dmca.html`
- `/thank-you` → `thank-you/index.html`
- `/checklist-thank-you` → `checklist-thank-you/index.html`
- `/analyzer/*` → React app (`appDir/index.html`)
- `/pages/*` and `/pages/products/*` — direct HTML serving with index.html fallback

---

## Git / deploy workflow

```bash
git add <files>
git commit -m "description"
git push origin main        # triggers Railway auto-deploy
railway up --service med-contract-site -c   # backup manual deploy if GH webhook misses
```

- macOS keychain handles GitHub auth
- `dist/` is gitignored — never commit it
- Railway build takes ~2 min

---

## Environment variables (Railway)

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe live secret key (starts `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (starts `whsec_...`) |
| `KIT_API_SECRET` | ConvertKit/Kit API |
| `RESEND_API_KEY` | Email sending (Resend) |
| `ANTHROPIC_API_KEY` | Claude API (analyzer) |

Pull any value: `railway variables --service med-contract-site --json | python3 -c "import json,sys; print(json.load(sys.stdin)['VAR_NAME'])"`

---

## What's pending before launch

See `OWNER_RUNBOOK.md` for the full owner-side checklist. Quick summary:

**Pre-launch (anytime):**
1. Owner: rebrand Stripe receipt to "Contract Intel" (dashboard, 5 min)
2. Owner: provide redacted sample analysis PDFs to replace EMCI placeholders
3. Owner: clean up Kit (delete unauthorized drafts, publish unpublished changes, delete 4 parallel sequences)
4. Owner: decide on YouTube embed (keep & set unlisted, or remove)
5. Owner: review `NUMERIC_AUDIT.md` and approve/correct each ⚠ row

**Launch day (in order):**
6. Owner: bind DNS in Cloudflare → Railway custom domain
7. Owner: Resend domain auth (SPF/DKIM in Cloudflare)
8. Owner: activate Kit welcome sequence
9. Owner: set YouTube video public (if keeping)
10. Owner: approve removal of password gate → Claude removes it
11. Owner: smoke test live site

---

## Brand (palette v3.1)

Authoritative source: `../med-contract-ops/state/brand-palette.md`.

- **Primary (forest green):** `#061e15`
- **Primary-dark:** `#02110a`
- **Hero center-lift:** `#0a2f1f` (radial gradient highlight only)
- **Gold (heritage bronze):** `#9c7e2e` · gold-bright `#b89a3e` · gold-hover `#6e5a20`
- **Teal:** `#1db5b5` (decorative only) · teal-dark `#189696` (interactive — WCAG safe)
- **Cream (background):** `#f7f4ec`
- **Ink (body text):** `#0a1f14`
- **Muted:** `#5a6b60`
- **Tagline:** DATA · LEVERAGE · FAIR PAY
- **Legal footer:** "This content is for educational purposes only and does not constitute legal advice."
- **Public-facing entity:** "MedContractIntel™ — a service operated by a Delaware limited liability company." Do NOT name the underlying LLC on customer-facing material.
- **Contact:** service@medcontractintel.com (active EMCI inbox handles both brands until a separate one is set up)
