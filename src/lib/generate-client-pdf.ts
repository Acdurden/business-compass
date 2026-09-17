/**
 * The client report, rendered to PDF.
 *
 * This is the same report the client reads on `/client/summary`, in the same
 * order, saying the same things. Both take a `ClientReport` from
 * `client-report.ts` and neither decides anything about its content. That is
 * deliberate: the two were built independently once and drifted within three
 * weeks, the PDF carrying a self-versus-advisor comparison the page had
 * deliberately dropped.
 *
 * This is NOT `generate-submission-pdf.ts`. That one is the advisor's working
 * file, headed "KRITERION VALUATION REPORT" with the submission id and the raw
 * score arithmetic on it. It stays where it is, for advisors.
 *
 * `buildClientPdf` is pure so the exact bytes a client downloads can be
 * rendered and checked outside a browser.
 */

import { jsPDF } from "jspdf";
import { formatCurrency, formatValuationRange } from "@/lib/score-display";
import { round10k, verdictOrStandIn, type ClientReport } from "@/lib/client-report";

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

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------ */

export function buildClientPdf(report: ClientReport): jsPDF {
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
    need(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(text.toUpperCase(), M, y, { charSpace: 1.1 });
    y += 16;
  }

  function paragraph(text: string, size = 10, color = MUTED, width = CONTENT_W, indent = 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, width) as string[];
    need(lines.length * (size * 1.45));
    doc.text(lines, M + indent, y);
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

  /*
   * Shrink the company name to fit rather than letting it run off the page.
   * Below 15pt it wraps instead of shrinking further.
   */
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  let nameSize = 23;
  while (nameSize > 15 && doc.getStringUnitWidth(report.companyName) * nameSize > CONTENT_W) {
    nameSize -= 1;
  }
  doc.setFontSize(nameSize);
  const nameLines = doc.splitTextToSize(report.companyName, CONTENT_W) as string[];
  doc.text(nameLines, M, y);
  y += (nameLines.length - 1) * (nameSize * 1.15) + 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(
    `Completed ${formatLongDate(report.completedOn)}${
      report.reviewed ? " · Reviewed by your Kriterion advisor" : ""
    }`,
    M,
    y,
  );
  y += 30;

  /* ---------------- score and value ---------------- */

  const hasMoney = report.basisAmount != null && report.basisAmount > 0;

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
  doc.text(hasMoney ? "WHERE THAT PUTS YOU TODAY" : "YOUR ASSESSMENT", bx, by, { charSpace: 1.1 });
  by += 26;

  if (hasMoney) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(NAVY);
    doc.text(formatValuationRange(report.midpoint), bx, by);
    by += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(MUTED);
    doc.text(
      `Midpoint ${formatCurrency(round10k(report.midpoint))} · ${report.multiple.toFixed(2)} times ${report.basisLabel} of ${formatCurrency(report.basisAmount ?? 0)}`,
      bx,
      by,
    );
  } else {
    /* No income figure on file, so there is no range. Say why rather than
       leaving a gap, and never fall back to a default amount. */
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(INK);
    const noneLines = doc.splitTextToSize(
      "We do not have your income figure on file yet, so this assessment does not put a range on the business. Your advisor can add it, and the figures will follow.",
      CONTENT_W - 190,
    ) as string[];
    doc.text(noneLines, bx, by);
  }

  // The score sits alongside, deliberately not as the headline.
  const sx = PAGE_W - M - 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text("YOUR SCORE", sx, y + 26, { align: "right", charSpace: 1.1 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(TEAL);
  doc.text(String(Math.round(report.score)), sx, y + 62, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(report.bandLabel, sx, y + 80, { align: "right" });

  y += boxH + 30;

  /* ---------------- verdict ---------------- */

  /*
   * Always rendered, so the report keeps its shape whether or not an advisor
   * has written a verdict. The stand-in makes no claim about this business.
   */
  eyebrow("What a buyer would conclude");
  paragraph(verdictOrStandIn(report), 11.5, INK, CONTENT_W - 40);
  y += 12;

  /* ---------------- findings ---------------- */

  if (report.findings.length > 0) {
    need(120);
    eyebrow("The things a buyer raises first");

    report.findings.forEach((f, i) => {
      need(110);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(TEAL);
      const head =
        f.available > 0 ? `${f.area.toUpperCase()} · ${f.available} POINTS` : f.area.toUpperCase();
      doc.text(`${String(i + 1).padStart(2, "0")} · ${head}`, M, y, { charSpace: 0.8 });
      y += 16;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(INK);
      const titleLines = doc.splitTextToSize(f.title, CONTENT_W - 12) as string[];
      doc.text(titleLines, M, y);
      y += titleLines.length * 15 + 6;

      if (f.evidence.length > 0) {
        paragraph(
          `What you told us in this area: ${f.evidence.join("; ")}.`,
          9,
          MUTED,
          CONTENT_W - 12,
        );
      }
      if (f.consequence) {
        paragraph(f.consequence, 10, INK, CONTENT_W - 12);
      }

      y += 4;
      rule(y, RAIL, 0.5);
      y += 18;
    });
  }

  /* ---------------- areas ---------------- */

  need(140);
  eyebrow("Where your points are, and where they are not");
  paragraph(
    report.reviewed
      ? "Eight areas carry the score. For each one, how many points your answers and your advisor's review have earned between them, and how many are still on the table."
      : "Eight areas carry the score. For each one, how many points your answers have earned and how many are still on the table.",
  );
  y += 8;

  const colArea = M;
  const colEarned = PAGE_W - M - 120;
  const colGap = PAGE_W - M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("AREA", colArea, y, { charSpace: 0.8 });
  doc.text("EARNED", colEarned, y, { align: "right", charSpace: 0.8 });
  doc.text("STILL AVAILABLE", colGap, y, { align: "right", charSpace: 0.8 });
  y += 7;
  rule(y, NAVY, 1);
  y += 16;

  report.areas
    .slice()
    .sort((a, b) => b.available - a.available)
    .forEach((area) => {
      need(26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(INK);
      doc.text(area.name, colArea, y);

      doc.setTextColor(MUTED);
      doc.text(`${area.earned} of ${area.total}`, colEarned, y, { align: "right" });

      if (area.available > 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(TEAL);
        doc.text(String(area.available), colGap, y, { align: "right" });
      } else {
        doc.setTextColor(MUTED);
        doc.text("-", colGap, y, { align: "right" });
      }

      y += 10;
      rule(y, RAIL, 0.5);
      y += 16;
    });

  need(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text("Still available across all eight areas", colArea, y);
  doc.setTextColor(TEAL);
  doc.text(`${report.totalAvailable} points`, colGap, y, { align: "right" });
  y += 26;

  /* ---------------- plan ---------------- */

  if (report.actions.length > 0) {
    need(140);
    y += 10;
    eyebrow("Your plan, in the order that moves the number most");

    report.actions.forEach((item, i) => {
      need(92);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(TEAL);
      const label = item.area
        ? `${String(i + 1).padStart(2, "0")} · ${item.area.toUpperCase()}`
        : String(i + 1).padStart(2, "0");
      doc.text(label, M, y, { charSpace: 0.8 });
      y += 16;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(INK);
      const problemLines = doc.splitTextToSize(item.problem, CONTENT_W - 12) as string[];
      doc.text(problemLines, M, y);
      y += problemLines.length * 15 + 6;

      paragraph(item.action, 10, MUTED, CONTENT_W - 12);
      y += 4;
      rule(y, RAIL, 0.5);
      y += 18;
    });

    if (report.uncoveredAreas.length > 0) {
      paragraph(
        `${report.uncoveredAreas.length === 1 ? "One area has" : `${report.uncoveredAreas.length} areas have`} points available and nothing prescribed yet: ${report.uncoveredAreas.join(", ")}. Your advisor will pick those up at the review conversation.`,
        9.5,
        MUTED,
      );
      y += 6;
    }
  }

  /* ---------------- disclaimer ---------------- */

  need(150);
  y += 8;

  const rangeNote = hasMoney
    ? " Ranges are a 5% band either side of the midpoint, rounded to the nearest ten thousand, and scores are shown on a 0-100 scale."
    : " Scores are shown on a 0-100 scale.";

  const discLines = doc.splitTextToSize(
    "This is an estimate produced by a model, not a valuation, an appraisal or an offer. It is built from the answers you gave us, which we have not audited or independently verified. What a business actually sells for depends on the buyer, the timing, the deal terms and what comes out in diligence, none of which this assessment measures. Treat " +
      (hasMoney ? "the range" : "this") +
      " as a starting point for a conversation, not a price, and take your own professional advice before acting on it." +
      rangeNote,
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
    doc.text(`${report.companyName} · Kriterion · kriterionbvi.com`, M, PAGE_H - 36);
    doc.text(`${p} of ${pages}`, PAGE_W - M, PAGE_H - 36, { align: "right" });
  }

  return doc;
}

/* ------------------------------------------------------------------ */

/**
 * Load one report and hand the client their copy of it.
 *
 * `submissionId` is optional and passed straight through, so this picks the
 * same submission the result page shows for the same signed-in client.
 */
export async function generateClientPdf(submissionId?: string): Promise<void> {
  const { loadClientReport } = await import("@/lib/client-report");
  const report = await loadClientReport(submissionId);
  const doc = buildClientPdf(report);

  const safeName = report.companyName
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`${safeName || "assessment"}-value-readiness.pdf`);
}
