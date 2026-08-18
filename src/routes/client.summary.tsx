import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import {
  buildConfig,
  computeValuation,
  targetAnalysis,
  type ScoringConfig,
  type ValuationResult,
} from "@/lib/valscore_calc";
import {
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";
import {
  BRAND,
  bandFor,
  bandSegments,
  buildDrivers,
  buildOpportunities,
  displayDelta,
  displayScore,
  formatCurrency,
  formatValuationRange,
  grossObjective,
  listNames,
  partitionByShift,
  totalOpportunity,
  type Driver,
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
  type PlanItem,
} from "@/lib/action-plan";

export const Route = createFileRoute("/client/summary")({
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
  },
  head: () => ({ meta: [{ title: "Your ValScore summary" }] }),
  component: ClientSummary,
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

/** The advisor review has to be in before a ValScore exists. */
function advisoryReady(status: string | null | undefined): boolean {
  return status === "submitted" || status === "final";
}

const BASIS_LABEL: Record<InputType, string> = {
  netfeeincome: "Net Fee Income",
  ebitda: "EBITDA",
};

/* ------------------------------------------------------------------ */

function ClientSummary() {
  const navigate = useNavigate();
  const [sub, setSub] = useState<Submission | null>(null);
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [advisoryAnswerCount, setAdvisoryAnswerCount] = useState(0);
  const [library, setLibrary] = useState<Library>(emptyLibrary());
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // RLS scopes these to the signed-in client's own submission.
      // NOTE: ordering must match the get_my_client_submission RPC (created_at
      // ASC) that /client uses, or a client with more than one submission would
      // see one submission on their portal and a different one here.
      const { data: subRows, error: subErr } = await supabase
        .from("submissions")
        .select(
          "submission_id,company_name,client_status,advisor_status,plan,valuation_input_type,valuation_input_amount,target_valuation",
        )
        .order("created_at", { ascending: true, nullsFirst: false })
        .limit(1);
      if (cancelled) return;

      const subData = (subRows ?? [])[0] as Submission | undefined;
      if (subErr || !subData) {
        setError(subErr?.message ?? "We couldn't find your assessment.");
        setLoading(false);
        return;
      }
      setSub(subData);

      const [sectionsRes, questionsRes, responsesRes, bandsRes, multiplesRes] =
        await Promise.all([
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
            .eq("submission_id", subData.submission_id),
          supabase
            .from("score_bands")
            .select("band_type,min_score,max_score,label"),
          supabase
            .from("valuation_multiples")
            .select("band_index,nfi_multiple,ebitda_multiple"),
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
          targetValuation: Number(subData.target_valuation ?? 0),
        },
        scoringConfig,
      );

      setAdvisoryAnswerCount(
        (responsesRes.data ?? []).filter(
          (r: { questionnaire_type?: string | null }) =>
            r.questionnaire_type === "advisory",
        ).length,
      );
      setSections((sectionsRes.data ?? []) as SectionMeta[]);
      setConfig(scoringConfig);
      setResult(computed);

      /**
       * The advisor's action plan, when there is one. Row-level security keeps
       * this empty until the review has been submitted and returns only the
       * library rows actually prescribed to this client, so a failure here is
       * never a reason to withhold the rest of the summary.
       */
      try {
        const [libraryData, planData] = await Promise.all([
          loadLibrary(),
          loadPlan(subData.submission_id),
        ]);
        if (cancelled) return;
        setLibrary(libraryData);
        setPlan(planData);
      } catch {
        if (cancelled) return;
        setLibrary(emptyLibrary());
        setPlan(EMPTY_PLAN);
      }

      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/client/auth" });
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading your summary…
      </div>
    );
  }

  if (error || !sub || !result || !config) {
    return (
      <Shell onSignOut={signOut} company={sub?.company_name}>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">
            Nothing to show yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "We couldn't find your assessment."}
          </p>
          <Button className="mt-5" onClick={() => navigate({ to: "/client" })}>
            Back to your portal
          </Button>
        </div>
      </Shell>
    );
  }

  const isObjectivePlan = sub.plan === "objective";
  const clientDone =
    sub.client_status === "submitted" || sub.client_status === "complete";

  // Objective-only clients have no advisor review to wait for, so their summary
  // unlocks the moment they finish the assessment.
  if (isObjectivePlan && !clientDone) {
    return (
      <Shell onSignOut={signOut} company={sub.company_name}>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">
            Finish your assessment first
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your score and valuation appear here as soon as you complete every
            question.
          </p>
          <Button className="mt-5" onClick={() => navigate({ to: "/client" })}>
            Back to your portal
          </Button>
        </div>
      </Shell>
    );
  }

  // Full service: guard against a submission flagged as reviewed while the
  // advisory answers are still blank. Without this the page would report a huge
  // downward restatement and mark every driver down, which is confidently wrong.
  if (
    !isObjectivePlan &&
    (!advisoryReady(sub.advisor_status) || advisoryAnswerCount === 0)
  ) {
    return (
      <Shell onSignOut={signOut} company={sub.company_name}>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">
            Your review is in progress
          </h2>
          <p className="mt-2 leading-relaxed text-sm text-muted-foreground">
            Your assessment is in with your advisor. Your ValScore summary
            unlocks as soon as their review is complete — we'll let you know the
            moment it's ready.
          </p>
          <Button className="mt-5" onClick={() => navigate({ to: "/client" })}>
            Back to your portal
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onSignOut={signOut} company={sub.company_name}>
      <SummaryBody
        sub={sub}
        sections={sections}
        result={result}
        config={config}
        library={library}
        plan={plan}
      />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function Shell({
  children,
  onSignOut,
  company,
}: {
  children: React.ReactNode;
  onSignOut: () => void | Promise<void>;
  company?: string;
}) {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen" style={{ background: "#eef1f5" }}>
      <header style={{ background: BRAND.navy }}>
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
          <span className="text-[15px] font-bold tracking-wide text-white">
            KRITERION
          </span>
          <span className="ml-auto text-[13px]" style={{ color: "#c3d2df" }}>
            {company ?? ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-[#c3d2df] hover:bg-white/10 hover:text-white"
            onClick={() => void onSignOut()}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <button
          type="button"
          onClick={() => navigate({ to: "/client" })}
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium"
          style={{ color: BRAND.muted }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to your portal
        </button>
        {children}
      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-[18px] rounded-[14px] border bg-white p-[22px]"
      style={{ borderColor: "#e4e9ef" }}
    >
      {title ? (
        <h2
          className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: BRAND.muted }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function SummaryBody({
  sub,
  sections,
  result,
  config,
  library,
  plan,
}: {
  sub: Submission;
  sections: SectionMeta[];
  result: ValuationResult;
  config: ScoringConfig;
  library: Library;
  plan: Plan;
}) {
  const inputType =
    (sub.valuation_input_type as InputType | null) ??
    DEFAULT_VALUATION_INPUT_TYPE;
  /**
   * Only show money when the client's own income figure is on file. The shared
   * default exists so the advisor tools always render something, but on a
   * client-facing page a valuation built from an invented amount would be
   * actively misleading — so when it's missing we show the score work and omit
   * the valuation and target planner entirely.
   */
  const rawAmount = Number(sub.valuation_input_amount ?? 0);
  const hasAmount = Number.isFinite(rawAmount) && rawAmount > 0;
  const amount = hasAmount ? rawAmount : DEFAULT_VALUATION_INPUT_AMOUNT;
  const anchors =
    inputType === "ebitda"
      ? config.multipleAnchorsEBITDA
      : config.multipleAnchorsNFI;

  const isObjective = sub.plan === "objective";
  const valScore = result.valScore;
  const objectiveMax = result.sectionScores
    .filter((s) => s.questionnaire_type === "objective")
    .reduce((sum, s) => sum + s.max_score, 0);
  const objectiveOn100 = grossObjective(result.objectiveScore, objectiveMax);
  const delta = valScore - objectiveOn100;
  const isFlat = Math.abs(delta) < 1;

  /**
   * Objective-only clients see their own score and the objective valuation;
   * full-service clients see the restated ValScore and the adjusted valuation.
   * Both are already on 0-100 for display, and the grossed objective bands land
   * on the same 0/50/70/85 thresholds, so one band list serves both.
   */
  const headlineScore = isObjective ? objectiveOn100 : valScore;
  const leg = isObjective ? result.objective : result.adjusted;
  const scoreLabel = isObjective ? "Your score" : "ValScore";

  const band = bandFor(headlineScore, config.adjustedBands);
  const segments = bandSegments(config);
  const drivers = useMemo(
    () => buildDrivers(sections, result.sectionScores),
    [sections, result.sectionScores],
  );
  const { up, down, held } = partitionByShift(drivers);
  /**
   * What is genuinely still available, counting BOTH halves of the ValScore.
   * `advisoryUpside` is the advisor's half only — the "where the upside is"
   * card is a report on the advisor's review, so it keeps that narrower figure
   * but says so rather than presenting it as the whole opportunity.
   */
  const opportunities = useMemo(
    () =>
      buildOpportunities(
        sections,
        result.sectionScores,
        isObjective ? "objective" : "full",
      ),
    [sections, result.sectionScores, isObjective],
  );
  const totalOpen = totalOpportunity(opportunities);
  const advisoryUpside = drivers.reduce((sum, d) => sum + d.upsidePoints, 0);

  /**
   * The advisor's own recommendations, when they have made any. Until then the
   * page falls back to the provisional focus list, which is derived from the
   * numbers rather than from anyone's judgement and says so.
   */
  const planItems = useMemo(
    () => buildPlanItems(plan, library, advisoryDriverContext(opportunities)),
    [plan, library, opportunities],
  );

  return (
    <>
      <div className="mb-5">
        <p
          className="text-[11px] uppercase tracking-[0.18em]"
          style={{ color: BRAND.muted }}
        >
          Your assessment · complete
        </p>
        <h1
          className="mt-1 text-[24px] font-semibold tracking-tight"
          style={{ color: BRAND.ink }}
        >
          Your ValScore Summary
        </h1>
        <p className="mt-1.5 text-[13.5px]" style={{ color: BRAND.muted }}>
          Your objective self-assessment, validated and restated by your advisor
          into a single value-readiness score — with a plan to raise it.
        </p>
      </div>

      {/* HERO */}
      <Card>
        <div className="flex flex-wrap items-center gap-[26px]">
          <div className="min-w-[150px] shrink-0 text-center">
            <div
              className="text-[64px] font-extrabold leading-[0.9] tracking-[-2px]"
              style={{ color: BRAND.navy }}
            >
              {displayScore(headlineScore)}
            </div>
            <div
              className="mt-2 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: BRAND.muted }}
            >
              {scoreLabel}
            </div>
            {isObjective ? null : (
              <div
                className="mt-2 inline-block rounded-full border px-[9px] py-0.5 text-[10.5px] font-bold"
                style={{
                  color: BRAND.tealDark,
                  background: "#dcefec",
                  borderColor: "#bfe6e3",
                }}
              >
                ✓ Advisor-reviewed
              </div>
            )}
          </div>
          <div className="min-w-[260px] flex-1">
            <div
              className="mb-1.5 inline-flex items-center gap-2 text-[15px] font-bold"
              style={{ color: "#a56a12" }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: segments[band.index]?.color ?? "#d59a3a" }}
              />
              {band.label}
            </div>
            <p
              className="m-0 mb-4 text-[13px] leading-[1.5]"
              style={{ color: BRAND.muted }}
            >
              Your ValScore combines your objective self-assessment with your
              advisor's review of the things a questionnaire can't capture.
            </p>
            <BandRibbon segments={segments} score={headlineScore} />
          </div>
        </div>
      </Card>

      {/* HOW YOUR VALSCORE WAS BUILT — restatement (full service only) */}
      {isObjective ? null : (
        <Card title="How your ValScore was built">
          <div className="flex flex-wrap items-center justify-center gap-[18px] pb-5 text-center">
            <div className="min-w-[110px]">
              <div
                className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: BRAND.muted }}
              >
                You said
              </div>
              <div
                className="mt-1.5 text-[44px] font-extrabold leading-none tracking-[-1.6px]"
                style={{ color: BRAND.navy }}
              >
                {displayScore(objectiveOn100)}
              </div>
              <div
                className="mt-1.5 text-[11px]"
                style={{ color: BRAND.muted }}
              >
                Your self-assessment
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <DeltaChip delta={delta} isFlat={isFlat} />
              <div
                className="text-[26px] font-bold leading-none"
                style={{ color: "#c2ccd6" }}
              >
                →
              </div>
            </div>
            <div className="min-w-[110px]">
              <div
                className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: BRAND.muted }}
              >
                Your ValScore
              </div>
              <div
                className="mt-1.5 text-[44px] font-extrabold leading-none tracking-[-1.6px]"
                style={{ color: BRAND.tealDark }}
              >
                {displayScore(valScore)}
              </div>
              <div
                className="mt-1.5 text-[11px]"
                style={{ color: BRAND.muted }}
              >
                Restated by your advisor
              </div>
            </div>
          </div>
          <p
            className="m-0 border-t pt-4 text-center text-[12.5px] leading-[1.6]"
            style={{ color: BRAND.muted, borderColor: "#eef2f6" }}
          >
            Your advisor reviews every driver you scored yourself on, then
            restates your assessment into your ValScore. It can move up or down.
          </p>
        </Card>
      )}

      {/* DRIVER BY DRIVER — the advisor's read (full service only) */}
      {!isObjective && drivers.length > 0 ? (
        <Card title="Where your advisor's read differed">
          <p
            className="m-0 mb-3 text-[12.5px] leading-[1.6]"
            style={{ color: BRAND.muted }}
          >
            Your own read against your advisor's, driver by driver, on the same
            0–100 scale.
          </p>
          <div
            className="mb-3 flex flex-wrap items-center gap-4 text-[11px]"
            style={{ color: BRAND.muted }}
          >
            <span className="inline-flex items-center gap-[7px]">
              <span
                className="inline-block h-3 w-3 rounded-full border-[2.5px] bg-white"
                style={{ borderColor: "#8fa6ba" }}
              />
              Your read
            </span>
            <span className="inline-flex items-center gap-[7px]">
              <span
                className="inline-block h-3 w-3 rounded-full border-2 border-white"
                style={{
                  background: BRAND.navy,
                  boxShadow: `0 0 0 1px ${BRAND.navy}`,
                }}
              />
              Advisor's read
            </span>
          </div>
          {drivers.map((d) => (
            <DriverRow key={d.key} driver={d} />
          ))}
          <div
            className="mt-4 rounded-[10px] border p-[13px_15px] text-[13px] leading-[1.65]"
            style={{
              background: "#f6f8fa",
              borderColor: "#e4e9ef",
              color: BRAND.ink,
            }}
          >
            <Verdict
              isFlat={isFlat}
              delta={delta}
              up={up}
              down={down}
              held={held}
            />
          </div>
        </Card>
      ) : null}

      {/* WHERE THE UPSIDE IS — scored by the advisor (full service only) */}
      {!isObjective && drivers.length > 0 ? (
        <Card title="Your advisor's review — where the upside is">
          <div
            className="mb-3 flex gap-4 text-[11px]"
            style={{ color: BRAND.muted }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: BRAND.teal }}
              />
              Captured
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: BRAND.upside }}
              />
              Upside available
            </span>
          </div>
          {drivers.map((d) => (
            <UpsideRow key={d.key} driver={d} />
          ))}
          <div
            className="mt-3.5 flex items-center justify-between border-t-2 pt-3.5 font-bold"
            style={{ borderColor: "#e4e9ef" }}
          >
            <span
              className="text-[13px] uppercase tracking-[0.1em]"
              style={{ color: BRAND.muted }}
            >
              Available from your advisor&apos;s review
            </span>
            <span className="text-[16px]" style={{ color: BRAND.tealDark }}>
              +{advisoryUpside} points
            </span>
          </div>
          <p
            className="m-0 mt-2.5 text-[12px] leading-[1.55]"
            style={{ color: BRAND.muted }}
          >
            That is +{advisoryUpside} of the {totalOpen} points still open on
            your ValScore. The rest sits in your own answers — the full picture
            is in Where to focus, below.
          </p>
        </Card>
      ) : null}

      {/* WHERE YOUR UPSIDE IS — objective plan, from the client's own answers */}
      {isObjective ? (
        <ObjectiveUpsideCard opportunities={opportunities} total={totalOpen} />
      ) : null}

      {/* THE ADVISOR'S ACTION PLAN — replaces the provisional focus list */}
      {planItems.length > 0 ? (
        <ActionPlanCard items={planItems} />
      ) : !isObjective && opportunities.length > 0 ? (
        <FocusCard opportunities={opportunities} />
      ) : null}

      {/* VALUATION — only when the client's income figure is actually on file */}
      {hasAmount ? (
        <Card title="What your ValScore means for value">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-[240px] flex-1">
              <div
                className="text-[30px] font-extrabold tracking-[-0.5px]"
                style={{ color: BRAND.navy }}
              >
                {formatValuationRange(leg.estimatedValuation)}
              </div>
              <div className="mt-1 text-[13px]" style={{ color: BRAND.muted }}>
                Midpoint estimate{" "}
                {formatCurrency(Math.round(result.adjusted.estimatedValuation))}{" "}
                · about {result.adjusted.multiple.toFixed(2)}× your{" "}
                {BASIS_LABEL[inputType]}
              </div>
            </div>
            <div className="flex flex-wrap gap-[22px]">
              <Meta label="Basis" value={BASIS_LABEL[inputType]} />
              <Meta label="Amount" value={formatCurrency(amount)} />
              <Meta label={scoreLabel} value={displayScore(headlineScore)} />
            </div>
          </div>
          <div
            className="mt-4 rounded-[9px] border p-[11px_14px] text-[12.5px] leading-[1.5]"
            style={{
              background: "#f6f8fa",
              borderColor: "#e4e9ef",
              color: BRAND.muted,
            }}
          >
            At the top band, your current {BASIS_LABEL[inputType]} of{" "}
            <b style={{ color: BRAND.ink }}>{formatCurrency(amount)}</b> could
            support up to{" "}
            <b style={{ color: BRAND.ink }}>
              {formatCurrency(leg.maxValuation)}
            </b>
            . Raising your ValScore is the fastest way to move up the scale
            toward it.
          </div>
        </Card>
      ) : null}

      {/* TARGET PLANNER — needs a real income figure to price against */}
      {hasAmount ? (
        <TargetPlanner
          amount={amount}
          basisLabel={BASIS_LABEL[inputType]}
          scoreLabel={scoreLabel}
          /* The objective leg is scored natively out of 60, so the planner works
             in native points and converts only for display. The ValScore leg is
             already 0-100, so its converter is the identity. */
          currentScore={isObjective ? result.objectiveScore : valScore}
          toDisplayScore={
            isObjective
              ? (n: number) => grossObjective(n, objectiveMax)
              : (n: number) => n
          }
          currentValuation={leg.estimatedValuation}
          floors={isObjective ? config.objectiveFloors : config.adjustedFloors}
          anchors={anchors}
          initialTarget={Number(sub.target_valuation ?? 0) || undefined}
        />
      ) : (
        <Card title="What your score means for value">
          <p
            className="m-0 text-[13px] leading-[1.6]"
            style={{ color: BRAND.muted }}
          >
            We don't have your income figure on file yet, so we're not showing a
            valuation range. Your advisor can add it — once it's in, this page
            will show what your score means in dollars, plus a planner for
            setting a target.
          </p>
        </Card>
      )}

      {isObjective ? <UpgradeCard /> : null}

      <p
        className="mt-2.5 text-center text-[11.5px] leading-[1.5]"
        style={{ color: BRAND.muted }}
      >
        Estimates are model outputs and are not a formal valuation or an offer.
        Ranges reflect a ±5% band around the midpoint. Scores are shown on a
        0–100 scale.
      </p>
    </>
  );
}

