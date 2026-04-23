import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractText: text("contract_text").notNull(),
  state: text("state"),
  region: text("region"),
  compensationModel: text("compensation_model"),
  yearsExperience: text("years_experience"),
  settingType: text("setting_type"),
  employerType: text("employer_type"),
  apcSupervision: text("apc_supervision"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  analysisResult: text("analysis_result"),
  email: text("email"),
  phone: text("phone"),
  counterProposal: text("counter_proposal"),
  qaTranscript: text("qa_transcript"),
  testimonialEmailSent: integer("testimonial_email_sent", { mode: "boolean" }).default(false),
  // Payment gate (FIX 0, 2026-04-15): analyzer requires paid Stripe Checkout
  // before any analysis runs. Existing pre-launch rows are grandfathered to
  // "paid" by the one-shot migration in storage.ts. New rows created via
  // /api/create-checkout start "unpaid" and flip to "paid" only after the
  // stripe-webhook receives checkout.session.completed for their session.
  stripeSessionId: text("stripe_session_id"),
  paymentStatus: text("payment_status").default("unpaid"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

export interface IntakeData {
  state: string;
  region: string;
  compensationModel: string;
  yearsExperience: string;
  settingType: string;
  employerType: string;
  apcSupervision: string;
}

export interface AnalysisResult {
  executiveSummary: {
    overallScore: number;
    riskLevel: "low" | "moderate" | "high" | "critical";
    topConcerns: string[];
    topStrengths: string[];
  };
  compensation: {
    extractedTerms: {
      baseCompensation: string;
      bonusStructure: string;
      totalExpectedComp: string;
      compensationModel: string;
    };
    regionalBenchmark: {
      percentile: number;
      regionMedian: string;
      regionRange: string;
      nationalMedian: string;
      nationalRange: string;
      assessment: string;
    };
  };
  clauseAnalysis: Array<{
    clauseName: string;
    severity: "red" | "yellow" | "green";
    summary: string;
    whatItMeans: string;
    industryNorm: string;
  }>;
  noncompete: {
    present: boolean;
    radius: string;
    duration: string;
    stateEnforceability: string;
    analysis: string;
    negotiationStrategy: string;
  };
  malpractice: {
    coverageType: string;
    tailCoverage: string;
    severity: "red" | "yellow" | "green";
    analysis: string;
    recommendation: string;
  };
  terminationProvisions: {
    withoutCause: string;
    noticePeriod: string;
    severity: "red" | "yellow" | "green";
    analysis: string;
  };
  negotiationApproach: {
    approachType: "new_contract" | "renegotiation" | "either";
    overallStrategy: string;
    openingMove: string;
    keyPrinciples: string[];
    sequencing: Array<{
      step: number;
      action: string;
      timing: string;
      rationale: string;
    }>;
    walkAwayThreshold: string;
    alternativesIfStuck: string[];
    renegotiationTriggers: string[];
  };
  negotiationPriorities: Array<{
    priority: number;
    clause: string;
    rationale: string;
    currentLanguage: string;
    suggestedLanguage: string;
    difficulty: "easy" | "moderate" | "hard";
  }>;
  disclaimer: string;
}
