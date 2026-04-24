import { type Express, type Request, type Response } from "express";
import multer from "multer";
import https from "https";
import Stripe from "stripe";
import { storage } from "./storage.js";
import { buildSystemPrompt, USER_PROMPT_TEMPLATE } from "./analysis-prompt.js";
import { generatePDF } from "./pdf-report.js";
import { sendEmail, buildReportEmailHtml } from "./email-service.js";
import { generateLetterDocx } from "./letter-docx.js";
import type { Analysis, IntakeData, AnalysisResult } from "../shared/schema.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Payment gate helpers (FIX 0, 2026-04-15) ------------------------------------
// Analyzer analyses now require a paid Stripe Checkout session before any
// report data is returned. The bypass header X-Internal-Test with a secret
// from env lets the owner run internal smoke tests without paying.
function isInternalTestRequest(req: Request): boolean {
  const expected = process.env.INTERNAL_TEST_SECRET;
  if (!expected) return false;
  const provided = req.header("X-Internal-Test");
  return typeof provided === "string" && provided === expected;
}

function requirePaidOrInternal(analysis: Analysis, req: Request): { ok: true } | { ok: false; status: number; body: { error: string } } {
  if (isInternalTestRequest(req)) return { ok: true };
  if (analysis.paymentStatus === "paid") return { ok: true };
  return {
    ok: false,
    status: 402,
    body: { error: "Payment required — this analysis has not been paid for." },
  };
}

// Lazy-initialize Stripe client — matches stripe-webhook.ts pattern so the
// server boots cleanly when STRIPE_SECRET_KEY is missing (dev / early deploy).
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