/**
 * Objective-only clients have no advisor read to compare against, so their
 * upside comes from their own answers: how much of each scored section they
 * captured, and what is still on the table.
 */
function ObjectiveUpsideCard({
  opportunities,
  total,
}: {
  opportunities: Opportunity[];
  total: number;
}) {
  const rows = opportunities.map((o) => ({
    key: o.key,
    name: o.name,
    pct: Math.round(o.capturedPct),
    gap: Math.round(o.totalGap),
  }));

  if (rows.length === 0) return null;
  const totalGap = total;

  return (
    <Card title="Where your upside is">
      <p
        className="m-0 mb-3 text-[12.5px] leading-[1.6]"
        style={{ color: BRAND.muted }}
      >
        How much of each area you have captured, ranked by what is still
        available. These are points of your score, on the same 0–100 scale as
        the score itself.
      </p>
      <div
        className="mb-3 flex gap-4 text-[11px]"
        style={{ color: BRAND.muted }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[11px] w-[11px] rounded-[3px]"
            style={{ background: BRAND.teal }}
          />
          Captured
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[11px] w-[11px] rounded-[3px]"
            style={{ background: BRAND.upside }}
          />
          Upside available
        </span>
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          className="border-b py-[9px] last:border-b-0 md:grid md:items-center md:gap-3.5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,2.3fr)_auto]"
          style={{ borderColor: "#eef2f6" }}
        >
          <div className="flex items-start justify-between gap-3 md:block">
            <div className="text-[13.5px] font-semibold">
              {r.name}
              <span
                className="mt-px block text-[11px] font-normal"
                style={{ color: BRAND.muted }}
              >
                {r.pct}% captured
              </span>
            </div>
            <div className="min-w-[66px] shrink-0 text-right md:hidden">
              <div
                className="text-[15px] font-extrabold leading-none tabular-nums"
                style={{ color: BRAND.tealDark }}
              >
                +{r.gap}
              </div>
              <div
                className="mt-0.5 text-[10px] uppercase tracking-[0.05em]"
                style={{ color: BRAND.muted }}
              >
                pts upside
              </div>
            </div>
          </div>
          <div
            className="mt-2 flex h-2.5 overflow-hidden rounded-md md:mt-0"
            style={{ background: "#eef2f6" }}
          >
            <span style={{ width: `${r.pct}%`, background: BRAND.teal }} />
            <span
              style={{ width: `${100 - r.pct}%`, background: BRAND.upside }}
            />
          </div>
          <div className="hidden min-w-[66px] text-right md:block">
            <div
              className="text-[15px] font-extrabold leading-none tabular-nums"
              style={{ color: BRAND.tealDark }}
            >
              +{r.gap}
            </div>
            <div
              className="mt-0.5 text-[10px] uppercase tracking-[0.05em]"
              style={{ color: BRAND.muted }}
            >
              pts upside
            </div>
          </div>
        </div>
      ))}
      <div
        className="mt-3.5 flex items-center justify-between border-t-2 pt-3.5 font-bold"
        style={{ borderColor: "#e4e9ef" }}
      >
        <span
          className="text-[13px] uppercase tracking-[0.1em]"
          style={{ color: BRAND.muted }}
        >
          Total upside still available
        </span>
        <span className="text-[16px]" style={{ color: BRAND.tealDark }}>
          +{totalGap} points
        </span>
      </div>
    </Card>
  );
}

