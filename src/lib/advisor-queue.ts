/**
 * The advisor dashboard's logic: which list does each submission belong in, and
 * what is the one thing to do about it.
 *
 * Kept out of the route so it can be exercised against real rows rather than
 * only compiled. The organising idea is that a submission is filed by WHO IS
 * BLOCKING it, not by its status code:
 *
 *   needs   — the advisor's move
 *   waiting — the client's move; a nudge, not a task
 *   done    — finished, kept visible so a completed review does not vanish
 *
 * Nothing here is a practice-performance measure. Every number this module
 * produces is a count of assessments or reviews.
 */

import { computeValuation, type ScoringConfig } from "@/lib/valscore_calc";
import {
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";

export type QueueSubmission = {
  submission_id: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  plan: string;
  valuation_input_type: string | null;
  valuation_input_amount: number | null;
  created_at: string;
  updated_at: string;
};

export type QueueResponse = {
  submission_id: string;
  section_id: string | null;
  questionnaire_type: string | null;
  points_awarded: number | null;
};

export type QueueQuestion = {
  section_id: string;
  questionnaire_type: string;
  max_score: number | null;
};

export type Bucket = "needs" | "waiting" | "done";
export type Destination = "plan" | "advisory" | "results";

export type QueueAction = { label: string; to: Destination };

export type QueueItem = {
  id: string;
  company: string;
  plan: string;
  bucket: Bucket;
  /** Leading, quieter half of the stage line. */
  stage: string;
  /** The half worth bolding — what state it is actually in. */
  stageStrong: string;
  /** Score and plan size, when they exist. Never a mid-review score. */
  meta: string;
  days: number;
  action: QueueAction;
  secondary: QueueAction | null;
  /** Higher sorts first inside a bucket. */
  urgency: number;
};

export type QueueTile = {
  key: string;
  value: number;
  footnote: string;
  alert: boolean;
};

export type QueueNote = { id: string; count: string; text: string; info?: boolean };

/** Whole days between then and now, never negative. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const STAGE_ADVISORY_NOT_STARTED = "advisory not started";
const STAGE_NO_PLAN = "no action plan yet";

export function countQuestions(questions: QueueQuestion[]) {
  let objective = 0;
  let advisory = 0;
  questions.forEach((q) => {
    if (q.questionnaire_type === "objective") objective += 1;
    else if (q.questionnaire_type === "advisory") advisory += 1;
  });
  return { objective, advisory };
}

/**
 * File every submission and decide its one action.
 *
 * `config` may be null while the scoring tables are still loading; scores are
 * simply omitted until it arrives rather than the whole queue waiting on them.
 */
export function buildQueueItems(input: {
  submissions: QueueSubmission[];
  responses: QueueResponse[];
  questions: QueueQuestion[];
  planProblems: Array<{ id: string; submission_id: string }>;
  planActions: Array<{ submission_problem_id: string }>;
  config: ScoringConfig | null;
  now?: number;
}): QueueItem[] {
  const {
    submissions,
    responses,
    questions,
    planProblems,
    planActions,
    config,
    now = Date.now(),
  } = input;

  const totals = countQuestions(questions);

  const answered = new Map<string, { objective: number; advisory: number }>();
  const responsesBySubmission = new Map<string, QueueResponse[]>();
  responses.forEach((r) => {
    const counts = answered.get(r.submission_id) ?? { objective: 0, advisory: 0 };
    if (r.questionnaire_type === "advisory") counts.advisory += 1;
    else counts.objective += 1;
    answered.set(r.submission_id, counts);

    const list = responsesBySubmission.get(r.submission_id);
    if (list) list.push(r);
    else responsesBySubmission.set(r.submission_id, [r]);
  });

  const problemsBySubmission = new Map<string, string[]>();
  planProblems.forEach((p) => {
    const list = problemsBySubmission.get(p.submission_id);
    if (list) list.push(p.id);
    else problemsBySubmission.set(p.submission_id, [p.id]);
  });
  const actionsByProblem = new Map<string, number>();
  planActions.forEach((a) => {
    actionsByProblem.set(
      a.submission_problem_id,
      (actionsByProblem.get(a.submission_problem_id) ?? 0) + 1,
    );
  });

  return submissions.map((s) => {
    const counts = answered.get(s.submission_id) ?? { objective: 0, advisory: 0 };
    const problemIds = problemsBySubmission.get(s.submission_id) ?? [];
    const actionCount = problemIds.reduce((sum, id) => sum + (actionsByProblem.get(id) ?? 0), 0);
    const days = daysSince(s.updated_at, now);
    const isObjectivePlan = s.plan === "objective";
    const clientDone = s.client_status === "submitted" || s.client_status === "complete";
    const reviewIn = s.advisor_status === "submitted" || s.advisor_status === "final";

    /**
     * A ValScore is only quoted once the review that produced it is in AND the
     * advisory questions actually carry answers. Without both, the number would
     * be a ValScore made of the objective half alone — the same trap the client
     * summary guards against.
     */
    let meta = "";
    if (config && reviewIn && counts.advisory > 0) {
      const computed = computeValuation(
        (responsesBySubmission.get(s.submission_id) ?? []) as never,
        questions as never,
        {
          valuationInputType:
            (s.valuation_input_type as "netfeeincome" | "ebitda" | null) ??
            DEFAULT_VALUATION_INPUT_TYPE,
          valuationInputAmount: Number(s.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT),
          targetValuation: 0,
        },
        config,
      );
      meta = `ValScore ${Math.round(computed.valScore)}`;
    }
    const planMeta = problemIds.length
      ? `${plural(problemIds.length, "problem", "problems")}, ${plural(actionCount, "action", "actions")}`
      : "";
    const metaLine = [meta, planMeta].filter(Boolean).join(" · ");

    const base = {
      id: s.submission_id,
      company: s.company_name,
      plan: s.plan,
      days,
    };

    /* ---- finished ---- */
    if (s.advisor_status === "final") {
      return {
        ...base,
        bucket: "done" as const,
        stage: "Final · ",
        stageStrong: planMeta || "no action plan recorded",
        meta,
        action: { label: "View results", to: "results" as const },
        secondary: { label: "Action plan", to: "plan" as const },
        urgency: -days,
      };
    }
    if (isObjectivePlan && clientDone) {
      return {
        ...base,
        bucket: "done" as const,
        stage: "Complete · ",
        stageStrong: "no advisor review on this plan",
        meta: "",
        action: { label: "View results", to: "results" as const },
        secondary: null,
        urgency: -days,
      };
    }

    /* ---- needs you ---- */
    if (clientDone && !isObjectivePlan) {
      if (s.advisor_status === "notstarted") {
        return {
          ...base,
          bucket: "needs" as const,
          stage: "Client submitted · ",
          stageStrong: STAGE_ADVISORY_NOT_STARTED,
          meta: `advisory questionnaire · 0 of ${totals.advisory} answered`,
          action: { label: "Start the advisory", to: "advisory" as const },
          secondary: null,
          urgency: 1000 + days,
        };
      }
      if (s.advisor_status === "inprogress") {
        return {
          ...base,
          bucket: "needs" as const,
          stage: "Advisory in progress · ",
          stageStrong: `${counts.advisory} of ${totals.advisory} answered`,
          meta: "",
          action: { label: "Resume the advisory", to: "advisory" as const },
          secondary: null,
          urgency: 900 + days,
        };
      }
      // Review submitted but not final: the action plan is the outstanding work.
      return {
        ...base,
        bucket: "needs" as const,
        stage: "Review submitted · ",
        stageStrong: problemIds.length ? "action plan started" : STAGE_NO_PLAN,
        meta: metaLine,
        action: {
          label: problemIds.length ? "Finish the action plan" : "Build the action plan",
          to: "plan" as const,
        },
        secondary: { label: "View results", to: "results" as const },
        urgency: (problemIds.length ? 700 : 800) + days,
      };
    }

    /* ---- waiting on the client ---- */
    if (s.client_status === "inprogress") {
      return {
        ...base,
        bucket: "waiting" as const,
        stage: "Assessment in progress · ",
        stageStrong: `${counts.objective} of ${totals.objective} answered`,
        meta: "",
        action: { label: "View results", to: "results" as const },
        secondary: null,
        urgency: days,
      };
    }
    return {
      ...base,
      bucket: "waiting" as const,
      stage: "Not started",
      stageStrong: "",
      meta: `invited ${plural(daysSince(s.created_at, now), "day", "days")} ago`,
      action: { label: "View results", to: "results" as const },
      secondary: null,
      urgency: days,
    };
  });
}

export function sortBucket(items: QueueItem[], bucket: Bucket): QueueItem[] {
  return items
    .filter((i) => i.bucket === bucket)
    .sort((a, b) => b.urgency - a.urgency || a.company.localeCompare(b.company));
}

/** One tile per stage of the pipeline, left to right. */
export function buildTiles(
  items: QueueItem[],
  submissions: QueueSubmission[],
  /** Client accounts with no submission at all; null while still loading. */
  neverOpened: number | null,
): QueueTile[] {
  const notStartedSubs = submissions.filter((s) => s.client_status === "notstarted").length;
  const inAssessment = submissions.filter((s) => s.client_status === "inprogress").length;
  const needs = items.filter((i) => i.bucket === "needs");
  const awaiting = needs.filter((i) => i.stageStrong === STAGE_ADVISORY_NOT_STARTED).length;
  const reviewing = needs.length - awaiting;
  const finished = items.filter((i) => i.bucket === "done").length;
  const oldestNeeds = needs.reduce((max, i) => Math.max(max, i.days), 0);
  const stalled = items.filter((i) => i.bucket === "waiting" && i.days > 14).length;
  const notStarted = (neverOpened ?? 0) + notStartedSubs;

  return [
    {
      key: "Not started",
      value: notStarted,
      footnote:
        neverOpened == null
          ? "invited, never opened"
          : `${plural(neverOpened, "account", "accounts")} never opened`,
      alert: notStarted > 0,
    },
    {
      key: "Assessment in progress",
      value: inAssessment,
      footnote: stalled ? `${plural(stalled, "stalled", "stalled")} over 14 days` : "none stalled",
      alert: stalled > 0,
    },
    {
      key: "Awaiting your review",
      value: awaiting,
      footnote: awaiting
        ? `oldest waiting ${plural(oldestNeeds, "day", "days")}`
        : "nothing sitting with you",
      alert: awaiting > 0,
    },
    {
      key: "Review in progress",
      value: reviewing,
      footnote: reviewing ? "advisory or action plan open" : "none open",
      alert: false,
    },
    {
      key: "Finished",
      value: finished,
      footnote: finished ? "marked final" : "none marked final yet",
      alert: false,
    },
  ];
}

/** Things that are nobody's task but cost something if they sit. */
export function buildNotes(
  items: QueueItem[],
  submissions: QueueSubmission[],
  neverOpened: number | null,
): QueueNote[] {
  const out: QueueNote[] = [];

  if (neverOpened) {
    out.push({
      id: "never-opened",
      count: String(neverOpened),
      text: "client accounts exist with no assessment against them. Most are likely seed and test data rather than real people who stalled — open the list and check before reading anything into the number.",
    });
  }

  const stalled = sortBucket(items, "waiting").filter((i) => i.days > 14);
  if (stalled.length) {
    out.push({
      id: "stalled",
      count: String(stalled.length),
      text: `${stalled.length === 1 ? "client has" : "clients have"} been mid-assessment for over two weeks. The oldest is ${stalled[0].company}, untouched for ${plural(stalled[0].days, "day", "days")}.`,
    });
  }

  const unanswered = sortBucket(items, "needs").filter(
    (i) => i.stageStrong === STAGE_ADVISORY_NOT_STARTED,
  );
  if (unanswered.length) {
    out.push({
      id: "oldest-review",
      count: String(unanswered[0].days),
      text: `days is the oldest review waiting on you. ${unanswered[0].company} submitted and has heard nothing since.`,
    });
  }

  const noPlan = items.filter((i) => i.stageStrong === STAGE_NO_PLAN);
  if (noPlan.length) {
    out.push({
      id: "no-plan",
      count: String(noPlan.length),
      text: `${noPlan.length === 1 ? "review was" : "reviews were"} submitted with no action plan at all. Those clients would see a summary with nothing to do about it.`,
    });
  }

  const noAmount = submissions.filter(
    (s) => s.valuation_input_amount == null || Number(s.valuation_input_amount) <= 0,
  );
  if (noAmount.length) {
    out.push({
      id: "no-amount",
      count: String(noAmount.length),
      text: `${noAmount.length === 1 ? "client has" : "clients have"} no income figure on file, so their assessment cannot produce a valuation.`,
      info: true,
    });
  }

  return out;
}
