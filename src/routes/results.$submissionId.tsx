import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeValuation } from "@/lib/valscore_calc.js";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/results/$submissionId")({
  ssr: false,
  component: ResultsPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center text-sm">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">Submission not found.</div>
  ),
});

type Question = {
  question_id: string;
  section_id: string;
  questionnaire_type: string;
  max_score: number | null;
};
type Response = {
  question_id: string;
  section_id: string | null;
  questionnaire_type: string | null;
  points_awarded: number | null;
};
type Section = {
  section_id: string;
  section_name: string;
  sort_order: number;
  questionnaire_type: string;
};

type InputType = "netfeeincome" | "ebitda";

function fmtCurrency(n: number) {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function ResultsPage() {
  const { submissionId } = Route.useParams();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  const [inputType, setInputType] = useState<InputType>("netfeeincome");
  const [amountStr, setAmountStr] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [subRes, sRes, qRes, rRes] = await Promise.all([
        supabase
          .from("submissions")
          .select("company_name,valuation_input_type,valuation_input_amount")
          .eq("submission_id", submissionId)
          .maybeSingle(),
        supabase
          .from("sections")
          .select("section_id,section_name,sort_order,questionnaire_type")
          .order("sort_order"),
        supabase
          .from("questions")
          .select("question_id,section_id,questionnaire_type,max_score")
          .eq("active", true),
        supabase
          .from("responses")
          .select("question_id,section_id,questionnaire_type,points_awarded")
          .eq("submission_id", submissionId),
      ]);
      if (cancelled) return;
      if (subRes.error || !subRes.data) {
        toast.error("Submission not found");
        navigate({ to: "/" });
        return;
      }
      setCompanyName(subRes.data.company_name);
      if (subRes.data.valuation_input_type) {
        setInputType(subRes.data.valuation_input_type as InputType);
      }
      if (subRes.data.valuation_input_amount != null) {
        setAmountStr(String(subRes.data.valuation_input_amount));
      }
      setSections((sRes.data ?? []) as Section[]);
      setQuestions((qRes.data ?? []) as Question[]);
      setResponses((rRes.data ?? []) as Response[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId, navigate]);

  const amount = useMemo(() => {
    const n = parseFloat(amountStr.replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  }, [amountStr]);

  const result = useMemo(() => {
    if (!questions.length) return null;
    return computeValuation(responses, questions, {
      valuationInputType: inputType,
      valuationInputAmount: amount,
      targetValuation: 0,
    });
  }, [questions, responses, inputType, amount]);

  // Persist input changes (debounced lightly)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      void supabase
        .from("submissions")
        .update({
          valuation_input_type: inputType,
          valuation_input_amount: amount || null,
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", submissionId);
    }, 400);
    return () => clearTimeout(t);
  }, [inputType, amount, submissionId, loading]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Calculating your results…
      </div>
    );
  }

  const obj = result?.objective;

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Valuation results
            </p>
            <p className="text-sm font-medium">{companyName}</p>
          </div>
          <Button variant="ghost" asChild size="sm">
            <Link to="/">Start over</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 pt-10 space-y-10">
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-1">Your financials</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Enter the figure your valuation should be based on. Results update live.
          </p>
          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="amount" className="text-xs uppercase tracking-wide text-muted-foreground">
                Amount (USD)
              </Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="e.g. 1,500,000"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="mt-1.5 text-lg font-medium"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Basis
              </Label>
              <div className="mt-1.5 inline-flex rounded-md border border-border p-1 bg-background">
                {(
                  [
                    { v: "netfeeincome", label: "Net Fee Income" },
                    { v: "ebitda", label: "EBITDA" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setInputType(opt.v)}
                    className={cn(
                      "px-3.5 py-2 text-sm rounded transition-colors",
                      inputType === opt.v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Market position
            </p>
            <p className="mt-2 text-lg font-semibold leading-tight">
              {obj?.marketPosition || "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Objective score {result?.objectiveScore ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Valuation multiple
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {obj ? `${obj.multiple.toFixed(4)}x` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {inputType === "ebitda" ? "EBITDA basis" : "Net Fee Income basis"}
            </p>
          </div>
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
            <p className="text-[11px] uppercase tracking-wide text-primary/80">
              Estimated valuation
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {obj ? fmtCurrency(obj.estimatedValuation) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {amount > 0 ? `Based on ${fmtCurrency(amount)}` : "Enter an amount above"}
            </p>
          </div>
        </section>

        <p className="text-xs text-muted-foreground text-center">
          Submission ID {submissionId}
        </p>
      </div>
    </main>
  );
}
