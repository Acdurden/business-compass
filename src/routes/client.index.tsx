import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { generateSubmissionPdf } from "@/lib/generate-submission-pdf";
import {
  buildConfig,
  computeValuation,
  type ScoringConfig,
  type ValuationResult,
} from "@/lib/valscore_calc";
import {
  BRAND,
  bandFor,
  buildOpportunities,
  displayScore,
  formatCurrency,
  formatValuationRange,
  grossObjective,
  totalOpportunity,
  type Opportunity,
  type SectionMeta,
} from "@/lib/score-display";

export const Route = createFileRoute("/client/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/client/auth" });
    }
    const { data: isClient } = await supabase.rpc("has_role", {
      _user_id: data.session.user.id,
      _role: "client",
    });
    if (!isClient) {
      throw redirect({ to: "/client/auth" });
    }
    if (data.session.user.user_metadata?.must_change_password) {
      throw redirect({ to: "/client/change-password" });
    }
    return { email: data.session.user.email ?? "" };
  },
  head: () => ({ meta: [{ title: "Client portal" }] }),
  component: ClientHome,
});

type MySubmission = {
  submission_id: string;
  client_token: string;
  client_status: string;
  company_name: string;
};

type InputType = "netfeeincome" | "ebitda";

type SubmissionExtras = {
  advisor_status: string | null;
  plan: string | null;
  valuation_input_type: InputType | null;
  valuation_input_amount: number | null;
  target_valuation: number | null;
};

type Plan = "objective" | "full";

/**
 * The four stages of the client journey. `/client` is one route whose content is
 * driven by this, rather than a fixed dashboard — a client with no results yet
 * would otherwise be shown an empty score.
 *
 * "awaiting" does not exist on the objective-only plan: with no advisor review
 * there is nothing to wait for, so submitting goes straight to "complete".
 */
type Stage = "new" | "progress" | "awaiting" | "complete";

function deriveStage(
  sub: MySubmission | null,
  advisorStatus: string | null,
  plan: Plan,
  advisoryAnswers: number,
): Stage {
  if (!sub || sub.client_status === "notstarted") return "new";
  if (sub.client_status !== "submitted" && sub.client_status !== "complete") {
    return "progress";
  }
  // Client has submitted.
  if (plan === "objective") return "complete";
  const reviewed = advisorStatus === "submitted" || advisorStatus === "final";
  /**
   * A submission can be flagged as reviewed while the advisory answers are
   * still blank. Treating that as complete would show a ValScore made of the
   * objective half only — confidently wrong. `/client/summary` already refuses
   * to render in that case; keep this page in step with it.
   */
  if (reviewed && advisoryAnswers === 0) return "awaiting";
  return reviewed ? "complete" : "awaiting";
}

/** Everything the finished dashboard needs, loaded only once there is a score. */
type ScoreData = {
  sections: SectionMeta[];
  result: ValuationResult;
  config: ScoringConfig;
};

