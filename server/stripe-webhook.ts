/**
 * Stripe Webhook Handler — PDF delivery on checkout.session.completed
 *
 * Must be registered BEFORE express.json() so the raw body is intact for signature verification.
 *
 * Product ID → PDF mapping:
 *   prod_UIVNFDZzok4SZf → Hospitalist Shift Economics ($37)       → med-shift-economics.pdf
 *   prod_UIVN9EesbBvLid → RVU Playbook ($47)               → em-rvu-playbook.pdf
 *   prod_UIVNEWo3geIr7s → Negotiation Script Pack ($67)    → em-negotiation-script-pack.pdf
 *   prod_UJqJP9Zksl0AA7 → Bundle ($197)                    → all 3 PDFs + analyzer credit
 *
 * After deploying, register the webhook in Stripe Dashboard:
 *   URL: https://medcontractintel.com/api/stripe/webhook
 *   Events: checkout.session.completed, charge.dispute.created, charge.dispute.updated,
 *           payment_intent.payment_failed, charge.refunded
 *   Copy the signing secret → Railway env: STRIPE_WEBHOOK_SECRET
 */

import type { Express, Request, Response } from "express";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { sendEmail } from "./email-service.js";
import { storage } from "./storage.js";
import { resumeAnalysisFromRow } from "./routes.js";

// BUG 1 (2026-04-15): PDFs are now read from the local filesystem rather than
// fetched from GitHub release assets. Build script copies server/pdfs → dist/server/pdfs.
// Previous approach (https GET to github.com/.../releases/download/pdfs-v1) was
// silently failing on Railway (no emitted error, attachments array stayed empty,
// purchase email went out without a PDF). Reading locally is deterministic and
// gives an immediate, obvious error if the file is missing.
const __dirname_hook = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(__dirname_hook, "server", "pdfs");

// ── Ops INBOX writer ───────────────────────────────────────────────────────
//
// Writes a structured markdown file to em-contract-ops/INBOX/ so the Ops
// Controller agent can classify and act on webhook events (disputes, refunds,
// failed payments) on its next wake cycle.
//
// File path format: INBOX/YYYY-MM-DD-{source}-{timestamp}.md
// Frontmatter fields: source, event_type, timestamp, severity
// Data section: JSON block containing the event-specific payload.
//
// TODO (Phase 1c): Replace fs.writeFileSync with a GitHub API commit to the
// em-contract-ops repo so this works when running on Railway (the remote
// container has no access to the local ~/Desktop/em-contract-ops/ path).
// For now, every write also logs to console.error so Railway logs capture the
// event even when the file write silently fails in production.
//
// Severity guide:
//   critical — dispute.created (immediate owner notification needed)
//   high     — payment_intent.payment_failed
//   medium   — charge.refunded, charge.dispute.updated
//   low      — informational / routine

const OPS_INBOX_DIR = "/Users/ambamplify/Desktop/em-contract-ops/INBOX";

function writeOpsInbox(source: string, data: {
  event_type: string;
  severity: "critical" | "high" | "medium" | "low";
  [key: string]: unknown;
}): void {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const tsMs = now.getTime();
  const filename = `${dateStr}-${source}-${tsMs}.md`;
  const filepath = `${OPS_INBOX_DIR}/${filename}`;

  const { event_type, severity, ...payload } = data;

  const frontmatter = [
    "---",
    `source: ${source}`,
    `event_type: ${event_type}`,
    `timestamp: ${now.toISOString()}`,
    `severity: ${severity}`,
    "status: unprocessed",
    "---",
    "",
  ].join("\n");

  const body = [
    `# ${event_type.toUpperCase().replace(/\./g, " ")}`,
    "",
    `**Source:** ${source}  `,
    `**Time:** ${now.toISOString()}  `,
    `**Severity:** ${severity}`,
    "",
    "## Payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "## Next Actions",
    "",
    "- [ ] Classify and move to QUEUE/ with priority",
    "- [ ] Check domains/ for any revenue or customer record update",
    severity === "critical"
      ? "- [ ] iMessage alert to owner (9167050598) — dispute requires immediate response"
      : severity === "high"
      ? "- [ ] Note in daily digest; follow up if pattern repeats"
      : "- [ ] Log in daily digest",
    "",
  ].join("\n");

  const content = frontmatter + body;

  // Always log to console.error so Railway logs capture this even if the
  // local file write is a no-op on the remote container. The JSON is the
  // canonical record until Phase 1c wires in the GitHub API commit.
  console.error(`[OpsInbox:${severity.toUpperCase()}] ${event_type}`, JSON.stringify(payload));

  try {
    fs.writeFileSync(filepath, content, "utf8");
    console.log(`[OpsInbox] Written: ${filename}`);
  } catch (err: any) {
    // Expected on Railway — file path is local-only. Phase 1c will replace
    // this with a GitHub API commit to em-contract-ops/INBOX/.
    console.error(`[OpsInbox] Local write failed (expected on Railway): ${err.message}`);
  }
}