// Persistent keep-alive agent — prevents connection drops mid-request on long Claude calls
const httpsAgent = new https.Agent({ keepAlive: true, timeout: 300000 });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function registerRoutes(app: Express) {
  // ── Create Stripe Checkout session for analyzer ($97) ──────────────────────
  // Primary entry point from the intake form. Creates the analysis row in
  // "awaiting_payment" state, then a Stripe Checkout session that will redirect
  // to /analyzer/report/{analysisId} on success. Actual analysis kickoff
  // happens in the stripe-webhook when checkout.session.completed fires.
  app.post("/api/create-checkout", upload.single("contract"), async (req: Request, res: Response) => {
    try {
      // Extract contract (same logic as POST /api/analyze below) ─────────────
      let contractText = "";
      if (req.file) {
        if (req.file.mimetype === "application/pdf") {
          try {
            const pdfParse = (await import("pdf-parse")).default;
            const pdfData = await pdfParse(req.file.buffer);
            contractText = pdfData.text;
          } catch {
            return res.status(400).json({ error: "Could not read PDF file. Please try pasting the text instead." });
          }
        } else {
          contractText = req.file.buffer.toString("utf-8");
        }
      } else if (req.body.contractText) {
        contractText = req.body.contractText;
      }
      if (!contractText || contractText.trim().length < 100) {
        return res.status(400).json({ error: "Contract text is too short or missing. Please upload a valid contract." });
      }

      const intake: IntakeData = {
        state: req.body.state || "Unknown",
        region: req.body.region || "Unknown",
        compensationModel: req.body.compensationModel || "Unknown",
        yearsExperience: req.body.yearsExperience || "Unknown",
        settingType: req.body.settingType || "Unknown",
        employerType: req.body.employerType || "Unknown",
        apcSupervision: req.body.apcSupervision || "Unknown",
      };

      // Bundle credit redemption — if the user provides an email that has an
      // unused analyzer credit (from a prior Bundle purchase), skip Stripe
      // entirely. The credit decrement is atomic; if it succeeds we create
      // a paid row and queue the analysis immediately.
      const bundleEmail = (req.body.bundleEmail || "").trim().toLowerCase();
      if (bundleEmail) {
        const redeemed = storage.redeemBundleCredit(bundleEmail);
        if (redeemed) {
          const row = storage.createAnalysis({
            contractText,
            state: intake.state,
            region: intake.region,
            compensationModel: intake.compensationModel,
            yearsExperience: intake.yearsExperience,
            settingType: intake.settingType,
            employerType: intake.employerType,
            apcSupervision: intake.apcSupervision,
            phone: req.body.phone || undefined,
            email: bundleEmail,
            status: "pending",
            paymentStatus: "paid",
          });
          console.log(`[create-checkout] Bundle credit redeemed for ${bundleEmail} → analysis ${row.id}`);
          resumeAnalysisFromRow(row);
          return res.json({
            analysisId: row.id,
            skipCheckout: true,
            redirect: `/analyzer/report/${row.id}`,
          });
        }
        // Email provided but no credit — fall through to $97 Stripe checkout.
        // Client UI can surface the "no credit found" state if it wants.
        console.log(`[create-checkout] No bundle credit for ${bundleEmail} — continuing to Stripe`);
      }

      // Row is created BEFORE payment so we have a stable ID to thread through
      // the Stripe session metadata and success_url. paymentStatus defaults to
      // "unpaid"; webhook flips it to "paid" and kicks off runAnalysis.
      const analysis = storage.createAnalysis({
        contractText,
        state: intake.state,
        region: intake.region,
        compensationModel: intake.compensationModel,
        yearsExperience: intake.yearsExperience,
        settingType: intake.settingType,
        employerType: intake.employerType,
        apcSupervision: intake.apcSupervision,
        phone: req.body.phone || undefined,
        status: "awaiting_payment",
        paymentStatus: "unpaid",
      });

      // Build Stripe Checkout session
      let stripe: Stripe;
      try {
        stripe = getStripe();
      } catch (e: any) {
        console.error("[create-checkout] Stripe not configured:", e?.message || e);
        return res.status(500).json({ error: "Payment system not configured on server" });
      }

      const host = req.get("host") || "medcontractintel.com";
      const proto = host.startsWith("localhost") ? "http" : "https";
      const origin = `${proto}://${host}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 9700,
              product_data: { name: "MedContractIntel™ — Contract Analyzer" },
            },
            quantity: 1,
          },
        ],
        metadata: {
          analysis_id: String(analysis.id),
          kind: "analyzer",
        },
        success_url: `${origin}/analyzer/report/${analysis.id}`,
        cancel_url: `${origin}/analyzer`,
      });

      storage.setStripeSessionId(analysis.id, session.id);
      console.log(`[create-checkout] Analysis ${analysis.id} → Stripe session ${session.id}`);
      res.json({ url: session.url, analysisId: analysis.id });
    } catch (err: any) {
      console.error("[create-checkout] Error:", err?.message || err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Internal-test direct submit — bypasses the payment gate when called with
  // the X-Internal-Test header matching INTERNAL_TEST_SECRET. Kept so the
  // owner can run smoke tests without paying. When the header is absent or
  // wrong, this route refuses and directs the client to /api/create-checkout.
  app.post("/api/analyze", upload.single("contract"), async (req: Request, res: Response) => {
    if (!isInternalTestRequest(req)) {
      return res.status(402).json({
        error: "Payment required. Use /api/create-checkout to start an analysis.",
      });
    }
    try {
      let contractText = "";

      if (req.file) {
        // Handle file upload (PDF or text)
        if (req.file.mimetype === "application/pdf") {
          try {
            const pdfParse = (await import("pdf-parse")).default;
            const pdfData = await pdfParse(req.file.buffer);
            contractText = pdfData.text;
          } catch (pdfErr: any) {
            return res.status(400).json({ error: "Could not read PDF file. Please try pasting the text instead." });
          }
        } else {
          contractText = req.file.buffer.toString("utf-8");
        }
      } else if (req.body.contractText) {
        contractText = req.body.contractText;
      }

      if (!contractText || contractText.trim().length < 100) {
        return res.status(400).json({ error: "Contract text is too short or missing. Please upload a valid contract." });
      }

      const intake: IntakeData = {
        state: req.body.state || "Unknown",
        region: req.body.region || "Unknown",
        compensationModel: req.body.compensationModel || "Unknown",
        yearsExperience: req.body.yearsExperience || "Unknown",
        settingType: req.body.settingType || "Unknown",
        employerType: req.body.employerType || "Unknown",
        apcSupervision: req.body.apcSupervision || "Unknown",
      };

      // Internal-test row — mark paid immediately so GET /api/analyze/:id
      // can return results without the payment gate blocking the poller.
      const analysis = storage.createAnalysis({
        contractText,
        state: intake.state,
        region: intake.region,
        compensationModel: intake.compensationModel,
        yearsExperience: intake.yearsExperience,
        settingType: intake.settingType,
        employerType: intake.employerType,
        apcSupervision: intake.apcSupervision,
        phone: req.body.phone || undefined,
        status: "pending",
        paymentStatus: "paid",
      });

      // Respond immediately — background job starts after response is flushed.
      // .catch() is load-bearing: without it a rejection here would become an
      // unhandledRejection and (pre-global-handler) crash the whole server.
      res.json({ id: analysis.id });
      setImmediate(() => {
        runAnalysis(analysis.id, contractText, intake).catch((err) => {
          console.error(`[Analysis ${analysis.id}] Fatal (escaped inner catch):`, err?.stack || err);
        });
      });
    } catch (err: any) {
      console.error("Submit error:", err);
      res.status(500).json({ error: err.message || "Failed to submit contract" });
    }
  });

  // Social proof counter
  app.get("/api/stats/count", (_req: Request, res: Response) => {
    try {
      const count = storage.getCompleteCount();
      res.json({ count });
    } catch {
      res.json({ count: 0 });
    }
  });

  // BUG 2 (2026-04-15): Purchase summary for /thank-you page.
  // Stripe redirects to /thank-you?session_id={CHECKOUT_SESSION_ID}; the
  // client calls this endpoint to render only the items actually purchased
  // (previously the page hard-coded all three PDFs regardless of what the
  // customer bought).
  app.get("/api/purchase-summary/:sessionId", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    // Basic shape check — Stripe checkout sessions are "cs_live_..." or "cs_test_..."
    if (!sessionId || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
      return res.status(400).json({ error: "Invalid session id" });
    }
    // Product id → UI slug. Client uses slugs to branch upsell + analyzer-CTA
    // visibility (preserves the existing ?product= query-param logic on the
    // thank-you page).
    const PRODUCT_SLUG: Record<string, string> = {
      prod_UO4aJ7yxy2HU6Z: "shift-economics", // Shift Economics Analyzer ($37)
      prod_UO4aJBAYjGjNv0: "rvu",              // wRVU Compensation Calculator ($47)
      prod_UO4aYFhkanuNpp: "scripts",           // Negotiation Script Pack ($67)
      prod_UO4a2irKl6Z49k: "analyzer",          // AI Contract Analyzer standalone ($97)
      prod_UO4a8a58qiED8T: "bundle",            // Complete Physician Contract Bundle ($197)
    };
    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      return res.status(500).json({ error: "Payment system not configured on server" });
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price.product"],
      });
      const products: Array<{ id: string; name: string; slug: string }> = [];
      const items = session.line_items?.data || [];
      for (const item of items) {
        const product = item.price?.product as Stripe.Product | undefined;
        if (!product || typeof product === "string") continue;
        products.push({
          id: product.id,
          name: product.name,
          slug: PRODUCT_SLUG[product.id] || "unknown",
        });
      }
      // Analyzer checkout (from POST /api/create-checkout) has no product in
      // the PRODUCT_SLUG map — it uses inline price_data with product_data.name.
      // Detect via metadata.kind === "analyzer" set when the session is created.
      if (session.metadata?.kind === "analyzer") {
        products.push({
          id: "analyzer",
          name: "MedContractIntel™ — Contract Analyzer",
          slug: "analyzer",
        });
      }
      res.json({
        products,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email || null,
      });
    } catch (err: any) {
      console.error(`[purchase-summary] ${sessionId}:`, err?.message || err);
      res.status(500).json({ error: "Failed to retrieve purchase summary" });
    }
  });

  // FIX 8 (2026-04-15): Admin resend endpoint — internal-only.
  // Replays the Stripe-webhook product-delivery flow for a given session ID
  // so Perplexity/owner can manually resend a purchase email when the
  // original delivery failed (e.g. bundle buyer whose thank-you URL was
  // misconfigured and never triggered the webhook properly).
  app.post("/api/admin/resend-purchase", async (req: Request, res: Response) => {
    if (!isInternalTestRequest(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { sessionId, overrideProducts } = req.body || {};
    if (!sessionId || typeof sessionId !== "string" || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }
    let stripe: Stripe;
    try { stripe = getStripe(); } catch {
      return res.status(500).json({ error: "Stripe not configured" });
    }
    try {
      // Retrieve the session (needs full expansion so replay path matches webhook)
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price.product"],
      });
      // Dynamic import to avoid circular — the webhook handler exports helpers.
      const { replayProductDelivery, replayWithOverride } = await import("./stripe-webhook.js");

      // overrideProducts: array of PDF filenames — bypasses Stripe product-ID
      // lookup and delivers those files directly. Use when the Stripe product ID
      // in the session doesn't match PRODUCT_MAP (e.g. product was recreated).
      if (Array.isArray(overrideProducts) && overrideProducts.length > 0) {
        const result = await replayWithOverride(session, overrideProducts as string[]);
        return res.json({ success: true, ...result });
      }

      const result = await replayProductDelivery(session);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error(`[admin/resend-purchase] ${sessionId}:`, err?.message || err);
      res.status(500).json({ error: err?.message || "Resend failed" });
    }
  });

  // Get analysis status/result — GATED by payment_status
  app.get("/api/analyze/:id", (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const analysis = storage.getAnalysis(id);
    if (!analysis) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    // Payment gate: a row in "awaiting_payment" state is visible to the client
    // (so the report page can show a "confirming payment..." spinner right after
    // Stripe redirects back) but cannot leak result data. Only paid analyses
    // get the full response; unpaid ones get only id/status/employerType.
    const paid = analysis.paymentStatus === "paid" || isInternalTestRequest(req);

    const response: any = {
      id: analysis.id,
      status: analysis.status,
      errorMessage: analysis.errorMessage,
      employerType: analysis.employerType,
      region: analysis.region,
      state: analysis.state,
      paymentStatus: analysis.paymentStatus,
    };
    if (!paid) {
      // Don't attach result — just let the client know it's waiting on payment.
      return res.json(response);
    }

    // FIX 5C (2026-04-15): expose the buyer email on paid analyses so the
    // report page can show "Your report has been auto-sent to [email]" rather
    // than prompting the user to enter their address manually.
    if (analysis.email) {
      response.email = analysis.email;
    }

    if (analysis.status === "complete" && analysis.analysisResult) {
      try {
        response.result = JSON.parse(analysis.analysisResult);
      } catch {
        response.status = "error";
        response.errorMessage = "Failed to parse analysis result";
      }
    }

    res.json(response);
  });

  // Download PDF report — GATED
  app.get("/api/analyze/:id/pdf", (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const analysis = storage.getAnalysis(id);

    if (!analysis || analysis.status !== "complete" || !analysis.analysisResult) {
      return res.status(400).json({ error: "Analysis not complete" });
    }
    const gate = requirePaidOrInternal(analysis, req);
    if (!gate.ok) return res.status(gate.status).json(gate.body);

    try {
      const result: AnalysisResult = JSON.parse(analysis.analysisResult);
      const pdfBuffer = generatePDF(result, analysis.employerType || "Employment", analysis.qaTranscript || undefined);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="MedContract-Analysis-${id}.pdf"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (err: any) {
      console.error("PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Save email and send PDF report
  app.patch("/api/analyze/:id/email", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { email, phone } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email" });
      }
      const analysis = storage.getAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      const gate = requirePaidOrInternal(analysis, req);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      // Save email (and optional phone) to database
      storage.updateEmail(id, email);
      if (phone && phone.trim()) storage.updatePhone(id, phone.trim());

      // Send PDF via email if analysis is complete. FIX 1: surface send
      // failures to the client instead of always returning success.
      let emailSent = false;
      let emailError: string | undefined;

      if (analysis.status === "complete" && analysis.analysisResult) {
        try {
          const result = JSON.parse(analysis.analysisResult);
          const pdfBuffer = generatePDF(result, analysis.employerType || "Employment", analysis.qaTranscript || undefined);
          const riskRating = result.executiveSummary?.overallRiskRating || result.executiveSummary?.riskLevel || "See Report";

          const attachments: Array<{filename: string; content: Buffer; contentType: string}> = [
            {
              filename: `MedContract-Analysis-${id}.pdf`,
              content: Buffer.from(pdfBuffer),
              contentType: "application/pdf",
            },
          ];

          // Attach counter-proposal letter as .docx if one has been generated
          if (analysis.counterProposal) {
            try {
              const docxBuffer = await generateLetterDocx(analysis.counterProposal, id);
              attachments.push({
                filename: `Counter-Proposal-Letter-${id}.docx`,
                content: docxBuffer,
                contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              });
              console.log(`[Email] Including counter-proposal letter as .docx (${docxBuffer.length} bytes)`);
            } catch (docxErr: any) {
              console.warn(`[Email] Failed to generate .docx, falling back to .txt:`, docxErr.message);
              attachments.push({
                filename: `Counter-Proposal-Letter-${id}.txt`,
                content: Buffer.from(analysis.counterProposal, "utf-8"),
                contentType: "text/plain",
              });
            }
          }

          const emailResult = await sendEmail({
            to: email,
            subject: `Your MedContractIntel Analysis Report — ${analysis.employerType || "Contract"} Review`,
            html: buildReportEmailHtml(analysis.employerType || "Employment", riskRating, !!analysis.counterProposal),
            attachments,
          });

          if (emailResult.success) {
            emailSent = true;
          } else {
            emailError = emailResult.error || "Unknown email provider error";
            console.warn(`[Email] Failed to send to ${email}: ${emailError}`);
          }
        } catch (emailErr: any) {
          emailError = emailErr?.message || "Exception while building or sending email";
          console.error(`[Email] Error generating/sending PDF:`, emailError);
        }
      } else {
        emailError = "Analysis is not complete yet — email will be sent later";
      }

      // success reflects the email save (which always works).
      // emailSent is true only when the PDF email actually left the server.
      // The client uses emailSent to decide whether to show "we emailed you"
      // vs "email failed — download the PDF manually" messaging.
      res.json({ success: true, emailSent, error: emailError });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save email" });
    }
  });

  // Generate counter-proposal letter — GATED
  app.post("/api/analyze/:id/counter-proposal", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = storage.getAnalysis(id);
      if (!analysis || analysis.status !== "complete" || !analysis.analysisResult) {
        return res.status(400).json({ error: "Analysis not complete" });
      }
      const gate = requirePaidOrInternal(analysis, req);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const { tone, purpose, selectedPriorities, contractStartDate, expiredIncluded } = req.body;
      const isRenegotiation = purpose === "renegotiation";
      const result = JSON.parse(analysis.analysisResult);
      const priorities = result.negotiationPriorities || [];

      // Build the selected priorities context — include all fields
      const buildPriorityText = (idx: number) => {
        const p = priorities[idx];
        if (!p) return null;
        const name = p?.clause ?? p?.clauseName ?? p?.name ?? p?.issue ?? `Priority ${idx + 1}`;
        const current = p?.currentLanguage ?? p?.currentTerms ?? p?.current_terms ?? "";
        const target = p?.suggestedLanguage ?? p?.targetTerms ?? p?.target_terms ?? "";
        const walkAway = p?.walkAwayPoint ?? p?.walk_away_point ?? "";
        const financialImpact = p?.financialImpact ?? p?.financial_impact ?? "";
        const rationale = p?.rationale ?? p?.reason ?? "";
        let text = `Priority: ${name}`;
        if (current) text += `\nCurrent Terms: ${current}`;
        if (target) text += `\nProposed Terms: ${target}`;
        if (financialImpact) text += `\nFinancial Impact: ${financialImpact}`;
        if (walkAway) text += `\nWalk-Away Point: ${walkAway}`;
        if (rationale) text += `\nRationale: ${rationale}`;
        return text;
      };

      const selectedItems = (selectedPriorities || [])
        .map((idx: number) => buildPriorityText(idx))
        .filter(Boolean)
        .join("\n\n");

      // Build compensation context so the letter can reference specific numbers
      const comp = result.compensation || {};
      const rvu = comp.rvu || {};
      const compContext = [
        comp.model ? `Compensation Model: ${comp.model}` : "",
        comp.baseRate ? `Base Rate: ${comp.baseRate}` : "",
        rvu.multiplier ? `RVU Multiplier: $${rvu.multiplier}/RVU` : "",
        rvu.rvuType ? `RVU Type: ${rvu.rvuType}` : "",
        rvu.apcSharedCreditPct ? `APC Shared Credit: ${rvu.apcSharedCreditPct}%` : "",
        comp.severity ? `Compensation Risk: ${comp.severity}` : "",
      ].filter(Boolean).join("\n");

      // For renegotiation: expired items the physician chose to include
      const expiredItems = (expiredIncluded || [])
        .map((idx: number) => buildPriorityText(idx))
        .filter(Boolean)
        .join("\n\n");

      const employerType = analysis.employerType || "the employer";
      const es = result.executiveSummary || {};
      const summaryText = es.summary ?? es.overview ?? "";

      // Calculate tenure if start date provided
      let tenureText = "";
      if (isRenegotiation && contractStartDate) {
        const start = new Date(contractStartDate);
        const now = new Date();
        const years = Math.floor((now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        const months = Math.floor(((now.getTime() - start.getTime()) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
        tenureText = years > 0 ? `approximately ${years} year${years > 1 ? "s" : ""}${months > 0 ? ` and ${months} month${months > 1 ? "s" : ""}` : ""}` : `approximately ${months} month${months > 1 ? "s" : ""}`;
      }

      const expiredContext = expiredItems
        ? `\n\nADDITIONAL CONTEXT — FULFILLED PROVISIONS (the physician has explicitly chosen to reference these):
${expiredItems}
NOTE: These are one-time provisions that have likely been fulfilled based on the physician's tenure. The physician wants to reference them for context — weave them in briefly as historical context or evidence of unfair original terms, NOT as current asks.`
        : "";

      const toneInstructions = tone === "firm"
        ? `TONE: Professional but firm. The physician knows their market value and is prepared to explore other opportunities if terms cannot be aligned. Do not threaten — but make it clear this is a serious conversation about competitive alignment, not a casual request.`
        : `TONE: Warm, collaborative, and partnership-oriented throughout. The physician genuinely wants this to work and sees this as a conversation between partners, not adversaries. Frame every ask as a mutual win — the employer retains an experienced physician, the physician gets fair compensation. Use phrases like "I'd like to discuss," "I believe we can find a structure that works for both of us," "I'm confident we can align on terms." Avoid any language that sounds like an ultimatum, demand, or threat. The goal is to make the employer WANT to adjust terms, not feel pressured.`;

      const purposeInstructions = isRenegotiation
        ? `CONTEXT: The physician is ALREADY WORKING under this contract${tenureText ? ` for ${tenureText}` : ""} and wants to renegotiate terms${contractStartDate ? ` (contract started ${contractStartDate})` : ""}. This is NOT a new offer — the physician has established tenure, a track record, and leverage from their existing relationship and performance.

IMPORTANT: Focus ONLY on ongoing structural terms (compensation rates, RVU multiplier, modification rights, termination provisions, non-compete scope, malpractice coverage). Do NOT include one-time provisions that have already been fulfilled (sign-on bonuses already received, initial grace periods that have expired) UNLESS the physician has explicitly included them as additional context.

${toneInstructions}

Draft a professional letter that:
1. Opens by acknowledging the positive working relationship and the physician's tenure/contributions${tenureText ? ` (${tenureText} of service)` : ""}
2. References upcoming renewal, contract anniversary, or a proactive request for discussion
3. Addresses EVERY selected priority — do not skip any. For each one, reference the current terms, propose specific alternative terms, and briefly justify with market data or fairness rationale
4. If compensation or RVU terms are among the priorities, lead with those — compensation is typically the physician's primary concern and should be addressed first and most thoroughly, with specific dollar amounts and benchmark comparisons
5. Emphasizes retention value — the cost of replacing an experienced, credentialed physician vs. adjusting terms
6. References specific contract sections and proposes concrete alternative language
7. Closes by requesting a meeting to discuss, with a specific timeframe`
        : `CONTEXT: The physician has received a NEW contract offer and is responding BEFORE signing. They do not yet work for this employer.

${toneInstructions}

Draft a professional letter that:
1. Opens with gratitude for the opportunity and genuine enthusiasm about the position
2. Addresses EVERY selected priority — do not skip any. For each one, reference the current terms, propose specific alternative terms, and briefly justify with market data or fairness rationale
3. If compensation or RVU terms are among the priorities, lead with those — compensation is typically the physician's primary concern and should be addressed first and most thoroughly, with specific dollar amounts and benchmark comparisons
4. Provides brief, factual justification referencing MGMA/SHM/AMGA market benchmarks where relevant
5. Closes with openness to discussion and eagerness to finalize the agreement`;

      const systemPrompt = `You are a professional communication consultant helping an internal medicine and hospitalist physician draft a ${isRenegotiation ? "contract renegotiation request" : "counter-proposal letter"} to their employer regarding their employment contract.

You are NOT providing legal advice. You are drafting a professional communication template.

IM & HOSPITALIST COMPENSATION BENCHMARKS (for reference in letter):
- National median IM total compensation (target update pending IM_DATA_2026): benchmark verification in progress (MGMA / AMGA / Doximity 2025)
- Hourly: median $222/hr, 75th percentile $259/hr
- Effective wRVU rates: staffing companies $40-$52/wRVU, independent groups $55-$75/wRVU, hospital-direct $50-$68/wRVU
- If the contract uses a custom RVU definition (e.g., "Qualified RVUs" with APC discounts), note that standard wRVU benchmarks cannot be directly compared — but the EFFECTIVE compensation should still be benchmarked against market medians

${purposeInstructions}

Format: Write the letter as plain text, ready to copy and send. Use "[Physician Name]", "[Employer Representative]", "[Facility Name]", and "[Date]" as placeholders. Do NOT use markdown formatting — write it as a clean professional letter.

IMPORTANT: Address ALL selected priorities in the letter. Do not summarize or skip any. The letter can be up to 800 words if needed to cover all points thoroughly.`;

      const userPrompt = `Employer type: ${employerType}
Purpose: ${isRenegotiation ? "Renegotiation of existing contract" : "Counter-proposal for new contract offer"}
${isRenegotiation && contractStartDate ? `Contract start date: ${contractStartDate}\nPhysician tenure: ${tenureText}` : ""}

Current Compensation Structure:
${compContext}

Contract Summary: ${summaryText.substring(0, 500)}

Active Negotiation Priorities (address ALL of these in the letter):
${selectedItems}
${expiredContext}

Draft the ${isRenegotiation ? "renegotiation request" : "counter-proposal"} communication template now. Remember: address EVERY priority listed above, lead with compensation/RVU issues, and maintain the requested tone throughout.`;

      console.log(`[Counter-Proposal ${id}] Generating ${tone} letter for ${(selectedPriorities || []).length} priorities...`);
      const startTime = Date.now();

      const letterText = await callClaudeAPI(systemPrompt, userPrompt);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Counter-Proposal ${id}] Generated in ${elapsed}s (${letterText.length} chars)`);

      // Save to database so it can be included in email
      storage.updateCounterProposal(id, letterText);

      res.json({ letter: letterText });
    } catch (err: any) {
      console.error("Counter-proposal error:", err.message || err);
      res.status(500).json({ error: "Failed to generate counter-proposal" });
    }
  });

  // Send counter-proposal letter as Word doc to user's email
  app.post("/api/analyze/:id/send-letter", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { email } = req.body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email" });
      }

      const analysis = storage.getAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      const gate = requirePaidOrInternal(analysis, req);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      if (!analysis.counterProposal) {
        return res.status(400).json({ error: "No counter-proposal letter generated yet" });
      }

      const docxBuffer = await generateLetterDocx(analysis.counterProposal, id);

      await sendEmail({
        to: email,
        subject: "Your Counter-Proposal Letter — MedContractIntel Analysis",
        html: "<p>Your counter-proposal letter is attached as a Word document (.docx). Open it, replace the placeholder fields, and send when ready.</p>",
        attachments: [
          {
            filename: `Counter-Proposal-Letter-${id}.docx`,
            content: docxBuffer,
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        ],
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Send letter error:", err.message || err);
      res.status(500).json({ error: "Failed to send letter" });
    }
  });

  // FIX 3: Download counter-proposal letter as .docx — GATED
  app.get("/api/analyze/:id/letter.docx", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = storage.getAnalysis(id);
      if (!analysis) return res.status(404).json({ error: "Analysis not found" });
      const gate = requirePaidOrInternal(analysis, req);
      if (!gate.ok) return res.status(gate.status).json(gate.body);
      if (!analysis.counterProposal) {
        return res.status(400).json({ error: "No counter-proposal letter generated yet" });
      }
      const docxBuffer = await generateLetterDocx(analysis.counterProposal, id);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="Counter-Proposal-Letter-${id}.docx"`);
      res.send(docxBuffer);
    } catch (err: any) {
      console.error("Counter-proposal docx download error:", err?.message || err);
      res.status(500).json({ error: "Failed to generate letter" });
    }
  });

  // FIX 2: Download Q&A transcript as .txt — GATED
  app.get("/api/analyze/:id/qa.txt", (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const analysis = storage.getAnalysis(id);
    if (!analysis) return res.status(404).json({ error: "Analysis not found" });
    const gate = requirePaidOrInternal(analysis, req);
    if (!gate.ok) return res.status(gate.status).json(gate.body);
    if (!analysis.qaTranscript) {
      return res.status(400).json({ error: "No Q&A transcript yet — ask a question first" });
    }
    let transcript: Array<{role: string; content: string}>;
    try {
      transcript = JSON.parse(analysis.qaTranscript);
    } catch {
      return res.status(500).json({ error: "Stored Q&A transcript is corrupt" });
    }
    const lines = [
      `MedContractIntel — Q&A Transcript`,
      `Analysis #${id}`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `────────────────────────────────────────`,
      ``,
    ];
    for (const msg of transcript) {
      const who = msg.role === "user" ? "You" : "MedContractIntel";
      lines.push(`${who}:`);
      lines.push(msg.content);
      lines.push("");
    }
    lines.push(`────────────────────────────────────────`);
    lines.push(`This is educational analysis, not legal advice.`);
    lines.push(`Consult a healthcare attorney before making contract decisions.`);
    const body = lines.join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="MedContract-QA-${id}.txt"`);
    res.send(body);
  });

  // FIX 2: Email Q&A transcript — GATED
  app.post("/api/analyze/:id/send-qa", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { email } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email" });
      }
      const analysis = storage.getAnalysis(id);
      if (!analysis) return res.status(404).json({ error: "Analysis not found" });
      const gate = requirePaidOrInternal(analysis, req);
      if (!gate.ok) return res.status(gate.status).json(gate.body);
      if (!analysis.qaTranscript) {
        return res.status(400).json({ error: "No Q&A transcript yet — ask a question first" });
      }
      let transcript: Array<{role: string; content: string}>;
      try {
        transcript = JSON.parse(analysis.qaTranscript);
      } catch {
        return res.status(500).json({ error: "Stored Q&A transcript is corrupt" });
      }
      // FIX 6 (2026-04-15): the Q&A is now formatted as readable HTML in the
      // email body itself (matching purchase / report email styling) instead
      // of a .txt attachment. Removes one click and looks professional.
      const escape = (s: string) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
      const qaHtmlBody = transcript.map((m) => {
        const isUser = m.role === "user";
        return `
          <div style="margin:0 0 1.25rem; padding:0 0 1rem; border-bottom:1px solid #e5e7eb;">
            <p style="font-size:0.7rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${isUser ? "#061e15" : "#9c7e2e"}; margin:0 0 0.5rem;">${isUser ? "Question" : "MedContractIntel"}</p>
            <p style="color:${isUser ? "#061e15" : "#374151"}; font-size:0.9375rem; line-height:1.6; margin:0; ${isUser ? "font-weight:600;" : ""}">${escape(m.content)}</p>
          </div>`;
      }).join("");
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:640px; margin:0 auto; padding:2rem 1rem; color:#1f2937; background:#f9fafb;">
          <div style="background:#061e15; border-radius:12px 12px 0 0; padding:1.5rem 2rem; text-align:center;">
            <p style="color:#9c7e2e; font-size:0.7rem; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; margin:0 0 0.4rem;">MedContractIntel</p>
            <p style="color:rgba(255,255,255,0.5); font-size:0.75rem; margin:0;">Your Contract Q&amp;A Transcript</p>
          </div>
          <div style="background:#ffffff; padding:2rem; border:1px solid #e5e7eb;">
            <p style="color:#061e15; font-size:1rem; margin:0 0 1.25rem;">Below is your full Q&amp;A session for analysis #${id}.</p>
            ${qaHtmlBody}
            <p style="color:#9ca3af; font-size:0.75rem; line-height:1.5; margin:1.5rem 0 0;">This is educational analysis, not legal advice. Consult a healthcare attorney before making contract decisions.</p>
          </div>
          <div style="background:#061e15; border-radius:0 0 12px 12px; padding:1rem 2rem; text-align:center;">
            <p style="color:rgba(255,255,255,0.4); font-size:0.7rem; margin:0;">MedContractIntel · <a href="mailto:service@medcontractintel.com" style="color:#1db5b5; text-decoration:none;">service@medcontractintel.com</a></p>
          </div>
        </div>`;
      const result = await sendEmail({
        to: email,
        subject: `Your MedContractIntel Q&A Transcript — Analysis #${id}`,
        html,
      });
      if (!result.success) {
        return res.status(502).json({ success: false, error: result.error || "Email provider error" });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Send Q&A error:", err?.message || err);
      res.status(500).json({ error: "Failed to send Q&A transcript" });
    }
  });

  // Contract Q&A chat endpoint — GATED
  app.post("/api/analyze/:id/chat", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = storage.getAnalysis(id);
      if (!analysis || analysis.status !== "complete" || !analysis.analysisResult) {
        return res.status(400).json({ error: "Analysis not complete" });
      }
      const gate = requirePaidOrInternal(analysis, req);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const { message, history } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Enforce 15-question limit
      const priorUserMessages = (history || []).filter((m: any) => m.role === "user").length;
      if (priorUserMessages >= 15) {
        return res.json({
          reply: "You've reached the 15-question limit for this analysis. For additional questions, please start a new contract analysis or consult a healthcare attorney for complex legal questions.",
        });
      }

      const result = JSON.parse(analysis.analysisResult);
      const contractText = analysis.contractText;

      // Build a concise summary of the analysis for context (avoid sending full JSON)
      const execSummary = result.executiveSummary || {};
      const compensation = result.compensation || {};
      const noncompete = result.noncompete || {};
      const malpractice = result.malpractice || {};
      const termination = result.terminationProvisions || {};

      const analysisContext = `ANALYSIS SUMMARY:
Overall Risk: ${execSummary.overallRiskRating || execSummary.riskLevel || "N/A"} (Score: ${execSummary.overallRiskScore || execSummary.overallScore || "N/A"}/100)
Key Concerns: ${(execSummary.keyRedFlags || execSummary.topConcerns || []).join("; ")}
Key Strengths: ${(execSummary.keyStrengths || execSummary.topStrengths || []).join("; ")}
Compensation Model: ${compensation.model || "N/A"}
RVU Details: ${compensation.rvu ? JSON.stringify(compensation.rvu) : "N/A"}
Non-Compete: ${noncompete.exists !== undefined ? (noncompete.exists ? `Yes — ${noncompete.radius}, ${noncompete.duration}` : "None") : "See analysis"}
Malpractice: ${malpractice.type || "N/A"} — Tail: ${malpractice.tailCoverage || "N/A"}
Termination Without Cause: ${termination.withoutCauseNotice || "N/A"}`;

      const systemPrompt = `You are the Contract Intelligence Assistant for MedContractIntel, helping an internal medicine and hospitalist physician understand their employment contract.

You have access to:
1. The FULL CONTRACT TEXT
2. The AI ANALYSIS that was already performed

RULES:
- Answer questions about THIS CONTRACT and its analysis, AND common questions physicians have when navigating contract negotiations — such as who to contact at their employer, how to approach conversations with HR vs. recruiters vs. medical directors, when to involve an attorney, general negotiation strategy, and how to prepare for a negotiation meeting. These are directly relevant to using the contract analysis. If asked about something truly unrelated (weather, general medicine, unrelated personal topics), redirect: "I can only help with questions about your contract and the negotiation process. What would you like to know?"
- For questions like "who should I speak with about my contract?" — give a direct, practical answer based on the employer type identified in the contract. At a staffing company: start with the recruiter for compensation questions, escalate to regional medical director for structural issues, involve HR only for benefits/onboarding. At a hospital: HR or physician relations for standard terms, CMO/department chair for schedule and clinical issues. Always recommend having an attorney review before signing regardless of who they speak with.
- Explain contract language in plain English. Be specific — reference actual clauses and terms from the contract.
- When comparing to benchmarks, clearly state the source (e.g., "MGMA median", "MGMA data").
- You are NOT providing legal advice. You are explaining contract terms and their implications.
- NEVER tell the physician whether to sign or not sign. Instead, explain the risks and trade-offs so they can make an informed decision.
- If asked "should I sign this?" or similar, respond: "I can't advise whether to sign — that's a personal and legal decision. But I can explain the specific risks and benefits to help you decide. What aspect concerns you most?"
- Keep responses concise — 2-4 paragraphs max. Use bullet points for lists.
- End every response with this exact disclaimer on its own line:
---
*This is educational analysis, not legal advice. Consult a healthcare attorney before making contract decisions.*

CONTRACT TEXT:
${contractText.substring(0, 15000)}

${analysisContext}`;

      // Build messages array with history
      const messages: Array<{role: string; content: string}> = [];
      if (history && Array.isArray(history)) {
        for (const msg of history.slice(-10)) { // Keep last 10 messages for context
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      messages.push({ role: "user", content: message });

      const reply = await callClaudeChat(systemPrompt, messages);

      // Persist full Q&A transcript to DB so it can be included in PDF download
      try {
        const fullTranscript = [
          ...(Array.isArray(history) ? history : []),
          { role: "user", content: message },
          { role: "assistant", content: reply },
        ];
        storage.updateQaTranscript(id, JSON.stringify(fullTranscript));
      } catch (transcriptErr: any) {
        console.warn("[Chat] Failed to save transcript:", transcriptErr.message);
      }

      res.json({ reply });
    } catch (err: any) {
      console.error("Chat error:", err.message || err);
      res.status(500).json({ error: "Failed to process question" });
    }
  });

  // Calculator / checklist email capture → Kit tag subscription + results email
  app.post("/api/subscribe", async (req: Request, res: Response) => {
    const { email, tag, results } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }

    // Tag ID mapping — add new tags here as needed
    const TAG_IDS: Record<string, number> = {
      "calculator-lead": 18866964,
      "lead-magnet-downloaded": 18504641,
    };

    const KIT_API_SECRET = process.env.KIT_API_SECRET || "mMxWbfbQnzp-6B1S67GFX4sps7B8_-kAUQvlF4fuFmU";
    const tagName = tag || "calculator-lead";
    const tagId = TAG_IDS[tagName];

    try {
      // 1. Subscribe to Kit tag
      if (tagId) {
        // 10-second timeout — prevents a Kit outage from hanging the request
        // indefinitely and piling up open connections on Railway.
        const kitController = new AbortController();
        const kitTimeout = setTimeout(() => kitController.abort(), 10_000);
        let kitRes: Response;
        try {
          kitRes = await fetch(`https://api.convertkit.com/v3/tags/${tagId}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_secret: KIT_API_SECRET, email }),
            signal: kitController.signal,
          });
        } catch (fetchErr: any) {
          if (fetchErr?.name === "AbortError") {
            console.warn(`[Subscribe] Kit API timed out after 10s for ${email}`);
          } else {
            console.warn(`[Subscribe] Kit API fetch failed for ${email}: ${fetchErr?.message}`);
          }
          // Don't fail the whole subscribe request — still send the results email below.
          kitRes = new Response(null, { status: 599 });
        } finally {
          clearTimeout(kitTimeout);
        }
        if (!kitRes.ok) {
          console.warn(`[Subscribe] Kit tag ${tagId} returned ${kitRes.status} for ${email}`);
        } else {
          console.log(`[Subscribe] ${email} subscribed to Kit tag "${tagName}" (${tagId})`);
        }
      } else {
        console.warn(`[Subscribe] Unknown tag: "${tagName}" — subscriber not tagged`);
      }

      // 2. Send results email if calculator results provided
      if (results && typeof results === "object") {
        const { sendEmail: send } = await import("./email-service.js");
        await send({
          to: email,
          subject: "Your MedContractIntel Calculator Results — MedContractIntel™",
          html: buildCalculatorResultsEmail(results),
        });
        console.log(`[Subscribe] Calculator results email sent to ${email}`);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Subscribe] Error:", err.message);
      res.status(500).json({ error: "Subscription failed" });
    }
  });

  // Debug endpoint — raw HTTPS call to Claude API
  app.get("/api/test-claude", async (req: Request, res: Response) => {
    try {
      const data = JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "say hi" }]
      });
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data)
        }
      };
      const request = https.request(options, (response: any) => {
        let body = "";
        response.on("data", (chunk: any) => body += chunk);
        response.on("end", () => res.json({ status: response.statusCode, body }));
      });
      request.on("error", (e: any) => res.json({ error: e.message }));
      request.write(data);
      request.end();
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  // ── Better Stack uptime monitor webhook ────────────────────────────────────
  //
  // Receives POST notifications from Better Stack when a monitor goes down or
  // recovers. Register this URL in Better Stack under Monitors → Integrations →
  // Webhook:  https://medcontractintel.com/api/ops/uptime-webhook
  //
  // Better Stack payload shape (simplified):
  //   { monitor: { id, url, pronounceable_name }, started_at, status }
  //   status is one of: "up" | "down" | "paused" | "pending"
  //
  // TODO (Phase 1c): Replace the console.log below with a GitHub API commit to
  // med-contract-ops/INBOX/YYYY-MM-DD-uptime-{timestamp}.md using the same
  // writeOpsInbox pattern from stripe-webhook.ts. That will let the Ops
  // Controller agent classify and respond to outages on its next wake cycle.
  app.post("/api/ops/uptime-webhook", (req: Request, res: Response) => {
    try {
      const payload = req.body || {};

      // Extract the fields Better Stack sends
      const monitorName: string = payload?.monitor?.pronounceable_name || payload?.monitor?.url || "unknown";
      const monitorUrl: string = payload?.monitor?.url || "";
      const status: string = payload?.status || "unknown";
      const startedAt: string = payload?.started_at || new Date().toISOString();

      const severity = status === "down" ? "CRITICAL" : "INFO";

      // Log to Railway so the event is captured even before Phase 1c is wired up
      console.error(
        `[Uptime:${severity}] monitor="${monitorName}" status=${status}` +
        ` url=${monitorUrl} started_at=${startedAt}`
      );

      // TODO (Phase 1c): commit INBOX file via GitHub API:
      //   POST /repos/ambamplify/med-contract-ops/contents/INBOX/YYYY-MM-DD-uptime-{ts}.md
      //   body: base64(frontmatter + payload JSON)
      // This mirrors the writeOpsInbox() pattern in stripe-webhook.ts.

      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Uptime] Webhook handler error:", err.message);
      // Always return 200 to Better Stack — a non-200 triggers a retry storm
      res.status(200).json({ received: true, error: err.message });
    }
  });
}

// Raw HTTPS call to Anthropic API (bypasses SDK — fixes Node v24 hang)
function callClaudeAPI(systemPrompt: string, userPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      agent: httpsAgent,
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data)
      }
    };

    const request = https.request(options, (response) => {
      console.log(`[Claude API] Response started — status: ${response.statusCode}`);

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        console.log(`[Claude API] Response complete — total length: ${body.length} chars`);

        let parsed: any;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          console.error(`[Claude API] JSON parse failed on raw response. First 500 chars:\n${body.substring(0, 500)}`);
          reject(new Error(`Failed to parse API response (${body.length} chars): ${body.substring(0, 200)}`));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Anthropic API error ${response.statusCode}: ${parsed.error?.message || body.substring(0, 300)}`));
          return;
        }
        if (!parsed.content || !parsed.content[0] || parsed.content[0].type !== "text") {
          console.error(`[Claude API] Unexpected response structure:`, JSON.stringify(parsed).substring(0, 500));
          reject(new Error("No text content in Claude response"));
          return;
        }
        resolve(parsed.content[0].text);
      });
      response.on("error", (e) => {
        console.error(`[Claude API] Response stream error:`, e.message);
        reject(new Error(`Response stream error: ${e.message}`));
      });
    });

    request.on("error", (e) => reject(new Error(`HTTPS request failed: ${e.message}`)));

    // 8 minute timeout for large responses
    request.setTimeout(480000, () => {
      console.error(`[Claude API] Request timed out after 8 minutes`);
      request.destroy();
      reject(new Error("API call timed out after 8 minutes"));
    });

    request.write(data);
    request.end();
  });
}