function ClientHome() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<MySubmission | null>(null);
  const [extras, setExtras] = useState<SubmissionExtras | null>(null);
  const [plan, setPlan] = useState<Plan>("full");
  const [answered, setAnswered] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [advisoryAnswered, setAdvisoryAnswered] = useState(0);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data, error } = await supabase.rpc("get_my_client_submission");
    if (error) {
      toast.error("Failed to load");
      setLoading(false);
      return;
    }
    const row = (data ?? [])[0] as MySubmission | undefined;
    setSub(row ?? null);

    if (row) {
      // The RPC doesn't carry the plan or the valuation inputs; read them
      // directly. RLS scopes this to the signed-in client's own row.
      const { data: statusRow } = await supabase
        .from("submissions")
        .select(
          "advisor_status,plan,valuation_input_type,valuation_input_amount,target_valuation",
        )
        .eq("submission_id", row.submission_id)
        .maybeSingle();
      const extraData = (statusRow ?? null) as SubmissionExtras | null;
      setExtras(extraData);
      const rowPlan: Plan =
        extraData?.plan === "objective" ? "objective" : "full";
      setPlan(rowPlan);

      // Progress, for the in-progress state.
      const [
        { count: answeredCount },
        { count: questionCount },
        { count: advisoryCount },
      ] = await Promise.all([
        supabase
          .from("responses")
          .select("question_id", { count: "exact", head: true })
          .eq("submission_id", row.submission_id)
          .eq("questionnaire_type", "objective"),
        supabase
          .from("questions")
          .select("question_id", { count: "exact", head: true })
          .eq("active", true)
          .eq("questionnaire_type", "objective"),
        supabase
          .from("responses")
          .select("question_id", { count: "exact", head: true })
          .eq("submission_id", row.submission_id)
          .eq("questionnaire_type", "advisory"),
      ]);
      setAnswered(answeredCount ?? null);
      setTotalQuestions(questionCount ?? null);
      const advisoryAnswers = advisoryCount ?? 0;
      setAdvisoryAnswered(advisoryAnswers);

      // Only load the scoring machinery when there is actually a result to
      // show. A half-finished assessment must not produce a partial score.
      if (
        deriveStage(
          row,
          extraData?.advisor_status ?? null,
          rowPlan,
          advisoryAnswers,
        ) === "complete"
      ) {
        const loaded = await loadScoreData(row.submission_id, extraData);
        setScoreData(loaded);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
    void refresh();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/client/auth" });
  }

  async function startNew(e: React.FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("start_my_client_submission", {
      p_company_name: name,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not start");
      return;
    }
    const row = (data ?? [])[0] as MySubmission | undefined;
    if (!row) {
      toast.error("Could not start");
      return;
    }
    navigate({ to: "/client/questionnaire" });
  }

  const stage = deriveStage(
    sub,
    extras?.advisor_status ?? null,
    plan,
    advisoryAnswered,
  );

  return (
    <Shell
      email={email}
      company={sub?.company_name ?? ""}
      stage={stage}
      plan={plan}
      hasSubmission={sub !== null}
      onSignOut={signOut}
      onNavigate={(to) => navigate({ to })}
    >
      {loading ? (
        <p className="text-sm" style={{ color: BRAND.muted }}>
          Loading…
        </p>
      ) : stage === "new" ? (
        <NotStarted
          plan={plan}
          hasSubmission={sub !== null}
          companyName={sub?.company_name ?? companyName}
          setCompanyName={setCompanyName}
          busy={busy}
          onStart={startNew}
          onContinue={() => navigate({ to: "/client/questionnaire" })}
        />
      ) : stage === "progress" ? (
        <InProgress
          companyName={sub?.company_name ?? ""}
          answered={answered}
          total={totalQuestions}
          onContinue={() => navigate({ to: "/client/questionnaire" })}
        />
      ) : stage === "awaiting" ? (
        <AwaitingReview companyName={sub?.company_name ?? ""} />
      ) : (
        <Complete
          plan={plan}
          companyName={sub?.company_name ?? ""}
          submissionId={sub?.submission_id ?? ""}
          extras={extras}
          data={scoreData}
          onViewSummary={() => navigate({ to: "/client/summary" })}
        />
      )}
    </Shell>
  );
}

/**
 * Load the same rows `/client/summary` loads, so the two pages can never show
 * different numbers for the same submission.
 */
async function loadScoreData(
  submissionId: string,
  extras: SubmissionExtras | null,
): Promise<ScoreData | null> {
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
        .eq("submission_id", submissionId),
      supabase
        .from("score_bands")
        .select("band_type,min_score,max_score,label"),
      supabase
        .from("valuation_multiples")
        .select("band_index,nfi_multiple,ebitda_multiple"),
    ]);

  if (!questionsRes.data || questionsRes.data.length === 0) return null;

  const config = buildConfig(
    (bandsRes.data ?? []) as never,
    (multiplesRes.data ?? []) as never,
  );
  const result = computeValuation(
    (responsesRes.data ?? []) as never,
    (questionsRes.data ?? []) as never,
    {
      valuationInputType: extras?.valuation_input_type ?? "netfeeincome",
      // Deliberately no shared default here: a client must never be shown a
      // valuation built from an income figure nobody gave us.
      valuationInputAmount: Number(extras?.valuation_input_amount ?? 0),
      targetValuation: Number(extras?.target_valuation ?? 0),
    },
    config,
  );

  return {
    sections: (sectionsRes.data ?? []) as SectionMeta[],
    result,
    config,
  };
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

type NavTarget = "/client" | "/client/questionnaire" | "/client/summary";

