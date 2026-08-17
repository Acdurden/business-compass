import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { BRAND } from "@/lib/score-display";

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
): Stage {
  if (!sub || sub.client_status === "notstarted") return "new";
  if (sub.client_status !== "submitted" && sub.client_status !== "complete") {
    return "progress";
  }
  // Client has submitted.
  if (plan === "objective") return "complete";
  return advisorStatus === "submitted" || advisorStatus === "final"
    ? "complete"
    : "awaiting";
}

function ClientHome() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<MySubmission | null>(null);
  const [advisorStatus, setAdvisorStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("full");
  const [answered, setAnswered] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
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
      // The RPC doesn't carry advisor_status or plan; read them directly. RLS
      // scopes this to the signed-in client's own row.
      const { data: statusRow } = await supabase
        .from("submissions")
        .select("advisor_status,plan")
        .eq("submission_id", row.submission_id)
        .maybeSingle();
      setAdvisorStatus((statusRow?.advisor_status as string | null) ?? null);
      setPlan(statusRow?.plan === "objective" ? "objective" : "full");

      // Progress, for the in-progress state.
      const [{ count: answeredCount }, { count: questionCount }] =
        await Promise.all([
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
        ]);
      setAnswered(answeredCount ?? null);
      setTotalQuestions(questionCount ?? null);
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

  const stage = deriveStage(sub, advisorStatus, plan);

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Client portal
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              {email || "Welcome"}
            </h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-14">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
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
            onViewSummary={() => navigate({ to: "/client/summary" })}
          />
        )}
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Fact({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        {sub}
      </p>
    </div>
  );
}

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
    <div>
      <h2 className="text-3xl font-semibold tracking-tight">
        Let&apos;s find out what your business is worth
      </h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
        This assessment scores your business across the areas buyers actually
        price — financial quality, client concentration, founder dependency,
        operations, positioning and growth. You&apos;ll get a value-readiness
        score and an estimated valuation range at the end.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Assessment for{" "}
            <span className="font-medium text-foreground">{companyName}</span>
          </p>
          <Button size="lg" className="mt-4 w-full" onClick={onContinue}>
            Begin your assessment
          </Button>
        </div>
      ) : (
        <form
          onSubmit={onStart}
          className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
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
            className="mt-5 w-full"
            disabled={busy || !companyName.trim()}
          >
            {busy ? "Starting…" : "Begin your assessment"}
          </Button>
        </form>
      )}

      <p className="mt-6 border-t border-border/60 pt-5 text-[13px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">What happens next:</span>{" "}
        {plan === "full"
          ? "you complete the assessment, your advisor reviews it and restates your score, then your full ValScore summary and action plan unlock here."
          : "you complete the assessment and your score, valuation range and target planner are ready immediately. An advisor review is available later as an add-on if you want it."}
      </p>
    </div>
  );
}

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
    <div>
      <h2 className="text-3xl font-semibold tracking-tight">
        Continue your assessment
      </h2>
      <p className="mt-3 text-muted-foreground">{companyName}</p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
        {answered != null && total != null ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">
                {answered}
              </span>
              <span className="text-base text-muted-foreground">
                of {total} answered
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct ?? 0}%`, background: BRAND.teal }}
              />
            </div>
          </>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Every answer is saved automatically — you can close this and pick up
          exactly where you left off.
        </p>
        <Button size="lg" className="mt-5 w-full" onClick={onContinue}>
          Continue where you left off
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-5">
        <p className="text-sm font-medium">
          Your score unlocks when you finish
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          We don&apos;t show a partial score — a half-finished assessment would
          give you a misleading number. Complete all the questions and your
          score, valuation range and biggest opportunities all appear here.
        </p>
      </div>
    </div>
  );
}

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
          className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
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
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function AwaitingReview({ companyName }: { companyName: string }) {
  return (
    <div>
      <h2 className="text-3xl font-semibold tracking-tight">
        Your assessment is in review
      </h2>
      <p className="mt-3 text-muted-foreground">
        {companyName} · here&apos;s where things stand.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
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
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-5">
        <p className="text-sm font-medium">Nothing needed from you right now</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          We&apos;ll let you know the moment your results are ready. Most
          reviews complete within a few business days.
        </p>
      </div>
    </div>
  );
}

function Complete({
  plan,
  companyName,
  onViewSummary,
}: {
  plan: Plan;
  companyName: string;
  onViewSummary: () => void;
}) {
  return (
    <div>
      <h2 className="text-3xl font-semibold tracking-tight">
        {plan === "full"
          ? "Your ValScore summary is ready"
          : "Your results are ready"}
      </h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
        {plan === "full" ? (
          <>
            Your advisor has reviewed your assessment for{" "}
            <span className="font-medium text-foreground">{companyName}</span>{" "}
            and restated your score. Your summary includes their read on every
            driver and where your upside sits.
          </>
        ) : (
          <>
            Your assessment for{" "}
            <span className="font-medium text-foreground">{companyName}</span>{" "}
            is scored. Your score, valuation range and target planner are
            complete and yours to keep.
          </>
        )}
      </p>

      <Button size="lg" className="mt-7" onClick={onViewSummary}>
        {plan === "full" ? "View your ValScore summary" : "View your summary"}
      </Button>

      {plan === "objective" ? (
        <div
          className="mt-8 rounded-xl border p-6"
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
          <p className="mt-2 text-[15px] font-bold">
            Unlock your advisor-adjusted valuation
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            An advisor interviews you on the things a self-assessment can&apos;t
            capture, then restates your score and builds a prioritised action
            plan.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px]">
            <li>Your ValScore — validated, not self-reported</li>
            <li>A prioritised plan for your biggest gaps</li>
            <li>Full valuation report</li>
          </ul>
          <Button
            className="mt-4"
            style={{ background: BRAND.teal }}
            onClick={() =>
              toast.info("We'll be in touch about adding an advisor review.")
            }
          >
            Add an advisor review
          </Button>
        </div>
      ) : null}
    </div>
  );
}