/** Advisory upgrade offer, shown only to objective-only clients. */
function UpgradeCard() {
  return (
    <section
      className="mb-[18px] rounded-[14px] border p-[22px]"
      style={{
        borderColor: "#cfe9e7",
        background: "linear-gradient(180deg,#f4fbfa,#fff)",
      }}
    >
      <span
        className="inline-block rounded-full border px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.09em]"
        style={{
          background: "#dcefec",
          color: BRAND.tealDark,
          borderColor: "#bfe6e3",
        }}
      >
        Optional add-on
      </span>
      <p className="mt-2 text-[15px] font-extrabold">
        Unlock your advisor-adjusted valuation
      </p>
      <p
        className="mt-1 text-[12.5px] leading-[1.55]"
        style={{ color: BRAND.muted }}
      >
        Everything above is your own read of the business. An advisor interviews
        you on what a questionnaire can&apos;t capture — how transferable your
        earnings really are, how the business runs without you — then restates
        your score and builds a prioritised plan.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px]">
        <li>Your ValScore — validated, not self-reported</li>
        <li>A prioritised plan for the gaps above</li>
        <li>Full valuation report</li>
      </ul>
      <Button className="mt-4" style={{ background: BRAND.teal }}>
        Add an advisor review
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10.5px] uppercase tracking-[0.08em]"
        style={{ color: BRAND.muted }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-[14px] font-bold">{value}</div>
    </div>
  );
}