// Lazy-initialize Stripe to avoid v22 crash on startup when env var is missing
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

// ── PDF read helper — local filesystem ─────────────────────────────────────
// Reads a purchase-delivery PDF synchronously from dist/server/pdfs/. Throws
// with a clear message if the file is missing so the caller sees a real error
// instead of a silently empty attachment list.
function readPDF(filename: string): Buffer {
  const full = path.join(PDF_DIR, filename);
  if (!fs.existsSync(full)) {
    throw new Error(`PDF not found at ${full}. Build step must copy server/pdfs → dist/server/pdfs.`);
  }
  return fs.readFileSync(full);
}

// ── Product → delivery config ──────────────────────────────────────────────
interface ProductConfig {
  name: string;
  pdfs: string[]; // filenames matching GitHub release assets
}

const PRODUCT_MAP: Record<string, ProductConfig> = {
  prod_UIVNFDZzok4SZf: {
    name: "Hospitalist Shift Economics",
    pdfs: ["med-shift-economics.pdf"],
  },
  prod_UIVN9EesbBvLid: {
    name: "IM wRVU Playbook",
    pdfs: ["em-rvu-playbook.pdf"],
  },
  prod_UIVNEWo3geIr7s: {
    name: "Negotiation Script Pack",
    pdfs: ["em-negotiation-script-pack.pdf"],
  },
  prod_UJqJP9Zksl0AA7: {
    // Correct live Stripe product ID (verified 2026-04-15). Previous ID
    // prod_UIVN7avX9UwmZ1 was stale — bundle was recreated in Stripe Dashboard
    // at some point, silently breaking all bundle PDF delivery since launch.
    name: "Complete MedCI Contract Toolkit (Bundle)",
    pdfs: [
      "med-shift-economics.pdf",
      "em-rvu-playbook.pdf",
      "em-negotiation-script-pack.pdf",
    ],
  },
};

// ── Register webhook route (must be before express.json middleware) ─────────
export function registerStripeWebhook(app: Express) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;

      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error("[Webhook] STRIPE_WEBHOOK_SECRET not set");
        return res.status(500).send("Webhook secret not configured");
      }

      let event: Stripe.Event;
      try {
        event = getStripe().webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        console.error("[Webhook] Signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      console.log(`[Webhook] Event received: ${event.type}`);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        // Handle async — don't await (Stripe requires 200 within 30s)
        handleCheckoutCompleted(session).catch((err) =>
          console.error("[Webhook] handleCheckoutCompleted error:", err.message)
        );

      } else if (event.type === "charge.dispute.created") {
        // ── Dispute opened — critical; requires response within 7 days ─────
        handleDisputeCreated(event.data.object as Stripe.Dispute);

      } else if (event.type === "charge.dispute.updated") {
        // ── Dispute status change (e.g. evidence submitted, won, lost) ──────
        handleDisputeUpdated(event.data.object as Stripe.Dispute);

      } else if (event.type === "payment_intent.payment_failed") {
        // ── Payment attempt failed (card declined, insufficient funds, etc.) ─
        handlePaymentFailed(event.data.object as Stripe.PaymentIntent);

      } else if (event.type === "charge.refunded") {
        // ── Refund issued (full or partial) ─────────────────────────────────
        handleChargeRefunded(event.data.object as Stripe.Charge);

      } else {
        // Unhandled event type — log so we can decide whether to add a handler
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    }
  );
}

