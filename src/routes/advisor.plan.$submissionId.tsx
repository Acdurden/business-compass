/**
 * Advisor workspace — the action plan.
 *
 * The advisor answers the advisory questionnaire elsewhere (/advisor/$submissionId).
 * This screen is the other half of the review: naming the problems this business
 * actually has and prescribing what to do about them. It is what the client
 * eventually reads on their ValScore summary, and it is the part of Kriterion
 * that is sold.
 *
 * Everything saves as it is clicked. Drivers are listed in the same order the
 * client sees their opportunities — most value first — so the advisor works down
 * the list that matters rather than the order the questionnaire happens to use.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import {
  buildConfig,
  computeValuation,
  type ScoringConfig,
  type ValuationResult,
} from "@/lib/valscore_calc";
import {
  DEFAULT_TARGET_VALUATION,
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";
import {
  bandFor,
  buildOpportunities,
  displayScore,
  formatCurrency,
  formatValuationRange,
  type Opportunity,
  type SectionMeta,
} from "@/lib/score-display";
import {
  advisoryDriverContext,
  buildPlanItems,
  countActions,
  emptyLibrary,
  loadLibrary,
  loadPlan,
  EMPTY_PLAN,
  type Library,
  type Plan,
  type PlanCureRow,
  type PlanProblemRow,
} from "@/lib/action-plan";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Eye,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/advisor/plan/$submissionId")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  component: ActionPlanWorkspace,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

type InputType = "netfeeincome" | "ebitda";

type Submission = {
  submission_id: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  plan: string;
  valuation_input_type: InputType | null;
  valuation_input_amount: number | null;
  target_valuation: number | null;
};

const BASIS_LABEL: Record<InputType, string> = {
  netfeeincome: "Net Fee Income",
  ebitda: "EBITDA",
};

/** A driver as this screen needs it: identity, both scores, and what is open. */
type WorkspaceSection = {
  sectionId: string;
  name: string;
  advisoryActual: number;
  advisoryMax: number;
  objectiveActual: number;
  objectiveMax: number;
  points: number | null;
};

