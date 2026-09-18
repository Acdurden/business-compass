/**
 * The client report, assembled once.
 *
 * There is exactly one report. `/client/summary` renders it to the screen and
 * `generate-client-pdf.ts` renders it to a PDF, and neither of them decides
 * anything about its content. Before this module the two were built
 * independently and had already drifted: the PDF carried a self-versus-advisor
 * comparison the result page had deliberately dropped, and it banded an
 * objective-only score against the wrong scale. Assembling here makes that
 * class of disagreement impossible rather than something to notice later.
 *
 * Everything below is read from the database. Nothing is invented. Where a
 * piece is missing, the field is null and the renderers omit the block instead
 * of substituting a plausible-looking stand-in.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildConfig, computeValuation, type ValuationResult } from "@/lib/valscore_calc";
import { bandFor, buildOpportunities, grossObjective, type SectionMeta } from "@/lib/score-display";
import {
  advisoryDriverContext,
  buildPlanItems,
  emptyLibrary,
  loadLibrary,
  loadPlan,
  EMPTY_PLAN,
} from "@/lib/action-plan";

export type InputType = "netfeeincome" | "ebitda";

/** One of the eight scored areas, in ValScore points. */
export type ReportArea = {
  key: string;
  name: string;
  earned: number;
  total: number;
  available: number;
};

/**
 * One of the things a buyer raises first: the advisor's flagged problem, the
 * client's own answers that bear on it, and what a buyer does about it.
 */
export type ReportFinding = {
  area: string;
  available: number;
  title: string;
  /** The client's own answers in this area, in their own words at the time. */
  evidence: string[];
  /** The library paragraph. Null for a problem the advisor typed themselves. */
  consequence: string | null;
};

export type ReportAction = {
  area: string | null;
  available: number | null;
  problem: string;
  action: string;
};

export type ClientReport = {
  submissionId: string;
  companyName: string;
  completedOn: Date;
  /** True only where an advisor has genuinely reviewed this submission. */
  reviewed: boolean;
  /** Objective-only clients never get a review, so they never wait for one. */
  isObjectivePlan: boolean;
  /** Whether the client has finished and submitted their own questionnaire. */
  clientSubmitted: boolean;
  /** The advisor's sentence. Null when they have not written one. */
  verdict: string | null;
  score: number;
  bandLabel: string;
  basisLabel: string;
  /** Null when no income figure is on file, in which case there is no range. */
  basisAmount: number | null;
  multiple: number;
  midpoint: number;
  areas: ReportArea[];
  totalAvailable: number;
  findings: ReportFinding[];
  actions: ReportAction[];
  /** Areas holding points with nothing prescribed against them. */
  uncoveredAreas: string[];
};

/**
 * Re-exported so callers of the report do not have to know where rounding
 * lives. There is one definition, in `score-display.ts`, alongside the
 * formatter that every screen and the PDF share.
 */
export { round10k } from "@/lib/score-display";

type SubmissionRow = {
  submission_id: string;
  company_name: string | null;
  client_status: string | null;
  advisor_status: string | null;
  plan: string | null;
  valuation_input_type: string | null;
  valuation_input_amount: number | null;
  updated_at: string | null;
  advisor_verdict: string | null;
};

const SUB_COLUMNS =
  "submission_id,company_name,client_status,advisor_status,plan,valuation_input_type,valuation_input_amount,updated_at,advisor_verdict";

/**
 * Load and assemble one report.
 *
 * `submissionId` is optional. Omitted, it picks the signed-in client's own
 * submission ordered `created_at` ASC, which is what `/client` and
 * `/client/summary` both do. Changing that ordering in one place and not the
 * other is a bug this project has already had once.
 */