type NavItem = {
  label: string;
  to?: NavTarget;
  active?: boolean;
  locked?: boolean;
  /** Why it's greyed out, shown on hover. */
  reason?: string;
  upgrade?: boolean;
  onClick?: () => void;
};

function navItems(
  stage: Stage,
  plan: Plan,
  hasSubmission: boolean,
  onSignOut: () => void,
): NavItem[] {
  const done = stage === "complete";
  const soon = "Available when your results are ready";
  const unbuilt = "Coming soon";
  return [
    { label: "Dashboard", to: "/client", active: true },
    {
      label: "My assessment",
      to: "/client/questionnaire",
      locked: !hasSubmission,
      reason: "Starts when you begin your assessment",
    },
    {
      label: "Score & valuation",
      to: "/client/summary",
      locked: !done,
      reason: soon,
    },
    { label: "Opportunities", locked: true, reason: unbuilt },
    { label: "Documents", locked: true, reason: unbuilt },
    ...(plan === "objective" && done
      ? [
          {
            label: "Upgrade: Advisor review",
            upgrade: true,
            onClick: () =>
              toast.info("We'll be in touch about adding an advisor review."),
          } satisfies NavItem,
        ]
      : []),
    { label: "Account", locked: true, reason: unbuilt },
    { label: "Sign out", onClick: onSignOut },
  ];
}

