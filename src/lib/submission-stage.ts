/**
 * Where a submission stands, decided in one place for the back office.
 *
 * The sidebar badge, the submissions filters, the dashboard tiles and the
 * command palette all ask the same question ("is the next move ours or the
 * client's?"). Answering it in four files is how their counts would drift
 * apart.
 */

export type StageInput = {
  client_status: string | null | undefined;
  advisor_status: string | null | undefined;
  /** "objective" is the self-assessment only, with no advisor review included. */
  plan?: string | null;
};

/** The client has finished their half and the questionnaire is locked. */
export function clientReady(clientStatus: string | null | undefined): boolean {
  return clientStatus === "submitted" || clientStatus === "complete";
}

export function normalizeAdvisoryStatus(
  status: string | null | undefined,
): "notstarted" | "inprogress" | "submitted" | "final" {
  if (status === "submitted" || status === "final" || status === "inprogress") return status;
  return "notstarted";
}

/**
 * The six places a submission can be.
 *
 * - invited: the client has an account but has not started the questionnaire
 * - client: the client is part-way through
 * - needs: the client has submitted and the advisory review has not begun
 * - advisory: the advisory review is under way
 * - review: the advisory is submitted and waits to be marked final
 * - final: the advisory review is marked final
 * - complete: an objective-only plan the client has submitted. There is no
 *   advisor review on that plan, so it is finished, as the dashboard queue in
 *   `advisor-queue.ts` already treats it.
 */
export type Stage = "invited" | "client" | "needs" | "advisory" | "review" | "final" | "complete";

export function stageOf(r: StageInput): Stage {
  if (!clientReady(r.client_status)) {
    return r.client_status === "inprogress" ? "client" : "invited";
  }
  const adv = normalizeAdvisoryStatus(r.advisor_status);
  if (adv === "final") return "final";
  if (r.plan === "objective") return "complete";
  if (adv === "inprogress") return "advisory";
  if (adv === "submitted") return "review";
  return "needs";
}

export type StageMeta = {
  label: string;
  tone: "neutral" | "warn" | "ok";
  /** The one next step, as its button reads. */
  next: string;
  /** Whether that step is advisory work (a dark button) or not (outlined). */
  advisorWork: boolean;
  /** Which of the four progress steps is current (0 to 3), or 4 when all are done. */
  step: number;
};

export const STAGE: Record<Stage, StageMeta> = {
  invited: {
    label: "Invited, not started",
    tone: "neutral",
    next: "Resend invite",
    advisorWork: false,
    step: 1,
  },
  client: {
    label: "Client in progress",
    tone: "neutral",
    next: "Copy login link",
    advisorWork: false,
    step: 1,
  },
  needs: {
    label: "Needs advisory",
    tone: "warn",
    next: "Start advisory",
    advisorWork: true,
    step: 2,
  },
  advisory: {
    label: "Advisory in progress",
    tone: "warn",
    next: "Continue advisory",
    advisorWork: true,
    step: 2,
  },
  review: {
    label: "Advisory submitted",
    tone: "warn",
    next: "Mark as final",
    advisorWork: true,
    step: 3,
  },
  final: {
    label: "Final",
    tone: "ok",
    next: "Open action plan",
    advisorWork: false,
    step: 4,
  },
  complete: {
    label: "Complete, no advisor review",
    tone: "ok",
    next: "View results",
    advisorWork: false,
    step: 4,
  },
};

/** The filter chips on the submissions list, in order. */
export type StageFilter = "needs" | "client" | "final" | "all";

export const STAGE_FILTERS: Array<{ key: StageFilter; label: string }> = [
  { key: "needs", label: "Needs me" },
  { key: "client", label: "Waiting on client" },
  { key: "final", label: "Final" },
  { key: "all", label: "All" },
];

export function matchesStageFilter(stage: Stage, filter: StageFilter): boolean {
  switch (filter) {
    case "needs":
      return stage === "needs" || stage === "advisory" || stage === "review";
    case "client":
      return stage === "invited" || stage === "client";
    case "final":
      return stage === "final" || stage === "complete";
    default:
      return true;
  }
}

/**
 * The next step is the advisor's: the client has submitted and the advisory
 * review is not yet marked final. This is what the sidebar badge counts, and
 * it is the same set as the "Needs me" filter.
 */
export function needsAdvisor(r: StageInput): boolean {
  return matchesStageFilter(stageOf(r), "needs");
}

/** "Oct 10", or "Not recorded" for a missing or unreadable date. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The one line under a status pill. It uses the last update, which is the only
 * date every submission carries; no stage records its own start date.
 */
export function stageDetail(stage: Stage, updatedAt: string | null | undefined): string {
  const when = shortDate(updatedAt);
  switch (stage) {
    case "invited":
      return `Not started. Last update ${when}`;
    case "client":
      return `Working on it. Last active ${when}`;
    case "needs":
      return `Submitted. Last update ${when}`;
    case "advisory":
      return `Advisory last saved ${when}`;
    case "review":
      return `Advisory submitted ${when}`;
    case "final":
      return `Final on ${when}`;
    case "complete":
      return `Objective only, submitted ${when}`;
  }
}
