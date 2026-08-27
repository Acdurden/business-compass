/**
 * My Assessment — the permanent record of what the client said.
 *
 * The gap this closes: a full-service client is told their self-assessment
 * becomes their ValScore and can move after review, and is then never shown the
 * self-assessment. Between submitting and the review landing they see a
 * four-step timeline and nothing else, which is the longest and least designed
 * stretch of the journey.
 *
 * This is NOT the results page. `/client/summary` is the assessed result. This
 * is the client's own view of their own business, and it stays reachable after
 * the review lands rather than going dead — the two are different artefacts.
 *
 * ANCHORED TO A TARGET, NOT TO A PERFECT SCORE. A bare score reads as a grade,
 * and on this model a grade nobody can get: the scale barely reaches its upper
 * bands. So the client says what they want the business to be worth and the page
 * works backwards to the score that reaches it, using the engine's own
 * `targetAnalysis`. Their score becomes a position on a route they chose.
 */

import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ClientShell,
  type ClientPlan,
  type ClientStage,
  type NavTarget,
} from "@/components/client-shell";
import { ValuationDisclaimer } from "@/components/valuation-disclaimer";
import {
  buildConfig,
  computeValuation,
  type ScoringConfig,
  type ValuationResult,
} from "@/lib/valscore_calc";
import {
  BRAND,
  buildOpportunities,
  displayScore,
  formatCurrency,
  grossObjective,
  type Opportunity,
  type SectionMeta,
} from "@/lib/score-display";

export const Route = createFileRoute("/client/assessment")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/client/auth" });
    const { data: isClient } = await supabase.rpc("has_role", {
      _user_id: data.session.user.id,
      _role: "client",
    });
    if (!isClient) throw redirect({ to: "/client/auth" });
    if (data.session.user.user_metadata?.must_change_password) {
      throw redirect({ to: "/client/change-password" });
    }
    return { email: data.session.user.email ?? "" };
  },
  head: () => ({ meta: [{ title: "My assessment" }] }),
  component: MyAssessment,
});

type InputType = "netfeeincome" | "ebitda";

type MySubmission = {
  submission_id: string;
  client_status: string;
  company_name: string;
};

type Extras = {
  advisor_status: string | null;
  plan: string | null;
  valuation_input_type: InputType | null;
  valuation_input_amount: number | null;
  target_valuation: number | null;
};

const BASIS_WORD: Record<InputType, string> = {
  netfeeincome: "net fee income",
  ebitda: "EBITDA",
};

/** Dollars are shown to the nearest $10,000. Display layer only. */
function round10k(n: number): number {
  return Math.round(n / 10000) * 10000;
}

