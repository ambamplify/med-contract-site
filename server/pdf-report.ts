import { jsPDF } from "jspdf";
import type { AnalysisResult } from "../shared/schema.js";

const COLORS = {
  navy: [15, 30, 61] as [number, number, number],
  gold: [201, 168, 76] as [number, number, number],
  darkGray: [51, 51, 51] as [number, number, number],
  medGray: [102, 102, 102] as [number, number, number],
  lightGray: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  red: [220, 53, 69] as [number, number, number],
  yellow: [255, 193, 7] as [number, number, number],
  green: [40, 167, 69] as [number, number, number],
};

const PAGE_WIDTH = 210;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// Safe string: coerce anything to a string, return "" for nullish
function s(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

export function generatePDF(result: any, employerType: string, qaTranscript?: string): ArrayBuffer {
  console.log("[PDF] Starting generation, result keys:", result ? Object.keys(result) : "no result");

  try {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let y = 20;

    function checkPage(needed: number) {
      if (y + needed > 270) {
        doc.addPage();
        y = 20;
      }
    }

    function drawHeader() {
      doc.setFillColor(...COLORS.navy);
      doc.rect(0, 0, PAGE_WIDTH, 40, "F");
      doc.setFillColor(...COLORS.gold);
      doc.rect(0, 40, PAGE_WIDTH, 2, "F");

      // Brand mark — gold square monogram in top-right corner
      const markSize = 26;
      const markX = PAGE_WIDTH - MARGIN - markSize;
      doc.setFillColor(...COLORS.gold);
      doc.roundedRect(markX, 7, markSize, markSize, 3, 3, "F");
      doc.setTextColor(...COLORS.navy);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("MCI", markX + markSize / 2, 22, { align: "center" });
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text("CONTRACT", markX + markSize / 2, 27, { align: "center" });
      doc.text("INTEL", markX + markSize / 2, 30.5, { align: "center" });

      doc.setTextColor(...COLORS.white);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("MedContractIntel\u2122", MARGIN, 18);

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Analysis: ${employerType || "Employment"} Contract`, MARGIN, 28);

      doc.setFontSize(9);
      doc.text(`Generated ${new Date().toLocaleDateString()}`, MARGIN, 36);

      y = 50;
    }

    function sectionTitle(title: string) {
      checkPage(15);
      doc.setFillColor(...COLORS.navy);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(title, MARGIN + 3, y + 5.5);
      y += 12;
    }

    function bodyText(text: string, indent = 0) {
      if (!text) return;
      doc.setTextColor(...COLORS.darkGray);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(String(text), CONTENT_WIDTH - indent);
      for (const line of lines) {
        checkPage(5);
        doc.text(line, MARGIN + indent, y);
        y += 4.5;
      }
      y += 2;
    }

    function labelValue(label: string, value: any) {
      const val = s(value);
      if (!val) return;
      checkPage(6);
      doc.setTextColor(...COLORS.medGray);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(label + ":", MARGIN + 2, y);
      doc.setTextColor(...COLORS.darkGray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const valLines = doc.splitTextToSize(val, CONTENT_WIDTH - 50);
      doc.text(valLines, MARGIN + 48, y);
      y += Math.max(valLines.length * 4.5, 5);
    }

    function severityColor(severity: string): [number, number, number] {
      const s = (severity || "").toLowerCase().trim();
      if (["red", "critical", "high", "severe", "significant"].includes(s)) return COLORS.red;
      if (["yellow", "moderate", "medium", "caution"].includes(s)) return COLORS.yellow;
      if (["green", "low", "favorable", "good", "minimal"].includes(s)) return COLORS.green;
      return COLORS.yellow;
    }

    // Render any object's key-value pairs as label: value lines
    function renderObject(obj: any) {
      if (!obj || typeof obj !== "object") return;
      for (const [key, val] of Object.entries(obj)) {
        if (val === null || val === undefined) continue;
        const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\s/, "").replace(/\b\w/g, c => c.toUpperCase());
        if (typeof val === "object" && !Array.isArray(val)) {
          // Sub-section
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          checkPage(6);
          doc.setTextColor(...COLORS.darkGray);
          doc.text(label + ":", MARGIN + 2, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          renderObject(val);
        } else if (Array.isArray(val)) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          checkPage(6);
          doc.setTextColor(...COLORS.darkGray);
          doc.text(label + ":", MARGIN + 2, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          for (const item of val) {
            if (typeof item === "string") {
              bodyText(`• ${item}`, 4);
            } else if (typeof item === "object") {
              renderObject(item);
              y += 2;
            }
          }
        } else if (typeof val === "boolean") {
          labelValue(label, val ? "Yes" : "No");
        } else {
          // Long text as bodyText, short as labelValue
          const str = String(val);
          if (str.length > 120) {
            bodyText(str);
          } else {
            labelValue(label, str);
          }
        }
      }
    }

    // --- PAGE 1: HEADER ---
    drawHeader();

    // --- #1 PRIORITY CARD ---
    try {
      const priorities = result?.negotiationPriorities;
      if (Array.isArray(priorities) && priorities.length > 0) {
        const top = priorities[0];
        const topClause = s(top?.clause ?? top?.clauseName ?? top?.name ?? "Top Priority");
        const topRationale = s(top?.rationale);
        const topDifficulty = s(top?.difficulty ?? "moderate");
        checkPage(30);

        doc.setFillColor(...COLORS.gold);
        doc.rect(MARGIN, y, 3, 24, "F");
        doc.setFillColor(...COLORS.lightGray);
        doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 24, "F");

        doc.setTextColor(...COLORS.gold);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("YOUR #1 NEGOTIATION PRIORITY", MARGIN + 7, y + 6);

        doc.setTextColor(...COLORS.darkGray);
        doc.setFontSize(11);
        doc.text(topClause, MARGIN + 7, y + 13);

        if (topRationale) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          const ratLines = doc.splitTextToSize(topRationale, CONTENT_WIDTH - 50);
          doc.text(ratLines[0] || "", MARGIN + 7, y + 19);
        }

        const diffColor = topDifficulty === "hard" ? COLORS.red : topDifficulty === "moderate" ? COLORS.yellow : COLORS.green;
        doc.setFillColor(...diffColor);
        doc.roundedRect(MARGIN + CONTENT_WIDTH - 25, y + 2, 22, 6, 2, 2, "F");
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(7);
        doc.text(topDifficulty.toUpperCase(), MARGIN + CONTENT_WIDTH - 24, y + 6.2);

        y += 30;
      }
    } catch (e) {
      console.error("[PDF] Priority card error:", e);
    }

    // --- EXECUTIVE SUMMARY ---
    try {
      const es = result?.executiveSummary;
      if (es) {
        sectionTitle("EXECUTIVE SUMMARY");
        const rawScore = es.overallScore ?? es.overall_score ?? es.overallRiskScore ?? es.overall_risk_score ?? es.score ?? es.riskScore ?? es.risk_score ?? 0;
        const score = typeof rawScore === "number" ? rawScore : parseInt(rawScore) || 0;
        const riskLevel = s(es.riskLevel ?? es.risk_level ?? es.overallRiskRating ?? es.overall_risk_rating ?? es.risk ?? "moderate");

        checkPage(20);
        const scoreColor = severityColor(riskLevel);
        doc.setFillColor(...scoreColor);
        doc.circle(MARGIN + 12, y + 8, 10, "F");
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(String(score), MARGIN + 12, y + 10, { align: "center" });
        doc.setFontSize(6);
        doc.text("/ 100", MARGIN + 12, y + 14, { align: "center" });

        doc.setTextColor(...COLORS.darkGray);
        doc.setFontSize(10);
        doc.text(`Risk Level: ${riskLevel.toUpperCase()}`, MARGIN + 28, y + 6);
        y += 22;

        const concerns = es.topConcerns ?? es.top_concerns ?? es.concerns ?? es.redFlags ?? es.red_flags ?? es.keyRedFlags ?? es.key_red_flags ?? es.keyFindings ?? es.key_findings ?? [];
        if (Array.isArray(concerns) && concerns.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("Top Concerns:", MARGIN + 2, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          for (const c of concerns) { bodyText(`• ${s(c)}`, 4); }
        }

        const strengths = es.topStrengths ?? es.top_strengths ?? es.strengths ?? [];
        if (Array.isArray(strengths) && strengths.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("Strengths:", MARGIN + 2, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          for (const st of strengths) { bodyText(`• ${s(st)}`, 4); }
        }
      }
    } catch (e) {
      console.error("[PDF] Executive summary error:", e);
    }

    // --- COMPENSATION (structured) ---
    try {
      const comp = result?.compensation;
      if (comp) {
        sectionTitle("COMPENSATION ANALYSIS");

        // Severity badge
        const compSev = s(comp.severity ?? "moderate").toLowerCase();
        const compColor = severityColor(compSev);
        doc.setFillColor(...compColor);
        doc.roundedRect(MARGIN, y, 28, 6, 2, 2, "F");
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text(compSev.toUpperCase() + " RISK", MARGIN + 2, y + 4.2);
        y += 10;

        // Compensation Model
        if (comp.model) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...COLORS.navy);
          checkPage(6);
          doc.text("Compensation Model", MARGIN + 2, y);
          y += 5;
          bodyText(s(comp.model));
        }

        // Base Rate
        if (comp.baseRate) {
          labelValue("Base Rate", s(comp.baseRate));
        }

        // Hourly Analysis (for hourly contracts)
        const hourly = comp.hourlyAnalysis;
        if (hourly && hourly.hourlyRate) {
          checkPage(20);
          doc.setFillColor(255, 248, 230);
          doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
          doc.setFillColor(...COLORS.gold);
          doc.rect(MARGIN, y, 3, 8, "F");
          doc.setTextColor(...COLORS.navy);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("Hourly Rate Analysis", MARGIN + 6, y + 5.5);
          y += 12;

          labelValue("Contract Hourly Rate", `$${hourly.hourlyRate}/hr`);
          if (hourly.annualAtContractHours) {
            labelValue("Projected Annual Income", s(hourly.annualAtContractHours));
          }

          // Market comparison — the key data
          if (hourly.marketComparison) {
            checkPage(20);
            doc.setFillColor(255, 235, 235);
            const mcLines = doc.splitTextToSize(s(hourly.marketComparison), CONTENT_WIDTH - 12);
            const mcHeight = mcLines.length * 3.8 + 10;
            doc.rect(MARGIN, y, CONTENT_WIDTH, mcHeight, "F");
            doc.setFillColor(...COLORS.red);
            doc.rect(MARGIN, y, 3, mcHeight, "F");
            doc.setTextColor(...COLORS.red);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("HOURLY RATE vs. MARKET BENCHMARK", MARGIN + 6, y + 5);
            doc.setTextColor(...COLORS.darkGray);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 8;
            for (const line of mcLines) {
              checkPage(4);
              doc.text(line, MARGIN + 6, y);
              y += 3.8;
            }
            y += 5;
          }

          if (hourly.shiftDifferentials) {
            labelValue("Shift Differentials", s(hourly.shiftDifferentials));
          }
          if (hourly.apcSupervisionPay) {
            labelValue("APC Supervision Pay", s(hourly.apcSupervisionPay));
          }
          if (hourly.rateEscalation) {
            labelValue("Rate Escalation", s(hourly.rateEscalation));
          }
        }

        // RVU section — only for RVU-based contracts
        const rvu = comp.rvu;
        if (rvu && rvu.multiplier && s(rvu.rvuType) !== "NOT_APPLICABLE") {
          checkPage(20);
          // RVU sub-header with highlight box
          doc.setFillColor(255, 248, 230); // light gold background
          const rvuBoxStart = y;
          doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
          doc.setFillColor(...COLORS.gold);
          doc.rect(MARGIN, y, 3, 8, "F");
          doc.setTextColor(...COLORS.navy);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("RVU Compensation Details", MARGIN + 6, y + 5.5);
          y += 12;

          labelValue("RVU Multiplier", `$${rvu.multiplier}/RVU`);
          labelValue("RVU Type", s(rvu.rvuType));
          labelValue("Plan Name", s(rvu.planName));
          labelValue("Plan Effective Date", s(rvu.planEffectiveDate));

          if (rvu.apcSharedCreditPct !== null && rvu.apcSharedCreditPct !== undefined) {
            labelValue("APC Shared Credit", `${rvu.apcSharedCreditPct}% of shared/supervised RVUs`);
          }

          // RVU Multiplier Benchmark — THE KEY NEGOTIATION DATA
          if (rvu.multiplierBenchmark) {
            checkPage(20);
            doc.setFillColor(255, 235, 235); // light red background — this is a warning
            const benchLines = doc.splitTextToSize(s(rvu.multiplierBenchmark), CONTENT_WIDTH - 12);
            const benchHeight = benchLines.length * 3.8 + 10;
            doc.rect(MARGIN, y, CONTENT_WIDTH, benchHeight, "F");
            doc.setFillColor(...COLORS.red);
            doc.rect(MARGIN, y, 3, benchHeight, "F");
            doc.setTextColor(...COLORS.red);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("RVU MULTIPLIER vs. MARKET BENCHMARK", MARGIN + 6, y + 5);
            doc.setTextColor(...COLORS.darkGray);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 8;
            for (const line of benchLines) {
              checkPage(4);
              doc.text(line, MARGIN + 6, y);
              y += 3.8;
            }
            y += 5;
          }

          // Effective rate per wRVU
          if (rvu.effectiveRatePerWrvu) {
            checkPage(10);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.red);
            doc.text("Effective Rate per Standard wRVU:", MARGIN + 2, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.darkGray);
            doc.setFontSize(8);
            const effLines = doc.splitTextToSize(s(rvu.effectiveRatePerWrvu), CONTENT_WIDTH - 6);
            for (const line of effLines) {
              checkPage(4);
              doc.text(line, MARGIN + 4, y);
              y += 3.8;
            }
            y += 3;
          }

          // RVU Type Explanation — critical for understanding
          if (rvu.rvuTypeExplanation) {
            checkPage(15);
            doc.setFillColor(255, 243, 243); // light red background for warning
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.red);
            doc.text("⚠ RVU Definition Warning:", MARGIN + 2, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.darkGray);
            doc.setFontSize(8);
            const explLines = doc.splitTextToSize(s(rvu.rvuTypeExplanation), CONTENT_WIDTH - 6);
            for (const line of explLines) {
              checkPage(4);
              doc.text(line, MARGIN + 4, y);
              y += 3.8;
            }
            y += 3;
          }

          // Qualified RVU Definition
          if (rvu.qualifiedRvuDefinition) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.medGray);
            checkPage(6);
            doc.text("Qualified RVU Definition:", MARGIN + 2, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.darkGray);
            const defLines = doc.splitTextToSize(s(rvu.qualifiedRvuDefinition), CONTENT_WIDTH - 6);
            for (const line of defLines) {
              checkPage(4);
              doc.text(line, MARGIN + 4, y);
              y += 3.8;
            }
            y += 3;
          }

          // Advance Reconciliation Risk
          if (rvu.advanceReconciliationRisk) {
            checkPage(10);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.red);
            doc.text("Advance Reconciliation Risk:", MARGIN + 2, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.darkGray);
            doc.setFontSize(8);
            const riskLines = doc.splitTextToSize(s(rvu.advanceReconciliationRisk), CONTENT_WIDTH - 6);
            for (const line of riskLines) {
              checkPage(4);
              doc.text(line, MARGIN + 4, y);
              y += 3.8;
            }
            y += 3;
          }

          // Plan Revision Rights
          if (rvu.planRevisionRights) {
            checkPage(10);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.medGray);
            doc.text("Plan Revision Rights:", MARGIN + 2, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.darkGray);
            doc.setFontSize(8);
            const revLines = doc.splitTextToSize(s(rvu.planRevisionRights), CONTENT_WIDTH - 6);
            for (const line of revLines) {
              checkPage(4);
              doc.text(line, MARGIN + 4, y);
              y += 3.8;
            }
            y += 3;
          }
        }

        // Additional Compensation
        const addComp = comp.additionalCompensation;
        if (addComp) {
          checkPage(15);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...COLORS.navy);
          doc.text("Additional Compensation", MARGIN + 2, y);
          y += 6;

          if (addComp.signOnBonus) {
            labelValue("Sign-On Bonus", typeof addComp.signOnBonus === "number" ? `$${addComp.signOnBonus.toLocaleString()}` : s(addComp.signOnBonus));
          }
          if (addComp.signOnBonusClawback) {
            labelValue("Clawback Terms", s(addComp.signOnBonusClawback));
          }
          if (addComp.triageShiftDifferential) {
            labelValue("Triage Differential", s(addComp.triageShiftDifferential));
          }
          if (addComp.orientationPay) {
            labelValue("Orientation Pay", s(addComp.orientationPay));
          }
          if (addComp.emeTraining) {
            labelValue("EMR Training", s(addComp.emeTraining));
          }
        }
      }
    } catch (e) {
      console.error("[PDF] Compensation error:", e);
    }

    // --- CLAUSE ANALYSIS ---
    try {
      const clauses = result?.clauseAnalysis;
      if (Array.isArray(clauses) && clauses.length > 0) {
        sectionTitle("CLAUSE-BY-CLAUSE ANALYSIS");
        for (let i = 0; i < clauses.length; i++) {
          const clause = clauses[i];
          if (!clause) continue;
          checkPage(25);
          const sev = s(clause?.severity ?? clause?.riskLevel ?? clause?.risk_level ?? "yellow");
          const color = severityColor(sev);
          doc.setFillColor(...color);
          doc.rect(MARGIN, y, 3, 18, "F");

          doc.setTextColor(...COLORS.darkGray);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text(s(clause?.clauseName ?? clause?.clauseTitle ?? clause?.name ?? clause?.title ?? `Clause ${i + 1}`), MARGIN + 6, y + 4);

          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          const summary = s(clause?.summary ?? clause?.description ?? clause?.analysis ?? clause?.recommendation ?? "");
          if (summary) {
            const summLines = doc.splitTextToSize(summary, CONTENT_WIDTH - 10);
            doc.text(summLines.slice(0, 2), MARGIN + 6, y + 9);
          }

          const norm = s(clause?.industryNorm ?? clause?.industry_norm ?? "");
          if (norm) {
            doc.setTextColor(...COLORS.medGray);
            const normLines = doc.splitTextToSize(`Industry norm: ${norm}`, CONTENT_WIDTH - 10);
            doc.text(normLines[0] || "", MARGIN + 6, y + 16);
          }

          y += 22;
        }
      }
    } catch (e) {
      console.error("[PDF] Clause analysis error:", e);
    }

    // --- NON-COMPETE (flexible) ---
    try {
      if (result?.noncompete) {
        sectionTitle("NON-COMPETE ANALYSIS");
        renderObject(result.noncompete);
      }
    } catch (e) {
      console.error("[PDF] Non-compete error:", e);
    }

    // --- MALPRACTICE (flexible) ---
    try {
      if (result?.malpractice) {
        sectionTitle("MALPRACTICE INSURANCE");
        renderObject(result.malpractice);
      }
    } catch (e) {
      console.error("[PDF] Malpractice error:", e);
    }

    // --- TERMINATION (flexible) ---
    try {
      if (result?.terminationProvisions) {
        sectionTitle("TERMINATION PROVISIONS");
        renderObject(result.terminationProvisions);
      }
    } catch (e) {
      console.error("[PDF] Termination error:", e);
    }

    // --- NEGOTIATION APPROACH ---
    try {
      const na = result?.negotiationApproach;
      if (na) {
        sectionTitle("RECOMMENDED NEGOTIATION APPROACH");
        labelValue("Approach", s(na?.approachType ?? na?.approach_type ?? "").replace(/_/g, " "));
        bodyText(s(na?.overallStrategy ?? na?.overall_strategy));
        labelValue("Opening Move", s(na?.openingMove ?? na?.opening_move));

        const principles = na?.keyPrinciples ?? na?.key_principles ?? [];
        if (Array.isArray(principles) && principles.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          checkPage(5);
          doc.text("Key Principles:", MARGIN + 2, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          for (const p of principles) { bodyText(`• ${s(p)}`, 4); }
        }

        const seq = na?.sequencing ?? [];
        if (Array.isArray(seq) && seq.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          checkPage(5);
          doc.text("Step-by-Step Tactics:", MARGIN + 2, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          for (const step of seq) {
            if (typeof step === "string") {
              // New format: plain strings like "Step 1: Do this..."
              bodyText(`• ${step}`, 4);
            } else if (typeof step === "object") {
              // Old format: {step, action, timing, rationale}
              const txt = [s(step?.step), s(step?.action), s(step?.timing), s(step?.rationale)].filter(Boolean).join(" — ");
              bodyText(`• ${txt || JSON.stringify(step)}`, 4);
            }
          }
        }

        labelValue("Walk-Away Threshold", s(na?.walkAwayThreshold ?? na?.walk_away_threshold));
      }
    } catch (e) {
      console.error("[PDF] Negotiation approach error:", e);
    }

    // --- NEGOTIATION PRIORITIES ---
    try {
      const priorities = result?.negotiationPriorities;
      if (Array.isArray(priorities) && priorities.length > 0) {
        sectionTitle("NEGOTIATION PRIORITIES");
        for (let i = 0; i < priorities.length; i++) {
          const p = priorities[i];
          if (!p) continue;
          checkPage(35);

          const clauseName = s(p?.clause ?? p?.clauseName ?? p?.name ?? p?.issue ?? `Priority ${i + 1}`);

          // Priority header with number
          doc.setFillColor(...COLORS.navy);
          doc.roundedRect(MARGIN, y, 8, 6, 2, 2, "F");
          doc.setTextColor(...COLORS.white);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.text(`#${p?.priority ?? i + 1}`, MARGIN + 1.5, y + 4.2);

          doc.setTextColor(...COLORS.darkGray);
          doc.setFontSize(10);
          doc.text(clauseName, MARGIN + 11, y + 4.2);

          // One-time badge if applicable
          if (p?.isOneTime) {
            doc.setFillColor(...COLORS.medGray);
            doc.roundedRect(MARGIN + CONTENT_WIDTH - 18, y, 16, 5, 1.5, 1.5, "F");
            doc.setTextColor(...COLORS.white);
            doc.setFontSize(6);
            doc.text("ONE-TIME", MARGIN + CONTENT_WIDTH - 17, y + 3.5);
          }

          y += 9;
          doc.setFont("helvetica", "normal");

          // Financial Impact (highlighted)
          const impact = s(p?.financialImpact ?? p?.financial_impact ?? "");
          if (impact) {
            checkPage(12);
            doc.setFillColor(255, 248, 230);
            const impLines = doc.splitTextToSize(impact, CONTENT_WIDTH - 12);
            const impHeight = impLines.length * 3.8 + 6;
            doc.rect(MARGIN + 2, y - 1, CONTENT_WIDTH - 4, impHeight, "F");
            doc.setFillColor(...COLORS.gold);
            doc.rect(MARGIN + 2, y - 1, 2, impHeight, "F");
            doc.setTextColor(...COLORS.gold);
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text("FINANCIAL IMPACT", MARGIN + 7, y + 2.5);
            doc.setTextColor(...COLORS.darkGray);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 5;
            for (const line of impLines) {
              checkPage(4);
              doc.text(line, MARGIN + 7, y);
              y += 3.8;
            }
            y += 3;
          }

          // Current Terms
          const current = s(p?.currentTerms ?? p?.current_terms ?? p?.currentLanguage ?? p?.current_language ?? "");
          if (current) {
            checkPage(10);
            doc.setFillColor(255, 240, 240);
            const curLines = doc.splitTextToSize(current, CONTENT_WIDTH - 12);
            const curHeight = curLines.length * 3.8 + 6;
            doc.rect(MARGIN + 2, y - 1, CONTENT_WIDTH - 4, curHeight, "F");
            doc.setTextColor(...COLORS.red);
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text("CURRENT TERMS", MARGIN + 5, y + 2.5);
            doc.setTextColor(...COLORS.darkGray);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 5;
            for (const line of curLines) {
              checkPage(4);
              doc.text(line, MARGIN + 5, y);
              y += 3.8;
            }
            y += 3;
          }

          // Target Terms
          const target = s(p?.targetTerms ?? p?.target_terms ?? p?.suggestedLanguage ?? p?.suggested_language ?? "");
          if (target) {
            checkPage(10);
            doc.setFillColor(240, 255, 240);
            const tgtLines = doc.splitTextToSize(target, CONTENT_WIDTH - 12);
            const tgtHeight = tgtLines.length * 3.8 + 6;
            doc.rect(MARGIN + 2, y - 1, CONTENT_WIDTH - 4, tgtHeight, "F");
            doc.setTextColor(...COLORS.green);
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text("TARGET TERMS", MARGIN + 5, y + 2.5);
            doc.setTextColor(...COLORS.darkGray);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 5;
            for (const line of tgtLines) {
              checkPage(4);
              doc.text(line, MARGIN + 5, y);
              y += 3.8;
            }
            y += 3;
          }

          // Walk-Away Point
          const walkAway = s(p?.walkAwayPoint ?? p?.walk_away_point ?? p?.walkAway ?? "");
          if (walkAway) {
            checkPage(10);
            doc.setFillColor(255, 252, 235);
            const waLines = doc.splitTextToSize(walkAway, CONTENT_WIDTH - 12);
            const waHeight = waLines.length * 3.8 + 6;
            doc.rect(MARGIN + 2, y - 1, CONTENT_WIDTH - 4, waHeight, "F");
            doc.setTextColor(180, 140, 20);
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text("WALK-AWAY POINT", MARGIN + 5, y + 2.5);
            doc.setTextColor(...COLORS.darkGray);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 5;
            for (const line of waLines) {
              checkPage(4);
              doc.text(line, MARGIN + 5, y);
              y += 3.8;
            }
            y += 3;
          }

          // Expiration basis for one-time items
          if (p?.isOneTime && p?.expirationBasis) {
            doc.setTextColor(...COLORS.medGray);
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            checkPage(5);
            doc.text(`Expiration: ${s(p.expirationBasis)}`, MARGIN + 4, y);
            y += 5;
          }

          y += 4;
        }
      }
    } catch (e) {
      console.error("[PDF] Negotiation priorities error:", e);
    }

    // --- ATTORNEY REFERRAL ---
    try {
      sectionTitle("WHEN TO CONSULT AN ATTORNEY");
      bodyText("The Contract Analyzer identifies financial and structural risks in your contract. It does not provide legal advice and cannot replace an attorney for high-stakes negotiations.");
      y += 2;
      bodyText("Consider consulting a healthcare attorney if your report shows:");
      bodyText("• A Critical overall risk rating", 4);
      bodyText("• A non-compete clause rated Red severity", 4);
      bodyText("• Any termination provision with less than 60 days notice without cause", 4);
      bodyText("• Tail insurance responsibility estimated above $15,000", 4);
      y += 2;
      bodyText("To find a healthcare attorney in your state who works with physicians:");
      bodyText("• State Bar Physician Health Law Directory (americanbar.org)", 4);
      bodyText("• American Health Lawyers Association (healthlawyers.org)", 4);
      bodyText("• Ask your state medical society — most maintain a referral list", 4);
      y += 2;
      doc.setTextColor(...COLORS.medGray);
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      checkPage(5);
      doc.text("MedContractIntel does not endorse or receive compensation from any attorney or legal service.", MARGIN, y);
      y += 8;
    } catch (e) {
      console.error("[PDF] Attorney referral error:", e);
    }

    // --- DISCLAIMER ---
    try {
      sectionTitle("DISCLAIMER");
      bodyText(s(result?.disclaimer) || "This analysis is for informational purposes only and does not constitute legal advice. Consult with a qualified healthcare attorney before making decisions based on this analysis.");
    } catch (e) {
      console.error("[PDF] Disclaimer error:", e);
    }

    // --- Q&A TRANSCRIPT ---
    if (qaTranscript) {
      try {
        const msgs = JSON.parse(qaTranscript) as Array<{role: string; content: string}>;
        if (Array.isArray(msgs) && msgs.length > 0) {
          doc.addPage();
          y = 20;
          sectionTitle("YOUR QUESTIONS & ANSWERS");

          let qNum = 1;
          for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            if (!msg) continue;

            if (msg.role === "user") {
              checkPage(20);
              // Numbered circle
              doc.setFillColor(...COLORS.navy);
              doc.circle(MARGIN + 4, y + 3.5, 4, "F");
              doc.setTextColor(...COLORS.white);
              doc.setFontSize(7);
              doc.setFont("helvetica", "bold");
              doc.text(String(qNum), MARGIN + 4, y + 5, { align: "center" });

              // Question text (bold navy)
              doc.setTextColor(...COLORS.navy);
              doc.setFontSize(9.5);
              doc.setFont("helvetica", "bold");
              const qLines = doc.splitTextToSize(s(msg.content), CONTENT_WIDTH - 12);
              doc.text(qLines, MARGIN + 10, y + 1);
              y += qLines.length * 4.8 + 5;
              qNum++;
            } else {
              // Strip the disclaimer footer line and separator
              const cleanAnswer = s(msg.content)
                .split("\n")
                .filter((line: string) => line.trim() !== "---" && !line.includes("not legal advice") && !line.includes("Consult a healthcare attorney"))
                .join("\n")
                .trim();

              doc.setTextColor(...COLORS.darkGray);
              doc.setFontSize(8.5);
              doc.setFont("helvetica", "normal");
              const aLines = doc.splitTextToSize(cleanAnswer, CONTENT_WIDTH - 4);
              for (const line of aLines) {
                checkPage(5);
                doc.text(line, MARGIN + 2, y);
                y += 4.3;
              }
              y += 3;

              // Divider between pairs
              checkPage(8);
              doc.setDrawColor(220, 220, 220);
              doc.setLineWidth(0.3);
              doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
              y += 6;
            }
          }

          // Legal disclaimer at end of Q&A section
          checkPage(14);
          y += 2;
          doc.setFillColor(...COLORS.lightGray);
          doc.rect(MARGIN, y, CONTENT_WIDTH, 10, "F");
          doc.setTextColor(...COLORS.medGray);
          doc.setFontSize(7);
          doc.setFont("helvetica", "italic");
          doc.text("The Q&A above is educational analysis, not legal advice. Consult a healthcare attorney before making contract decisions.", MARGIN + 3, y + 6.5);
          y += 14;
        }
      } catch (e) {
        console.error("[PDF] Q&A transcript error:", e);
      }
    }

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(...COLORS.navy);
      doc.rect(0, 287, PAGE_WIDTH, 10, "F");
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(7);
      doc.text("MedContractIntel\u2122 — Contract Analysis", MARGIN, 293);
      doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH - MARGIN - 20, 293);
    }

    console.log("[PDF] Generation complete, pages:", pageCount);
    return doc.output("arraybuffer");

  } catch (err: any) {
    console.error("[PDF] FATAL generation error:", err?.message || err, err?.stack);
    throw err;
  }
}
