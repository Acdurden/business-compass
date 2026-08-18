import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { computeValuation, buildConfig } from "@/lib/valscore_calc.js";
import {
  DEFAULT_TARGET_VALUATION,
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";

type InputType = "netfeeincome" | "ebitda";

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtMultiple(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  return `${n.toFixed(1)}x`;
}

function fmtScore(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "0";
  return Math.round(n).toString();
}

export async function generateSubmissionPdf(submissionId: string): Promise<void> {
  // 1. Load submission via admin/advisor RLS (advisor-side reads OK)
  const { data: sub, error: subErr } = await supabase
    .from("submissions")
    .select(
      "submission_id,company_name,client_status,advisor_status,valuation_input_type,valuation_input_amount,target_valuation,updated_at",
    )
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (subErr || !sub) throw new Error("Submission not found");

  const [sectionsRes, questionsRes, responsesRes, scoreBandsRes, multiplesRes] = await Promise.all([
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

  const sections = (sectionsRes.data ?? []) as Array<{
    section_id: string;
    section_name: string;
    sort_order: number;
    questionnaire_type: string;
  }>;
  const questions = (questionsRes.data ?? []) as Array<{
    question_id: string;
    section_id: string;
    questionnaire_type: string;
    max_score: number | null;
  }>;
  const responses = (responsesRes.data ?? []) as Array<{
    question_id: string;
    section_id: string | null;
    questionnaire_type: string | null;
    points_awarded: number | null;
  }>;

  const inputType = (sub.valuation_input_type as InputType | null) ?? DEFAULT_VALUATION_INPUT_TYPE;
  const amount = Number(sub.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT);
  const target = Number(sub.target_valuation ?? DEFAULT_TARGET_VALUATION);

  const scoringConfig = buildConfig(
    (scoreBandsRes.data ?? []) as never,
    (multiplesRes.data ?? []) as never,
  );

  const result = computeValuation(
    responses,
    questions,
    {
      valuationInputType: inputType,
      valuationInputAmount: amount,
      targetValuation: target,
    },
    scoringConfig,
  );

  const advisoryComplete = sub.advisor_status === "submitted" || sub.advisor_status === "final";
  const hasAdvisory = responses.some((r) => r.questionnaire_type === "advisory");
  const includeAdjusted = advisoryComplete || hasAdvisory;

  // ---- Build PDF ----
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  const primary: [number, number, number] = [15, 23, 42]; // slate-900
  const accent: [number, number, number] = [37, 99, 235]; // blue-600
  const muted: [number, number, number] = [100, 116, 139]; // slate-500

  // Header
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("KRITERION VALUATION REPORT", margin, y);
  doc.text(
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    pageW - margin,
    y,
    { align: "right" },
  );
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...primary);
  doc.text(sub.company_name, margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Submission ID: ${sub.submission_id}`, margin, y);
  y += 24;

  if (!includeAdjusted) {
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(margin, y, pageW - margin * 2, 32, 4, 4, "FD");
    doc.setTextColor(120, 53, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("ADVISORY PORTION PENDING", margin + 12, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      "This report reflects the objective questionnaire only. Adjusted ValScore figures will be available once the advisor questionnaire is complete.",
      margin + 12,
      y + 25,
      { maxWidth: pageW - margin * 2 - 24 },
    );
    y += 44;
  }

  // Section: Score by Section
  y = sectionHeading(doc, "Score by Section", y, margin, primary);

  const objSectionRows = sections
    .filter((s) => s.questionnaire_type === "objective")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => {
      const sc = result.sectionScores.find((x) => x.section_id === s.section_id);
      return [s.section_name, fmtScore(sc?.actual_score ?? 0), fmtScore(sc?.max_score ?? 0)];
    });

  const objTotal = result.objectiveScore;
  const objMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "objective")
    .reduce((sum, s) => sum + s.max_score, 0);

  autoTable(doc, {
    startY: y,
    head: [["Section", "Score", "Max"]],
    body: objSectionRows,
    foot: [["Objective Score", fmtScore(objTotal), fmtScore(objMax)]],
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 6, textColor: primary },
    headStyles: { fillColor: [241, 245, 249], textColor: primary, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: primary, fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right", cellWidth: 70 },
      2: { halign: "right", cellWidth: 70, textColor: muted },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  if (includeAdjusted) {
    const advSectionRows = sections
      .filter((s) => s.questionnaire_type === "advisory")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => {
        const sc = result.sectionScores.find((x) => x.section_id === s.section_id);
        return [s.section_name, fmtScore(sc?.actual_score ?? 0), fmtScore(sc?.max_score ?? 0)];
      });

    if (advSectionRows.length > 0) {
      const advMax = result.sectionScores
        .filter((s) => s.questionnaire_type === "advisory")
        .reduce((sum, s) => sum + s.max_score, 0);

      y = ensureSpace(doc, y, 120, margin);
      autoTable(doc, {
        startY: y,
        head: [["Advisor Section", "Score", "Max"]],
        body: advSectionRows,
        foot: [["Advisor Score", fmtScore(result.advisoryScore), fmtScore(advMax)]],
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 6, textColor: primary },
        headStyles: { fillColor: [241, 245, 249], textColor: primary, fontStyle: "bold" },
        footStyles: { fillColor: [241, 245, 249], textColor: primary, fontStyle: "bold" },
        columnStyles: {
          1: { halign: "right", cellWidth: 70 },
          2: { halign: "right", cellWidth: 70, textColor: muted },
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
    }
  }

  // Financial inputs
  y = ensureSpace(doc, y, 100, margin);
  y = sectionHeading(doc, "Financial Inputs", y, margin, primary);
  autoTable(doc, {
    startY: y,
    body: [
      ["Basis", inputType === "ebitda" ? "EBITDA" : "Net Fee Income"],
      ["Amount", fmtCurrency(amount)],
    ],
    theme: "plain",
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 5, textColor: primary },
    columnStyles: {
      0: { textColor: muted, cellWidth: 160 },
      1: { fontStyle: "bold" },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // Valuation results
  y = ensureSpace(doc, y, 140, margin);
  y = sectionHeading(doc, "Valuation Results", y, margin, primary);

  const adj = result.adjusted;
  const valuationRows: string[][] = [
    [
      "ValScore",
      adj.marketPosition || "—",
      fmtMultiple(adj.multiple),
      fmtCurrency(adj.estimatedValuation),
    ],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Basis", "Market Position", "Multiple", "Estimated Valuation"]],
    body: valuationRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 7, textColor: primary },
    headStyles: { fillColor: [241, 245, 249], textColor: primary, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "right", cellWidth: 70 },
      3: { halign: "right", cellWidth: 130, fontStyle: "bold" },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // ValScore summary box (if advisory)
  if (includeAdjusted) {
    y = ensureSpace(doc, y, 60, margin);
    doc.setFillColor(239, 246, 255); // blue-50
    doc.setDrawColor(...accent);
    doc.roundedRect(margin, y, pageW - margin * 2, 46, 4, 4, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("VALSCORE", margin + 14, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...primary);
    doc.text(
      `${fmtScore(result.objectiveScore)} + ${fmtScore(result.advisoryScore)} = ${fmtScore(result.valScore)}`,
      margin + 14,
      y + 36,
    );
    y += 60;
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(
      "Confidential — prepared for the named company.",
      margin,
      doc.internal.pageSize.getHeight() - 24,
    );
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 24, {
      align: "right",
    });
  }

  const safeName = sub.company_name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  doc.save(`Kriterion_${safeName || sub.submission_id}.pdf`);
}

function sectionHeading(
  doc: jsPDF,
  label: string,
  y: number,
  margin: number,
  primary: [number, number, number],
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...primary);
  doc.text(label, margin, y);
  return y + 10;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function renderTargetBlock(
  doc: jsPDF,
  title: string,
  t: {
    requiredMultiple: number;
    requiredScore: number | null;
    scoreDeficit: number | null;
    additionalIncomeRequired: number;
    totalIncomeRequired: number;
  },
  currentScore: number,
  currentValuation: number,
  targetValuation: number,
  y: number,
  margin: number,
  pageW: number,
  primary: [number, number, number],
  muted: [number, number, number],
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text(title.toUpperCase(), margin, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Current score ${fmtScore(currentScore)}`, pageW - margin, y + 6, {
    align: "right",
  });
  y += 14;

  if (currentValuation >= targetValuation) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...primary);
    const msg = `Target already exceeded. Estimated valuation of ${fmtCurrency(currentValuation)} is above the target of ${fmtCurrency(targetValuation)} — no additional score or income required.`;
    const lines = doc.splitTextToSize(msg, pageW - margin * 2);
    doc.text(lines, margin, y + 8);
    return y + 8 + lines.length * 12 + 10;
  }

  const rows = [
    ["Required multiple", `${t.requiredMultiple.toFixed(1)}x`],
    [
      "Required score",
      t.requiredScore != null ? Math.ceil(t.requiredScore).toString() : "Beyond top band",
    ],
    [
      "Score deficit",
      t.scoreDeficit != null
        ? t.scoreDeficit <= 0
          ? "Target achievable at current score"
          : `${Math.ceil(t.scoreDeficit)} pts`
        : "—",
    ],
    [
      "Additional income required",
      t.scoreDeficit != null && t.scoreDeficit <= 0
        ? fmtCurrency(0)
        : fmtCurrency(t.additionalIncomeRequired),
    ],
    ["Total income required", fmtCurrency(t.totalIncomeRequired)],
  ];

  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "plain",
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 4, textColor: primary },
    columnStyles: {
      0: { textColor: muted, cellWidth: 220 },
      1: { fontStyle: "bold" },
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
}