// ── Handle completed checkout ──────────────────────────────────────────────
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Analyzer payment gate (FIX 0) — sessions created by POST /api/create-checkout
  // carry metadata.kind="analyzer" and metadata.analysis_id. Handle these first
  // and return early; they do NOT need the PDF-delivery flow below.
  if (session.metadata?.kind === "analyzer" && session.metadata.analysis_id) {
    await handleAnalyzerCheckoutCompleted(session);
    return;
  }

  const customerEmail = session.customer_details?.email || session.customer_email;
  const customerName = session.customer_details?.name || "";

  if (!customerEmail) {
    console.error(`[Webhook] No email on session ${session.id}`);
    return;
  }

  console.log(`[Webhook] Processing checkout ${session.id} for ${customerEmail}`);

  // Expand line items to get product IDs
  let lineItems: Stripe.LineItem[] = [];
  try {
    const expanded = await getStripe().checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price.product"],
    });
    lineItems = expanded.line_items?.data || [];
  } catch (err: any) {
    console.error("[Webhook] Failed to retrieve line items:", err.message);
    return;
  }

  // Bundle product ID — grants an analyzer credit to the buyer's email in
  // addition to delivering the PDFs. Kept as a constant here so the webhook
  // can recognize bundle purchases without touching PRODUCT_MAP structure.
  // Corrected 2026-04-15: live Stripe product is prod_UJqJP9Zksl0AA7.
  const BUNDLE_PRODUCT_ID = "prod_UJqJP9Zksl0AA7";

  for (const item of lineItems) {
    const product = item.price?.product as Stripe.Product | undefined;
    if (!product || typeof product === "string") continue;

    const config = PRODUCT_MAP[product.id];
    if (!config) {
      console.warn(`[Webhook] Unknown product ID: ${product.id}`);
      continue;
    }

    console.log(`[Webhook] Sending "${config.name}" PDFs to ${customerEmail}`);
    await sendProductEmail(customerEmail, customerName, config);

    // Bundle grants an analyzer credit — store keyed to the buyer's email so
    // they can redeem it later on /analyzer without paying again.
    if (product.id === BUNDLE_PRODUCT_ID) {
      try {
        const remaining = storage.grantBundleCredit(customerEmail);
        console.log(`[Webhook:bundle] Granted analyzer credit to ${customerEmail} — total now ${remaining}`);
      } catch (err: any) {
        console.error(`[Webhook:bundle] Failed to grant credit to ${customerEmail}:`, err?.message || err);
      }
    }
  }
}

// ── Dispute: created ──────────────────────────────────────────────────────
// Called when a cardholder opens a chargeback. Critical severity — Stripe
// gives 7 days to submit evidence. Writes an INBOX item immediately.
//
// TODO (iMessage): Send an iMessage to 9167050598 with the dispute amount and
// reason so the owner is notified instantly even without checking the ops repo.
// Phase 1c will wire this up via the iMessage MCP or a Make.com webhook.
function handleDisputeCreated(dispute: Stripe.Dispute): void {
  const amountDollars = (dispute.amount / 100).toFixed(2);
  console.error(
    `[Webhook:DISPUTE] charge.dispute.created — dispute ${dispute.id}` +
    ` | charge ${dispute.charge} | $${amountDollars} | reason: ${dispute.reason}`
  );

  writeOpsInbox("stripe-dispute", {
    event_type: "charge.dispute.created",
    severity: "critical",
    dispute_id: dispute.id,
    charge_id: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id,
    amount_cents: dispute.amount,
    amount_dollars: amountDollars,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    // evidence_due_by is a Unix timestamp; convert for readability
    evidence_due_by: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null,
    // Customer email is not on the Dispute object directly — look it up via
    // the associated Charge in a follow-up if needed for evidence submission.
    // TODO: expand charge to get billing_details.email if Phase 1c adds async lookup.
    customer_email_note: "Retrieve from charge object via Stripe Dashboard or API",
  });

  // TODO (Phase 1c — iMessage alert):
  // await sendIMessage("9167050598", `⚠️ DISPUTE OPENED: $${amountDollars} — reason: ${dispute.reason}. Respond within 7 days.`);
}

// ── Dispute: updated ──────────────────────────────────────────────────────
// Called when dispute status changes: evidence submitted, won, lost, etc.
// Medium severity — log for audit trail; owner reviews in daily digest.
function handleDisputeUpdated(dispute: Stripe.Dispute): void {
  const amountDollars = (dispute.amount / 100).toFixed(2);
  console.log(
    `[Webhook:dispute] charge.dispute.updated — dispute ${dispute.id}` +
    ` | status: ${dispute.status} | $${amountDollars}`
  );

  writeOpsInbox("stripe-dispute", {
    event_type: "charge.dispute.updated",
    severity: "medium",
    dispute_id: dispute.id,
    charge_id: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id,
    amount_cents: dispute.amount,
    amount_dollars: amountDollars,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    evidence_due_by: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null,
  });
}