function Shell({
  children,
  email,
  company,
  stage,
  plan,
  hasSubmission,
  onSignOut,
  onNavigate,
}: {
  children: React.ReactNode;
  email: string;
  company: string;
  stage: Stage;
  plan: Plan;
  hasSubmission: boolean;
  onSignOut: () => void | Promise<void>;
  onNavigate: (to: NavTarget) => void;
}) {
  const items = navItems(stage, plan, hasSubmission, () => void onSignOut());

  return (
    <div className="flex min-h-screen" style={{ background: "#eef1f5" }}>
      <aside
        className="hidden w-[214px] shrink-0 flex-col py-[18px] md:flex"
        style={{ background: BRAND.navy, color: "#c3d2df" }}
      >
        <div className="px-[18px] pb-[18px] text-[15px] font-bold tracking-wide text-white">
          KRITERION
        </div>
        <nav className="flex flex-col">
          {items.map((item) =>
            item.locked ? (
              <span
                key={item.label}
                title={item.reason}
                className="flex cursor-default items-center gap-2.5 border-l-[3px] border-transparent px-[18px] py-2.5 text-[13px] opacity-[0.34]"
              >
                <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-current opacity-60" />
                {item.label}
                <span aria-hidden>🔒</span>
              </span>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() =>
                  item.onClick ? item.onClick() : item.to && onNavigate(item.to)
                }
                className="flex items-center gap-2.5 border-l-[3px] px-[18px] py-2.5 text-left text-[13px] transition-colors hover:bg-[#16293a] hover:text-white"
                style={{
                  borderLeftColor: item.active ? BRAND.teal : "transparent",
                  background: item.active ? "#16293a" : "transparent",
                  color: item.active
                    ? "#ffffff"
                    : item.upgrade
                      ? "#7fd3ce"
                      : "#a8bccd",
                  fontWeight: item.active ? 600 : 400,
                }}
              >
                <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-current opacity-60" />
                {item.label}
              </button>
            ),
          )}
        </nav>
        <div
          className="mt-auto border-t px-[18px] pt-4 text-[11.5px] leading-[1.5]"
          style={{ borderColor: "#1e3549", color: "#6f8698" }}
        >
          {company || "Your business"}
          <br />
          {email}
        </div>
      </aside>

      {/* Phones don't get the rail — just the brand and a way out. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center justify-between px-5 py-3 md:hidden"
          style={{ background: BRAND.navy }}
        >
          <span className="text-[15px] font-bold tracking-wide text-white">
            KRITERION
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
        </header>
        <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-7">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function Card({
  title,
  children,
  className,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={`mb-4 rounded-[13px] border bg-white p-5 ${className ?? ""}`}
      style={{ borderColor: "#e4e9ef", ...style }}
    >
      {title ? (
        <h2
          className="mb-3.5 text-[11.5px] font-bold uppercase tracking-[0.13em]"
          style={{ color: BRAND.muted }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function PageHead({
  eyebrow,
  title,
  sub,
  plan,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  plan?: Plan;
}) {
  return (
    <div className="mb-[18px]">
      <p
        className="text-[11px] uppercase tracking-[0.18em]"
        style={{ color: BRAND.muted }}
      >
        {eyebrow}
      </p>
      <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-[23px] font-semibold tracking-tight">
        {title}
        {plan ? (
          <span
            className="rounded-full border px-2.5 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.09em]"
            style={
              plan === "objective"
                ? {
                    background: "#eef2f6",
                    color: "#5c6f80",
                    borderColor: "#dde4ea",
                  }
                : {
                    background: "#dcefec",
                    color: BRAND.tealDark,
                    borderColor: "#bfe6e3",
                  }
            }
          >
            {plan === "objective" ? "Objective only" : "Full service"}
          </span>
        ) : null}
      </h1>
      <p className="mt-1.5 text-[13.5px]" style={{ color: BRAND.muted }}>
        {sub}
      </p>
    </div>
  );
}

function Fact({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      className="rounded-[10px] border p-[13px_15px]"
      style={{ borderColor: "#e4e9ef", background: "#f6f8fa" }}
    >
      <p className="text-[13px] font-bold">{title}</p>
      <p
        className="mt-0.5 text-[11.5px] leading-[1.45]"
        style={{ color: BRAND.muted }}
      >
        {sub}
      </p>
    </div>
  );
}

function Stepper({
  steps,
}: {
  steps: Array<{ label: string; note: string; state: "done" | "addon" }>;
}) {
  return (
    <div className="flex">
      {steps.map((s, i) => (
        <div key={s.label} className="relative flex-1 pt-5">
          <span
            aria-hidden
            className="absolute top-1.5 h-[3px]"
            style={{
              left: i === 0 ? "50%" : 0,
              right: i === steps.length - 1 ? "50%" : 0,
              background:
                s.state === "done"
                  ? BRAND.positive
                  : "repeating-linear-gradient(90deg,#e4e9ef 0 5px,transparent 5px 10px)",
            }}
          />
          <span
            aria-hidden
            className="absolute left-1/2 top-px h-[13px] w-[13px] -translate-x-1/2 rounded-full border-[2.5px]"
            style={
              s.state === "done"
                ? { background: BRAND.positive, borderColor: "#eef1f5" }
                : { background: "#fff", border: "2.5px dashed #b9c6d2" }
            }
          />
          <div
            className="text-center text-[12.5px] font-semibold"
            style={{ color: s.state === "done" ? BRAND.ink : "#9aa8b5" }}
          >
            {s.label}
          </div>
          <div
            className="mt-0.5 text-center text-[10.5px]"
            style={{ color: "#9aa8b5" }}
          >
            {s.note}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage: not started                                                  */
/* ------------------------------------------------------------------ */

function NotStarted({
  plan,
  hasSubmission,
  companyName,
  setCompanyName,
  busy,
  onStart,
  onContinue,
}: {
  plan: Plan;
  hasSubmission: boolean;
  companyName: string;
  setCompanyName: (v: string) => void;
  busy: boolean;
  onStart: (e: React.FormEvent) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <PageHead
        eyebrow="Welcome"
        title="Let's get started"
        sub="You haven't started your assessment yet."
        plan={plan}
      />
      <Card>
        <h2 className="text-[26px] font-semibold tracking-tight">
          Let&apos;s find out what your business is worth
        </h2>
        <p
          className="mt-2.5 max-w-[620px] text-[14px] leading-[1.65]"
          style={{ color: BRAND.muted }}
        >
          This assessment scores your business across the areas buyers actually
          price — financial quality, client concentration, founder dependency,
          operations, positioning and growth. You&apos;ll get a value-readiness
          score and an estimated valuation range at the end.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Fact
            title="10–15 minutes"
            sub="Saves as you go — leave and come back anytime"
          />
          <Fact title="24 questions" sub="Across 8 scored value drivers" />
          {plan === "full" ? (
            <Fact
              title="Then an advisor review"
              sub="Your answers validated by an experienced advisor"
            />
          ) : (
            <Fact
              title="Results immediately"
              sub="Your score and valuation as soon as you finish"
            />
          )}
        </div>

        {hasSubmission ? (
          <div className="mt-6 max-w-md">
            <p className="text-sm" style={{ color: BRAND.muted }}>
              Assessment for{" "}
              <span className="font-medium" style={{ color: BRAND.ink }}>
                {companyName}
              </span>
            </p>
            <Button size="lg" className="mt-4" onClick={onContinue}>
              Begin your assessment
            </Button>
          </div>
        ) : (
          <form onSubmit={onStart} className="mt-6 max-w-md">
            <Label htmlFor="company">Company name</Label>
            <Input
              id="company"
              required
              maxLength={200}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Co."
              className="mt-2"
            />
            <Button
              type="submit"
              size="lg"
              className="mt-5"
              disabled={busy || !companyName.trim()}
            >
              {busy ? "Starting…" : "Begin your assessment"}
            </Button>
          </form>
        )}

        <p
          className="mt-5 border-t pt-4 text-[12.5px] leading-[1.6]"
          style={{ borderColor: "#eef2f6", color: BRAND.muted }}
        >
          <span className="font-medium" style={{ color: BRAND.ink }}>
            What happens next:
          </span>{" "}
          {plan === "full"
            ? "you complete the assessment, your advisor reviews it and restates your score, then your full ValScore summary and action plan unlock here."
            : "you complete the assessment and your score, valuation range and target planner are ready immediately. An advisor review is available later as an add-on if you want it."}
        </p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stage: in progress                                                  */
/* ------------------------------------------------------------------ */

function InProgress({
  companyName,
  answered,
  total,
  onContinue,
}: {
  companyName: string;
  answered: number | null;
  total: number | null;
  onContinue: () => void;
}) {
  const pct =
    answered != null && total != null && total > 0
      ? Math.min(100, Math.round((answered / total) * 100))
      : null;
  return (
    <>
      <PageHead
        eyebrow="In progress"
        title="Your assessment"
        sub={`${companyName} · pick up where you left off.`}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-6">
          {answered != null && total != null ? (
            <div className="shrink-0">
              <div
                className="text-[34px] font-extrabold leading-none tracking-tight"
                style={{ color: BRAND.navy }}
              >
                {answered}
                <span
                  className="text-[17px] font-normal"
                  style={{ color: BRAND.muted }}
                >
                  {" "}
                  of {total}
                </span>
              </div>
              <div
                className="mt-1.5 text-[11px] uppercase tracking-[0.1em]"
                style={{ color: BRAND.muted }}
              >
                Questions answered
              </div>
            </div>
          ) : null}
          <div className="min-w-[220px] flex-1">
            <div
              className="h-2.5 overflow-hidden rounded-md"
              style={{ background: "#eef2f6" }}
            >
              <div
                className="h-full rounded-md transition-all"
                style={{ width: `${pct ?? 0}%`, background: BRAND.teal }}
              />
            </div>
            <p
              className="mt-2.5 text-[12.5px] leading-[1.5]"
              style={{ color: BRAND.muted }}
            >
              Every answer is saved automatically — you can close this and pick
              up exactly where you left off.
            </p>
          </div>
          <Button size="lg" className="shrink-0" onClick={onContinue}>
            Continue where you left off
          </Button>
        </div>
      </Card>

      <Card title="What you'll get">
        <p className="text-sm font-medium">
          Your score unlocks when you finish
        </p>
        <p
          className="mt-1 text-[13px] leading-[1.6]"
          style={{ color: BRAND.muted }}
        >
          We don&apos;t show a partial score — a half-finished assessment would
          give you a misleading number. Complete all the questions and your
          score, valuation range and biggest opportunities all appear here.
        </p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stage: awaiting review                                              */
/* ------------------------------------------------------------------ */

function TimelineItem({
  state,
  title,
  body,
  last,
}: {
  state: "done" | "current" | "todo";
  title: string;
  body: string;
  last?: boolean;
}) {
  const mark =
    state === "done"
      ? { bg: "#e6f4ec", fg: BRAND.positiveText, br: "#bfe3cd", ch: "✓" }
      : state === "current"
        ? { bg: "#e7eefb", fg: "#2456b8", br: "#c3d6f4", ch: "›" }
        : { bg: "#f4f6f9", fg: "#aab6c2", br: "#e4e9ef", ch: "·" };
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      {!last ? (
        <span
          className="absolute bottom-0 left-[11px] top-6 w-px"
          style={{ background: "#e4e9ef" }}
          aria-hidden
        />
      ) : null}
      <span
        className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
        style={{ background: mark.bg, color: mark.fg, borderColor: mark.br }}
      >
        {mark.ch}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p
          className="mt-0.5 text-[13px] leading-[1.55]"
          style={{ color: BRAND.muted }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function AwaitingReview({ companyName }: { companyName: string }) {
  return (
    <>
      <PageHead
        eyebrow="Submitted"
        title="Your assessment is in review"
        sub={`${companyName} · here's where things stand.`}
      />
      <Card>
        <TimelineItem
          state="done"
          title="You submitted your assessment"
          body="Every question answered across 8 value drivers."
        />
        <TimelineItem
          state="current"
          title="Your advisor is reviewing it"
          body="They're working through the things a questionnaire can't capture — customer retention, staff tenure, how transferable your earnings really are — and will restate your score based on what they find."
        />
        <TimelineItem
          state="todo"
          title="Your ValScore is restated"
          body="Your self-assessment becomes your ValScore. It can move up or down."
        />
        <TimelineItem
          state="todo"
          title="Your summary and action plan unlock"
          body="Including your advisor-adjusted valuation and a prioritised plan — right here, no action needed from you."
          last
        />
      </Card>

      <Card>
        <p className="text-sm font-medium">Nothing needed from you right now</p>
        <p
          className="mt-1 text-[13px] leading-[1.6]"
          style={{ color: BRAND.muted }}
        >
          We&apos;ll let you know the moment your results are ready. Most
          reviews complete within a few business days.
        </p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stage: complete — the dashboard                                     */
/* ------------------------------------------------------------------ */

function Tile({
  label,
  value,
  note,
  pill,
  highlight,
  valueClass,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  pill?: string;
  highlight?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className="rounded-[13px] border p-[15px_16px]"
      style={
        highlight
          ? {
              borderColor: "#cfe9e7",
              background: "linear-gradient(180deg,#f4fbfa,#fff)",
            }
          : { borderColor: "#e4e9ef", background: "#fff" }
      }
    >
      <div
        className="text-[10.5px] uppercase tracking-[0.08em]"
        style={{ color: BRAND.muted }}
      >
        {label}
      </div>
      <div
        className={`mt-[5px] font-extrabold leading-none tracking-tight ${valueClass ?? "text-[29px]"}`}
        style={{ color: BRAND.navy }}
      >
        {value}
      </div>
      {pill ? (
        <span
          className="mt-[7px] inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: "#fbf1dd",
            color: "#a56a12",
            borderColor: "#eeddb6",
          }}
        >
          {pill}
        </span>
      ) : null}
      {note ? (
        <div className="mt-1 text-[11.5px]" style={{ color: BRAND.muted }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

function OpportunityRow({ o }: { o: Opportunity }) {
  const pct = Math.round(o.capturedPct);
  const points = Math.round(o.totalGap);
  return (
    <div
      className="border-b py-[11px] last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_118px_60px] md:items-center md:gap-3"
      style={{ borderColor: "#eef2f6" }}
    >
      <div className="flex items-start justify-between gap-3 md:block">
        <div className="text-[13px] font-semibold">
          {o.name}
          <span
            className="mt-0.5 block text-[10.5px] font-normal"
            style={{ color: BRAND.muted }}
          >
            {pct}% captured
            {o.advisoryPct == null
              ? ""
              : ` · ${o.objectiveGap} from your answers · ${o.advisoryGap} from your advisor`}
          </span>
        </div>
        <div className="shrink-0 text-right md:hidden">
          <div
            className="text-[15px] font-extrabold leading-none"
            style={{ color: BRAND.tealDark }}
          >
            +{points}
          </div>
        </div>
      </div>
      <div
        className="mt-2 flex h-[9px] overflow-hidden rounded-md md:mt-0"
        style={{ background: "#eef2f6" }}
      >
        <span style={{ width: `${pct}%`, background: BRAND.teal }} />
        <span style={{ width: `${100 - pct}%`, background: BRAND.upside }} />
      </div>
      <div className="hidden text-right md:block">
        <div
          className="text-[15px] font-extrabold leading-none"
          style={{ color: BRAND.tealDark }}
        >
          +{points}
        </div>
        <div
          className="mt-0.5 text-[9px] font-bold uppercase"
          style={{ color: BRAND.muted }}
        >
          pts
        </div>
      </div>
    </div>
  );
}

function Complete({
  plan,
  companyName,
  submissionId,
  extras,
  data,
  onViewSummary,
}: {
  plan: Plan;
  companyName: string;
  submissionId: string;
  extras: SubmissionExtras | null;
  data: ScoreData | null;
  onViewSummary: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const isObjective = plan === "objective";

  async function downloadPdf() {
    if (!submissionId) return;
    setDownloading(true);
    try {
      await generateSubmissionPdf(submissionId);
    } catch {
      toast.error("We couldn't build your PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  // If the scoring rows didn't load we still show a working page rather than a
  // blank one — just without invented numbers.
  const objectiveMax =
    data?.result.sectionScores
      .filter((s) => s.questionnaire_type === "objective")
      .reduce((sum, s) => sum + s.max_score, 0) ?? 0;
  const headline = data
    ? isObjective
      ? grossObjective(data.result.objectiveScore, objectiveMax)
      : data.result.valScore
    : null;
  const band =
    data && headline != null
      ? bandFor(headline, data.config.adjustedBands)
      : null;
  const leg = data
    ? isObjective
      ? data.result.objective
      : data.result.adjusted
    : null;

  const rawAmount = Number(extras?.valuation_input_amount ?? 0);
  const hasAmount = Number.isFinite(rawAmount) && rawAmount > 0;
  const target = Number(extras?.target_valuation ?? 0);

  const opportunities = data
    ? buildOpportunities(
        data.sections,
        data.result.sectionScores,
        isObjective ? "objective" : "full",
      ).filter((o) => o.totalGap > 0)
    : [];
  const totalOpen = totalOpportunity(opportunities);

  return (
    <>
      <PageHead
        eyebrow="Welcome back"
        title="Your valuation dashboard"
        sub={`${companyName} · here's where things stand and what's next.`}
        plan={plan}
      />

      <Card>
        <Stepper
          steps={
            isObjective
              ? [
                  { label: "Account created", note: "Done", state: "done" },
                  {
                    label: "Assessment submitted",
                    note: "Done",
                    state: "done",
                  },
                  { label: "Your results", note: "Ready", state: "done" },
                  {
                    label: "Advisor review",
                    note: "Optional add-on",
                    state: "addon",
                  },
                ]
              : [
                  { label: "Account created", note: "Done", state: "done" },
                  {
                    label: "Assessment submitted",
                    note: "Done",
                    state: "done",
                  },
                  { label: "Advisor review", note: "Done", state: "done" },
                  { label: "Your ValScore", note: "Ready", state: "done" },
                ]
          }
        />
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={isObjective ? "Objective score" : "ValScore"}
          value={headline != null ? displayScore(headline) : "—"}
          pill={band?.label}
          highlight
        />
        {hasAmount && leg ? (
          <Tile
            label="Estimated value"
            value={formatValuationRange(leg.estimatedValuation)}
            valueClass="text-[18px]"
            note={`Midpoint ${formatCurrency(leg.estimatedValuation)}`}
          />
        ) : (
          <Tile
            label="Estimated value"
            value="—"
            valueClass="text-[20px]"
            note="We need your income figure to price this"
          />
        )}
        <Tile
          label="Value goal"
          value={target > 0 ? formatCurrency(target) : "Not set"}
          valueClass="text-[20px]"
          note={
            target > 0 ? "Your target valuation" : "Set one on your summary"
          }
        />
        <Tile
          label="Assessment"
          value="Complete"
          valueClass="text-[20px]"
          note={
            isObjective ? "All 8 drivers scored" : "Reviewed by your advisor"
          }
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <Card title="Your biggest opportunities">
            {opportunities.length === 0 ? (
              <p className="text-[13px]" style={{ color: BRAND.muted }}>
                Nothing outstanding — you have captured everything this
                assessment measures.
              </p>
            ) : (
              <>
                {opportunities.slice(0, 3).map((o) => (
                  <OpportunityRow key={o.key} o={o} />
                ))}
                <div
                  className="mt-3.5 flex items-center justify-between border-t-2 pt-3 font-extrabold"
                  style={{ borderColor: "#e4e9ef" }}
                >
                  <span
                    className="text-[11.5px] uppercase tracking-[0.1em]"
                    style={{ color: BRAND.muted }}
                  >
                    {isObjective
                      ? "Total available across all 8 drivers"
                      : "Total ValScore still available"}
                  </span>
                  <span
                    className="text-[16px]"
                    style={{ color: BRAND.tealDark }}
                  >
                    +{totalOpen}
                  </span>
                </div>
              </>
            )}
            <p
              className="mt-3 border-t pt-3 text-[12px] leading-[1.55]"
              style={{ borderColor: "#eef2f6", color: BRAND.muted }}
            >
              {isObjective
                ? "These areas hold the most unclaimed points — improving them raises your score and the valuation multiple that comes with it. An advisor review turns this into a concrete plan."
                : "Your advisor flagged these as the priorities. Each one is broken down driver by driver in your summary."}
            </p>
          </Card>
        </div>

        <div>
          <Card title="Your results">
            <p className="text-[14px] font-bold">
              {isObjective
                ? "Your objective results are ready"
                : "Your ValScore summary is ready"}
            </p>
            <p
              className="mt-1 text-[12.5px] leading-[1.55]"
              style={{ color: BRAND.muted }}
            >
              {isObjective
                ? "Your score, valuation range and target planner are complete and yours to keep."
                : "Your advisor has reviewed your assessment and restated your score. Your summary includes their read on every driver and where your upside sits."}
            </p>
            <Button className="mt-3.5" onClick={onViewSummary}>
              {isObjective
                ? "View your full summary"
                : "View your ValScore summary"}
            </Button>
          </Card>

          {isObjective ? (
            <Card
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
                className="mt-1 text-[12.5px] leading-[1.5]"
                style={{ color: BRAND.muted }}
              >
                An advisor interviews you on the things a self-assessment
                can&apos;t capture, then restates your score and builds a
                prioritised action plan.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px]">
                <li>Your ValScore — validated, not self-reported</li>
                <li>A prioritised plan for the gaps above</li>
                <li>Full valuation report</li>
              </ul>
              <Button
                className="mt-4"
                style={{ background: BRAND.teal }}
                onClick={() =>
                  toast.info(
                    "We'll be in touch about adding an advisor review.",
                  )
                }
              >
                Add an advisor review
              </Button>
            </Card>
          ) : null}

          <Card
            style={{
              borderColor: "#cfe9e7",
              background: "linear-gradient(180deg,#f4fbfa,#fff)",
            }}
          >
            <p className="text-[14px] font-bold">Set your value goal</p>
            <p
              className="mt-1 text-[12.5px] leading-[1.5]"
              style={{ color: BRAND.muted }}
            >
              Tell us what you&apos;d like the business to be worth, and
              we&apos;ll map the score — and any income growth — it would take
              to get there.
            </p>
            <Button className="mt-3" onClick={onViewSummary}>
              {target > 0 ? "Change your target" : "Set a target"}
            </Button>
          </Card>

          <Card title="Your documents">
            <div
              className="flex items-center gap-2.5 border-b py-2.5 text-[13px]"
              style={{ borderColor: "#eef2f6" }}
            >
              <span
                className="h-[30px] w-[26px] shrink-0 rounded"
                style={{ background: "#dcefe3" }}
                aria-hidden
              />
              <div className="flex-1">
                {isObjective ? "Objective Score Summary" : "ValScore Summary"}
                <div className="text-[11px]" style={{ color: BRAND.muted }}>
                  Ready · PDF
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={downloading || !submissionId}
                onClick={() => void downloadPdf()}
              >
                {downloading ? "Preparing…" : "Download"}
              </Button>
            </div>
            <div className="flex items-center gap-2.5 py-2.5 text-[13px] opacity-60">
              <span
                className="h-[30px] w-[26px] shrink-0 rounded"
                style={{ background: "#eef2f6" }}
                aria-hidden
              />
              <div className="flex-1">
                Full Valuation Report
                <div className="text-[11px]" style={{ color: BRAND.muted }}>
                  {isObjective
                    ? "Included with an advisor review"
                    : "Coming soon"}
                </div>
              </div>
              <span
                className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{
                  background: "#f1f4f7",
                  color: "#9aa8b6",
                  borderColor: "#e4e9ef",
                }}
              >
                {isObjective ? "Unlock" : "Locked"}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
