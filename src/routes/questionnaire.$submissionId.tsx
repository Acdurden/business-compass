import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/questionnaire/$submissionId")({
  ssr: false,
  component: QuestionnairePage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">Something went wrong.</p>
        <p className="mt-2 text-xs">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">Submission not found.</div>
  ),
});

type Section = { id: string; name: string; sort_order: number };
type Question = {
  id: string;
  section_id: string;
  question_text: string;
  sort_order: number;
  max_score: number;
};
type AnswerOption = {
  id: string;
  question_id: string;
  answer_text: string;
  points: number;
  option_order: number;
};

function QuestionnairePage() {
  const { submissionId } = Route.useParams();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState<string>("");
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<AnswerOption[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({}); // question_id -> answer_option_id
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [submissionRes, sectionsRes, questionsRes, responsesRes] =
        await Promise.all([
          supabase
            .from("submissions")
            .select("company_name,client_status")
            .eq("submission_id", submissionId)
            .maybeSingle(),
          supabase.from("sections").select("*").order("sort_order"),
          supabase
            .from("questions")
            .select("*")
            .eq("questionnaire_type", "objective")
            .eq("active", true)
            .order("sort_order"),
          supabase
            .from("responses")
            .select("question_id,answer_option_id")
            .eq("submission_id", submissionId),
        ]);

      if (cancelled) return;
      if (submissionRes.error || !submissionRes.data) {
        toast.error("Submission not found");
        navigate({ to: "/" });
        return;
      }
      setCompanyName(submissionRes.data.company_name);

      const qs = (questionsRes.data ?? []) as Question[];
      setSections((sectionsRes.data ?? []) as Section[]);
      setQuestions(qs);

      if (qs.length) {
        const { data: opts } = await supabase
          .from("answer_options")
          .select("*")
          .in(
            "question_id",
            qs.map((q) => q.id),
          )
          .order("option_order");
        if (!cancelled) setOptions((opts ?? []) as AnswerOption[]);
      }

      const map: Record<string, string> = {};
      (responsesRes.data ?? []).forEach((r) => {
        map[r.question_id] = r.answer_option_id;
      });
      setResponses(map);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId, navigate]);

  const sectionsWithQuestions = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    const grouped = new Map<string, { section: Section; questions: Question[] }>();
    for (const q of questions) {
      const s = byId.get(q.section_id);
      if (!s) continue;
      if (!grouped.has(s.id)) grouped.set(s.id, { section: s, questions: [] });
      grouped.get(s.id)!.questions.push(q);
    }
    return Array.from(grouped.values()).sort(
      (a, b) => a.section.sort_order - b.section.sort_order,
    );
  }, [sections, questions]);

  const optionsByQuestion = useMemo(() => {
    const m: Record<string, AnswerOption[]> = {};
    for (const o of options) {
      (m[o.question_id] ||= []).push(o);
    }
    return m;
  }, [options]);

  const answered = Object.keys(responses).length;
  const total = questions.length;
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  const allAnswered = total > 0 && answered === total;

  async function handleSelect(question: Question, option: AnswerOption) {
    // optimistic
    setResponses((prev) => ({ ...prev, [question.id]: option.id }));
    setSaving(question.id);
    const { error } = await supabase.from("responses").upsert(
      {
        submission_id: submissionId,
        question_id: question.id,
        answer_option_id: option.id,
        section_id: question.section_id,
        questionnaire_type: "objective",
        selected_answer_text: option.answer_text,
        points_awarded: option.points,
        answered_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,question_id" },
    );
    setSaving(null);
    if (error) {
      toast.error("Couldn't save answer");
      console.error(error);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    const { error } = await supabase
      .from("submissions")
      .update({ client_status: "complete", updated_at: new Date().toISOString() })
      .eq("submission_id", submissionId);
    setFinishing(false);
    if (error) {
      toast.error("Couldn't finalize submission");
      return;
    }
    navigate({ to: "/results/$submissionId", params: { submissionId } });
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Valuation questionnaire
              </p>
              <p className="truncate text-sm font-medium">
                {companyName || "…"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {answered} / {total} answered
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                ID {submissionId}
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
            No active objective questions have been loaded yet. Add them to
            the database and refresh.
          </div>
        ) : (
          <div className="space-y-14">
            {sectionsWithQuestions.map(({ section, questions: qs }, sIdx) => (
              <section key={section.id}>
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {String(sIdx + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {section.name}
                  </h2>
                </div>
                <ol className="space-y-5">
                  {qs.map((q) => {
                    const opts = optionsByQuestion[q.id] ?? [];
                    const selected = responses[q.id];
                    return (
                      <li
                        key={q.id}
                        className="rounded-xl border border-border bg-card p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-snug">
                            {q.question_text}
                          </p>
                          {saving === q.id && (
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
                <Link to="/">Exit</Link>
              </Button>
              <Button
                size="lg"
                disabled={!allAnswered || finishing}
                onClick={handleFinish}
              >
                {finishing ? "Finishing…" : "See my results"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