function DeltaChip({ delta, isFlat }: { delta: number; isFlat: boolean }) {
  const style = isFlat
    ? { background: "#eef2f6", color: "#5c6f80", borderColor: "#dde4ea" }
    : delta > 0
      ? {
          background: "#e6f4ec",
          color: BRAND.positiveText,
          borderColor: "#bfe3cd",
        }
      : {
          background: "#fbecea",
          color: BRAND.negativeText,
          borderColor: "#f0cfc9",
        };
  const text = isFlat
    ? "Confirmed"
    : delta > 0
      ? `▲ +${Math.round(delta)} points`
      : `▼ −${Math.abs(Math.round(delta))} points`;
  return (
    <span
      className="whitespace-nowrap rounded-full border px-3 py-1 text-[11.5px] font-extrabold"
      style={style}
    >
      {text}
    </span>
  );
}

function BandRibbon({
  segments,
  score,
}: {
  segments: ReturnType<typeof bandSegments>;
  score: number;
}) {
  const total = segments.reduce((s, b) => s + b.width, 0) || 100;
  const min = segments[0]?.min ?? 0;
  const max = segments[segments.length - 1]?.max ?? 100;
  const pct = Math.max(
    0,
    Math.min(100, ((score - min) / (max - min || 1)) * 100),
  );
  return (
    <div className="relative mt-1.5">
      <div
        className="absolute -top-2 -translate-x-1/2 text-center"
        style={{ left: `${pct}%` }}
      >
        <div
          className="mb-0.5 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ background: BRAND.navy }}
        >
          You · {displayScore(score)}
        </div>
        <div
          className="mx-auto h-0 w-0"
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: `8px solid ${BRAND.navy}`,
          }}
        />
      </div>
      <div
        className="flex h-[34px] overflow-hidden rounded-lg border"
        style={{ borderColor: "#e4e9ef" }}
      >
        {segments.map((b) => (
          <div
            key={b.min}
            className="flex items-center justify-center px-1 text-center text-[10.5px] font-bold leading-[1.1] text-white"
            style={{ flex: b.width / total, background: b.color }}
          >
            {b.label
              .replace(/ band$/i, "")
              .replace(/^Bottom of market$/i, "Bottom")}
            <br />
            {b.min}–{b.max}
          </div>
        ))}
      </div>
      <div
        className="mt-1 flex justify-between text-[10px]"
        style={{ color: BRAND.muted }}
      >
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function DriverRow({ driver }: { driver: Driver }) {
  const isFlat = Math.abs(driver.delta) < 3;
  const lo = Math.min(driver.selfScore, driver.advisorScore);
  const hi = Math.max(driver.selfScore, driver.advisorScore);
  const dirColor = driver.delta > 0 ? BRAND.positive : BRAND.negative;
  const deltaColor = isFlat
    ? "#9aa8b5"
    : driver.delta > 0
      ? BRAND.positiveText
      : BRAND.negativeText;

  const delta = (
    <div
      className="text-right text-[13px] font-extrabold tabular-nums"
      style={{ color: deltaColor }}
    >
      {displayDelta(driver.delta)}
      <span
        className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.05em]"
        style={{ color: BRAND.muted }}
      >
        {isFlat ? "held" : "shift"}
      </span>
    </div>
  );

  return (
    <div
      className="border-b py-[11px] last:border-b-0 md:grid md:items-center md:gap-3.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,2.2fr)_70px]"
      style={{ borderColor: "#eef2f6" }}
    >
      <div className="flex items-start justify-between gap-3 md:block">
        <div className="text-[13px] font-semibold leading-[1.3]">
          {driver.name}
          <span
            className="mt-0.5 block text-[10.5px] font-normal"
            style={{ color: BRAND.muted }}
          >
            You {displayScore(driver.selfScore)} · Advisor{" "}
            {displayScore(driver.advisorScore)}
          </span>
        </div>
        <div className="shrink-0 md:hidden">{delta}</div>
      </div>
      <div className="relative mt-2 h-[22px] md:mt-0">
        <div
          className="absolute left-0 right-0 top-[10px] h-[3px] rounded-sm"
          style={{ background: BRAND.rail }}
        />
        {!isFlat ? (
          <div
            className="absolute top-[10px] h-[3px] rounded-sm"
            style={{
              left: `${lo}%`,
              width: `${hi - lo}%`,
              background: dirColor,
            }}
          />
        ) : null}
        <div
          className="absolute top-[5.5px] h-3 w-3 -translate-x-1/2 rounded-full border-[2.5px] bg-white"
          style={{ left: `${driver.selfScore}%`, borderColor: "#8fa6ba" }}
        />
        <div
          className="absolute top-[5.5px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white"
          style={{
            left: `${driver.advisorScore}%`,
            background: BRAND.navy,
            boxShadow: `0 0 0 1px ${BRAND.navy}`,
          }}
        />
      </div>
      <div className="hidden md:block">{delta}</div>
    </div>
  );
}

