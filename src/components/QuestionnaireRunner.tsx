import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearAdvisorResponse,
  getAdvisorSubmission,
  saveAdvisorResponse,
  setAdvisorStatus,
} from "@/lib/advisor-submissions.functions";

type Section = {
  section_id: string;
  section_name: string;
  sort_order: number;
};
type Question = {
  question_id: string;
  section_id: string;
  question_text: string;
  sort_order: number;
  max_score: number | null;
};
type AnswerOption = {
  id: string;
  question_id: string;
  answer_text: string;
  points: number | null;
  option_order: number;
  unique_id_responses: string | null;
};

type ClientSource = { mode: "client"; token: string };
type AdvisorSource = { mode: "advisor"; submissionId: string };

export type QuestionnaireRunnerProps = (ClientSource | AdvisorSource) & {
  questionnaireType: "objective" | "advisory";
  statusField: "client_status" | "advisor_status";
  eyebrow: string;
  finishLabel: string;
  exitTo: "/" | "/advisor" | "/client" | "/admin/submissions";
  notFoundTo: "/" | "/advisor" | "/client" | "/admin/submissions";
  /** Where to send the user when they click "Finish". Defaults to exitTo. */
  finishTo?: { to: string; params?: Record<string, string> };
  /** "complete" (default) marks complete + shows results.
   *  "submitlock" calls submit_my_client_submission and returns to exitTo. */
  finishMode?: "complete" | "submitlock";
  /** When true, render a required final "Financial information" step
   *  (basis + amount) before allowing finish. Client mode only. */
  requireFinancialInput?: boolean;
  /** When true, render answers but disable editing and hide submit (advisor review). */
  readOnly?: boolean;
  /** When true, present the questionnaire one section at a time (wizard),
   *  with Back/Continue navigation and per-section completion gating.
   *  When false (default), all sections render on one scrolling page. */
  stepped?: boolean;
};

function fmtCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = Number(digits);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

