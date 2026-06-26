import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import { computeValuation, type ValuationResult } from "@/lib/valscore_calc";
import {
  DEFAULT_TARGET_VALUATION,
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";
import { generateSubmissionPdf } from "@/lib/generate-submission-pdf";
import { FileDown, ArrowLeft, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/results/$submissionId")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  component: ResultsPage,
});

type InputType = "netfeeincome" | "ebitda";

type Submission = {
  submission_id: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  valuation_input_type: InputType | null;
  valuation_input_amount: number | null;
  target_valuation: number | null;
};

type SectionRow = {
  section_id: string;
  section_name: string;
  sort_order: number;
  questionnaire_type: string;
};

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

function ResultsPage() {
  const { submissionId } = Route.useParams();
  const [sub, setSub] = useState<Submission | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: subData, error: subErr } = await supabase
        .from("submissions")
        .select(
          "submission_id,company_name,client_status,advisor_status,valuation_input_type,valuation_input_amount,target_valuation",
        )
        .eq("submission_id", submissionId)
        .maybeSingle();
      if (cancelled) return;
      if (subErr || !subData) {
        setError(subErr?.message ?? "Submission not found");
        setLoading(false);
        return;
      }
      const [sectionsRes, questionsRes, responsesRes] = await Promise.all([
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

      const inputType =
        (subData.valuation_input_type as InputType | null) ?? DEFAULT_VALUATION_INPUT_TYPE;
      const amount = Number(subData.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT);
      const target = Number(subData.target_valuation ?? DEFAULT_TARGET_VALUATION);

      const computed = computeValuation(
        (responsesRes.data ?? []) as never,
        (questionsRes.data ?? []) as never,
        {
          valuationInputType: inputType,
          valuationInputAmount: amount,
          targetValuation: target,
        },
      );

      setSub(subData as Submission);
      setSections((sectionsRes.data ?? []) as SectionRow[]);
      setResult(computed);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      await generateSubmissionPdf(submissionId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading results…</p>
      </main>
    );
  }
  if (error || !sub || !result) {
    return (
      <main className="min-h-screen grid place-items-center p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error ?? "Could not load results"}</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/submissions">Back to submissions</Link>
        </Button>
      </main>
    );
  }

  const advisoryComplete = sub.advisor_status === "complete";
  const objSections = sections
    .filter((s) => s.questionnaire_type === "objective")
    .sort((a, b) => a.sort_order - b.sort_order);
  const advSections = sections
    .filter((s) => s.questionnaire_type === "advisory")
    .sort((a, b) => a.sort_order - b.sort_order);
  const objMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "objective")
    .reduce((acc, s) => acc + s.max_score, 0);
  const advMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "advisory")
    .reduce((acc, s) => acc + s.max_score, 0);

  const inputType =
    (sub.valuation_input_type as InputType | null) ?? DEFAULT_VALUATION_INPUT_TYPE;
  const amount = Number(sub.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT);

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-6 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Combined results
            </p>
            <h1 className="text-lg font-semibold truncate">{sub.company_name}</h1>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {sub.submission_id}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/submissions">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Submissions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/advisor/$submissionId" params={{ submissionId }}>
                <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                Edit advisory
              </Link>
            </Button>
            <Button size="sm" onClick={() => void downloadPdf()} disabled={pdfBusy}>
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              {pdfBusy ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {!advisoryComplete && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
            Advisory questionnaire isn't marked complete yet — adjusted ValScore figures
            below reflect the answers saved so far.
          </div>
        )}

        <section className="grid md:grid-cols-3 gap-4">
          <ScoreCard label="Objective" value={fmtScore(result.objectiveScore)} max={objMax} />
          <ScoreCard label="Advisor" value={fmtScore(result.advisoryScore)} max={advMax} />
          <ScoreCard
            label="ValScore"
            value={fmtScore(result.valScore)}
            max={objMax + advMax}
            highlight
          />
        </section>

        <SectionTable title="Objective sections" sections={objSections} result={result} />
        {advSections.length > 0 && (
          <SectionTable title="Advisor sections" sections={advSections} result={result} />
        )}

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-3">Valuation</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Basis</th>
                  <th className="py-2 pr-3">Market position</th>
                  <th className="py-2 pr-3 text-right">Multiple</th>
                  <th className="py-2 text-right">Estimated valuation</th>
                </tr>
              </thead>
              <tbody>
                <ValuationRow label="Objective" leg={result.objective} />
                <ValuationRow label="ValScore (adjusted)" leg={result.adjusted} highlight />
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <Meta label="Basis">{inputType === "ebitda" ? "EBITDA" : "Net Fee Income"}</Meta>
            <Meta label="Amount">{fmtCurrency(amount)}</Meta>
          </dl>
        </section>
      </div>
    </main>
  );
}

function ScoreCard({
  label,
  value,
  max,
  highlight,
}: {
  label: string;
  value: string;
  max: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">
        {value}
        <span className="text-base text-muted-foreground"> / {fmtScore(max)}</span>
      </p>
    </div>
  );
}

function SectionTable({
  title,
  sections,
  result,
}: {
  title: string;
  sections: SectionRow[];
  result: ValuationResult;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Section</th>
              <th className="py-2 pr-3 text-right">Score</th>
              <th className="py-2 text-right">Max</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const sc = result.sectionScores.find((x) => x.section_id === s.section_id);
              return (
                <tr key={s.section_id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3">{s.section_name}</td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {fmtScore(sc?.actual_score ?? 0)}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {fmtScore(sc?.max_score ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ValuationRow({
  label,
  leg,
  highlight,
}: {
  label: string;
  leg: ValuationResult["objective"];
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-primary/5" : ""}>
      <td className="py-2.5 pr-3 font-medium">{label}</td>
      <td className="py-2.5 pr-3">{leg.marketPosition || "—"}</td>
      <td className="py-2.5 pr-3 text-right">{fmtMultiple(leg.multiple)}</td>
      <td className="py-2.5 text-right font-semibold">{fmtCurrency(leg.estimatedValuation)}</td>
    </tr>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