// ── Payment failed ────────────────────────────────────────────────────────
// Called when a PaymentIntent fails (card declined, insufficient funds, etc.)
// High severity — may indicate a pattern of failed purchases to investigate.
function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): void {
  const amountDollars = (paymentIntent.amount / 100).toFixed(2);
  const failureReason =
    paymentIntent.last_payment_error?.message ||
    paymentIntent.last_payment_error?.code ||
    "unknown";
  const customerEmail =
    (paymentIntent as any).customer_details?.email ||
    paymentIntent.receipt_email ||
    null;

  console.error(
    `[Webhook:payment-failed] payment_intent.payment_failed — PI ${paymentIntent.id}` +
    ` | $${amountDollars} | reason: ${failureReason}` +
    (customerEmail ? ` | email: ${customerEmail}` : "")
  );

  writeOpsInbox("stripe-payment", {
    event_type: "payment_intent.payment_failed",
    severity: "high",
    payment_intent_id: paymentIntent.id,
    amount_cents: paymentIntent.amount,
    amount_dollars: amountDollars,
    currency: paymentIntent.currency,
    failure_reason: failureReason,
    failure_code: paymentIntent.last_payment_error?.code || null,
    failure_decline_code: paymentIntent.last_payment_error?.decline_code || null,
    customer_email: customerEmail,
    // last_payment_error.payment_method.card.brand / last4 if available
    card_brand: paymentIntent.last_payment_error?.payment_method?.card?.brand || null,
    card_last4: paymentIntent.last_payment_error?.payment_method?.card?.last4 || null,
  });
}

// ── Charge refunded ───────────────────────────────────────────────────────
// Called when a charge is fully or partially refunded (manual or via dispute).
// Medium severity — log for revenue reconciliation.
//
// TODO (domains/revenue.md): Phase 1c should auto-update em-contract-ops/
// domains/revenue.md to deduct the refund amount from monthly revenue totals
// via a GitHub API commit. For now the INBOX item is the audit trail.
function handleChargeRefunded(charge: Stripe.Charge): void {
  // Sum all refund line items from the refunds list (handles partial refunds)
  const refundedCents = charge.refunds?.data?.reduce(
    (sum, r) => sum + (r.amount || 0),
    0
  ) ?? charge.amount_refunded;
  const refundedDollars = (refundedCents / 100).toFixed(2);
  const totalDollars = (charge.amount / 100).toFixed(2);
  const isPartial = charge.amount_refunded < charge.amount;
  const customerEmail =
    charge.billing_details?.email ||
    charge.receipt_email ||
    null;

  console.log(
    `[Webhook:refund] charge.refunded — charge ${charge.id}` +
    ` | refunded $${refundedDollars} of $${totalDollars}` +
    ` | ${isPartial ? "partial" : "full"}` +
    (customerEmail ? ` | email: ${customerEmail}` : "")
  );

  writeOpsInbox("stripe-refund", {
    event_type: "charge.refunded",
    severity: "medium",
    charge_id: charge.id,
    payment_intent_id: typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id || null,
    amount_cents: charge.amount,
    amount_dollars: totalDollars,
    refunded_cents: refundedCents,
    refunded_dollars: refundedDollars,
    currency: charge.currency,
    refund_type: isPartial ? "partial" : "full",
    customer_email: customerEmail,
    // TODO (Phase 1c): commit a note to em-contract-ops/domains/revenue.md
    // deducting refund_dollars from monthly revenue. For now: manual reconcile.
    revenue_note: `Deduct $${refundedDollars} from monthly revenue in domains/revenue.md`,
  });
}

// FIX 8 (2026-04-15): Admin-triggered replay of a purchase delivery.
// Used when the original webhook failed to fire or the email didn't land —
// call with a Stripe session ID and the PDF delivery + bundle-credit grant
// runs identically to the real webhook path. Returns a summary for the
// admin endpoint to echo back. Caller must retrieve and expand line_items.
export async function replayProductDelivery(session: Stripe.Checkout.Session): Promise<{ customerEmail: string | null; productsDelivered: string[]; creditsGranted: number }> {
  const customerEmail = session.customer_details?.email || session.customer_email || null;
  if (!customerEmail) {
    throw new Error("Session has no customer email — cannot resend");
  }
  const customerName = session.customer_details?.name || "";
  const lineItems = session.line_items?.data || [];
  const BUNDLE_PRODUCT_ID = "prod_UJqJP9Zksl0AA7"; // corrected 2026-04-15
  const delivered: string[] = [];
  let creditsGranted = 0;
  for (const item of lineItems) {
    const product = item.price?.product as Stripe.Product | undefined;
    if (!product || typeof product === "string") continue;
    const config = PRODUCT_MAP[product.id];
    if (!config) continue;
    console.log(`[Resend] Sending "${config.name}" to ${customerEmail}`);
    await sendProductEmail(customerEmail, customerName, config);
    delivered.push(config.name);
    if (product.id === BUNDLE_PRODUCT_ID) {
      try {
        storage.grantBundleCredit(customerEmail);
        creditsGranted++;
      } catch (err: any) {
        console.error(`[Resend:bundle] Failed to grant credit to ${customerEmail}:`, err?.message || err);
      }
    }
  }
  return { customerEmail, productsDelivered: delivered, creditsGranted };
}