export function QuestionnaireRunner(props: QuestionnaireRunnerProps) {
  const { questionnaireType, statusField, eyebrow, finishLabel, exitTo, notFoundTo } = props;
  const navigate = useNavigate();
  const loadAdvisor = useServerFn(getAdvisorSubmission);
  const saveAdvisor = useServerFn(saveAdvisorResponse);
  const clearAdvisor = useServerFn(clearAdvisorResponse);
  const setAdvStatus = useServerFn(setAdvisorStatus);

  const [companyName, setCompanyName] = useState("");
  const [clientToken, setClientToken] = useState<string | null>(
    props.mode === "client" ? props.token : null,
  );
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<AnswerOption[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finBasis, setFinBasis] = useState<"netfeeincome" | "ebitda">("netfeeincome");
  const [finAmount, setFinAmount] = useState<string>("");
  const [finError, setFinError] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const finInputRef = useRef<HTMLInputElement | null>(null);
  const finSectionRef = useRef<HTMLDivElement | null>(null);
  const questionRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // Stable identity for effect dependency
  const sourceKey =
    props.mode === "client" ? `client:${props.token}` : `advisor:${props.submissionId}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let companyNameVal = "";
      let tokenVal: string | null = null;
      const responseMap: Record<string, string> = {};

      if (props.mode === "client") {
        const { data, error } = await supabase.rpc("get_client_submission", {
          p_token: props.token,
        });
        if (cancelled) return;
        const row = (data ?? [])[0];
        if (error || !row) {
          toast.error("This link is invalid or has expired");
          navigate({ to: notFoundTo });
          return;
        }
        companyNameVal = row.company_name as string;
        tokenVal = props.token;

        const respRes = await supabase.rpc("get_client_responses", {
          p_token: props.token,
        });
        if (cancelled) return;
        for (const r of (respRes.data ?? []) as Array<{
          question_id: string;
          questionnaire_type: string | null;
          answer_option_id: string;
        }>) {
          if (r.questionnaire_type === questionnaireType) {
            responseMap[r.question_id] = r.answer_option_id;
          }
        }
      } else {
        try {
          const load = await loadAdvisor({
            data: { submissionId: props.submissionId, questionnaireType },
          });
          if (cancelled) return;
          companyNameVal = load.company_name;
          tokenVal = load.client_token;
          for (const r of load.responses) {
            responseMap[r.question_id] = r.answer_option_id;
          }
        } catch (err) {
          if (cancelled) return;
          toast.error(err instanceof Error ? err.message : "Submission not found");
          navigate({ to: notFoundTo });
          return;
        }
      }

      const [sectionsRes, questionsRes] = await Promise.all([
        supabase
          .from("sections")
          .select("section_id,section_name,sort_order")
          .eq("questionnaire_type", questionnaireType)
          .eq("active", true)
          .order("sort_order"),
        supabase
          .from("questions")
          .select("question_id,section_id,question_text,sort_order,max_score")
          .eq("questionnaire_type", questionnaireType)
          .eq("active", true)
          .order("sort_order"),
      ]);
      if (cancelled) return;

      const qs = (questionsRes.data ?? []) as Question[];
      setSections((sectionsRes.data ?? []) as Section[]);
      setQuestions(qs);
      setCompanyName(companyNameVal);
      setClientToken(tokenVal);
      setResponses(responseMap);

      if (qs.length) {
        const { data: opts } = await supabase
          .from("answer_options")
          .select("id,question_id,answer_text,points,option_order,unique_id_responses")
          .in(
            "question_id",
            qs.map((q) => q.question_id),
          )
          .eq("active", true)
          .order("option_order");
        if (!cancelled) setOptions((opts ?? []) as AnswerOption[]);
      }

      // mark in-progress if not already started (skip in read-only mode)
      if (!props.readOnly) {
        if (props.mode === "client") {
          await supabase.rpc("set_client_submission_status", {
            p_token: props.token,
            p_status: "inprogress",
          });
        } else {
          try {
            await setAdvStatus({
              data: {
                submissionId: props.submissionId,
                status: "inprogress",
                onlyIfNotStarted: true,
              },
            });
          } catch {
            /* non-fatal */
          }
        }
      }

      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, questionnaireType, statusField, notFoundTo]);

  const sectionsWithQuestions = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.section_id, s]));
    const grouped = new Map<string, { section: Section; questions: Question[] }>();
    for (const q of questions) {
      const s = byId.get(q.section_id);
      if (!s) continue;
      if (!grouped.has(s.section_id)) grouped.set(s.section_id, { section: s, questions: [] });
      grouped.get(s.section_id)!.questions.push(q);
    }
    return Array.from(grouped.values()).sort((a, b) => a.section.sort_order - b.section.sort_order);
  }, [sections, questions]);

  const optionsByQuestion = useMemo(() => {
    const m: Record<string, AnswerOption[]> = {};
    for (const o of options) (m[o.question_id] ||= []).push(o);
    return m;
  }, [options]);

  const answered = Object.keys(responses).length;
  const total = questions.length;
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  const allAnswered = total > 0 && answered === total;
  const requireFin = !!props.requireFinancialInput && props.mode === "client";
  const cleanFin = finAmount.replace(/[$,\s]/g, "");
  const parsedAmount = Number(cleanFin);
  const financialReady =
    !requireFin || (cleanFin !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0);

  // Wizard (one-section-at-a-time) mode. Only active for the client-facing,
  // editable questionnaire — never in advisor mode or read-only review.
  const stepped = !!props.stepped && !props.readOnly && props.mode === "client";

  // Steps: each real section in order, then (if required) a final financial step.
  // A step is { kind: "section", data } or { kind: "financial" }.
  type Step = { kind: "section"; section: Section; questions: Question[] } | { kind: "financial" };
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = sectionsWithQuestions.map(({ section, questions }) => ({
      kind: "section" as const,
      section,
      questions,
    }));
    if (requireFin) list.push({ kind: "financial" as const });
    return list;
  }, [sectionsWithQuestions, requireFin]);

  const stepCount = steps.length;
  const safeStepIndex = Math.min(stepIndex, Math.max(0, stepCount - 1));
  const currentStep = steps[safeStepIndex];
  const isLastStep = safeStepIndex === stepCount - 1;

  // Is the current step fully answered? Sections require all their questions;
  // the financial step requires a valid amount.
  function stepComplete(step: Step | undefined): boolean {
    if (!step) return false;
    if (step.kind === "financial") return financialReady;
    return step.questions.every((q) => !!responses[q.question_id]);
  }
  const currentStepComplete = stepComplete(currentStep);

  async function handleSelect(question: Question, option: AnswerOption) {
    if (props.readOnly) return;

    /**
     * Clicking the answer that is already chosen clears it.
     *
     * Advisor only. The client questionnaire saves through a database routine
     * that has no counterpart for deleting a row, and changing what a client can
     * do to their own submitted answers is a separate decision.
     *
     * Until this existed the only way to undo one advisory answer was
     * `advisor_reset_advisor_responses`, which wipes all eighteen. The action
     * plan has always toggled on re-click, so this also makes the two halves of
     * the review behave the same way.
     */
    if (props.mode === "advisor" && responses[question.question_id] === option.id) {
      await handleClear(question);
      return;
    }

    setResponses((prev) => ({ ...prev, [question.question_id]: option.id }));
    setSaving(question.question_id);
    let error: unknown = null;
    if (props.mode === "client") {
      const res = await supabase.rpc("save_client_response", {
        p_token: props.token,
        p_question_id: question.question_id,
        p_answer_option_id: option.id,
      });
      error = res.error;
    } else {
      try {
        await saveAdvisor({
          data: {
            submissionId: props.submissionId,
            questionnaireType,
            questionId: question.question_id,
            sectionId: question.section_id,
            answerOptionId: option.id,
            answerText: option.answer_text,
            points: option.points ?? 0,
            uniqueIdResponse: option.unique_id_responses,
          },
        });
      } catch (e) {
        error = e;
      }
    }
    setSaving(null);
    if (error) {
      toast.error("Couldn't save answer");
      console.error(error);
    }
  }

  /** Put one question back to unanswered. Advisor only; see handleSelect. */
  async function handleClear(question: Question) {
    if (props.mode !== "advisor") return;
    const previous = responses[question.question_id];
    setResponses((prev) => {
      const next = { ...prev };
      delete next[question.question_id];
      return next;
    });
    setSaving(question.question_id);
    try {
      await clearAdvisor({
        data: {
          submissionId: props.submissionId,
          questionnaireType,
          questionId: question.question_id,
        },
      });
    } catch (e) {
      // Put the answer back rather than leaving the screen claiming a change
      // that never reached the database.
      setResponses((prev) => ({ ...prev, [question.question_id]: previous }));
      toast.error("Couldn't clear that answer");
      console.error(e);
    } finally {
      setSaving(null);
    }
  }

  function goBack() {
    if (safeStepIndex === 0) return;
    setAttemptedSubmit(false);
    setStepIndex(safeStepIndex - 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goNext() {
    // Gate: the current section must be fully answered before advancing.
    if (!currentStepComplete) {
      setAttemptedSubmit(true);
      // Scroll to the first unanswered question in this section (financial
      // step has no per-question refs; its own error styling covers it).
      if (currentStep && currentStep.kind === "section") {
        const firstMissing = currentStep.questions.find((q) => !responses[q.question_id]);
        if (firstMissing) {
          questionRefs.current[firstMissing.question_id]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
      return;
    }
    setAttemptedSubmit(false);
    setStepIndex(safeStepIndex + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleFinish() {
    const finishMode = props.finishMode ?? "complete";
    setFinError(null);

    // Build list of missing questions in page order.
    const missingQuestionIds: string[] = [];
    for (const { questions: qs } of sectionsWithQuestions) {
      for (const q of qs) {
        if (!responses[q.question_id]) missingQuestionIds.push(q.question_id);
      }
    }
    const finBlank =
      requireFin && (cleanFin === "" || !Number.isFinite(parsedAmount) || parsedAmount <= 0);

    if (missingQuestionIds.length > 0 || finBlank) {
      setAttemptedSubmit(true);
      if (stepped) {
        // In wizard mode, jump to the step that contains the first gap
        // rather than scrolling to a section that isn't currently rendered.
        let targetStep = -1;
        if (missingQuestionIds.length > 0) {
          const firstMissingId = missingQuestionIds[0];
          targetStep = steps.findIndex(
            (st) =>
              st.kind === "section" && st.questions.some((q) => q.question_id === firstMissingId),
          );
        } else if (finBlank) {
          targetStep = steps.findIndex((st) => st.kind === "financial");
        }
        if (targetStep >= 0) setStepIndex(targetStep);
        if (finBlank) {
          setFinError("Enter your financial amount before submitting.");
        }
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      const firstMissingEl = missingQuestionIds.length
        ? questionRefs.current[missingQuestionIds[0]]
        : finSectionRef.current;
      if (firstMissingEl) {
        firstMissingEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (finBlank) {
        setFinError("Enter your financial amount before submitting.");
      }
      return;
    }

    setFinishing(true);
    let error: unknown = null;
    if (requireFin) {
      const res = await supabase.rpc("set_my_client_valuation", {
        p_input_type: finBasis,
        p_input_amount: parsedAmount,
      });
      if (res.error) {
        setFinishing(false);
        toast.error("Couldn't save financial information");
        return;
      }
    }

    if (finishMode === "submitlock") {
      const res = await supabase.rpc("submit_my_client_submission");
      error = res.error;
    } else if (props.mode === "client") {
      const res = await supabase.rpc("set_client_submission_status", {
        p_token: props.token,
        p_status: "complete",
      });
      error = res.error;
    } else {
      try {
        await setAdvStatus({
          data: { submissionId: props.submissionId, status: "submitted" },
        });
      } catch (e) {
        error = e;
      }
    }
    setFinishing(false);
    if (error) {
      toast.error("Couldn't finalize submission");
      return;
    }
    if (finishMode === "submitlock") {
      toast.success("Submitted");
    } else {
      toast.success("Saved");
    }
    const finishTo = props.finishTo;
    if (finishMode !== "submitlock" && finishTo) {
      navigate({ to: finishTo.to, params: finishTo.params } as never);
    } else {
      navigate({ to: exitTo });
    }
  }

  function renderSection(section: Section, qs: Question[], displayIndex: number) {
    return (
      <section key={section.section_id}>
        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {String(displayIndex + 1).padStart(2, "0")}
          </span>
          <h2 className="text-xl font-semibold tracking-tight">{section.section_name}</h2>
        </div>
        <ol className="space-y-5">
          {qs.map((q) => {
            const opts = optionsByQuestion[q.question_id] ?? [];
            const selected = responses[q.question_id];
            const isMissing = attemptedSubmit && !selected;
            return (
              <li
                key={q.question_id}
                ref={(el) => {
                  questionRefs.current[q.question_id] = el;
                }}
                className={cn(
                  "rounded-xl border bg-card p-5 shadow-sm transition-colors",
                  isMissing ? "border-destructive bg-destructive/5" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug">{q.question_text}</p>
                  {saving === q.question_id && (
                    <span className="text-[11px] text-muted-foreground shrink-0 mt-1">saving…</span>
                  )}
                </div>
                <div className="mt-4 grid gap-2">
                  {opts.map((o) => {
                    const isSelected = selected === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => handleSelect(q, o)}
                        className={cn(
                          "group flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-foreground/30 hover:bg-muted/40",
                        )}
                      >
                        <span
                          className={cn(
                            "h-4 w-4 shrink-0 rounded-full border-2 grid place-items-center transition-colors",
                            isSelected ? "border-primary" : "border-muted-foreground/40",
                          )}
                        >
                          {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                        <span className="flex-1">{o.answer_text}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  function renderFinancial(displayIndex: number) {
    return (
      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {String(displayIndex + 1).padStart(2, "0")}
          </span>
          <h2 className="text-xl font-semibold tracking-tight">Financial information</h2>
        </div>
        <div
          ref={finSectionRef}
          className={cn(
            "rounded-xl border bg-card p-5 shadow-sm space-y-5 transition-colors",
            attemptedSubmit && !financialReady
              ? "border-destructive bg-destructive/5"
              : "border-border",
          )}
        >
          <div>
            <p className="font-medium leading-snug mb-3">Which figure are you providing?</p>
            <div className="grid gap-2">
              {(
                [
                  { v: "netfeeincome", label: "Net fee income" },
                  { v: "ebitda", label: "EBITDA" },
                ] as const
              ).map((o) => {
                const isSelected = finBasis === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setFinBasis(o.v)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-foreground/30 hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "h-4 w-4 shrink-0 rounded-full border-2 grid place-items-center",
                        isSelected ? "border-primary" : "border-muted-foreground/40",
                      )}
                    >
                      {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="flex-1">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="fin-amount" className="font-medium leading-snug block mb-2">
              Amount (USD) <span className="text-destructive">*</span>
            </label>
            <input
              id="fin-amount"
              ref={finInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={finAmount}
              onChange={(e) => {
                const input = e.target;
                const selectionStart = input.selectionStart ?? 0;
                const digitsBeforeCursor = input.value
                  .slice(0, selectionStart)
                  .replace(/\D/g, "").length;
                const formatted = fmtCurrencyInput(input.value);
                setFinAmount(formatted);
                if (finError) setFinError(null);
                requestAnimationFrame(() => {
                  if (!finInputRef.current) return;
                  let digitCount = 0;
                  let newPos = 0;
                  for (let i = 0; i < formatted.length; i++) {
                    if (/\d/.test(formatted[i])) digitCount++;
                    newPos = i + 1;
                    if (digitCount >= digitsBeforeCursor) break;
                  }
                  finInputRef.current.setSelectionRange(newPos, newPos);
                });
              }}
              placeholder=""
              className={cn(
                "w-full rounded-md border bg-background px-4 py-3 text-sm outline-none transition-colors",
                finError || (attemptedSubmit && !financialReady)
                  ? "border-destructive focus:border-destructive"
                  : "border-border focus:border-primary",
              )}
            />
            {finError ? (
              <p className="mt-2 text-xs text-destructive">{finError}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Required. Enter the actual figure — no default is provided.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
              <p className="truncate text-sm font-medium">{companyName || "…"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {answered} / {total} answered
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 pt-10">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading questions…</div>
        ) : sectionsWithQuestions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No active {questionnaireType} questions found.
          </div>
        ) : stepped ? (
          <div className="space-y-14">
            {currentStep && currentStep.kind === "section"
              ? renderSection(currentStep.section, currentStep.questions, safeStepIndex)
              : renderFinancial(safeStepIndex)}
          </div>
        ) : (
          <div className="space-y-14">
            {sectionsWithQuestions.map(({ section, questions: qs }, sIdx) =>
              renderSection(section, qs, sIdx),
            )}
            {requireFin && renderFinancial(sectionsWithQuestions.length)}
          </div>
        )}
      </div>

      {!loading && total > 0 && props.readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Review mode — answers are read-only.
            </span>
            <Button asChild>
              <Link to={exitTo}>Back to hub</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Stepped (one-section-at-a-time) footer: Back / Continue / Submit */}
      {!loading && total > 0 && !props.readOnly && stepped && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              {(() => {
                if (attemptedSubmit && !currentStepComplete) {
                  if (currentStep?.kind === "financial") {
                    return (
                      <span className="text-destructive">
                        Enter your financial information to continue.
                      </span>
                    );
                  }
                  const missingInStep =
                    currentStep?.kind === "section"
                      ? currentStep.questions.filter((q) => !responses[q.question_id]).length
                      : 0;
                  return (
                    <span className="text-destructive">
                      Please answer all questions in this section ({missingInStep} remaining).
                    </span>
                  );
                }
                return (
                  <span className="text-muted-foreground">
                    Section {safeStepIndex + 1} of {stepCount}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link to={exitTo}>Exit</Link>
              </Button>
              {safeStepIndex > 0 && (
                <Button variant="outline" onClick={goBack} disabled={finishing}>
                  Back
                </Button>
              )}
              {isLastStep ? (
                <Button size="lg" disabled={finishing} onClick={handleFinish}>
                  {finishing ? "Finishing…" : finishLabel}
                </Button>
              ) : (
                <Button size="lg" onClick={goNext}>
                  Continue
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Single-page footer (advisor questionnaire, and client when not stepped) */}
      {!loading && total > 0 && !props.readOnly && !stepped && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              {(() => {
                const missingCount = total - answered;
                const finBlank = requireFin && !financialReady;
                if (attemptedSubmit && (missingCount > 0 || finBlank)) {
                  const parts: string[] = [];
                  if (missingCount > 0) {
                    parts.push(`${missingCount} question${missingCount === 1 ? "" : "s"}`);
                  }
                  if (finBlank) parts.push("financial information");
                  return (
                    <span className="text-destructive">
                      Please answer all questions before submitting ({parts.join(" + ")} remaining).
                    </span>
                  );
                }
                return (
                  <span className="text-muted-foreground">
                    {!allAnswered
                      ? `${missingCount} question${missingCount === 1 ? "" : "s"} remaining`
                      : finBlank
                        ? "Enter your financial information to submit."
                        : "Ready to submit."}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link to={exitTo}>Exit</Link>
              </Button>
              <Button size="lg" disabled={finishing} onClick={handleFinish}>
                {finishing ? "Finishing…" : finishLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
