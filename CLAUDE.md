# MedContractIntel — Claude Coworker Instructions

## What this project is

MedContractIntel (`medcontractintel.com`) is a B2C site selling contract education tools to internal medicine & hospitalist physicians. Products: three PDF guides, a Contract Analyzer web app, and a bundle. Built by AEBMD LLC.

**Live URL:** https://medcontractintel.com  
**Repo:** https://github.com/ambamplify/med-contract-site  
**Deployed on:** Railway (auto-deploys on `git push origin main`)

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
| Contract Analyzer ($97) | `https://buy.stripe.com/4gM3cxetA5mm4YF2op3ZK03` |
| Complete Bundle ($197) | `https://buy.stripe.com/eVq28tfJE7gs9oV8Op3ZK0a` |

---

## File map — where things live

```
public/
  index.html                        ← Homepage (main landing page)
  thank-you/index.html              ← Post-purchase page (OTO + countdown timer)
  calculator/index.html             ← wRVU value calculator
  checklist/index.html              ← Free checklist lead magnet (Kit form)
  pages/
    analyzer.html                   ← Analyzer product page
    products/
      billing-breakdown.html        ← $37 product page
      rvu-playbook.html             ← $47 product page
      negotiation-scripts.html      ← $67 product page
      bundle.html                   ← $197 bundle page
  assets/images/
    brand_symbol.png                ← Small nav icon
    brand-mark-approved.jpg         ← Full brand mark (256×256, navy bg)
  sample-analysis.pdf               ← Free sample report (homepage CTA)

client/src/pages/
  report.tsx                        ← Analyzer results page (React)

server/
  index.ts                          ← Express entry point + password gate
  routes.ts                         ← API routes (analyzer, calculator email)
  stripe-webhook.ts                 ← Stripe webhook + PDF email delivery
  email-service.ts                  ← Resend/SMTP email wrapper
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
- Sequence has 7 approved emails (emails 8+ are unauthorized drafts, delete before activation)

---

## Password gate

`server/index.ts` has an HTTP Basic Auth gate (password: `emci2026`) that blocks all non-API routes. It is marked `// PASSWORD GATE — remove before launch`. **Do not remove it without explicit owner approval.**

---

## Thank-you page logic (`public/thank-you/index.html`)

Reads `?product=` URL param to customize the experience:

| `?product=` | What shows |
|---|---|
| `billing` / `scripts` / `pdf` (default) | RVU Playbook OTO at $47 + 15-min countdown |
| `rvu` | Analyzer CTA (they have the playbook) |
| `bundle` | Analyzer CTA (all 3 PDFs + analyzer included) |
| `analyzer` | Direct link to `/analyzer` |

OTO payment link: `https://buy.stripe.com/8x2bJ3550cAMdFb0hT3ZK06`

---

## Calculator email (`server/routes.ts`)

The wRVU calculator (`/calculator`) sends results to email. The fields the calculator JS sends are: `hourly`, `comp`, `profRev`, `facRev`, `share`, `wrvus`. Use these exact field names in `buildCalculatorResultsEmail()` — do not rename them.

---

## Analyzer (`client/src/pages/report.tsx`)

- Full React page — edit via `client/src/`, not `public/`
- Brand mark: `brand-mark-approved.jpg` (not `brand-icon.png`)
- Product upsell prices in report: RVU $47, Billing $37, Scripts $67, Bundle $197
- Bundle crossed-out price shown as "$248" (sum of 4 products), saving "$51"

---

## Git / deploy workflow

```bash
git add <files>
git commit -m "description"
git push origin main        # triggers Railway auto-deploy
```

- macOS keychain handles GitHub auth — no token needed in remote URL
- `dist/` is gitignored — never commit it
- Railway build takes ~2 min; check logs at railway.app if something breaks

---

## Environment variables (Railway)

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `KIT_API_SECRET` | ConvertKit/Kit API |
| `RESEND_API_KEY` | Email sending (Resend) |
| `ANTHROPIC_API_KEY` | Claude API (analyzer) |

---

## What's pending before launch

1. **Remove password gate** — edit `server/index.ts`, delete the `// PASSWORD GATE` block
2. **Activate Kit sequence 2705057** — only after cleaning up unauthorized emails (8+) and publishing all Unpublished Changes in emails 2, 5, 6, 7
3. **Delete 4 unauthorized Kit sequences** — must be done manually in Kit UI (API doesn't support deletion): IDs 2705600, 2702881, 2706887, 2706901
4. **Add `public/sample-analysis.pdf`** — homepage has a "Download Sample Analysis — Free →" button; the PDF doesn't exist yet; owner needs to provide a redacted analysis
5. **Set YouTube video public** — video ID `fXy6k0R2x-Y`

---

## Brand

- **Colors:** Navy `#0f1e3d`, Gold `#c9a84c`, Teal `#1a9090` / `#2ec4b6`
- **Tagline:** DATA · LEVERAGE · FAIR PAY
- **Tone:** Direct, data-driven, no fluff, physician-peer voice
- **Legal footer:** "This content is for educational purposes only and does not constitute legal advice."
- **Company:** AEBMD LLC · service@medcontractintel.com