function UpsideRow({ driver }: { driver: Driver }) {
  const pct = Math.round(driver.advisorScore);
  const upside = (
    <div className="min-w-[66px] shrink-0 text-right">
      <div
        className="text-[15px] font-extrabold leading-none tabular-nums"
        style={{ color: BRAND.tealDark }}
      >
        +{driver.upsidePoints}
      </div>
      <div
        className="mt-0.5 text-[10px] uppercase tracking-[0.05em]"
        style={{ color: BRAND.muted }}
      >
        pts upside
      </div>
    </div>
  );

  return (
    <div
      className="border-b py-[9px] last:border-b-0 md:grid md:items-center md:gap-3.5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,2.3fr)_auto]"
      style={{ borderColor: "#eef2f6" }}
    >
      <div className="flex items-start justify-between gap-3 md:block">
        <div className="text-[13.5px] font-semibold">
          {driver.name}
          <span
            className="mt-px block text-[11px] font-normal"
            style={{ color: BRAND.muted }}
          >
            {pct}% captured
          </span>
        </div>
        <div className="md:hidden">{upside}</div>
      </div>
      <div
        className="mt-2 flex h-2.5 overflow-hidden rounded-md md:mt-0"
        style={{ background: "#eef2f6" }}
      >
        <span style={{ width: `${pct}%`, background: BRAND.teal }} />
        <span style={{ width: `${100 - pct}%`, background: BRAND.upside }} />
      </div>
      <div className="hidden md:block">{upside}</div>
    </div>
  );
}

