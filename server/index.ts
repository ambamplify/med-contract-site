import "dotenv/config";

// Sentry must be imported and initialized BEFORE any other imports that might
// throw at load time, so the SDK can patch node's global error hooks first.
// Entire block is conditional on SENTRY_DSN — when the env var is missing
// (e.g. local dev, or before owner finishes Sentry account setup), the SDK
// is never initialized and the app behaves identically to a no-Sentry build.
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // 10% transaction sampling — enough to see traces under real traffic
    // without burning the Sentry quota on a low-volume production app.
    tracesSampleRate: 0.1,
  });
  console.log("[sentry] initialized");
}

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes, resumeAnalysisFromRow } from "./routes.js";
import { registerStripeWebhook } from "./stripe-webhook.js";
import { storage } from "./storage.js";
import { sendTestimonialRequestEmail } from "./email-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global safety net — keep the process alive even if a background task (e.g. fire-and-forget
// analysis job, scheduled testimonial email) throws an unhandled rejection or an event emitter
// fires an uncaught exception. Railway's SQLite-on-ephemeral-disk can intermittently throw on
// writes, and before these handlers a single thrown error inside an async callback would
// terminate the entire HTTP server and cause 502 Bad Gateway for all subsequent requests.
process.on("unhandledRejection", (reason: any) => {
  console.error("[unhandledRejection]", reason?.stack || reason);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason);
  }
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.stack || err);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
});

const app = express();

app.use(cors());

// ⚠️ Stripe webhook MUST be registered before express.json() — needs raw body for sig verification
registerStripeWebhook(app);

app.use(express.json({ limit: "10mb" }));

// Register analyzer API routes (/api/*)
registerRoutes(app);