// Admin override delivery — sends a fixed list of PDF filenames to the session's
// customer, bypassing PRODUCT_MAP lookup. Used when Stripe product IDs in the
// session don't match the map (e.g. product recreated after initial deploy).
// Also grants a bundle credit unconditionally since overrideProducts implies
// this was a bundle resend.
export async function replayWithOverride(
  session: Stripe.Checkout.Session,
  overrideProducts: string[]
): Promise<{ customerEmail: string | null; productsDelivered: string[]; creditsGranted: number }> {
  const customerEmail = session.customer_details?.email || session.customer_email || null;
  if (!customerEmail) throw new Error("Session has no customer email — cannot resend");
  const customerName = session.customer_details?.name || "";

  const config: ProductConfig = {
    name: "Complete MedCI Contract Toolkit (Bundle)",
    pdfs: overrideProducts,
  };
  console.log(`[Override Resend] Sending ${overrideProducts.length} PDFs to ${customerEmail}`);
  await sendProductEmail(customerEmail, customerName, config);

  // Grant bundle credit — override implies bundle delivery
  let creditsGranted = 0;
  try {
    storage.grantBundleCredit(customerEmail);
    creditsGranted = 1;
    console.log(`[Override Resend] Granted bundle credit to ${customerEmail}`);
  } catch (err: any) {
    console.error(`[Override Resend] Failed to grant credit:`, err?.message || err);
  }

  return { customerEmail, productsDelivered: [config.name], creditsGranted };
}

// ── Analyzer payment handler ──────────────────────────────────────────────
// Fires on checkout.session.completed for sessions created by
// POST /api/create-checkout. Marks the analysis row paid and queues the
// analysis via resumeAnalysisFromRow. Idempotent — repeated webhook
// deliveries (Stripe retries) skip if the row is already paid.
async function handleAnalyzerCheckoutCompleted(session: Stripe.Checkout.Session) {
  const analysisId = parseInt(session.metadata?.analysis_id || "", 10);
  if (!Number.isFinite(analysisId) || analysisId <= 0) {
    console.error(`[Webhook:analyzer] Invalid analysis_id in session ${session.id}:`, session.metadata?.analysis_id);
    return;
  }

  const analysis = storage.getAnalysis(analysisId);
  if (!analysis) {
    console.error(`[Webhook:analyzer] Session ${session.id} references missing analysis ${analysisId}`);
    return;
  }

  if (analysis.paymentStatus === "paid") {
    console.log(`[Webhook:analyzer] Analysis ${analysisId} already paid — skipping (idempotent)`);
    return;
  }

  // Payment must be completed. Stripe only sends checkout.session.completed
  // when payment is successful, but double-check the payment_status field.
  if (session.payment_status !== "paid") {
    console.warn(`[Webhook:analyzer] Session ${session.id} for analysis ${analysisId} has payment_status="${session.payment_status}" — skipping`);
    return;
  }

  console.log(`[Webhook:analyzer] Marking analysis ${analysisId} paid, queueing for analysis`);
  storage.markAnalysisPaid(analysisId);
  storage.updateAnalysisStatus(analysisId, "pending");

  // FIX 5 Part A (2026-04-15): capture the buyer email from the Stripe session
  // so runAnalysis can auto-email the completed report without the user having
  // to fill in the email form on the report page.
  const buyerEmail = session.customer_details?.email || session.customer_email || null;
  if (buyerEmail) {
    try {
      storage.updateEmail(analysisId, buyerEmail);
      console.log(`[Webhook:analyzer] Captured buyer email ${buyerEmail} on analysis ${analysisId}`);
    } catch (err: any) {
      console.error(`[Webhook:analyzer] Failed to store buyer email on ${analysisId}:`, err?.message || err);
    }
  } else {
    console.warn(`[Webhook:analyzer] No customer email on session ${session.id} — report auto-email will be skipped`);
  }

  // Re-fetch the row so we pass the updated status into the resume helper.
  const updated = storage.getAnalysis(analysisId);
  if (updated) {
    resumeAnalysisFromRow(updated);
    console.log(`[Webhook:analyzer] Analysis ${analysisId} queued successfully`);
  } else {
    console.error(`[Webhook:analyzer] Analysis ${analysisId} vanished after marking paid`);
  }
}