function Verdict({
  isFlat,
  delta,
  up,
  down,
  held,
}: {
  isFlat: boolean;
  delta: number;
  up: Driver[];
  down: Driver[];
  held: Driver[];
}) {
  return (
    <>
      <b style={{ color: BRAND.navy }}>
        {isFlat
          ? "Your advisor confirmed your overall read"
          : delta > 0
            ? `Your advisor restated your score upward, by ${Math.round(delta)} points.`
            : `Your advisor restated your score downward, by ${Math.abs(Math.round(delta))} points.`}
      </b>
      {/* Only claim the drivers disagreed when at least one actually moved —
          otherwise this clause contradicts the sentence that follows it. */}
      {isFlat
        ? up.length > 0 || down.length > 0
          ? " — but not driver by driver. "
          : ". "
        : " "}
      {up.length > 0 ? (
        <>
          They found more strength than you gave yourself credit for in{" "}
          <b style={{ color: BRAND.navy }}>{listNames(up)}</b>.{" "}
        </>
      ) : null}
      {down.length > 0 ? (
        <>
          They saw more risk than your answers suggested in{" "}
          <b style={{ color: BRAND.navy }}>{listNames(down)}</b>.{" "}
        </>
      ) : null}
      {held.length > 0 ? (
        <>
          Your read on <b style={{ color: BRAND.navy }}>{listNames(held)}</b>{" "}
          held up exactly.{" "}
        </>
      ) : null}
      Where to focus next is below.
    </>
  );
}

/**
 * The advisor's action plan: the problems they named, each with the actions
 * they prescribed underneath it.
 *
 * Nothing here is generated — every line was chosen by a person during the
 * review. Actions are nested under their problem because an action without its
 * reason reads as a generic tip, which is the opposite of what is being sold.
 *
 * The partner category behind each action is deliberately NOT shown. Telling an
 * owner to "go and find a CPA" without being able to introduce one is a worse
 * experience than saying nothing; the tag becomes a referral link once the
 * partner network exists. Clients cannot read those tags from the database
 * either, so this is enforced in two places, not one.
 */