// Sentry Express error handler — must be registered AFTER routes but BEFORE
// any other error middleware. Captures uncaught errors from route handlers
// and reports them to Sentry with full request context. No-op when DSN unset.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Production: serve static files
if (process.env.NODE_ENV === "production") {
  // In production, __dirname = dist/ (where index.mjs lives)
  // Vite builds React app to dist/app/ and marketing site stays in dist/public/
  const publicDir = path.resolve(__dirname, "public");
  const appDir = path.resolve(__dirname, "app");

  // No-cache helper for HTML responses
  const noCache = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
  };

  // Marketing site — static assets (JS/CSS get long-term cache; HTML gets no-cache via explicit routes)
  app.use(express.static(publicDir, { index: false }));

  // React analyzer app — served at /analyzer/*
  app.use("/analyzer", express.static(appDir, { index: false }));
  app.get("/analyzer", noCache, (_req, res) => res.sendFile(path.join(appDir, "index.html")));
  app.get("/analyzer/*", noCache, (_req, res) => res.sendFile(path.join(appDir, "index.html")));

  // Explicit routes for marketing sub-pages (bypass express.static directory-redirect ambiguity)
  app.get("/about", noCache, (_req, res) => res.sendFile(path.join(publicDir, "about", "index.html")));
  app.get("/about/", noCache, (_req, res) => res.sendFile(path.join(publicDir, "about", "index.html")));
  app.get("/checklist", noCache, (_req, res) => res.sendFile(path.join(publicDir, "checklist", "index.html")));
  app.get("/checklist/", noCache, (_req, res) => res.sendFile(path.join(publicDir, "checklist", "index.html")));
  app.get("/calculator", noCache, (_req, res) => res.sendFile(path.join(publicDir, "calculator", "index.html")));
  app.get("/calculator/", noCache, (_req, res) => res.sendFile(path.join(publicDir, "calculator", "index.html")));
  app.get("/refund", noCache, (_req, res) => res.sendFile(path.join(publicDir, "refund", "index.html")));
  app.get("/refund/", noCache, (_req, res) => res.sendFile(path.join(publicDir, "refund", "index.html")));
  app.get("/thank-you", noCache, (_req, res) => res.sendFile(path.join(publicDir, "thank-you", "index.html")));
  app.get("/thank-you/", noCache, (_req, res) => res.sendFile(path.join(publicDir, "thank-you", "index.html")));
  app.get("/checklist-thank-you", noCache, (_req, res) => res.sendFile(path.join(publicDir, "checklist-thank-you", "index.html")));
  app.get("/checklist-thank-you/", noCache, (_req, res) => res.sendFile(path.join(publicDir, "checklist-thank-you", "index.html")));

  // Marketing site HTML pages
  app.get("/pages/:page", noCache, (req, res) => {
    const filePath = path.join(publicDir, "pages", req.params.page);
    res.sendFile(filePath, (err) => {
      if (err) res.sendFile(path.join(publicDir, "index.html"));
    });
  });
  app.get("/pages/products/:page", noCache, (req, res) => {
    const filePath = path.join(publicDir, "pages", "products", req.params.page);
    res.sendFile(filePath, (err) => {
      if (err) res.sendFile(path.join(publicDir, "index.html"));
    });
  });

  // Marketing site catch-all (must be last)
  app.get("*", noCache, (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

// Graceful shutdown — Railway sends SIGTERM before rotating the container on a
// redeploy. Roll any in-flight analyses back to "pending" so the next container
// instance can resume them. Without this, a redeploy during an active analysis
// leaves the row stuck "analyzing" until the 3-min cleanup marks it as error.
let isShuttingDown = false;
function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] ${signal} received — rolling analyzing rows back to pending`);
  try {
    const rolled = storage.markAnalyzingAsPending(
      "Server restarting — analysis will resume."
    );
    console.log(`[shutdown] Rolled ${rolled} in-flight analysis row(s) to pending`);
  } catch (err: any) {
    console.error("[shutdown] Rollback failed:", err?.message || err);
  }
  // Short delay lets console output flush, then exit cleanly.
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MedContractIntel running on http://localhost:${PORT}`);

  // Startup recovery — runs in three layers:
  //
  // 1. Roll any "analyzing" rows back to "pending". SIGTERM should have done
  //    this already on a graceful redeploy, but a hard crash (OOM, node panic,
  //    Railway force-kill) can leave rows orphaned. Treat them as resumable
  //    rather than errors. (Beyond Perplexity's direct directions — reported.)
  try {
    const rolled = storage.markAnalyzingAsPending(
      "Server restart detected — analysis resuming."
    );
    if (rolled > 0) {
      console.log(`[startup] Rolled ${rolled} orphaned analyzing row(s) to pending`);
    }
  } catch (err: any) {
    console.error("[startup] Analyzing→pending rollback failed:", err?.message || err);
  }

  // 2. Requeue every "pending" analysis older than 2 minutes. These are rows
  //    from either (a) the rollback above or (b) SIGTERM's rollback from the
  //    previous container. Fresh submissions (<2 min old) are skipped because
  //    they are already queued via setImmediate in the POST handler and
  //    double-firing would waste an API call.
  try {
    const pending = storage.getStalePending(2);
    for (const row of pending) {
      console.log(`[startup] Requeuing stale pending analysis ${row.id}`);
      resumeAnalysisFromRow(row);
    }
    if (pending.length > 0) {
      console.log(`[startup] Requeued ${pending.length} pending analysis(es)`);
    }
  } catch (err: any) {
    console.error("[startup] Pending requeue failed:", err?.message || err);
  }

  // 3. Final safety net: if anything somehow remains stuck in "analyzing" for
  //    more than 3 minutes after requeue, mark it as error so the user sees a
  //    clear message instead of a report page that hangs forever. Healthy
  //    analysis completes in ~90s end-to-end (measured).
  try {
    const cleaned = storage.markStaleAnalysesAsError(3);
    if (cleaned > 0) {
      console.log(`[startup] Marked ${cleaned} stale analyzing row(s) as error`);
    }
  } catch (err: any) {
    console.error("[startup] Stale-analysis cleanup failed:", err?.message || err);
  }
});

// Day-14 testimonial email scheduler — runs every hour
async function runTestimonialEmailCheck() {
  try {
    const due = storage.getAnalysesForTestimonialEmail();
    for (const analysis of due) {
      if (!analysis.email) continue;
      const result = await sendTestimonialRequestEmail(analysis.email, analysis.employerType || "employment");
      if (result.success) {
        storage.markTestimonialEmailSent(analysis.id);
        console.log(`[Testimonial] Sent to ${analysis.email} (analysis ${analysis.id})`);
      } else {
        console.warn(`[Testimonial] Failed for ${analysis.email}: ${result.error}`);
      }
    }
  } catch (err: any) {
    console.error("[Testimonial] Check failed:", err.message);
  }
}

// Run once on startup (catches any missed), then every hour
runTestimonialEmailCheck();
setInterval(runTestimonialEmailCheck, 60 * 60 * 1000);
