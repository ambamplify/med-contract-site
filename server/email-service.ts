/**
 * Email Service — pluggable email sender for MedContractIntel
 *
 * To configure: Set these environment variables:
 *   EMAIL_PROVIDER=resend|sendgrid|smtp   (default: none — emails are logged only)
 *   EMAIL_API_KEY=your-api-key
 *   EMAIL_FROM=noreply@yourdomain.com     (default: noreply@medcontractintel.com)
 *
 * If no EMAIL_PROVIDER is set, emails are logged to console but not sent (dev mode).
 */

import https from "https";

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "";
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || "";
// BUG 3 (2026-04-15): Railway env has EMAIL_FROM set to the bare address
// "service@medcontractintel.com", so recipients saw the sender as "service".
// Wrap it with a brand display name if none is already embedded ("Name <addr>").
const EMAIL_FROM_RAW = process.env.EMAIL_FROM || "noreply@medcontractintel.com";
const EMAIL_FROM = EMAIL_FROM_RAW.includes("<")
  ? EMAIL_FROM_RAW
  : `MedContractIntel™ <${EMAIL_FROM_RAW}>`;

// Parse "Name <email@host>" into { name, email } for providers that require
// split fields (SendGrid). Falls back gracefully if the raw value is bare.
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || "MedContractIntel™", email: m[2] };
  return { name: "MedContractIntel™", email: raw };
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  console.log(`[Email] Sending to ${options.to} — subject: "${options.subject}"`);

  if (!EMAIL_PROVIDER) {
    console.log(`[Email] No EMAIL_PROVIDER set — email logged but not sent (dev mode)`);
    console.log(`[Email] To enable sending, set EMAIL_PROVIDER=resend and EMAIL_API_KEY=your-key`);
    return { success: true }; // Return success in dev mode so flow continues
  }

  try {
    switch (EMAIL_PROVIDER.toLowerCase()) {
      case "resend":
        return await sendViaResend(options);
      case "sendgrid":
        return await sendViaSendGrid(options);
      default:
        console.warn(`[Email] Unknown provider: ${EMAIL_PROVIDER}`);
        return { success: false, error: `Unknown email provider: ${EMAIL_PROVIDER}` };
    }
  } catch (err: any) {
    console.error(`[Email] Send failed:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Resend ───────────────────────────────────────────
function sendViaResend(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const body: any = {
      from: EMAIL_FROM,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    };

    if (options.attachments?.length) {
      body.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
        content_type: a.contentType,
      }));
    }

    const data = JSON.stringify(body);

    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${EMAIL_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`[Email] Resend: sent successfully`);
            resolve({ success: true });
          } else {
            console.error(`[Email] Resend error ${res.statusCode}: ${responseBody}`);
            resolve({ success: false, error: `Resend API error: ${res.statusCode}` });
          }
        });
      }
    );

    req.on("error", (e) => resolve({ success: false, error: e.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ success: false, error: "Email send timed out" });
    });

    req.write(data);
    req.end();
  });
}

// ─── SendGrid ─────────────────────────────────────────
function sendViaSendGrid(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const parsed = parseFrom(EMAIL_FROM);
    const body: any = {
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: parsed.email, name: parsed.name },
      subject: options.subject,
      content: [{ type: "text/html", value: options.html }],
    };

    if (options.attachments?.length) {
      body.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
        type: a.contentType,
        disposition: "attachment",
      }));
    }

    const data = JSON.stringify(body);

    const req = https.request(
      {
        hostname: "api.sendgrid.com",
        path: "/v3/mail/send",
        method: "POST",
        headers: {
          Authorization: `Bearer ${EMAIL_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 202) {
            console.log(`[Email] SendGrid: sent successfully`);
            resolve({ success: true });
          } else {
            console.error(`[Email] SendGrid error ${res.statusCode}: ${responseBody}`);
            resolve({ success: false, error: `SendGrid API error: ${res.statusCode}` });
          }
        });
      }
    );

    req.on("error", (e) => resolve({ success: false, error: e.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ success: false, error: "Email send timed out" });
    });

    req.write(data);
    req.end();
  });
}

// ─── Testimonial request email ────────────────────────
export async function sendTestimonialRequestEmail(to: string, employerType: string): Promise<{success: boolean; error?: string}> {
  try {
    const result = await sendEmail({
      to,
      subject: "Quick question about your contract analysis",
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 2rem; color: #1f2937;">
          <p style="color: #061e15; font-weight: 700; font-size: 1.125rem; margin-bottom: 1.25rem;">Hi,</p>
          <p style="line-height: 1.7; margin-bottom: 1rem;">Two weeks ago you analyzed your ${employerType || "employment"} contract with MedContractIntel™.</p>
          <p style="line-height: 1.7; margin-bottom: 1rem;">We'd love to know — did it help? What did you negotiate?</p>
          <p style="line-height: 1.7; margin-bottom: 1rem;">Reply to this email with your experience. With your permission, we may share your story (anonymously) to help other physicians in your position.</p>
          <p style="line-height: 1.7; margin-bottom: 2rem; color: #6b7280; font-size: 0.9rem;">No obligation — even a one-line update means a lot.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
          <p style="font-size: 0.8rem; color: #9ca3af;">MedContractIntel™ &nbsp;·&nbsp; service@medcontractintel.com</p>
        </div>
      `,
    });
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Email HTML template ──────────────────────────────
export function buildReportEmailHtml(employerType: string, riskRating: string, hasCounterProposal = false): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#061e15;border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#fff;font-size:24px;margin:0 0 4px;">MedContractIntel™</h1>
      <p style="color:#9c7e2e;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0;">Data. Leverage. Fair Pay.</p>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="color:#061e15;font-size:18px;margin:0 0 16px;">Your Contract Analysis Report</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Your ${employerType || "employment"} contract analysis is attached as a PDF.
        The overall risk rating is <strong>${riskRating || "See Report"}</strong>.
      </p>
      ${hasCounterProposal ? `<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
        We've also attached your <strong>counter-proposal letter</strong> — a professional communication template you can customize and send to your employer.
      </p>` : ""}
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Review the report carefully and consider consulting a healthcare attorney for any items rated <strong>High</strong> or <strong>Critical</strong> risk.
      </p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="color:#6b7280;font-size:12px;margin:0;"><strong>Next steps:</strong></p>
        <ol style="color:#6b7280;font-size:12px;margin:8px 0 0;padding-left:20px;line-height:1.8;">
          <li>Review the attached PDF report</li>
          <li>${hasCounterProposal ? "Review and customize the attached counter-proposal letter" : "Use the online tool to generate a counter-proposal letter"}</li>
          <li>Consult a healthcare attorney if needed</li>
        </ol>
      </div>
      <p style="color:#9ca3af;font-size:10px;line-height:1.5;margin:0;">
        This analysis is for informational purposes only and does not constitute legal advice.
        No attorney-client relationship is created by use of this tool.
      </p>
    </div>
  </div>
</body>
</html>`;
}