function ActionPlanCard({ items }: { items: PlanItem[] }) {
  const actionCount = countActions(items);
  return (
    <Card title="Your action plan">
      <p
        className="m-0 mb-4 text-[12.5px] leading-[1.6]"
        style={{ color: BRAND.muted }}
      >
        Your advisor identified{" "}
        <b style={{ color: BRAND.ink }}>
          {items.length} {items.length === 1 ? "issue" : "issues"}
        </b>{" "}
        holding your value back
        {actionCount > 0 ? (
          <>
            , with{" "}
            <b style={{ color: BRAND.ink }}>
              {actionCount} specific {actionCount === 1 ? "action" : "actions"}
            </b>{" "}
            to address {items.length === 1 ? "it" : "them"}
          </>
        ) : null}
        . They are ordered by how much value each one is holding.
      </p>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-[0_11px_11px_0] border-l-[3px] p-[13px_16px]"
            style={{ borderColor: BRAND.upside, background: "#fdfaf3" }}
          >
            <div className="text-[13.5px] font-bold leading-snug">
              {item.text}
            </div>
            {item.driverName ? (
              <div
                className="mt-0.5 text-[11.5px]"
                style={{ color: BRAND.muted }}
              >
                {item.driverName}
                {item.driverPoints != null && item.driverPoints > 0 ? (
                  <>
                    {" · up to "}
                    <b style={{ color: BRAND.tealDark }}>
                      +{item.driverPoints} points
                    </b>
                    {" available in this driver"}
                  </>
                ) : null}
              </div>
            ) : null}
            {item.actions.length > 0 ? (
              <ul className="m-0 mt-2.5 list-disc pl-[18px]">
                {item.actions.map((action) => (
                  <li
                    key={action.id}
                    className="mb-1 text-[12.5px] leading-[1.65] last:mb-0"
                    style={{ color: "#2b3b48" }}
                  >
                    {action.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Provisional focus list, derived from where the most points are still
 * available across BOTH halves of the ValScore. This is a stand-in: once the
 * advisor workspace persists the problem→cure recommendations, this card should
 * render those instead.
 *
 * Deliberately no second "out of 100" here. The page already uses that phrase
 * for the ValScore — the whole business — and repeating it inches later for a
 * single driver's capture rate reads as the same measure when it is not.
 */
function FocusCard({ opportunities }: { opportunities: Opportunity[] }) {
  const top = opportunities.filter((o) => o.totalGap > 0).slice(0, 5);
  if (top.length === 0) return null;
  return (
    <Card title="Where to focus">
      <p
        className="m-0 mb-3.5 text-[12.5px] leading-[1.6]"
        style={{ color: BRAND.muted }}
      >
        The drivers carrying the most unrealised value today, highest first.
        Your advisor will turn these into a specific action plan.
      </p>
      <div className="flex flex-col gap-3">
        {top.map((o, i) => {
          const points = Math.round(o.totalGap);
          return (
            <div
              key={o.key}
              className="flex items-start gap-3 rounded-[11px] border p-[14px_16px]"
              style={{ borderColor: "#e4e9ef" }}
            >
              <span
                className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-extrabold"
                style={{ background: "#dcefec", color: BRAND.tealDark }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold">{o.name}</div>
                <div
                  className="mt-0.5 text-[12.5px] leading-[1.5]"
                  style={{ color: BRAND.muted }}
                >
                  {o.advisoryPct == null ? null : (
                    <>
                      Your advisor rated this {displayScore(o.advisoryPct)}%
                      —{" "}
                    </>
                  )}
                  <b style={{ color: BRAND.tealDark }}>
                    {points} point{points === 1 ? "" : "s"}
                  </b>{" "}
                  {o.advisoryPct == null ? "of your score" : "of ValScore"} are
                  still available here.
                </div>
                {o.advisoryPct == null ? null : (
                  <div
                    className="mt-1 text-[11px] leading-[1.5]"
                    style={{ color: "#8a97a4" }}
                  >
                    {o.objectiveGap} from your own answers · {o.advisoryGap}{" "}
                    from your advisor&apos;s review
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function parseMoney(v: string): number {
  return Number(String(v).replace(/[^0-9.]/g, "")) || 0;
}

function TargetPlanner({
  amount,
  basisLabel,
  scoreLabel,
  currentScore,
  toDisplayScore,
  currentValuation,
  floors,
  anchors,
  initialTarget,
}: {
  amount: number;
  basisLabel: string;
  scoreLabel: string;
  currentScore: number;
  toDisplayScore: (n: number) => number;
  currentValuation: number;
  floors: number[];
  anchors: number[];
  initialTarget?: number;
}) {
  const suggested = useMemo(() => {
    const base = Math.max(currentValuation, amount);
    const step = base < 1_000_000 ? 250_000 : 500_000;
    const start = Math.ceil((base * 1.25) / step) * step;
    return [0, 1, 2, 3].map((i) => start + i * step);
  }, [currentValuation, amount]);

  const [raw, setRaw] = useState(() =>
    (initialTarget && initialTarget > 0
      ? initialTarget
      : suggested[1]
    ).toLocaleString("en-US"),
  );

  const target = parseMoney(raw);
  const analysis =
    target > 0
      ? targetAnalysis(target, amount, currentScore, floors, anchors)
      : null;
  const maxMultiple = anchors[anchors.length - 1];
  const maxValuation = amount * maxMultiple;
  const alreadyThere = currentValuation >= target - 0.5;
  const needsIncome = (analysis?.additionalIncomeRequired ?? 0) > 0.5;
  const reqScore =
    analysis?.requiredScore != null ? Math.ceil(analysis.requiredScore) : null;
  const shownCurrent = Math.round(toDisplayScore(currentScore));
  const shownRequired =
    reqScore != null ? Math.round(toDisplayScore(reqScore)) : null;
  const gain =
    shownRequired != null ? Math.max(0, shownRequired - shownCurrent) : null;

  return (
    <Card title="Set a target valuation">
      <p className="m-0 mb-3 text-[13px]" style={{ color: BRAND.muted }}>
        Set a target and we'll show the ValScore you'd need to reach it, and
        whether it also calls for higher income.
      </p>
      <div className="relative mb-2 max-w-md">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold"
          style={{ color: BRAND.muted }}
        >
          $
        </span>
        <input
          value={raw}
          inputMode="numeric"
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => {
            const n = parseMoney(raw);
            setRaw(n ? n.toLocaleString("en-US") : "");
          }}
          className="w-full rounded-[9px] border-[1.5px] bg-white py-[11px] pl-6 pr-3 text-[16px] font-semibold outline-none focus:border-[#1f8a86]"
          style={{ borderColor: "#d7dee6", color: BRAND.ink }}
          aria-label="Target valuation"
        />
      </div>
      <div className="flex flex-wrap gap-[7px]">
        {suggested.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setRaw(v.toLocaleString("en-US"))}
            className="rounded-full border bg-white px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors hover:border-[#1f8a86] hover:bg-[#f4fbfa] hover:text-[#166f6b]"
            style={{ borderColor: "#d7dee6", color: "#4a5a68" }}
          >
            {formatCurrency(v)}
          </button>
        ))}
      </div>

      <div
        className="mt-4 overflow-hidden rounded-[11px] border"
        style={{ borderColor: "#e4e9ef" }}
      >
        <div
          className="border-b p-[12px_16px] text-[13.5px] leading-[1.5]"
          style={{ background: "#f4fbfa", borderColor: "#e4e9ef" }}
        >
          {target <= 0 ? (
            "Enter a target valuation to see what it would take."
          ) : alreadyThere ? (
            <>
              <b style={{ color: BRAND.tealDark }}>You're already there.</b>{" "}
              Your {scoreLabel.toLowerCase()} of {shownCurrent} already supports{" "}
              {formatCurrency(target)}.
            </>
          ) : reqScore == null ? (
            <>
              {formatCurrency(target)} is beyond what this model can price from
              a {basisLabel.toLowerCase()} of {formatCurrency(amount)}.
            </>
          ) : (
            <>
              To reach{" "}
              <b style={{ color: BRAND.tealDark }}>{formatCurrency(target)}</b>,
              you'd need a ValScore of{" "}
              <b style={{ color: BRAND.tealDark }}>{reqScore}</b> — that's{" "}
              <b style={{ color: BRAND.tealDark }}>
                {gain} point{gain === 1 ? "" : "s"}
              </b>{" "}
              above your current {shownCurrent}.
            </>
          )}
        </div>
        {target > 0 && analysis ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3">
              <PlannerCell
                label="Target ValScore"
                value={reqScore != null ? String(reqScore) : "—"}
                sub={`from ${shownCurrent} today`}
              />
              <PlannerCell
                label="Points to gain"
                value={alreadyThere ? "0" : gain != null ? `+${gain}` : "—"}
                sub={alreadyThere ? "already met" : "via your action plan"}
              />
              <PlannerCell
                label="Implied multiple"
                value={`${analysis.requiredMultiple.toFixed(2)}×`}
                sub={`on ${basisLabel}`}
              />
            </div>
            {needsIncome ? (
              <div
                className="border-t p-[13px_16px] text-[13px] leading-[1.55]"
                style={{
                  background: "#fbf1dd",
                  borderColor: "#eeddb6",
                  color: "#a56a12",
                }}
              >
                Even at the maximum ValScore, {formatCurrency(amount)} of{" "}
                {basisLabel} tops out at{" "}
                <b style={{ color: "#6b4d0d" }}>
                  {formatCurrency(maxValuation)}
                </b>
                . To reach {formatCurrency(target)} you'd also need to grow{" "}
                {basisLabel} to about{" "}
                <b style={{ color: "#6b4d0d" }}>
                  {formatCurrency(Math.round(analysis.totalIncomeRequired))}
                </b>{" "}
                — an extra{" "}
                <b style={{ color: "#6b4d0d" }}>
                  {formatCurrency(
                    Math.round(analysis.additionalIncomeRequired),
                  )}
                </b>
                .
              </div>
            ) : alreadyThere ? (
              <div
                className="border-t p-[13px_16px] text-[13px] leading-[1.55]"
                style={{
                  background: "#e6f4ec",
                  borderColor: "#bfe3cd",
                  color: BRAND.positiveText,
                }}
              >
                <b style={{ color: "#155e3a" }}>No score increase needed</b> at
                your current income.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}

function PlannerCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="border-t border-r p-[14px_16px] last:border-r-0"
      style={{ borderColor: "#e4e9ef" }}
    >
      <div
        className="text-[10.5px] uppercase tracking-[0.08em]"
        style={{ color: BRAND.muted }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[22px] font-extrabold tracking-[-0.5px]"
        style={{ color: BRAND.navy }}
      >
        {value}
      </div>
      <div
        className="mt-0.5 text-[12px] font-semibold"
        style={{ color: BRAND.muted }}
      >
        {sub}
      </div>
    </div>
  );
}
