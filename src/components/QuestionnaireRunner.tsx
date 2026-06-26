import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  exitTo: "/" | "/advisor" | "/client";
  notFoundTo: "/" | "/advisor" | "/client";
  /** "complete" (default) marks complete + shows results.
   *  "submitlock" calls submit_my_client_submission and returns to exitTo. */
  finishMode?: "complete" | "submitlock";
};


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
        const subRes = await supabase
          .from("submissions")
          .select("company_name,client_token")
          .eq("submission_id", props.submissionId)
          .maybeSingle();
        if (cancelled) return;
        if (subRes.error || !subRes.data) {
          toast.error("Submission not found");
          navigate({ to: notFoundTo });
          return;
        }
        companyNameVal = subRes.data.company_name;
        tokenVal = subRes.data.client_token as string;

        const respRes = await supabase
          .from("responses")
          .select("question_id,answer_option_id")
          .eq("submission_id", props.submissionId)
          .eq("questionnaire_type", questionnaireType);
        if (cancelled) return;
        for (const r of respRes.data ?? []) {
          responseMap[r.question_id] = r.answer_option_id;
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
        const update: { advisor_status: string; updated_at: string } = {
          advisor_status: "inprogress",
          updated_at: new Date().toISOString(),
        };
        await supabase
          .from("submissions")
          .update(update)
          .eq("submission_id", props.submissionId)
          .neq(statusField, "complete");
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
      const responseId = `${props.submissionId}_${question.question_id}`;
      const res = await supabase.from("responses").upsert(
        {
          response_id: responseId,
          submission_id: props.submissionId,
          question_id: question.question_id,
          answer_option_id: option.id,
          section_id: question.section_id,
          questionnaire_type: questionnaireType,
          unique_id_response: option.unique_id_responses,
          selected_answer_text: option.answer_text,
          points_awarded: option.points ?? 0,
          answered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "submission_id,question_id" },
      );
      error = res.error;
    }
    setSaving(null);
    if (error) {
      toast.error("Couldn't save answer");
      console.error(error);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    let error: unknown = null;
    if (props.mode === "client") {
      const res = await supabase.rpc("set_client_submission_status", {
        p_token: props.token,
        p_status: "complete",
      });
      error = res.error;
    } else {
      const update: { advisor_status: string; updated_at: string } = {
        advisor_status: "complete",
        updated_at: new Date().toISOString(),
      };
      const res = await supabase
        .from("submissions")
        .update(update)
        .eq("submission_id", props.submissionId);
      error = res.error;
    }
    setFinishing(false);
    if (error) {
      toast.error("Couldn't finalize submission");
      return;
    }
    if (!clientToken) {
      toast.error("Missing token");
      return;
    }
    navigate({ to: "/results/$token", params: { token: clientToken } });
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
          </div>
        )}
      </div>

      {!loading && total > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {allAnswered
                ? "All questions answered."
                : `${total - answered} question${total - answered === 1 ? "" : "s"} remaining`}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link to={exitTo}>Exit</Link>
              </Button>
              <Button
                size="lg"
                disabled={!allAnswered || finishing}
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
