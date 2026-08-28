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
  area: string | null;
  finding: string;
  action: string;
  /**
   * Null whenever we could not name who does the work. A client cannot read
   * `partner_categories` under RLS, so for a real client this is always null
   * and the line is simply left off — it is never guessed at.
   */
  who: string | null;
};

export type ClientPdfInput = {
  companyName: string;
  completedOn: Date;
  reviewed: boolean;
  score: number;
  bandLabel: string;
  /**
   * False on the objective-only plan, where no advisor has reviewed anything.
   * Printing an empty advisor column would read as a review that scored zero.
   */
  showAdvisorColumn: boolean;
  basisLabel: string;
  /**
   * Null when no income figure is on file. The money block is then omitted
   * entirely rather than filled with a default — a client must never read an
   * invented figure as their own.
   */
  basisAmount: number | null;
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

  /*
   * Shrink the company name to fit rather than letting it run off the page.
   * "A Very Long Trading Name For Wrapping Limited" reached the right margin at
   * 23pt; anything longer used to overflow silently. Below 15pt it wraps
   * instead of shrinking further, so it never becomes unreadable.
   */
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  let nameSize = 23;
  while (nameSize > 15 && doc.getStringUnitWidth(input.companyName) * nameSize > CONTENT_W) {
    nameSize -= 1;
  }
  doc.setFontSize(nameSize);
  const nameLines = doc.splitTextToSize(input.companyName, CONTENT_W) as string[];
  doc.text(nameLines, M, y);
  y += (nameLines.length - 1) * (nameSize * 1.15) + 20;

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

  const hasMoney = input.basisAmount != null && input.basisAmount > 0;

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
    const lo = round10k(input.midpoint * 0.95);
    const hi = round10k(input.midpoint * 1.05);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(NAVY);
    doc.text(`${formatCurrency(lo)} - ${formatCurrency(hi)}`, bx, by);
    by += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(MUTED);
    doc.text(
      `Midpoint ${formatCurrency(round10k(input.midpoint))} · ${input.multiple.toFixed(2)} times ${input.basisLabel} of ${formatCurrency(input.basisAmount ?? 0)}`,
      bx,
      by,
    );
  } else {
    /*
     * No income figure on file, so there is no range to print. Say why rather
     * than leaving a gap, and never fall back to a default amount.
     */
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
  doc.text(String(Math.round(input.score)), sx, y + 62, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(input.bandLabel, sx, y + 80, { align: "right" });

  y += boxH + 30;

  /* ---------------- what this is ---------------- */

  /*
   * An objective-only client never gets a review, so they must not be told one
   * moved their number. The same false promise is currently live in the copy on
   * /client/assessment; it is not this file's to fix, but it is not this file's
   * to repeat either.
   */
  paragraph(
    input.reviewed
      ? "This is what your assessment says about how a buyer would see the business today. Your own answers set the starting position, and your advisor's review moved it. The number is worth less than what sits behind it, which is the rest of this document."
      : "This is what your own answers say about how a buyer would see the business today. Nobody from Kriterion has reviewed it — an advisor review is the next thing that would move it. The number is worth less than what sits behind it, which is the rest of this document.",
    10.5,
    INK,
  );
  y += 10;

  /* ---------------- the eight areas ---------------- */

  need(120);
  eyebrow("Where the value sits");
  paragraph(
    input.showAdvisorColumn
      ? "Eight areas carry the score. For each one: how much of it your own answers captured, how much your advisor credited after reviewing the business, and how much is still on the table."
      : "Eight areas carry the score. For each one: how much of it your answers captured, and how much is still on the table.",
  );
  y += 8;

  const colArea = M;
  const colSelf = input.showAdvisorColumn ? M + 268 : M + 344;
  const colAdv = M + 344;
  const colGap = PAGE_W - M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("AREA", colArea, y, { charSpace: 0.8 });
  doc.text("YOUR VIEW", colSelf, y, { align: "right", charSpace: 0.8 });
  if (input.showAdvisorColumn) {
    doc.text("ADVISOR", colAdv, y, { align: "right", charSpace: 0.8 });
  }
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
    if (input.showAdvisorColumn) {
      doc.text(`${Math.round(area.advisorPct)}%`, colAdv, y, { align: "right" });
    }

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
      const label = item.area
        ? `${String(i + 1).padStart(2, "0")} · ${item.area.toUpperCase()}`
        : String(i + 1).padStart(2, "0");
      doc.text(label, M, y, { charSpace: 0.8 });
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

      if (item.who) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(MUTED);
        doc.text(`Handled by: ${item.who}`, M, y);
        y += 14;
      }

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

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load one submission and hand the client their own copy.
 *
 * Reads exactly what `/client/summary` reads, in the same way and in the same
 * order (`created_at ASC` is enforced by the caller passing an id), so the PDF
 * and the screen can never disagree about which submission is "yours".
 *
 * The action plan is loaded through the same `loadLibrary`/`loadPlan` pair the
 * summary uses. Row-level security returns nothing until the review has been
 * submitted, so a failure there is never a reason to withhold the document.
 */
export async function generateClientPdf(submissionId: string): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { buildConfig, computeValuation } = await import("@/lib/valscore_calc.js");
  const { bandFor, buildDrivers, buildOpportunities, grossObjective, totalOpportunity } =
    await import("@/lib/score-display");
  const { advisoryDriverContext, buildPlanItems, emptyLibrary, loadLibrary, loadPlan, EMPTY_PLAN } =
    await import("@/lib/action-plan");

  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select(
      "submission_id,company_name,advisor_status,plan,valuation_input_type,valuation_input_amount,updated_at",
    )
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (subErr || !subRow) throw new Error("We couldn't find your assessment.");

  const [sectionsRes, questionsRes, responsesRes, bandsRes, multiplesRes] = await Promise.all([
    supabase
      .from("sections")
      .select("section_id,section_name,sort_order,questionnaire_type")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("questions")
      .select("question_id,section_id,questionnaire_type,max_score")
      .eq("active", true),
    supabase
      .from("responses")
      .select("question_id,section_id,questionnaire_type,points_awarded")
      .eq("submission_id", submissionId),
    supabase.from("score_bands").select("band_type,min_score,max_score,label"),
    supabase.from("valuation_multiples").select("band_index,nfi_multiple,ebitda_multiple"),
  ]);

  const responses = responsesRes.data ?? [];
  const sections = (sectionsRes.data ?? []) as never;

  const isObjective = subRow.plan === "objective";
  const advisoryAnswered = responses.filter(
    (r: { questionnaire_type?: string | null }) => r.questionnaire_type === "advisory",
  ).length;
  /*
   * The same rule the screens apply: a submission flagged as reviewed with zero
   * advisory answers is NOT reviewed, and must not produce an advisor column.
   */
  const reviewed =
    !isObjective &&
    (subRow.advisor_status === "submitted" || subRow.advisor_status === "final") &&
    advisoryAnswered > 0;

  const rawAmount = Number(subRow.valuation_input_amount ?? 0);
  const hasAmount = Number.isFinite(rawAmount) && rawAmount > 0;

  const config = buildConfig((bandsRes.data ?? []) as never, (multiplesRes.data ?? []) as never);
  const result = computeValuation(
    responses as never,
    (questionsRes.data ?? []) as never,
    {
      valuationInputType: (subRow.valuation_input_type as "netfeeincome" | "ebitda") ?? "ebitda",
      valuationInputAmount: hasAmount ? rawAmount : 0,
      targetValuation: 0,
    },
    config,
  );

  const objectiveMax = result.sectionScores
    .filter((s: { questionnaire_type: string }) => s.questionnaire_type === "objective")
    .reduce((sum: number, s: { max_score: number }) => sum + s.max_score, 0);

  const leg = reviewed ? result.adjusted : result.objective;
  const score = reviewed ? result.valScore : grossObjective(result.objectiveScore, objectiveMax);
  const bands = reviewed ? config.adjustedBands : config.objectiveBands;

  const opportunities = buildOpportunities(
    sections,
    result.sectionScores,
    reviewed ? "full" : "objective",
  );
  const drivers = buildDrivers(sections, result.sectionScores);
  const gapByKey = new Map(opportunities.map((o) => [o.key, o.totalGap]));

  let planItems: ClientPdfPlanItem[] = [];
  if (reviewed) {
    try {
      const [library, plan] = await Promise.all([loadLibrary(), loadPlan(submissionId)]);
      planItems = buildPlanItems(plan, library, advisoryDriverContext(opportunities)).flatMap(
        (item) =>
          item.actions.map((action) => ({
            area: item.driverName,
            finding: item.text,
            action: action.text,
            who: action.categoryName,
          })),
      );
    } catch {
      // No plan readable is not a reason to withhold the rest of the document.
      buildPlanItems(EMPTY_PLAN, emptyLibrary(), new Map());
      planItems = [];
    }
  }

  const doc = buildClientPdf({
    companyName: subRow.company_name ?? "Your business",
    completedOn: subRow.updated_at ? new Date(subRow.updated_at as string) : new Date(),
    reviewed,
    score,
    bandLabel: bandFor(score, bands)?.label ?? "",
    showAdvisorColumn: reviewed,
    basisLabel: subRow.valuation_input_type === "ebitda" ? "EBITDA" : "Net Fee Income",
    basisAmount: hasAmount ? rawAmount : null,
    multiple: leg.multiple,
    midpoint: leg.estimatedValuation,
    areas: drivers.map((d) => ({
      name: d.name,
      selfPct: d.selfScore,
      advisorPct: d.advisorScore,
      pointsAvailable: gapByKey.get(d.key) ?? 0,
    })),
    totalAvailable: totalOpportunity(opportunities),
    plan: planItems,
  });

  const safeName = (subRow.company_name ?? "assessment")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`${safeName || "assessment"}-value-readiness.pdf`);
}