function MyAssessment() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<MySubmission | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [answered, setAnswered] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [advisoryAnswered, setAdvisoryAnswered] = useState(0);
  const [loading, setLoading] = useState(true);

  /** What the client typed, as digits. Null means they have not set one. */
  const [target, setTarget] = useState<number | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setEmail(data.session?.user.email ?? "");
    });

    async function load() {
      const { data, error } = await supabase.rpc("get_my_client_submission");
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load");
        setLoading(false);
        return;
      }
      const row = (data ?? [])[0] as MySubmission | undefined;
      if (!row) {
        setLoading(false);
        return;
      }
      setSub(row);

      const { data: extraRow } = await supabase
        .from("submissions")
        .select("advisor_status,plan,valuation_input_type,valuation_input_amount,target_valuation")
        .eq("submission_id", row.submission_id)
        .maybeSingle();
      if (cancelled) return;
      const ex = (extraRow ?? null) as Extras | null;
      setExtras(ex);
      setTarget(ex?.target_valuation != null ? Number(ex.target_valuation) : null);

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
          .select("question_id,section_id,questionnaire_type,points_awarded")
          .eq("submission_id", row.submission_id),
        supabase.from("score_bands").select("band_type,min_score,max_score,label"),
        supabase.from("valuation_multiples").select("band_index,nfi_multiple,ebitda_multiple"),
      ]);
      if (cancelled) return;

      const questions = (questionsRes.data ?? []) as { questionnaire_type: string }[];
      const responses = (responsesRes.data ?? []) as { questionnaire_type: string }[];
      setTotalQuestions(questions.filter((q) => q.questionnaire_type === "objective").length);
      setAnswered(responses.filter((r) => r.questionnaire_type === "objective").length);
      setAdvisoryAnswered(responses.filter((r) => r.questionnaire_type === "advisory").length);

      const cfg = buildConfig((bandsRes.data ?? []) as never, (multiplesRes.data ?? []) as never);
      setConfig(cfg);
      setSections((sectionsRes.data ?? []) as SectionMeta[]);
      setResult(
        computeValuation(
          (responsesRes.data ?? []) as never,
          (questionsRes.data ?? []) as never,
          {
            valuationInputType: ex?.valuation_input_type ?? "netfeeincome",
            // No shared default. A client must never be shown a figure built
            // from an income amount or a target nobody gave us.
            valuationInputAmount: Number(ex?.valuation_input_amount ?? 0),
            targetValuation: Number(ex?.target_valuation ?? 0),
          },
          cfg,
        ),
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/client/auth" });
  }

  /**
   * Save the target. Deliberately allowed after submission: the income figure is
   * an answer and freezes, a target is a goal and does not.
   */
  async function saveTarget(next: number | null) {
    setSavingTarget(true);
    const { error } = await supabase.rpc("set_my_client_target", { p_target: next });
    setSavingTarget(false);
    if (error) {
      toast.error("Could not save that target");
      return;
    }
    toast.success(next ? "Target saved" : "Target cleared");
    setExtras((prev) => (prev ? { ...prev, target_valuation: next } : prev));
  }

  const plan: ClientPlan = extras?.plan === "objective" ? "objective" : "full";
  const submitted = sub?.client_status === "submitted" || sub?.client_status === "complete";
  const reviewed =
    (extras?.advisor_status === "submitted" || extras?.advisor_status === "final") &&
    advisoryAnswered > 0;
  const stage: ClientStage = !sub
    ? "new"
    : !submitted
      ? "progress"
      : plan === "objective" || reviewed
        ? "complete"
        : "awaiting";

  return (
    <ClientShell
      email={email}
      company={sub?.company_name ?? ""}
      stage={stage}
      plan={plan}
      hasSubmission={sub !== null}
      active="/client/assessment"
      onSignOut={signOut}
      onNavigate={(to: NavTarget) => navigate({ to })}
    >
      {loading ? (
        <p className="text-sm" style={{ color: BRAND.muted }}>
          Loading…
        </p>
      ) : !sub ? (
        <EmptyState onStart={() => navigate({ to: "/client" })} />
      ) : !submitted ? (
        <InProgress
          answered={answered}
          total={totalQuestions}
          onResume={() => navigate({ to: "/client/questionnaire" })}
        />
      ) : result && config ? (
        <Submitted
          result={result}
          sections={sections}
          extras={extras}
          reviewed={reviewed}
          awaitingReview={plan !== "objective" && !reviewed}
          target={target}
          setTarget={setTarget}
          savingTarget={savingTarget}
          onSaveTarget={saveTarget}
          onViewResults={() => navigate({ to: "/client/summary" })}
        />
      ) : (
        <p className="text-sm" style={{ color: BRAND.muted }}>
          Your assessment is submitted. The summary will appear here shortly.
        </p>
      )}
    </ClientShell>
  );
}