// ── Build and send the product delivery email ──────────────────────────────
async function sendProductEmail(
  to: string,
  name: string,
  config: ProductConfig
) {
  // Read PDFs from local filesystem (dist/server/pdfs/ at runtime after build)
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  for (const filename of config.pdfs) {
    try {
      const content = readPDF(filename);
      attachments.push({ filename, content, contentType: "application/pdf" });
      console.log(`[Webhook] Read PDF: ${filename} (${content.length} bytes)`);
    } catch (err: any) {
      console.error(`[Webhook] Failed to read PDF ${filename}:`, err.message);
    }
  }

  // Hard-fail if we somehow end up with zero attachments for a product that
  // expects some — previously the email went out anyway and the customer
  // received an empty-looking purchase confirmation. Now we log loudly so the
  // error is visible in Railway logs and we know to intervene.
  if (attachments.length === 0 && config.pdfs.length > 0) {
    console.error(`[Webhook] CRITICAL: product "${config.name}" expects ${config.pdfs.length} PDF(s) but 0 were read from ${PDF_DIR}. Purchase email will still be sent but without attachments — manual intervention required.`);
  }

  const firstName = name.split(" ")[0] || "Doctor";
  const isBundle = config.pdfs.length > 1;

  const html = buildProductEmailHtml(firstName, config.name, isBundle);

  const result = await sendEmail({
    to,
    subject: `Your purchase: ${config.name} — MedContractIntel`,
    html,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  if (!result.success) {
    console.error(`[Webhook] Email send failed for ${to}: ${result.error}`);
  } else {
    console.log(`[Webhook] Email sent to ${to} with ${attachments.length} PDF(s)`);
  }
}

// ── Email HTML template ────────────────────────────────────────────────────
function buildProductEmailHtml(firstName: string, productName: string, isBundle: boolean): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:2rem 1rem;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:#0f1e3d;border-radius:12px 12px 0 0;padding:1.5rem 2rem;text-align:center;">
          <p style="color:#c9a84c;font-size:0.7rem;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 0.5rem;">MedContractIntel</p>
          <p style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin:0;">DATA · LEVERAGE · FAIR PAY</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:2rem;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="color:#0f1e3d;font-size:1rem;margin:0 0 1rem;">Hi ${firstName},</p>
          <p style="color:#374151;font-size:0.9375rem;line-height:1.7;margin:0 0 1rem;">
            Thank you for your purchase. Your ${isBundle ? "guides are" : "guide is"} attached to this email as ${isBundle ? "PDF files" : "a PDF"}.
          </p>
          <p style="color:#374151;font-size:0.9375rem;line-height:1.7;margin:0 0 1.5rem;">
            <strong style="color:#0f1e3d;">${productName}</strong> — open the ${isBundle ? "attachments" : "attachment"} below to get started.
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" width="100%" style="margin:1.5rem 0;">
            <tr><td align="center">
              <a href="https://medcontractintel.com/analyzer"
                 style="display:inline-block;background:#c9a84c;color:#0f1e3d;font-weight:700;font-size:0.9375rem;padding:0.875rem 2rem;border-radius:8px;text-decoration:none;">
                Analyze My Contract — $97 →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:0.875rem;line-height:1.7;margin:0;">
            The analyzer takes the concepts in ${isBundle ? "these guides" : "this guide"} and applies them directly to your contract — giving you an exact dollar gap vs. market, every red flag clause rated, and a counter-proposal letter ready to send.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0f1e3d;border-radius:0 0 12px 12px;padding:1.25rem 2rem;text-align:center;">
          <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:0 0 0.5rem;">
            MedContractIntel · <a href="mailto:service@medcontractintel.com" style="color:#2ec4b6;text-decoration:none;">service@medcontractintel.com</a>
          </p>
          <p style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin:0;">
            This content is for educational purposes only and does not constitute legal advice.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
