import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { analyses, type InsertAnalysis, type Analysis } from "../shared/schema.js";

// DATABASE_PATH env var lets Railway (or any prod host) point the SQLite file
// at a persistent volume (e.g. /data/med-contract.db). Falls back to a relative
// path so local dev still works without any env configuration.
const dbPath = process.env.DATABASE_PATH || "med-contract.db";
// Ensure the parent directory exists — on first boot after attaching a fresh
// volume, /data will be empty and SQLite would otherwise fail to open the file.
const dbDir = path.dirname(dbPath);
if (dbDir && dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
console.log(`[storage] opening SQLite at ${path.resolve(dbPath)}`);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Create table if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_text TEXT NOT NULL,
    state TEXT,
    region TEXT,
    compensation_model TEXT,
    years_experience TEXT,
    setting_type TEXT,
    employer_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    analysis_result TEXT,
    email TEXT,
    created_at INTEGER
  )
`);

// Bundle analyzer credits — one row per unique buyer email. Incremented by
// the Stripe webhook on Bundle purchases and decremented by /api/create-checkout
// when a bundle buyer redeems their included analyzer run. COLLATE NOCASE on
// the email primary key makes lookups case-insensitive (Alice@X.com == alice@x.com).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS bundle_credits (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    credits INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

// Add columns if they don't exist (migration for existing databases)
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN apc_supervision TEXT`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN counter_proposal TEXT`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN phone TEXT`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN qa_transcript TEXT`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN testimonial_email_sent INTEGER DEFAULT 0`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN stripe_session_id TEXT`); } catch { /* exists */ }
// Payment gate: add column + grandfather all existing rows as "paid" on first
// deployment. The ALTER succeeds exactly once; the UPDATE then runs once and
// is skipped on subsequent boots (ALTER throws, catch swallows, UPDATE is inside the try).
try {
  sqlite.exec(`ALTER TABLE analyses ADD COLUMN payment_status TEXT DEFAULT 'unpaid'`);
  sqlite.exec(`UPDATE analyses SET payment_status = 'paid'`);
  console.log(`[storage] payment_status column added and existing rows grandfathered as paid`);
} catch { /* column exists */ }

const db = drizzle(sqlite);

export const storage = {
  createAnalysis(data: InsertAnalysis): Analysis {
    const result = db.insert(analyses).values(data).returning().get();
    return result;
  },

  getAnalysis(id: number): Analysis | undefined {
    return db.select().from(analyses).where(eq(analyses.id, id)).get();
  },

  updateAnalysisStatus(id: number, status: string, errorMessage?: string) {
    if (errorMessage) {
      db.update(analyses)
        .set({ status, errorMessage })
        .where(eq(analyses.id, id))
        .run();
    } else {
      db.update(analyses)
        .set({ status })
        .where(eq(analyses.id, id))
        .run();
    }
  },

  updateAnalysisResult(id: number, result: string) {
    // Clear error_message on success — SIGTERM rollback and startup requeue
    // both set a transient "restarting" message on the row. Without clearing,
    // a successfully-completed analysis would carry a stale error_message,
    // breaking the invariant "complete rows have no error_message".
    db.update(analyses)
      .set({ status: "complete", analysisResult: result, errorMessage: null })
      .where(eq(analyses.id, id))
      .run();
  },

  updateEmail(id: number, email: string) {
    db.update(analyses)
      .set({ email })
      .where(eq(analyses.id, id))
      .run();
  },

  updateQaTranscript(id: number, transcript: string) {
    db.update(analyses)
      .set({ qaTranscript: transcript })
      .where(eq(analyses.id, id))
      .run();
  },

  updatePhone(id: number, phone: string) {
    db.update(analyses)
      .set({ phone })
      .where(eq(analyses.id, id))
      .run();
  },

  updateCounterProposal(id: number, letter: string) {
    db.update(analyses)
      .set({ counterProposal: letter })
      .where(eq(analyses.id, id))
      .run();
  },

  getCompleteCount(): number {
    const result = db.select({ count: sql<number>`count(*)` }).from(analyses).where(eq(analyses.status, 'complete')).get();
    return Number(result?.count ?? 0);
  },

  getAnalysesForTestimonialEmail(): Analysis[] {
    const fourteenDaysAgo = Math.floor(Date.now() / 1000) - (14 * 24 * 60 * 60);
    const fifteenDaysAgo = fourteenDaysAgo - (24 * 60 * 60);
    return db.select().from(analyses).where(
      sql`status = 'complete' AND email IS NOT NULL AND testimonial_email_sent = 0 AND created_at IS NOT NULL AND CAST(strftime('%s', datetime(created_at/1000, 'unixepoch')) AS INTEGER) BETWEEN ${fifteenDaysAgo} AND ${fourteenDaysAgo}`
    ).all();
  },

  markTestimonialEmailSent(id: number) {
    db.update(analyses).set({ testimonialEmailSent: true }).where(eq(analyses.id, id)).run();
  },

  // Mark any rows stuck in "analyzing" longer than `minutes` as "error". Called on startup
  // so analyses orphaned by a previous crash don't stay stuck forever from the user's POV.
  markStaleAnalysesAsError(minutes: number = 20): number {
    const cutoffMs = Date.now() - minutes * 60 * 1000;
    const result = sqlite.prepare(
      `UPDATE analyses
         SET status = 'error',
             error_message = 'Analysis was interrupted before it could complete. Please resubmit — you will not be charged again.'
       WHERE status = 'analyzing'
         AND created_at IS NOT NULL
         AND created_at < ?`
    ).run(cutoffMs);
    return result.changes;
  },

  // Roll all "analyzing" rows back to "pending" with a shutdown message.
  // Called on SIGTERM (Railway redeploy signal) so in-flight analyses can be
  // resumed by the next container instead of being permanently marked as errors.
  markAnalyzingAsPending(message: string): number {
    const result = sqlite.prepare(
      `UPDATE analyses
         SET status = 'pending',
             error_message = ?
       WHERE status = 'analyzing'`
    ).run(message);
    return result.changes;
  },

  // Return any rows in "pending" status older than `minutes`. Used on startup
  // to requeue analyses that were orphaned by a previous redeploy or crash.
  // Fresh submissions (status "pending" for < 2 min) are not returned — they
  // are already queued via setImmediate in the POST handler.
  getStalePending(minutes: number = 2): Analysis[] {
    const cutoffMs = Date.now() - minutes * 60 * 1000;
    return db
      .select()
      .from(analyses)
      .where(sql`status = 'pending' AND created_at IS NOT NULL AND created_at < ${cutoffMs}`)
      .all();
  },

  // Attach a Stripe Checkout session ID to an analysis row. Called by
  // /api/create-checkout after stripe.checkout.sessions.create() returns.
  setStripeSessionId(id: number, sessionId: string) {
    db.update(analyses).set({ stripeSessionId: sessionId }).where(eq(analyses.id, id)).run();
  },

  // Flip payment_status to "paid". Called by the Stripe webhook on
  // checkout.session.completed. Does not start the analysis itself — the
  // caller is responsible for queueing runAnalysis after marking paid.
  markAnalysisPaid(id: number) {
    db.update(analyses).set({ paymentStatus: "paid" }).where(eq(analyses.id, id)).run();
  },

  // Idempotency helper for the webhook — look up an analysis by its Stripe
  // session ID so repeated webhook deliveries can detect "already processed".
  getAnalysisByStripeSessionId(sessionId: string): Analysis | undefined {
    return db.select().from(analyses).where(eq(analyses.stripeSessionId, sessionId)).get();
  },

  // Bundle credit helpers ─────────────────────────────────────────────────────
  // Grant one analyzer credit to the given email (bundle purchase). Increments
  // if the email already has credits.
  grantBundleCredit(email: string): number {
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    sqlite.prepare(
      `INSERT INTO bundle_credits (email, credits, created_at, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(email) DO UPDATE SET credits = credits + 1, updated_at = ?`
    ).run(normalized, now, now, now);
    const row = sqlite.prepare(`SELECT credits FROM bundle_credits WHERE email = ?`).get(normalized) as { credits: number } | undefined;
    return row?.credits ?? 0;
  },

  // How many unused analyzer credits this email has.
  getBundleCreditCount(email: string): number {
    const normalized = email.trim().toLowerCase();
    const row = sqlite.prepare(`SELECT credits FROM bundle_credits WHERE email = ?`).get(normalized) as { credits: number } | undefined;
    return row?.credits ?? 0;
  },

  // Atomically decrement credits for this email. Returns true if a credit was
  // successfully redeemed (caller can then skip Stripe). Returns false if the
  // email has no credits.
  redeemBundleCredit(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    const result = sqlite.prepare(
      `UPDATE bundle_credits SET credits = credits - 1, updated_at = ?
       WHERE email = ? AND credits > 0`
    ).run(Date.now(), normalized);
    return result.changes > 0;
  },
};