/* ------------------------------------------------------------------ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: BRAND.rail }}>
      {children}
    </section>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <Card>
      <h1 className="text-[22px] font-semibold" style={{ color: BRAND.ink }}>
        You have not started an assessment yet
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: BRAND.muted }}>
        Once you do, this page becomes the record of what you told us and what it says about how a
        buyer would see the business.
      </p>
      <Button className="mt-4" onClick={onStart}>
        Go to your dashboard
      </Button>
    </Card>
  );
}

function InProgress({
  answered,
  total,
  onResume,
}: {
  answered: number;
  total: number;
  onResume: () => void;
}) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold" style={{ color: BRAND.ink }}>
          Your assessment is part-finished
        </h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed" style={{ color: BRAND.muted }}>
          Everything you have answered is saved. Pick it up whenever you have twenty minutes.
        </p>
      </div>
      <Card>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: "#eef1f5" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: BRAND.teal }}
          />
        </div>
        <p className="mt-2.5 text-[14px]" style={{ color: BRAND.muted }}>
          <b style={{ color: BRAND.ink }}>
            {answered} of {total}
          </b>{" "}
          questions answered
        </p>
        <Button className="mt-4" onClick={onResume}>
          Pick up where you left off
        </Button>
        <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: BRAND.muted }}>
          There is no score yet on purpose. Every question moves the picture, so a score built from
          part of the answers would tell you something that is not true.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Submitted({
  result,
  sections,
  extras,
  reviewed,
  awaitingReview,
  target,
  setTarget,
  savingTarget,
  onSaveTarget,
  onViewResults,
}: {
  result: ValuationResult;
  sections: SectionMeta[];
  extras: Extras | null;
  reviewed: boolean;
  /** True only where an advisor review is genuinely still to come. An
   *  objective-only client has `reviewed` false forever and is not waiting. */
  awaitingReview: boolean;
  target: number | null;
  setTarget: (n: number | null) => void;
  savingTarget: boolean;
  onSaveTarget: (n: number | null) => void | Promise<void>;
  onViewResults: () => void;
}) {
  const objectiveMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "objective")
    .reduce((sum, s) => sum + s.max_score, 0);
  const score = grossObjective(result.objectiveScore, objectiveMax);
  const amount = Number(extras?.valuation_input_amount ?? 0);
  const hasAmount = amount > 0;
  const basis = (extras?.valuation_input_type ?? "netfeeincome") as InputType;

  /**
   * The objective leg, not the adjusted one. This page is what the client's own
   * answers describe, before any review.
   */
  const midpoint = result.objective.estimatedValuation;

  /**
   * Objective-only opportunities: the forty advisory points are unassessed
   * rather than available, so upside is the objective gap alone, grossed. Score
   * plus opportunity therefore comes to 100, and the copy says "points of your
   * score" rather than ValScore points.
   */
  const opportunities: Opportunity[] = buildOpportunities(
    sections,
    result.sectionScores,
    "objective",
  );
  /**
   * Sum the raw gaps and round once. Rounding each driver and adding the results
   * gains a point on some submissions, which would put the headline and the list
   * visibly out of step.
   */
  const totalGap = Math.round(opportunities.reduce((sum, o) => sum + o.totalGap, 0));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: BRAND.muted }}>
          My assessment
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold" style={{ color: BRAND.ink }}>
          What your own answers describe
        </h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed" style={{ color: BRAND.muted }}>
          {reviewed
            ? "This is your side of the assessment, kept as a record. Your reviewed result sits alongside it and is the one to work from."
            : "You have finished, and your advisor is reviewing it now. This is what you told us, and what it says about how a buyer would see the business today."}
        </p>
        <span
          className="mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[12.5px]"
          style={{ borderColor: BRAND.rail, color: BRAND.muted, background: "#ffffff" }}
        >
          {reviewed
            ? "Your view · your advisor's review is finished"
            : "Provisional · this will change after your advisor's review"}
        </span>
      </div>

      <Card>
        <div className="flex flex-wrap gap-x-12 gap-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: BRAND.muted }}>
              Your score
            </p>
            <p className="mt-1.5 text-[42px] font-bold leading-none" style={{ color: BRAND.teal }}>
              {displayScore(score)}
            </p>
          </div>
          {hasAmount ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: BRAND.muted }}>
                Where that puts you today
              </p>
              <p className="mt-1.5 text-[26px] font-semibold" style={{ color: BRAND.ink }}>
                {formatCurrency(round10k(midpoint * 0.95))} –{" "}
                {formatCurrency(round10k(midpoint * 1.05))}
              </p>
              <p className="mt-1 max-w-[42ch] text-[13px]" style={{ color: BRAND.muted }}>
                At {result.objective.multiple.toFixed(2)} times the {BASIS_WORD[basis]} of{" "}
                {formatCurrency(amount)} you entered.
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <TargetPlanner
        score={score}
        objectiveMax={objectiveMax}
        amount={amount}
        basis={basis}
        currentMidpoint={midpoint}
        target={target}
        setTarget={setTarget}
        saving={savingTarget}
        onSave={onSaveTarget}
        analysis={result.objective.target}
      />

      <div>
        <h2 className="text-[19px] font-semibold" style={{ color: BRAND.ink }}>
          Where those points are
        </h2>
        <p
          className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed"
          style={{ color: BRAND.muted }}
        >
          The eight things a buyer works through before making an offer, ordered by how much of your
          score is still available in each one. {totalGap} points in total.
        </p>
        <div className="mt-4 rounded-xl border bg-white" style={{ borderColor: BRAND.rail }}>
          {opportunities.map((o) => {
            const pct = o.capturedPct;
            return (
              <div
                key={o.key}
                className="grid grid-cols-[1fr_auto] items-center gap-4 border-b px-5 py-3.5 last:border-b-0 md:grid-cols-[1fr_140px_56px]"
                style={{ borderColor: BRAND.rail }}
              >
                <span className="text-[14.5px]" style={{ color: BRAND.ink }}>
                  {o.name}
                </span>
                <span
                  className="hidden h-1.5 overflow-hidden rounded-full md:block"
                  style={{ background: "#eef1f5" }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: BRAND.teal }}
                  />
                </span>
                <span
                  className="text-right text-[14px] tabular-nums"
                  style={{ color: o.totalGap >= 1 ? BRAND.ink : BRAND.muted }}
                >
                  {o.totalGap >= 1 ? `+${Math.round(o.totalGap)}` : "full"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {reviewed ? (
        <Button onClick={onViewResults}>See your reviewed results</Button>
      ) : (
        <Card>
          <h3 className="text-[15.5px] font-semibold" style={{ color: BRAND.ink }}>
            What happens next
          </h3>
          <ol
            className="mt-3 space-y-2.5 text-[14px] leading-relaxed"
            style={{ color: BRAND.muted }}
          >
            <li>
              Your Kriterion BVI advisor is working through the same eight areas independently.
            </li>
            <li>Your results are released, and the figures above will move in either direction.</li>
            <li>You talk it through. That is the conversation the assessment exists for.</li>
          </ol>
        </Card>
      )}

      <Card>
        <h3 className="text-[15.5px] font-semibold" style={{ color: BRAND.ink }}>
          Does something here look wrong?
        </h3>
        <p
          className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed"
          style={{ color: BRAND.muted }}
        >
          This page is a record of what you told us, so if an answer does not match how you would
          put it today, that matters. Contact your Kriterion BVI advisor and they can reopen your
          assessment so you can change it.
        </p>
      </Card>

      <ValuationDisclaimer provisional={awaitingReview} hasRange={hasAmount} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The target planner.
 *
 * `targetAnalysis` already lives in the engine and is exported specifically so a
 * client-facing planner could recompute against a target the client types. This
 * is that planner; the analysis passed in is the engine's own output for the
 * saved target, and typing a new one saves and reloads it.
 */
function TargetPlanner({
  score,
  objectiveMax,
  amount,
  basis,
  currentMidpoint,
  target,
  setTarget,
  saving,
  onSave,
  analysis,
}: {
  score: number;
  objectiveMax: number;
  amount: number;
  basis: InputType;
  currentMidpoint: number;
  target: number | null;
  setTarget: (n: number | null) => void;
  saving: boolean;
  onSave: (n: number | null) => void | Promise<void>;
  analysis: ValuationResult["objective"]["target"];
}) {
  const [draft, setDraft] = useState<string>(target ? target.toLocaleString("en-US") : "");

  useEffect(() => {
    setDraft(target ? target.toLocaleString("en-US") : "");
  }, [target]);

  const typed = Number(draft.replace(/[^0-9]/g, "")) || 0;
  const dirty = typed !== (target ?? 0);

  if (amount <= 0) {
    return (
      <Card>
        <h2 className="text-[19px] font-semibold" style={{ color: BRAND.ink }}>
          What would you want it to be worth?
        </h2>
        <p
          className="mt-1.5 max-w-[58ch] text-[14px] leading-relaxed"
          style={{ color: BRAND.muted }}
        >
          We do not have an income figure for the business yet, so there is nothing to work
          backwards from. Your Kriterion BVI advisor can add one.
        </p>
      </Card>
    );
  }

  const needRaw = analysis?.requiredScore ?? null;
  const needDisplay = needRaw == null ? null : Math.ceil(grossObjective(needRaw, objectiveMax));
  const extraIncome = analysis?.additionalIncomeRequired ?? 0;
  const alreadyThere = target != null && target > 0 && currentMidpoint >= target;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: BRAND.rail }}
    >
      <div
        className="border-b px-6 py-5"
        style={{ borderColor: BRAND.rail, background: "#f4f8fa" }}
      >
        <h2 className="text-[19px] font-semibold" style={{ color: BRAND.ink }}>
          What would you want it to be worth?
        </h2>
        <p
          className="mt-1.5 max-w-[58ch] text-[14px] leading-relaxed"
          style={{ color: BRAND.muted }}
        >
          Put a number in and this shows what it would take to get there. You can change it whenever
          you like.
        </p>
      </div>

      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15px]" style={{ color: BRAND.muted }}>
            $
          </span>
          <Input
            value={draft}
            inputMode="numeric"
            placeholder="1,000,000"
            className="h-11 max-w-[200px] text-[16px] tabular-nums"
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              setDraft(digits ? Number(digits).toLocaleString("en-US") : "");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (dirty && typed > 0) void onSave(typed);
              }
            }}
          />
          <Button disabled={saving || !dirty || typed <= 0} onClick={() => void onSave(typed)}>
            {saving ? "Saving…" : target == null ? "Set target" : "Update"}
          </Button>
          {target != null && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setTarget(null);
                void onSave(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="mt-5">
          {target == null || target <= 0 ? (
            <p className="max-w-[60ch] text-[14px] leading-relaxed" style={{ color: BRAND.muted }}>
              Put a figure in above and this fills in. Most people have a number in mind already,
              even if they have never said it out loud.
            </p>
          ) : alreadyThere ? (
            <p className="text-[17px] leading-relaxed" style={{ color: BRAND.ink }}>
              Your answers already put you at {formatCurrency(round10k(currentMidpoint))}, which is
              above that. Worth setting a higher one.
            </p>
          ) : (
            <>
              {needDisplay == null ? (
                <p className="text-[17px] leading-relaxed" style={{ color: BRAND.ink }}>
                  No score reaches {formatCurrency(target)} on your current {BASIS_WORD[basis]}.
                </p>
              ) : (
                <>
                  <p className="text-[17px] leading-relaxed" style={{ color: BRAND.ink }}>
                    To reach <b>{formatCurrency(target)}</b> you would need a score of{" "}
                    <b style={{ color: BRAND.teal }}>{needDisplay}</b>. You are at{" "}
                    <b>{displayScore(score)}</b>.
                  </p>
                  <p
                    className="mt-3 max-w-[62ch] text-[14px] leading-relaxed"
                    style={{ color: BRAND.muted }}
                  >
                    That is{" "}
                    <b style={{ color: BRAND.ink }}>
                      {Math.max(0, needDisplay - Math.round(score))} more points
                    </b>
                    , spread across the eight areas below. Your advisor&apos;s review is the next
                    thing that moves it, and after that the plan you work through together.
                  </p>
                </>
              )}

              {extraIncome > 0 && (
                <p
                  className="mt-4 rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed"
                  style={{
                    borderColor: "#e2c795",
                    background: "#fbf2e3",
                    color: BRAND.ink,
                  }}
                >
                  <b>Score alone does not get there.</b> Even at the top of the scale,{" "}
                  {formatCurrency(target)} needs {BASIS_WORD[basis]} of about{" "}
                  {formatCurrency(round10k(amount + extraIncome))}, against the{" "}
                  {formatCurrency(amount)} you entered. Growing the business and improving it are
                  two different jobs, and this target needs both.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