// Sonnet call for Q&A chat
function callClaudeChat(systemPrompt: string, messages: Array<{role: string; content: string}>): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data),
      },
    };

    const request = https.request(options, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        let parsed: any;
        try {
          parsed = JSON.parse(body);
        } catch {
          reject(new Error(`Failed to parse chat API response`));
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Chat API error ${response.statusCode}: ${parsed.error?.message || body.substring(0, 300)}`));
          return;
        }
        if (!parsed.content || !parsed.content[0] || parsed.content[0].type !== "text") {
          reject(new Error("No text content in chat response"));
          return;
        }
        resolve(parsed.content[0].text);
      });
      response.on("error", (e) => reject(new Error(`Chat response error: ${e.message}`)));
    });

    request.on("error", (e) => reject(new Error(`Chat HTTPS request failed: ${e.message}`)));
    // 120s — complex contract questions can exceed 60s under load.
    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error("Chat API timed out after 120 seconds"));
    });

    request.write(data);
    request.end();
  });
}

// Retry wrapper — handles both HTTP 5xx errors and network-level failures (ECONNRESET, ETIMEDOUT)
async function callClaudeAPIWithRetry(systemPrompt: string, userPrompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callClaudeAPI(systemPrompt, userPrompt);
    } catch (err: any) {
      const msg = err.message || "";
      const code = err.code || "";
      const isRetryable =
        /API error (500|529|503)/.test(msg) ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "ECONNREFUSED" ||
        msg.includes("timed out") ||
        msg.includes("socket hang up");
      if (isRetryable && attempt < maxRetries) {
        const delay = attempt * 5000; // 5s, 10s backoff
        console.warn(`[Claude API] Attempt ${attempt}/${maxRetries} failed — ${msg.substring(0, 100)} — retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// Resume a previously-submitted analysis from its DB row. Used on startup
// to transparently requeue analyses that were orphaned by a Railway redeploy
// or hard crash. Rehydrates IntakeData from the row's columns, then fires
// runAnalysis in the background with proper rejection handling.
export function resumeAnalysisFromRow(row: Analysis): void {
  const intake: IntakeData = {
    state: row.state || "Unknown",
    region: row.region || "Unknown",
    compensationModel: row.compensationModel || "Unknown",
    yearsExperience: row.yearsExperience || "Unknown",
    settingType: row.settingType || "Unknown",
    employerType: row.employerType || "Unknown",
    apcSupervision: row.apcSupervision || "Unknown",
  };
  setImmediate(() => {
    runAnalysis(row.id, row.contractText, intake).catch((err) => {
      console.error(`[Analysis ${row.id}] Resume failed:`, err?.stack || err);
    });
  });
}

async function runAnalysis(id: number, contractText: string, intake: IntakeData) {
  try {
    storage.updateAnalysisStatus(id, "analyzing");
    console.log(`[Analysis ${id}] Starting analysis...`);

    const systemPrompt = buildSystemPrompt(intake);
    const userPrompt = USER_PROMPT_TEMPLATE.replace("{CONTRACT_TEXT}", contractText);

    console.log(`[Analysis ${id}] Calling Claude API via raw HTTPS...`);
    const startTime = Date.now();

    const rawText = await callClaudeAPIWithRetry(systemPrompt, userPrompt);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Analysis ${id}] Claude responded in ${elapsed}s`);

    let jsonStr = rawText.trim();

    // Strip markdown code fences if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    // Try to parse, with multiple escalating repair passes as fallback.
    // 2026-04-16: IDs 16, 17 failed at "Expected ',' or '}' after property value
    // in JSON at position ~13267" — Claude Sonnet occasionally emits literal
    // control characters (unescaped newlines, tabs) or an unescaped " inside a
    // long string value (contract excerpts). Pass 1: original JSON.parse.
    // Pass 2: repairJSON(). Pass 3: sanitize control chars inside string values.
    // Pass 4: last-ditch — escape stray unescaped quotes that don't terminate a
    // string. If all four fail, throw so the row is marked error with the
    // underlying parse error as context.
    let parsed: AnalysisResult | undefined;
    const attempts: Array<() => string> = [
      () => jsonStr,
      () => repairJSON(jsonStr),
      () => sanitizeJsonControlChars(jsonStr),
      () => sanitizeJsonControlChars(repairJSON(jsonStr)),
    ];
    let lastErr: any;
    for (let i = 0; i < attempts.length; i++) {
      try {
        parsed = JSON.parse(attempts[i]());
        if (i > 0) console.log(`[Analysis ${id}] JSON parsed on attempt ${i + 1}/${attempts.length}`);
        break;
      } catch (e: any) {
        lastErr = e;
        console.log(`[Analysis ${id}] JSON parse attempt ${i + 1} failed: ${e?.message || e}`);
      }
    }
    if (!parsed) {
      throw new Error(`JSON parse failed after ${attempts.length} attempts: ${lastErr?.message || lastErr}`);
    }

    // Validate required fields
    if (!parsed.executiveSummary || !parsed.clauseAnalysis) {
      throw new Error("Analysis response missing required fields");
    }

    const esKeys = parsed.executiveSummary ? Object.keys(parsed.executiveSummary) : [];
    console.log(`[Analysis ${id}] Analysis complete. executiveSummary keys: ${JSON.stringify(esKeys)}`);
    storage.updateAnalysisResult(id, JSON.stringify(parsed));

    // FIX 5 Part B (2026-04-15): auto-send the full report email if we have
    // the buyer's email on file (captured by the Stripe webhook at payment
    // time, or set via bundleEmail redemption, or manually on the report page).
    // This replaces the previous flow where the user had to submit their email
    // on the report page to receive the PDF. Email send failures are logged
    // but do NOT block completion — the user can still download from /report.
    const saved = storage.getAnalysis(id);
    const autoEmail = saved?.email;
    if (autoEmail) {
      setImmediate(async () => {
        try {
          const result: AnalysisResult = parsed;
          const pdfBuffer = generatePDF(result, saved?.employerType || "Employment", saved?.qaTranscript || undefined);
          const riskRating = (result as any).executiveSummary?.overallRiskRating || (result as any).executiveSummary?.riskLevel || "See Report";
          const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [
            { filename: `MedContract-Analysis-${id}.pdf`, content: Buffer.from(pdfBuffer), contentType: "application/pdf" },
          ];
          if (saved?.counterProposal) {
            try {
              const docxBuffer = await generateLetterDocx(saved.counterProposal, id);
              attachments.push({
                filename: `Counter-Proposal-Letter-${id}.docx`,
                content: docxBuffer,
                contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              });
            } catch {}
          }
          const emailResult = await sendEmail({
            to: autoEmail,
            subject: `Your MedContractIntel Analysis Report — ${saved?.employerType || "Contract"} Review`,
            html: buildReportEmailHtml(saved?.employerType || "Employment", riskRating, !!saved?.counterProposal),
            attachments,
          });
          if (emailResult.success) {
            console.log(`[Analysis ${id}] Auto-sent report to ${autoEmail}`);
          } else {
            console.warn(`[Analysis ${id}] Auto-email to ${autoEmail} failed: ${emailResult.error}`);
          }
        } catch (autoErr: any) {
          console.error(`[Analysis ${id}] Auto-email build/send failed:`, autoErr?.message || autoErr);
        }
      });
    } else {
      console.log(`[Analysis ${id}] Complete — no email on file, user must request manually`);
    }
  } catch (err: any) {
    // Defensive: wrap the error-handling DB write so that a failing SQLite write
    // inside the catch does not propagate as an unhandled rejection. On Railway's
    // ephemeral disk, SQLite WAL writes can intermittently throw.
    try {
      console.error(`[Analysis ${id}] Error:`, err.message || err);
      const isApiError = /API error (500|529|503)/.test(err.message || "");
      const userMessage = isApiError
        ? "Analysis temporarily unavailable. Please try again in a few minutes. If the problem persists, email service@medcontractintel.com with your order number for a full refund."
        : err.message || "Analysis failed. Please try again.";
      storage.updateAnalysisStatus(id, "error", userMessage);
    } catch (innerErr: any) {
      console.error(`[Analysis ${id}] Error handler itself failed:`, innerErr?.message || innerErr);
    }
  }
}

function buildCalculatorResultsEmail(results: Record<string, any>): string {
  const effectiveHourly = results.effectiveHourly || results.hourlyRate || "";
  const gapVsMedian = results.gapVsMedian || results.annualGap || "";
  const groupRevenue = results.groupRevenue || results.rvuRevenue || "";

  const fmt = (v: any) => (v ? String(v) : "—");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:2rem 1rem;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:#061e15;border-radius:12px 12px 0 0;padding:1.5rem 2rem;text-align:center;">
          <p style="color:#9c7e2e;font-size:0.7rem;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 0.25rem;">MedContractIntel™</p>
          <p style="color:rgba(255,255,255,0.5);font-size:0.7rem;margin:0;">DATA · LEVERAGE · FAIR PAY</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:2rem;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="color:#061e15;font-size:1.125rem;font-weight:700;margin:0 0 1rem;">Your MedContractIntel Calculator Results</p>
          <p style="color:#374151;font-size:0.9375rem;margin:0 0 1.5rem;line-height:1.6;">Here's a summary of your numbers:</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:1.5rem;">
            ${effectiveHourly ? `<tr><td style="padding:0.875rem 1rem;border-bottom:1px solid #e5e7eb;">
              <span style="color:#6b7280;font-size:0.8125rem;">Effective Hourly Rate</span><br>
              <span style="color:#061e15;font-weight:700;font-size:1rem;">${fmt(effectiveHourly)}</span>
            </td></tr>` : ""}
            ${gapVsMedian ? `<tr><td style="padding:0.875rem 1rem;border-bottom:1px solid #e5e7eb;">
              <span style="color:#6b7280;font-size:0.8125rem;">Gap vs. Market Median</span><br>
              <span style="color:#dc2626;font-weight:700;font-size:1rem;">${fmt(gapVsMedian)}</span>
            </td></tr>` : ""}
            ${groupRevenue ? `<tr><td style="padding:0.875rem 1rem;">
              <span style="color:#6b7280;font-size:0.8125rem;">Estimated Group RVU Revenue</span><br>
              <span style="color:#061e15;font-weight:700;font-size:1rem;">${fmt(groupRevenue)}</span>
            </td></tr>` : ""}
          </table>

          <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:1.5rem;">
            <tr><td align="center">
              <a href="https://medcontractintel.com/analyzer"
                 style="display:inline-block;background:#9c7e2e;color:#061e15;font-weight:700;font-size:0.9375rem;padding:0.875rem 2rem;border-radius:8px;text-decoration:none;">
                Analyze My Contract — $97 →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:0.875rem;line-height:1.7;margin:0 0 0.75rem;">
            These numbers give you context. A full contract analysis gives you the exact clause language, a ranked negotiation plan, and a counter-proposal letter — specific to your contract.
          </p>
          <p style="color:#6b7280;font-size:0.875rem;line-height:1.7;margin:0;">
            Also check the <a href="https://medcontractintel.com/checklist" style="color:#1db5b5;">Free Red Flag Checklist</a> — 15 clauses to verify before you sign.
          </p>
        </td></tr>
        <tr><td style="background:#061e15;border-radius:0 0 12px 12px;padding:1.25rem 2rem;text-align:center;">
          <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:0 0 0.25rem;">
            MedContractIntel™ · <a href="mailto:service@medcontractintel.com" style="color:#1db5b5;text-decoration:none;">service@medcontractintel.com</a>
          </p>
          <p style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin:0;">Educational purposes only — not legal advice.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Sanitize literal control characters INSIDE JSON string values. When Claude
// emits a long string (e.g. a quoted contract clause) with a raw newline or
// tab, JSON.parse fails with "Expected ',' or '}' after property value…" at
// the offending position. Walk the string once, track whether we're inside a
// double-quoted JSON string (respecting backslash escapes), and replace raw
// \n \r \t inside strings with their escaped forms. Also neutralises any
// other <0x20 control char inside a string.
function sanitizeJsonControlChars(input: string): string {
  let out = "";
  let inString = false;
  let prev = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && prev !== "\\") {
      inString = !inString;
      out += ch;
    } else if (inString && ch === "\n") {
      out += "\\n";
    } else if (inString && ch === "\r") {
      out += "\\r";
    } else if (inString && ch === "\t") {
      out += "\\t";
    } else if (inString && ch.charCodeAt(0) < 0x20) {
      // Drop other control chars silently inside strings
      // (vertical tab, backspace, form feed, etc.)
    } else {
      out += ch;
    }
    // Update prev — treat consecutive backslashes correctly so \\" isn't mis-escaped
    prev = prev === "\\" && ch === "\\" ? "" : ch;
  }
  return out;
}

function repairJSON(str: string): string {
  let s = str.trim();

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of s) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") braces++;
      else if (ch === "}") braces--;
      else if (ch === "[") brackets++;
      else if (ch === "]") brackets--;
    }
  }

  if (inString) {
    s += '"';
  }

  s = s.replace(/,\s*$/, "");

  while (brackets > 0) {
    s += "]";
    brackets--;
  }
  while (braces > 0) {
    s += "}";
    braces--;
  }

  return s;
}