export async function loadClientReport(submissionId?: string): Promise<ClientReport> {
  const subQuery = supabase.from("submissions").select(SUB_COLUMNS);
  const { data: subRows, error: subErr } = submissionId
    ? await subQuery.eq("submission_id", submissionId).limit(1)
    : await subQuery.order("created_at", { ascending: true, nullsFirst: false }).limit(1);

  const sub = (subRows ?? [])[0] as SubmissionRow | undefined;
  if (subErr || !sub) throw new Error(subErr?.message ?? "We couldn't find your assessment.");

  const id = sub.submission_id;

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
      .select(
        "question_id,section_id,questionnaire_type,points_awarded,selected_answer_text,question_text",
      )
      .eq("submission_id", id),
    supabase.from("score_bands").select("band_type,min_score,max_score,label"),
    supabase.from("valuation_multiples").select("band_index,nfi_multiple,ebitda_multiple"),
  ]);

  const responses = responsesRes.data ?? [];
  const sections = (sectionsRes.data ?? []) as SectionMeta[];

  const isObjectivePlan = sub.plan === "objective";
  const advisoryAnswered = responses.filter(
    (r: { questionnaire_type?: string | null }) => r.questionnaire_type === "advisory",
  ).length;

  /*
   * The same rule every other screen applies: a submission flagged as reviewed
   * with zero advisory answers is NOT reviewed, and must not produce a ValScore
   * made of the objective half alone.
   */
  const reviewed =
    !isObjectivePlan &&
    (sub.advisor_status === "submitted" || sub.advisor_status === "final") &&
    advisoryAnswered > 0;

  const rawAmount = Number(sub.valuation_input_amount ?? 0);
  const hasAmount = Number.isFinite(rawAmount) && rawAmount > 0;

  const config = buildConfig((bandsRes.data ?? []) as never, (multiplesRes.data ?? []) as never);
  const result: ValuationResult = computeValuation(
    responses as never,
    (questionsRes.data ?? []) as never,
    {
      /*
       * Default to net fee income, matching DEFAULT_VALUATION_INPUT_TYPE and every
       * other site in the repo. This read "ebitda" until 2026-09-18, which for a
       * row with a null type and a non-null amount priced the business against
       * the EBITDA anchors, roughly two to four times the NFI anchors, and then
       * labelled the result "Net Fee Income" two hundred lines further down. The
       * same client saw a different valuation on /client than on /client/summary.
       */
      valuationInputType: (sub.valuation_input_type as InputType | null) ?? "netfeeincome",
      valuationInputAmount: hasAmount ? rawAmount : 0,
      targetValuation: 0,
    },
    config,
  );

  const objectiveMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "objective")
    .reduce((sum, s) => sum + s.max_score, 0);

  const leg = reviewed ? result.adjusted : result.objective;
  const score = reviewed ? result.valScore : grossObjective(result.objectiveScore, objectiveMax);

  /*
   * `adjustedBands` for both, deliberately. The objective bands are stored on
   * the raw /60 scale and this score is already grossed to 0-100, so banding a
   * grossed score against them reads a 72 as the top band. The PDF shipped on
   * 2026-08-28 did exactly that.
   */
  const bandLabel = bandFor(score, config.adjustedBands)?.label ?? "";

  const opportunities = buildOpportunities(
    sections,
    result.sectionScores,
    reviewed ? "full" : "objective",
  );

  const scoreBySection = new Map(result.sectionScores.map((s) => [s.section_id, s]));

  /*
   * Area totals are computed here rather than taken from `buildOpportunities`
   * so that earned, total and available always add up on the page. On a
   * reviewed submission an area is its objective section plus its advisory
   * section, which is why the eight of them sum to 100. Without a review the
   * advisory half is unassessed rather than available, so the area is the
   * objective section alone.
   */
  const areas: ReportArea[] = opportunities.map((o) => {
    const [objId, advId] = o.key.split("-");
    const obj = scoreBySection.get(objId ?? "");
    const adv = advId ? scoreBySection.get(advId) : undefined;
    const total = (obj?.max_score ?? 0) + (reviewed ? (adv?.max_score ?? 0) : 0);
    const earned = (obj?.actual_score ?? 0) + (reviewed ? (adv?.actual_score ?? 0) : 0);
    return { key: o.key, name: o.name, earned, total, available: Math.max(0, total - earned) };
  });

  const totalAvailable = areas.reduce((sum, a) => sum + a.available, 0);

  /*
   * The client's own answers, grouped by the objective section they belong to,
   * so a finding can quote what they actually said. `question_text` is the
   * wording they saw; it is null on answers given before that column existed,
   * and those simply contribute no evidence line rather than being shown
   * against today's wording.
   */
  const answersBySection = new Map<string, string[]>();
  responses
    .filter((r: { questionnaire_type?: string | null }) => r.questionnaire_type === "objective")
    .forEach((r: { section_id?: string | null; selected_answer_text?: string | null }) => {
      const sectionId = r.section_id ?? "";
      const answer = (r.selected_answer_text ?? "").trim();
      if (!sectionId || !answer) return;
      const list = answersBySection.get(sectionId);
      if (list) list.push(answer);
      else answersBySection.set(sectionId, [answer]);
    });

  const availableByArea = new Map(areas.map((a) => [a.name, a.available]));
  const objectiveSectionByArea = new Map(areas.map((a) => [a.name, a.key.split("-")[0] ?? ""]));

  let findings: ReportFinding[] = [];
  let actions: ReportAction[] = [];
  let uncoveredAreas: string[] = [];

  if (reviewed) {
    let planItems = [] as ReturnType<typeof buildPlanItems>;
    try {
      const [library, plan] = await Promise.all([loadLibrary(), loadPlan(id)]);
      planItems = buildPlanItems(plan, library, advisoryDriverContext(opportunities));
    } catch {
      // A plan that will not load is not a reason to withhold the rest.
      planItems = buildPlanItems(EMPTY_PLAN, emptyLibrary(), new Map());
    }

    /*
     * Three findings, taken in the order that matters most. The client reads a
     * page, not a database, and a list of every flagged problem buries the ones
     * that move the number.
     */
    findings = planItems
      .slice()
      .sort((a, b) => (b.driverPoints ?? 0) - (a.driverPoints ?? 0))
      .slice(0, 3)
      .map((item) => {
        const area = item.driverName ?? "";
        const objectiveSection = objectiveSectionByArea.get(area) ?? "";
        return {
          area,
          available: item.driverPoints ?? availableByArea.get(area) ?? 0,
          title: item.text,
          evidence: answersBySection.get(objectiveSection) ?? [],
          consequence: item.buyerConsequence,
        };
      });

    actions = planItems.flatMap((item) =>
      item.actions.map((action) => ({
        area: item.driverName,
        available: item.driverPoints,
        problem: item.text,
        action: action.text,
      })),
    );

    /*
     * Areas that still hold points but have nothing prescribed against them.
     * Shown rather than hidden: a client who reads a gap with no action is owed
     * an explanation, and an advisor who sees the list knows what to pick up.
     */
    const coveredAreas = new Set(planItems.map((i) => i.driverName ?? ""));
    uncoveredAreas = areas
      .filter((a) => a.available > 0 && !coveredAreas.has(a.name))
      .map((a) => a.name);
  }

  return {
    submissionId: id,
    companyName: (sub.company_name ?? "Your business").trim() || "Your business",
    completedOn: sub.updated_at ? new Date(sub.updated_at) : new Date(),
    reviewed,
    isObjectivePlan,
    clientSubmitted: sub.client_status === "submitted" || sub.client_status === "complete",
    verdict: (sub.advisor_verdict ?? "").trim() || null,
    score,
    bandLabel,
    basisLabel: sub.valuation_input_type === "ebitda" ? "EBITDA" : "Net Fee Income",
    basisAmount: hasAmount ? rawAmount : null,
    multiple: leg.multiple,
    midpoint: leg.estimatedValuation,
    areas,
    totalAvailable,
    findings,
    actions,
    uncoveredAreas,
  };
}

/**
 * What stands in for the verdict when the advisor has not written one.
 *
 * Deliberately says nothing about this business. A placeholder sentence
 * describing what a buyer thinks of a client's agency, written by nobody, is a
 * fabricated judgement, and the same rule that forbids inventing a number on a
 * client-facing page forbids inventing this. So the block holds its position
 * and its height, and says only what is true of every assessment.
 */
export function verdictOrStandIn(report: ClientReport): string {
  if (report.verdict) return report.verdict;
  return report.reviewed
    ? "Your advisor has reviewed this business against the same eight areas you answered on. The findings below are what they would put in front of a buyer first."
    : "This is built from your own answers across eight areas. An advisor review is the next thing that would move it.";
}
