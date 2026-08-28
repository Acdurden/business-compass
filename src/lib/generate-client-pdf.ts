/**
 * The client-facing PDF.
 *
 * This is NOT `generate-submission-pdf.ts`. That one is the advisor's working
 * file: it is headed "KRITERION VALUATION REPORT", prints the submission id, an
 * "Advisor Section / Score / Max" table, and the raw "43 + 32 = 75" arithmetic.
 * All three break rules that hold everywhere else in the product — a document
 * calling itself a valuation contradicts the disclaimer on every screen, and
 * client-facing scores are shown bare on 0-100, never as their native /60 and
 * /40 parts. It stays where it is, for advisors. This is the one a client keeps.
 *
 * Rules this file follows, all settled elsewhere:
 *  - The basis follows `valuation_input_type`. Never assume net fee income.
 *  - Scores are bare. No denominators, no "out of 100".
 *  - The band label is not the headline. The eight areas are.
 *  - Money is rounded to the nearest 10k. Dollar precision on a modelled
 *    estimate is false precision, and the disclaimer says as much.
 *  - The disclaimer wording is the approved one, identical to the screens.
 *
 * `buildClientPdf` is pure so the exact bytes a client downloads can be
 * rendered and checked outside a browser.
 */

import { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/score-display";

/* ------------------------------------------------------------------ */

export type ClientPdfArea = {
  name: string;
  /** Share of the area the client's own answers captured, 0-100. */
  selfPct: number;
  /** Share the advisor's review credited, 0-100. */
  advisorPct: number;
  /** ValScore points still on the table in this area. */
  pointsAvailable: number;
};

export type ClientPdfPlanItem = {
  area: string;
  finding: string;
  action: string;
  who: string;
};

export type ClientPdfInput = {
  companyName: string;
  completedOn: Date;
  reviewed: boolean;
  score: number;
  bandLabel: string;
  basisLabel: string;
  basisAmount: number;
  multiple: number;
  midpoint: number;
  areas: ClientPdfArea[];
  totalAvailable: number;
  plan: ClientPdfPlanItem[];
};

/* ------------------------------------------------------------------ */

const NAVY = "#0e1c2b";
const INK = "#12222f";
const MUTED = "#61707e";
const TEAL = "#1f8a86";
const RAIL = "#dde4ea";
const WASH = "#f4f7f9";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 54;
const CONTENT_W = PAGE_W - M * 2;

/** Nearest ten thousand. Dollar precision on a modelled estimate is a lie. */
function round10k(n: number): number {
  return Math.round(n / 10000) * 10000;
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------ */

export function buildClientPdf(input: ClientPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 0;

  /** Move down, starting a fresh page when the next block will not fit. */
  function need(space: number) {
    if (y + space > PAGE_H - 76) {
      doc.addPage();
      y = M + 8;
    }
  }

  function rule(atY: number, color = RAIL, weight = 0.75) {
    doc.setDrawColor(color);
    doc.setLineWidth(weight);
    doc.line(M, atY, PAGE_W - M, atY);
  }

  function eyebrow(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(text.toUpperCase(), M, y, { charSpace: 1.1 });
    y += 16;
  }

  function paragraph(text: string, size = 10, color = MUTED, width = CONTENT_W) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, width) as string[];
    need(lines.length * (size * 1.45));
    doc.text(lines, M, y);
    y += lines.length * (size * 1.45) + 4;
  }

  /* ---------------- masthead ---------------- */

  y = M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(NAVY);
  doc.text("KRITERION", M, y, { charSpace: 2.2 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("Value Readiness Assessment", PAGE_W - M, y, { align: "right" });

  y += 12;
  rule(y, NAVY, 1.2);
  y += 34;

  /* ---------------- who and when ---------------- */

  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.setTextColor(INK);
  doc.text(input.companyName, M, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(
    `Completed ${formatLongDate(input.completedOn)}${
      input.reviewed ? " · Reviewed by your Kriterion advisor" : ""
    }`,
    M,
    y,
  );
  y += 30;

  /* ---------------- the headline figure ---------------- */

  const lo = round10k(input.midpoint * 0.95);
  const hi = round10k(input.midpoint * 1.05);

  const boxH = 116;
  doc.setFillColor(WASH);
  doc.setDrawColor(RAIL);
  doc.setLineWidth(0.75);
  doc.roundedRect(M, y, CONTENT_W, boxH, 4, 4, "FD");

  const bx = M + 22;
  let by = y + 26;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text("WHERE THAT PUTS YOU TODAY", bx, by, { charSpace: 1.1 });
  by += 26;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(NAVY);
  doc.text(`${formatCurrency(lo)} - ${formatCurrency(hi)}`, bx, by);
  by += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(
    `Midpoint ${formatCurrency(round10k(input.midpoint))} · ${input.multiple.toFixed(2)} times ${input.basisLabel} of ${formatCurrency(input.basisAmount)}`,
    bx,
    by,
  );

  // The score sits alongside, deliberately not as the headline.
  const sx = PAGE_W - M - 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text("YOUR SCORE", sx, y + 26, { align: "right", charSpace: 1.1 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(TEAL);
  doc.text(String(Math.round(input.score)), sx, y + 62, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(input.bandLabel, sx, y + 80, { align: "right" });

  y += boxH + 30;

  /* ---------------- what this is ---------------- */

  paragraph(
    "This is what your assessment says about how a buyer would see the business today. Your own answers set the starting position, and your advisor's review moved it. The number is worth less than what sits behind it, which is the rest of this document.",
    10.5,
    INK,
  );
  y += 10;

  /* ---------------- the eight areas ---------------- */

  need(120);
  eyebrow("Where the value sits");
  paragraph(
    "Eight areas carry the score. For each one: how much of it your own answers captured, how much your advisor credited after reviewing the business, and how much is still on the table.",
  );
  y += 8;

  const colArea = M;
  const colSelf = M + 268;
  const colAdv = M + 344;
  const colGap = PAGE_W - M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("AREA", colArea, y, { charSpace: 0.8 });
  doc.text("YOUR VIEW", colSelf, y, { align: "right", charSpace: 0.8 });
  doc.text("ADVISOR", colAdv, y, { align: "right", charSpace: 0.8 });
  doc.text("STILL AVAILABLE", colGap, y, { align: "right", charSpace: 0.8 });
  y += 7;
  rule(y, NAVY, 1);
  y += 16;

  for (const area of input.areas) {
    need(26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(INK);
    doc.text(area.name, colArea, y);

    doc.setTextColor(MUTED);
    doc.text(`${Math.round(area.selfPct)}%`, colSelf, y, { align: "right" });
    doc.text(`${Math.round(area.advisorPct)}%`, colAdv, y, { align: "right" });

    if (area.pointsAvailable > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TEAL);
      doc.text(`${area.pointsAvailable}`, colGap, y, { align: "right" });
    } else {
      doc.setTextColor(MUTED);
      doc.text("-", colGap, y, { align: "right" });
    }

    y += 10;
    rule(y, RAIL, 0.5);
    y += 16;
  }

  need(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text("Still available across all eight areas", colArea, y);
  doc.setTextColor(TEAL);
  doc.text(`${input.totalAvailable} points`, colGap, y, { align: "right" });
  y += 26;

  /* ---------------- the plan ---------------- */

  if (input.plan.length > 0) {
    need(140);
    y += 10;
    eyebrow("What to do about it");
    paragraph(
      "Your advisor's plan, in the order they would work through it. Each item is a finding from the review and the action that answers it.",
    );
    y += 10;

    input.plan.forEach((item, i) => {
      need(96);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(TEAL);
      doc.text(`${String(i + 1).padStart(2, "0")} · ${item.area.toUpperCase()}`, M, y, {
        charSpace: 0.8,
      });
      y += 16;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(INK);
      const findingLines = doc.splitTextToSize(item.finding, CONTENT_W - 12) as string[];
      doc.text(findingLines, M, y);
      y += findingLines.length * 15 + 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(MUTED);
      const actionLines = doc.splitTextToSize(item.action, CONTENT_W - 12) as string[];
      doc.text(actionLines, M, y);
      y += actionLines.length * 14 + 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(MUTED);
      doc.text(`Handled by: ${item.who}`, M, y);
      y += 14;

      rule(y, RAIL, 0.5);
      y += 20;
    });
  }

  /* ---------------- the disclaimer ---------------- */

  need(150);
  y += 8;

  const discLines = doc.splitTextToSize(
    "This is an estimate produced by a model, not a valuation, an appraisal or an offer. It is built from the answers you gave us, which we have not audited or independently verified. What a business actually sells for depends on the buyer, the timing, the deal terms and what comes out in diligence - none of which this assessment measures. Treat the range as a starting point for a conversation, not a price, and take your own professional advice before acting on it. Ranges are a 5% band either side of the midpoint, rounded to the nearest ten thousand, and scores are shown on a 0-100 scale.",
    CONTENT_W - 36,
  ) as string[];

  const discH = discLines.length * 12 + 46;
  doc.setFillColor(WASH);
  doc.setDrawColor(RAIL);
  doc.setLineWidth(0.75);
  doc.roundedRect(M, y, CONTENT_W, discH, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("ABOUT THESE FIGURES", M + 18, y + 22, { charSpace: 1.1 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text(discLines, M + 18, y + 38);

  /* ---------------- footers ---------------- */

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    rule(PAGE_H - 52, RAIL, 0.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(`${input.companyName} · Kriterion · kriterionbvi.com`, M, PAGE_H - 36);
    doc.text(`${p} of ${pages}`, PAGE_W - M, PAGE_H - 36, { align: "right" });
  }

  return doc;
}