function ActionPlanWorkspace() {
  const { submissionId } = Route.useParams();

  const [sub, setSub] = useState<Submission | null>(null);
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [library, setLibrary] = useState<Library>(emptyLibrary());
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: subData, error: subErr } = await supabase
          .from("submissions")
          .select(
            "submission_id,company_name,client_status,advisor_status,plan,valuation_input_type,valuation_input_amount,target_valuation",
          )
          .eq("submission_id", submissionId)
          .maybeSingle();
        if (cancelled) return;
        if (subErr || !subData) {
          setError(subErr?.message ?? "Submission not found");
          setLoading(false);
          return;
        }

        const [
          sectionsRes,
          questionsRes,
          responsesRes,
          bandsRes,
          multiplesRes,
          libraryData,
          planData,
        ] = await Promise.all([
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
          supabase
            .from("score_bands")
            .select("band_type,min_score,max_score,label"),
          supabase
            .from("valuation_multiples")
            .select("band_index,nfi_multiple,ebitda_multiple"),
          loadLibrary(),
          loadPlan(submissionId),
        ]);
        if (cancelled) return;

        const scoringConfig = buildConfig(
          (bandsRes.data ?? []) as never,
          (multiplesRes.data ?? []) as never,
        );
        const computed = computeValuation(
          (responsesRes.data ?? []) as never,
          (questionsRes.data ?? []) as never,
          {
            valuationInputType:
              (subData.valuation_input_type as InputType | null) ??
              DEFAULT_VALUATION_INPUT_TYPE,
            valuationInputAmount: Number(
              subData.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT,
            ),
            targetValuation: Number(
              subData.target_valuation ?? DEFAULT_TARGET_VALUATION,
            ),
          },
          scoringConfig,
        );

        setSub(subData as Submission);
        setSections((sectionsRes.data ?? []) as SectionMeta[]);
        setConfig(scoringConfig);
        setResult(computed);
        setLibrary(libraryData);
        setPlan(planData);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load this review");
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const opportunities: Opportunity[] = useMemo(() => {
    if (!result) return [];
    return buildOpportunities(sections, result.sectionScores, "full");
  }, [sections, result]);

  const drivers = useMemo(
    () => advisoryDriverContext(opportunities),
    [opportunities],
  );

  /** Advisory sections in client-opportunity order, biggest first. */
  const workspaceSections: WorkspaceSection[] = useMemo(() => {
    if (!result) return [];
    const scoreById = new Map(
      result.sectionScores.map((s) => [s.section_id, s]),
    );
    const nameById = new Map(
      sections.map((s) => [s.section_id, s.section_name]),
    );

    const rows: WorkspaceSection[] = [];
    const seen = new Set<string>();

    const push = (advisoryId: string, objectiveId: string | null) => {
      if (seen.has(advisoryId)) return;
      const a = scoreById.get(advisoryId);
      if (!a) return;
      const o = objectiveId ? scoreById.get(objectiveId) : undefined;
      seen.add(advisoryId);
      rows.push({
        sectionId: advisoryId,
        name:
          drivers.get(advisoryId)?.name ??
          nameById.get(advisoryId) ??
          advisoryId,
        advisoryActual: a.actual_score,
        advisoryMax: a.max_score,
        objectiveActual: o?.actual_score ?? 0,
        objectiveMax: o?.max_score ?? 0,
        points: drivers.get(advisoryId)?.points ?? null,
      });
    };

    // Paired drivers first, in opportunity order.
    opportunities.forEach((o) => {
      const parts = o.key.split("-");
      if (parts.length < 2) return;
      push(parts[parts.length - 1], parts[0]);
    });

    // Any advisory section that could not be paired still needs to be workable.
    sections
      .filter((s) => s.questionnaire_type === "advisory")
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((s) => push(s.section_id, null));

    return rows;
  }, [result, sections, opportunities, drivers]);

  const planItems = useMemo(
    () => buildPlanItems(plan, library, drivers),
    [plan, library, drivers],
  );

  const flaggedByProblemId = useMemo(() => {
    const m = new Map<string, PlanProblemRow>();
    plan.problems.forEach((p) => {
      if (p.problem_id) m.set(p.problem_id, p);
    });
    return m;
  }, [plan.problems]);

  const prescribedCureIds = useMemo(() => {
    const s = new Set<string>();
    plan.cures.forEach((c) => {
      if (c.cure_id) s.add(c.cure_id);
    });
    return s;
  }, [plan.cures]);

  const toggleOpen = useCallback((sectionId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  /** Run one write, keeping the screen honest about whether it saved. */
  async function run(work: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : failure);
    } finally {
      setBusy(false);
    }
  }

  function nextProblemOrder(sectionId: string): number {
    const inSection = plan.problems.filter((p) => p.section_id === sectionId);
    if (inSection.length === 0) return 1;
    return Math.max(...inSection.map((p) => p.sort_order)) + 1;
  }

  function nextCureOrder(planProblemId: string): number {
    const under = plan.cures.filter(
      (c) => c.submission_problem_id === planProblemId,
    );
    if (under.length === 0) return 1;
    return Math.max(...under.map((c) => c.sort_order)) + 1;
  }

  async function insertProblem(
    sectionId: string,
    problemId: string | null,
    customText: string | null,
  ) {
    const { data, error: err } = await supabase
      .from("submission_problems")
      .insert({
        submission_id: submissionId,
        section_id: sectionId,
        problem_id: problemId,
        custom_text: customText,
        sort_order: nextProblemOrder(sectionId),
      })
      .select("id,section_id,problem_id,custom_text,sort_order")
      .single();
    if (err) throw new Error(err.message);
    const row = data as PlanProblemRow;
    setPlan((prev) => ({ ...prev, problems: [...prev.problems, row] }));
  }

  async function removeProblem(planProblemId: string) {
    const { error: err } = await supabase
      .from("submission_problems")
      .delete()
      .eq("id", planProblemId);
    if (err) throw new Error(err.message);
    // The database cascades the actions; mirror that here rather than reloading.
    setPlan((prev) => ({
      problems: prev.problems.filter((p) => p.id !== planProblemId),
      cures: prev.cures.filter(
        (c) => c.submission_problem_id !== planProblemId,
      ),
    }));
  }

  async function insertCure(
    planProblemId: string,
    cureId: string | null,
    customText: string | null,
  ) {
    const { data, error: err } = await supabase
      .from("submission_cures")
      .insert({
        submission_problem_id: planProblemId,
        cure_id: cureId,
        custom_text: customText,
        sort_order: nextCureOrder(planProblemId),
      })
      .select("id,submission_problem_id,cure_id,custom_text,sort_order")
      .single();
    if (err) throw new Error(err.message);
    const row = data as PlanCureRow;
    setPlan((prev) => ({ ...prev, cures: [...prev.cures, row] }));
  }

  async function removeCure(planCureId: string) {
    const { error: err } = await supabase
      .from("submission_cures")
      .delete()
      .eq("id", planCureId);
    if (err) throw new Error(err.message);
    setPlan((prev) => ({
      ...prev,
      cures: prev.cures.filter((c) => c.id !== planCureId),
    }));
  }

  /** Swap a flagged problem with its neighbour inside the same driver. */
  async function moveProblem(planProblemId: string, direction: -1 | 1) {
    const row = plan.problems.find((p) => p.id === planProblemId);
    if (!row) return;
    const siblings = plan.problems
      .filter((p) => p.section_id === row.section_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    const index = siblings.findIndex((p) => p.id === planProblemId);
    const swapWith = siblings[index + direction];
    if (!swapWith) return;

    const [a, b] = [row.sort_order, swapWith.sort_order];
    // Equal sort_order would leave the pair in an arbitrary order, so give the
    // moving row a value that is definitely on the right side of its neighbour.
    const newA = a === b ? b + direction : b;
    const newB = a === b ? b : a;

    const results = await Promise.all([
      supabase
        .from("submission_problems")
        .update({ sort_order: newA })
        .eq("id", row.id),
      supabase
        .from("submission_problems")
        .update({ sort_order: newB })
        .eq("id", swapWith.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    setPlan((prev) => ({
      ...prev,
      problems: prev.problems.map((p) =>
        p.id === row.id
          ? { ...p, sort_order: newA }
          : p.id === swapWith.id
            ? { ...p, sort_order: newB }
            : p,
      ),
    }));
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading the review…</p>
      </main>
    );
  }

  if (error || !sub || !result || !config) {
    return (
      <main className="min-h-screen grid place-items-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">
          {error ?? "Could not load this review"}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/submissions">Back to submissions</Link>
        </Button>
      </main>
    );
  }

  const inputType =
    (sub.valuation_input_type as InputType | null) ??
    DEFAULT_VALUATION_INPUT_TYPE;
  const hasAmount =
    sub.valuation_input_amount != null &&
    Number(sub.valuation_input_amount) > 0;
  const objectiveMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "objective")
    .reduce((sum, s) => sum + s.max_score, 0);
  const advisoryMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "advisory")
    .reduce((sum, s) => sum + s.max_score, 0);
  const band = bandFor(result.valScore, config.adjustedBands);
  const reviewOut =
    sub.advisor_status === "submitted" || sub.advisor_status === "final";
  const isObjectivePlan = sub.plan === "objective";
  const totalActions = countActions(planItems);

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Action plan
            </p>
            <h1 className="truncate text-lg font-semibold">
              {sub.company_name}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {sub.submission_id}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/submissions">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Submissions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/advisor/$submissionId" params={{ submissionId }}>
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                Advisory answers
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/results/$submissionId" params={{ submissionId }}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Results
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-7 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="min-w-0 space-y-4">
          {isObjectivePlan ? (
            <Banner tone="amber">
              This client is on the objective-only plan, so there is no advisor
              review in their portal. Anything you build here will not be shown
              to them unless they move to full service.
            </Banner>
          ) : reviewOut ? (
            <Banner tone="green">
              The advisory review is {sub.advisor_status}. This plan is live on
              the client&apos;s summary — every change you make here is visible
              to them straight away.
            </Banner>
          ) : (
            <Banner tone="slate">
              The client cannot see any of this yet. The plan appears on their
              summary once the advisory review is submitted.
            </Banner>
          )}

          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Drivers are listed the way the client sees them — most value
            available first. Flag the problems this business actually has, then
            choose what to do about each one. Everything saves as you click it.
          </p>

          {workspaceSections.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No advisory sections are set up, so there is nothing to plan
              against yet.
            </div>
          ) : (
            workspaceSections.map((section) => (
              <SectionPanel
                key={section.sectionId}
                section={section}
                open={open.has(section.sectionId)}
                onToggleOpen={() => toggleOpen(section.sectionId)}
                library={library}
                plan={plan}
                flaggedByProblemId={flaggedByProblemId}
                prescribedCureIds={prescribedCureIds}
                busy={busy}
                onToggleProblem={(problemId) => {
                  const existing = flaggedByProblemId.get(problemId);
                  void run(
                    () =>
                      existing
                        ? removeProblem(existing.id)
                        : insertProblem(section.sectionId, problemId, null),
                    "Could not save that change",
                  );
                }}
                onAddCustomProblem={(text) =>
                  run(
                    () => insertProblem(section.sectionId, null, text),
                    "Could not add that problem",
                  )
                }
                onRemoveProblemRow={(rowId) =>
                  run(() => removeProblem(rowId), "Could not remove that")
                }
                onToggleCure={(planProblemId, cureId) => {
                  const existing = plan.cures.find(
                    (c) =>
                      c.submission_problem_id === planProblemId &&
                      c.cure_id === cureId,
                  );
                  void run(
                    () =>
                      existing
                        ? removeCure(existing.id)
                        : insertCure(planProblemId, cureId, null),
                    "Could not save that change",
                  );
                }}
                onAddCustomCure={(planProblemId, text) =>
                  run(
                    () => insertCure(planProblemId, null, text),
                    "Could not add that action",
                  )
                }
                onRemoveCureRow={(rowId) =>
                  run(() => removeCure(rowId), "Could not remove that")
                }
                onMoveProblem={(rowId, dir) =>
                  run(
                    () => moveProblem(rowId, dir),
                    "Could not change the order",
                  )
                }
              />
            ))
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <RailCard title="The plan so far">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {planItems.length}
              </span>
              <span className="text-sm text-muted-foreground">
                {planItems.length === 1 ? "problem" : "problems"} flagged
              </span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {totalActions} {totalActions === 1 ? "action" : "actions"}{" "}
              prescribed
            </div>
            {planItems.some((i) => i.actions.length === 0) ? (
              <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
                Some flagged problems have no action yet. The client would see
                the problem with nothing to do about it.
              </p>
            ) : null}
          </RailCard>

          <RailCard title="ValScore">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {displayScore(result.valScore)}
              </span>
              <span className="text-sm text-muted-foreground">
                {band.label}
              </span>
            </div>
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <RailRow
                label="Client self-assessment"
                value={`${displayScore(result.objectiveScore)} / ${objectiveMax}`}
              />
              <RailRow
                label="Your review"
                value={`${displayScore(result.advisoryScore)} / ${advisoryMax}`}
              />
            </dl>
          </RailCard>

          {hasAmount ? (
            <RailCard title="Advisor-adjusted valuation">
              <div className="text-[15px] font-semibold">
                {formatValuationRange(result.adjusted.estimatedValuation)}
              </div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">
                Midpoint{" "}
                {formatCurrency(Math.round(result.adjusted.estimatedValuation))}{" "}
                · {result.adjusted.multiple.toFixed(2)}×{" "}
                {BASIS_LABEL[inputType]}
              </div>
              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                <RailRow label="Basis" value={BASIS_LABEL[inputType]} />
                <RailRow
                  label="Amount"
                  value={formatCurrency(Number(sub.valuation_input_amount))}
                />
              </dl>
            </RailCard>
          ) : (
            <RailCard title="Advisor-adjusted valuation">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                No income figure is on file for this client, so no valuation is
                shown — here or to them.
              </p>
            </RailCard>
          )}
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Banner({
  tone,
  children,
}: {
  tone: "amber" | "green" | "slate";
  children: React.ReactNode;
}) {
  const cls =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : tone === "green"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div
      className={`rounded-md border px-4 py-3 text-[12.5px] leading-relaxed ${cls}`}
    >
      {children}
    </div>
  );
}

function RailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type SectionPanelProps = {
  section: WorkspaceSection;
  open: boolean;
  onToggleOpen: () => void;
  library: Library;
  plan: Plan;
  flaggedByProblemId: Map<string, PlanProblemRow>;
  prescribedCureIds: Set<string>;
  busy: boolean;
  onToggleProblem: (problemId: string) => void;
  onAddCustomProblem: (text: string) => Promise<void>;
  onRemoveProblemRow: (rowId: string) => Promise<void>;
  onToggleCure: (planProblemId: string, cureId: string) => void;
  onAddCustomCure: (planProblemId: string, text: string) => Promise<void>;
  onRemoveCureRow: (rowId: string) => Promise<void>;
  onMoveProblem: (rowId: string, direction: -1 | 1) => Promise<void>;
};

function SectionPanel({
  section,
  open,
  onToggleOpen,
  library,
  plan,
  flaggedByProblemId,
  prescribedCureIds,
  busy,
  onToggleProblem,
  onAddCustomProblem,
  onRemoveProblemRow,
  onToggleCure,
  onAddCustomCure,
  onRemoveCureRow,
  onMoveProblem,
}: SectionPanelProps) {
  const [draftProblem, setDraftProblem] = useState("");

  const libraryProblems =
    library.problemsBySection.get(section.sectionId) ?? [];
  const flaggedRows = plan.problems
    .filter((p) => p.section_id === section.sectionId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const actionCount = plan.cures.filter((c) =>
    flaggedRows.some((p) => p.id === c.submission_problem_id),
  ).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-[140px] flex-1 text-[14px] font-semibold">
          {section.name}
        </span>
        <span className="text-[12px] text-muted-foreground">
          your review{" "}
          <b className="tabular-nums text-foreground">
            {displayScore(section.advisoryActual)}/{section.advisoryMax}
          </b>
          {section.objectiveMax > 0 ? (
            <>
              {" · "}client{" "}
              <b className="tabular-nums text-foreground">
                {displayScore(section.objectiveActual)}/{section.objectiveMax}
              </b>
            </>
          ) : null}
          {section.points != null ? (
            <>
              {" · "}opportunity{" "}
              <b className="tabular-nums text-foreground">+{section.points}</b>
            </>
          ) : null}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            flaggedRows.length
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {flaggedRows.length
            ? `${flaggedRows.length} flagged · ${actionCount} action${actionCount === 1 ? "" : "s"}`
            : "nothing flagged"}
        </span>
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-border bg-muted/20 px-4 py-4 md:grid-cols-2">
          {/* Problems */}
          <div>
            <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Problems to address
            </h3>
            {libraryProblems.length === 0 ? (
              <p className="text-[12.5px] italic text-muted-foreground">
                Nothing in the library for this driver yet — add a problem
                below.
              </p>
            ) : (
              libraryProblems.map((p) => {
                const flagged = flaggedByProblemId.has(p.problem_id);
                return (
                  <ToggleRow
                    key={p.problem_id}
                    checked={flagged}
                    disabled={busy}
                    onClick={() => onToggleProblem(p.problem_id)}
                    text={p.problem_text}
                  />
                );
              })
            )}

            {flaggedRows
              .filter((r) => r.problem_id == null)
              .map((r) => (
                <div
                  key={r.id}
                  className="mb-1.5 flex items-start gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/5 px-3 py-2 text-[12.5px] leading-relaxed"
                >
                  <span className="flex-1">{r.custom_text}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    yours
                  </span>
                  <button
                    type="button"
                    aria-label="Remove this problem"
                    disabled={busy}
                    onClick={() => void onRemoveProblemRow(r.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

            <AddRow
              placeholder="Add a problem…"
              value={draftProblem}
              onChange={setDraftProblem}
              disabled={busy}
              onSubmit={async () => {
                const text = draftProblem.trim();
                if (!text) return;
                await onAddCustomProblem(text);
                setDraftProblem("");
              }}
            />
          </div>

          {/* Actions */}
          <div>
            <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              How to address{" "}
              <span className="font-normal normal-case italic tracking-normal">
                — only for the problems flagged
              </span>
            </h3>
            {flaggedRows.length === 0 ? (
              <p className="text-[12.5px] italic leading-relaxed text-muted-foreground">
                Flag a problem on the left and its actions appear here. An
                action can never be prescribed without the problem it solves.
              </p>
            ) : (
              flaggedRows.map((row, index) => (
                <ProblemActions
                  key={row.id}
                  row={row}
                  index={index}
                  total={flaggedRows.length}
                  library={library}
                  plan={plan}
                  prescribedCureIds={prescribedCureIds}
                  busy={busy}
                  onToggleCure={onToggleCure}
                  onAddCustomCure={onAddCustomCure}
                  onRemoveCureRow={onRemoveCureRow}
                  onMoveProblem={onMoveProblem}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ProblemActions({
  row,
  index,
  total,
  library,
  plan,
  prescribedCureIds,
  busy,
  onToggleCure,
  onAddCustomCure,
  onRemoveCureRow,
  onMoveProblem,
}: {
  row: PlanProblemRow;
  index: number;
  total: number;
  library: Library;
  plan: Plan;
  prescribedCureIds: Set<string>;
  busy: boolean;
  onToggleCure: (planProblemId: string, cureId: string) => void;
  onAddCustomCure: (planProblemId: string, text: string) => Promise<void>;
  onRemoveCureRow: (rowId: string) => Promise<void>;
  onMoveProblem: (rowId: string, direction: -1 | 1) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");

  const heading = row.problem_id
    ? (library.problemById.get(row.problem_id)?.problem_text ?? row.problem_id)
    : (row.custom_text ?? "");
  const libraryCures = row.problem_id
    ? (library.curesByProblem.get(row.problem_id) ?? [])
    : [];
  const customCures = plan.cures.filter(
    (c) => c.submission_problem_id === row.id && c.cure_id == null,
  );

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-start gap-2">
        <span className="flex-1 text-[11.5px] font-bold leading-snug text-muted-foreground">
          {heading}
        </span>
        {total > 1 ? (
          <span className="flex shrink-0 gap-0.5">
            <button
              type="button"
              aria-label="Move up"
              disabled={busy || index === 0}
              onClick={() => void onMoveProblem(row.id, -1)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={busy || index === total - 1}
              onClick={() => void onMoveProblem(row.id, 1)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {libraryCures.map((c) => (
        <ToggleRow
          key={c.cure_id}
          checked={prescribedCureIds.has(c.cure_id)}
          disabled={busy}
          onClick={() => onToggleCure(row.id, c.cure_id)}
          text={c.cure_text}
          badge={
            c.category_id
              ? (library.categoryById.get(c.category_id)?.name ?? null)
              : null
          }
        />
      ))}

      {customCures.map((c) => (
        <div
          key={c.id}
          className="mb-1.5 flex items-start gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/5 px-3 py-2 text-[12.5px] leading-relaxed"
        >
          <span className="flex-1">{c.custom_text}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            yours
          </span>
          <button
            type="button"
            aria-label="Remove this action"
            disabled={busy}
            onClick={() => void onRemoveCureRow(c.id)}
            className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <AddRow
        placeholder="Add an action…"
        value={draft}
        onChange={setDraft}
        disabled={busy}
        onSubmit={async () => {
          const text = draft.trim();
          if (!text) return;
          await onAddCustomCure(row.id, text);
          setDraft("");
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ToggleRow({
  checked,
  disabled,
  onClick,
  text,
  badge,
}: {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
  text: string;
  badge?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      className={`mb-1.5 flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-[12.5px] leading-relaxed transition-colors disabled:opacity-60 ${
        checked
          ? "border-emerald-500/60 bg-emerald-500/10"
          : "border-border bg-card hover:border-muted-foreground/40"
      }`}
    >
      <span
        className={`mt-px grid h-[15px] w-[15px] shrink-0 place-items-center rounded border text-[10px] font-black leading-none ${
          checked
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-muted-foreground/40"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      <span className="flex-1">
        {text}
        {badge ? (
          <span className="ml-1.5 whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function AddRow({
  placeholder,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <div className="mt-2 flex gap-2">
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void onSubmit();
          }
        }}
        className="h-8 text-[12.5px]"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 shrink-0 px-2.5"
        disabled={disabled || value.trim().length === 0}
        onClick={() => void onSubmit()}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="sr-only">Add</span>
      </Button>
    </div>
  );
}
