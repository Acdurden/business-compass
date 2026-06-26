import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
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
  const {
    questionnaireType,
    statusField,
    eyebrow,
    finishLabel,
    exitTo,
    notFoundTo,
  } = props;
  const navigate = useNavigate();
  const loadAdvisor = useServerFn(getAdvisorSubmission);
  const saveAdvisor = useServerFn(saveAdvisorResponse);
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
  const finInputRef = useRef<HTMLInputElement | null>(null);

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
          .select(
            "id,question_id,answer_text,points,option_order,unique_id_responses",
          )
          .in("question_id", qs.map((q) => q.question_id))
          .eq("active", true)
          .order("option_order");
        if (!cancelled) setOptions((opts ?? []) as AnswerOption[]);
      }

      // mark in-progress if not already complete
      if (props.mode === "client") {
        await supabase.rpc("set_client_submission_status", {
          p_token: props.token,
          p_status: "inprogress",
        });
      } else {
        try {
          await setAdvStatus({
            data: { submissionId: props.submissionId, status: "inprogress", onlyIfNotComplete: true },
          });
        } catch {
          /* non-fatal */
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
      if (!grouped.has(s.section_id))
        grouped.set(s.section_id, { section: s, questions: [] });
      grouped.get(s.section_id)!.questions.push(q);
    }
    return Array.from(grouped.values()).sort(
      (a, b) => a.section.sort_order - b.section.sort_order,
    );
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
  const canFinish = allAnswered && financialReady;

  async function handleSelect(question: Question, option: AnswerOption) {
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

  async function handleFinish() {
    const finishMode = props.finishMode ?? "complete";
    setFinError(null);
    if (requireFin) {
      if (finAmount.trim() === "" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setFinError("Enter your financial amount before submitting.");
        toast.error("Enter your financial amount before submitting.");
        return;
      }
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
          data: { submissionId: props.submissionId, status: "complete" },
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
        ) : (
          <div className="space-y-14">
            {sectionsWithQuestions.map(({ section, questions: qs }, sIdx) => (
              <section key={section.section_id}>
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {String(sIdx + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {section.section_name}
                  </h2>
                </div>
                <ol className="space-y-5">
                  {qs.map((q) => {
                    const opts = optionsByQuestion[q.question_id] ?? [];
                    const selected = responses[q.question_id];
                    return (
                      <li
                        key={q.question_id}
                        className="rounded-xl border border-border bg-card p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-snug">{q.question_text}</p>
                          {saving === q.question_id && (
                            <span className="text-[11px] text-muted-foreground shrink-0 mt-1">
                              saving…
                            </span>
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
                                    isSelected
                                      ? "border-primary"
                                      : "border-muted-foreground/40",
                                  )}
                                >
                                  {isSelected && (
                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                  )}
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
            ))}

            {requireFin && (
              <section>
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {String(sectionsWithQuestions.length + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Financial information
                  </h2>
                </div>
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
                  <div>
                    <p className="font-medium leading-snug mb-3">
                      Which figure are you providing?
                    </p>
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
                              {isSelected && (
                                <span className="h-2 w-2 rounded-full bg-primary" />
                              )}
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
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={finAmount}
                      onChange={(e) => {
                        setFinAmount(e.target.value);
                        if (finError) setFinError(null);
                      }}
                      placeholder=""
                      className={cn(
                        "w-full rounded-md border bg-background px-4 py-3 text-sm outline-none transition-colors",
                        finError
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
            )}
          </div>
        )}
      </div>

      {!loading && total > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {!allAnswered
                ? `${total - answered} question${total - answered === 1 ? "" : "s"} remaining`
                : requireFin && !financialReady
                  ? "Enter your financial information to submit."
                  : "Ready to submit."}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link to={exitTo}>Exit</Link>
              </Button>
              <Button
                size="lg"
                disabled={!canFinish || finishing}
                onClick={handleFinish}
              >
                {finishing ? "Finishing…" : finishLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
