/**
 * Advisor dashboard — the state of every assessment and every review.
 *
 * Deliberately NOT a practice-performance screen. There is no advised value, no
 * average score and no book distribution: Andrew tracks the operations side
 * elsewhere, and mixing the two turns a work queue into a report nobody acts on.
 * Every number here is a count of assessments or reviews.
 *
 * All the deciding lives in `@/lib/advisor-queue` so it can be tested against
 * real rows; this file only loads and renders.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import { listClientAccounts, type ClientAccountRow } from "@/lib/password-admin.functions";
import { buildConfig, type ScoringConfig } from "@/lib/valscore_calc";
import {
  buildNotes,
  buildQueueItems,
  buildTiles,
  plural,
  sortBucket,
  type QueueAction,
  type QueueItem,
  type QueueQuestion,
  type QueueResponse,
  type QueueSubmission,
} from "@/lib/advisor-queue";
import { ClipboardList, ListChecks, Users } from "lucide-react";
import { BackOfficeNav } from "@/components/back-office-nav";
import { InviteClientButton } from "@/components/invite-client-button";

export const Route = createFileRoute("/advisor/")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  head: () => ({ meta: [{ title: "Advisor dashboard" }] }),
  component: AdvisorDashboard,
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function AdvisorDashboard() {
  const navigate = useNavigate();
  const loadClientAccounts = useServerFn(listClientAccounts);

  const [submissions, setSubmissions] = useState<QueueSubmission[]>([]);
  const [responses, setResponses] = useState<QueueResponse[]>([]);
  const [questions, setQuestions] = useState<QueueQuestion[]>([]);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [planProblems, setPlanProblems] = useState<Array<{ id: string; submission_id: string }>>(
    [],
  );
  const [planActions, setPlanActions] = useState<Array<{ submission_problem_id: string }>>([]);
  /**
   * The accounts themselves, not just how many. A number you cannot click
   * through to is a number you have to take on faith, and the first version of
   * this screen made a loud claim about 18 accounts that turned out to be
   * almost entirely seed data.
   */
  const [dormant, setDormant] = useState<ClientAccountRow[] | null>(null);
  /** Which tile is expanded, by its key. One at a time; null is all closed. */
  const [openTile, setOpenTile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [subsRes, responsesRes, questionsRes, bandsRes, multiplesRes, problemsRes] =
        await Promise.all([
          supabase
            .from("submissions")
            .select(
              "submission_id,company_name,client_status,advisor_status,plan,valuation_input_type,valuation_input_amount,created_at,updated_at",
            )
            .order("updated_at", { ascending: true }),
          supabase
            .from("responses")
            .select("submission_id,section_id,questionnaire_type,points_awarded"),
          supabase
            .from("questions")
            .select("section_id,questionnaire_type,max_score")
            .eq("active", true),
          supabase.from("score_bands").select("band_type,min_score,max_score,label"),
          supabase.from("valuation_multiples").select("band_index,nfi_multiple,ebitda_multiple"),
          supabase.from("submission_problems").select("id,submission_id"),
        ]);
      if (cancelled) return;

      if (subsRes.error) {
        setError(subsRes.error.message);
        setLoading(false);
        return;
      }

      const problems = (problemsRes.data ?? []) as Array<{
        id: string;
        submission_id: string;
      }>;

      // Only ask for actions once there are problems for them to hang off.
      let actions: Array<{ submission_problem_id: string }> = [];
      if (problems.length > 0) {
        const actionsRes = await supabase.from("submission_cures").select("submission_problem_id");
        if (cancelled) return;
        if (!actionsRes.error) {
          actions = (actionsRes.data ?? []) as Array<{
            submission_problem_id: string;
          }>;
        }
      }

      setSubmissions((subsRes.data ?? []) as QueueSubmission[]);
      setResponses((responsesRes.data ?? []) as QueueResponse[]);
      setQuestions((questionsRes.data ?? []) as QueueQuestion[]);
      setConfig(buildConfig((bandsRes.data ?? []) as never, (multiplesRes.data ?? []) as never));
      setPlanProblems(problems);
      setPlanActions(actions);
      setLoading(false);

      /**
       * Client accounts sit behind a server function because row-level security
       * only lets a user read their own role. It is the slowest call on the
       * page and feeds a single number, so it runs after the queue has already
       * rendered rather than holding it up.
       */
      try {
        const accounts = await loadClientAccounts();
        if (cancelled) return;
        setDormant(
          accounts
            .filter((a) => a.company_names.length === 0)
            .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")),
        );
      } catch {
        if (cancelled) return;
        setDormant(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadClientAccounts]);

  const items = useMemo(
    () =>
      buildQueueItems({
        submissions,
        responses,
        questions,
        planProblems,
        planActions,
        config,
      }),
    [submissions, responses, questions, planProblems, planActions, config],
  );

  const needs = useMemo(() => sortBucket(items, "needs"), [items]);
  const waiting = useMemo(() => sortBucket(items, "waiting"), [items]);
  const done = useMemo(() => sortBucket(items, "done"), [items]);
  const dormantCount = dormant === null ? null : dormant.length;
  const tiles = useMemo(
    () => buildTiles(items, submissions, dormantCount),
    [items, submissions, dormantCount],
  );
  const notes = useMemo(
    () => buildNotes(items, submissions, dormantCount),
    [items, submissions, dormantCount],
  );

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/submissions">Go to submissions</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <BackOfficeNav active={"dashboard"} />
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Advisor</p>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          {/*
           * The one thing an advisor starts rather than continues, so it sits
           * above the queue instead of inside it. Same dialog as the
           * submissions list — one component, so the plan links cannot drift
           * between the two screens.
           */}
          <InviteClientButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-7">
        <SectionHeading title="Assessments and reviews" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map((t) => {
            const accounts = t.includesAccounts ? (dormant ?? []) : [];
            /**
             * A tile only opens when there is something to show. A count of
             * zero that still invites a click would be a promise the panel
             * cannot keep.
             */
            const drillable = t.items.length > 0 || accounts.length > 0;
            const open = openTile === t.key;
            const body = (
              <>
                <div className="text-[10.5px] font-bold uppercase leading-snug tracking-[0.08em] text-muted-foreground">
                  {t.key}
                </div>
                <div
                  className={`mt-1.5 text-[27px] font-extrabold tabular-nums tracking-tight ${
                    t.alert
                      ? "text-amber-700 dark:text-amber-300"
                      : t.value === 0
                        ? "text-muted-foreground"
                        : ""
                  }`}
                >
                  {t.value}
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                  {t.footnote}
                </div>
                {drillable ? (
                  <div className="mt-1 text-[11px] font-semibold text-muted-foreground underline underline-offset-2">
                    {open ? "hide" : "show"}
                  </div>
                ) : null}
              </>
            );
            const shell = `rounded-xl border p-4 text-center shadow-sm ${
              t.alert ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-card"
            }`;
            return drillable ? (
              <button
                key={t.key}
                type="button"
                aria-expanded={open}
                onClick={() => setOpenTile((v) => (v === t.key ? null : t.key))}
                className={`${shell} transition-colors ${
                  open
                    ? "border-primary/60 ring-1 ring-primary/30"
                    : t.alert
                      ? "hover:border-amber-500"
                      : "hover:border-primary/50"
                }`}
              >
                {body}
              </button>
            ) : (
              <div key={t.key} className={shell}>
                {body}
              </div>
            );
          })}
        </div>

        {tiles.map((t) => {
          if (openTile !== t.key) return null;
          const accounts = t.includesAccounts ? (dormant ?? []) : [];
          return (
            <div key={t.key} className="mt-3 space-y-3">
              {t.items.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[11.5px] text-muted-foreground">
                    {plural(t.items.length, "assessment", "assessments")} counted in{" "}
                    <b className="text-foreground">{t.key.toLowerCase()}</b>
                  </p>
                  <Queue items={t.items} empty="" />
                </div>
              ) : null}
              {accounts.length > 0 ? <DormantAccounts accounts={accounts} /> : null}
            </div>
          );
        })}

        <SectionHeading title="Needs you" note="nothing moves until you act" />
        <Queue items={needs} empty="Nothing is waiting on you. Genuinely — not a placeholder." />

        <SectionHeading
          title="Waiting on the client"
          note="you are not the blocker, but silence still loses clients"
        />
        <Queue items={waiting} empty="No client is mid-assessment." />

        <SectionHeading title="Finished" note="reviews marked final" />
        <Queue items={done} empty="No review has been marked final yet." />

        {notes.length > 0 ? (
          <>
            <SectionHeading title="Worth a look" />
            <div className="grid gap-2.5 md:grid-cols-2">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 rounded-r-xl border-l-[3px] p-3.5 ${
                    n.info ? "border-l-slate-400 bg-muted/40" : "border-l-amber-500 bg-amber-500/5"
                  }`}
                >
                  <span className="min-w-[26px] text-[18px] font-extrabold leading-tight tabular-nums">
                    {n.count}
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-foreground/80">{n.text}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Client accounts with no assessment against them.
 *
 * Shown in full rather than summarised, because the count on its own invites a
 * conclusion the rows usually contradict: most of these are seed and test
 * accounts. "Never signed in" is the tell — an account created by the admin
 * tools that nobody ever logged into is not a person who stalled.
 */
function DormantAccounts({ accounts }: { accounts: ClientAccountRow[] }) {
  const neverSignedIn = accounts.filter((a) => !a.last_sign_in_at).length;
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold">Accounts with no assessment</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {plural(accounts.length, "account", "accounts")}, oldest first · {neverSignedIn} never
            signed in
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/clients">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Manage accounts
          </Link>
        </Button>
      </div>
      <ul className="divide-y divide-border/60">
        {accounts.map((a) => (
          <li
            key={a.user_id}
            className="grid gap-1 px-4 py-2.5 text-[12.5px] md:grid-cols-[2fr_1fr_1fr] md:items-center"
          >
            <span className="truncate font-medium">{a.email ?? "—"}</span>
            <span className="text-muted-foreground">
              signed up {a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}
            </span>
            <span
              className={
                a.last_sign_in_at ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"
              }
            >
              {a.last_sign_in_at
                ? `last signed in ${new Date(a.last_sign_in_at).toLocaleDateString()}`
                : "never signed in"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <h2 className="mb-2.5 mt-7 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground first:mt-1">
      {title}
      {note ? (
        <span className="ml-2 text-[11px] font-normal normal-case italic tracking-normal text-muted-foreground/70">
          — {note}
        </span>
      ) : null}
    </h2>
  );
}

function Queue({ items, empty }: { items: QueueItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-5 text-[13px] italic text-muted-foreground shadow-sm">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {items.map((i, index) => (
        <div
          key={i.id}
          className={`grid items-center gap-3 px-4 py-3.5 md:grid-cols-[1.6fr_1.15fr_0.75fr_auto] ${
            index > 0 ? "border-t border-border/60" : ""
          }`}
        >
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">
              {i.company}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide ${
                  i.plan === "full"
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i.plan === "full" ? "full service" : "objective"}
              </span>
            </div>
            {i.meta ? (
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">{i.meta}</div>
            ) : null}
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            {i.stage}
            {i.stageStrong ? <b className="text-foreground">{i.stageStrong}</b> : null}
          </div>
          <div
            className={`text-[12.5px] tabular-nums ${
              i.days > 14
                ? "text-red-700 dark:text-red-300"
                : i.days > 7
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground"
            }`}
          >
            waiting <b>{plural(i.days, "day", "days")}</b>
          </div>
          <div className="flex flex-wrap justify-start gap-2 md:justify-end">
            {i.secondary ? (
              <ActionButton submissionId={i.id} action={i.secondary} variant="outline" />
            ) : null}
            <ActionButton submissionId={i.id} action={i.action} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButton({
  submissionId,
  action,
  variant,
}: {
  submissionId: string;
  action: QueueAction;
  variant?: "outline";
}) {
  if (action.to === "plan") {
    return (
      <Button asChild size="sm" variant={variant}>
        <Link to="/advisor/plan/$submissionId" params={{ submissionId }}>
          <ListChecks className="mr-1.5 h-3.5 w-3.5" />
          {action.label}
        </Link>
      </Button>
    );
  }
  if (action.to === "advisory") {
    return (
      <Button asChild size="sm" variant={variant}>
        <Link to="/advisor/$submissionId" params={{ submissionId }}>
          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
          {action.label}
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant={variant}>
      <Link to="/admin/results/$submissionId" params={{ submissionId }}>
        {action.label}
      </Link>
    </Button>
  );
}
