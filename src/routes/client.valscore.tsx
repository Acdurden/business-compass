/**
 * ValScore — the advisor's assessment.
 *
 * Rebuilt 2026-09-17 to the approved mock. It decides nothing about its own
 * content: `loadClientReport` assembles the report and this file renders it, so
 * the screen and the PDF cannot disagree.
 *
 * Decisions this page is built to, all taken before it:
 *  - The buyer's lens leads. The client reads what a buyer would conclude
 *    before they read a number.
 *  - No band label as the headline. It sits quietly beside the score.
 *  - Money is rounded to the nearest ten thousand.
 *  - Advisor findings are framed as what a buyer does with the facts, never as
 *    corrections to the owner.
 *  - No second dollar figure. There is no "could be worth" number, because
 *    every honest version of it either uses an unvalidated model or expresses
 *    upside as points-to-perfection, and both overclaim.
 *  - No self-versus-advisor comparison. It reads as marking the owner down on
 *    their own business.
 *  - The target planner is gone from here. It set a target almost nobody
 *    reaches. `/client/objective-score` keeps its own.
 *
 * ONE OF TWO PRODUCTS, 2026-09-18. This page holds the advisor's work and
 * nothing else: their number, the valuation that follows from it, what a buyer
 * would conclude, the findings and the plan. The client's own answers and what
 * those are worth live on `/client/objective-score`, which is a finished
 * product needing no review. Nothing appears on both.
 */

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Download, Share2 } from "lucide-react";
import { ShareScoreDialog } from "@/components/share-score-dialog";
import { generateClientPdf } from "@/lib/generate-client-pdf";
import { BRAND, displayScore, formatCurrency, formatValuationRange } from "@/lib/score-display";
import { ValuationDisclaimer } from "@/components/valuation-disclaimer";
import {
  loadClientReport,
  round10k,
  verdictOrStandIn,
  type ClientReport,
  type ReportArea,
  type ReportFinding,
} from "@/lib/client-report";

export const Route = createFileRoute("/client/valscore")({
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
  head: () => ({ meta: [{ title: "ValScore" }] }),
  component: ClientSummary,
});

/* ------------------------------------------------------------------ */

function ClientSummary() {
  const navigate = useNavigate();
  const [report, setReport] = useState<ClientReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClientReport()
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "We couldn't load your results.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading your results…
      </div>
    );
  }

  if (error || !report) {
    return (
      <Shell onSignOut={signOut}>
        <Blocked
          title="Nothing to show yet"
          body={error ?? "We couldn't find your assessment."}
          onBack={() => navigate({ to: "/client" })}
        />
      </Shell>
    );
  }

  /*
   * This page is the ValScore and nothing else. It holds the advisor's work:
   * their number, the valuation that follows from it, what a buyer would
   * conclude, the findings and the plan. Everything the client's own answers
   * produce lives on `/client/objective-score`, which is a finished product in
   * its own right and needs no review to exist.
   *
   * So there is nothing to render until a review does. `reviewed` in
   * `client-report.ts` requires advisory answers to actually exist rather than
   * trusting a status flag, so a submission marked reviewed with a blank
   * advisory half lands here rather than reporting a collapsed ValScore.
   */
  if (!report.reviewed) {
    return (
      <Shell onSignOut={signOut} company={report.companyName}>
        <Blocked
          title={
            report.isObjectivePlan
              ? "A ValScore is not part of your assessment"
              : "Your ValScore is being prepared"
          }
          body={
            report.isObjectivePlan
              ? "Your Objective Score is finished and available now. A ValScore is a separate assessment: an advisor works the same eight areas against what a buyer would conclude from the same facts. Ask us about adding one."
              : "An advisor is working the same eight areas independently. Your Objective Score is finished and available now, and your ValScore arrives as a separate result."
          }
          onBack={() => navigate({ to: "/client/objective-score" })}
        />
      </Shell>
    );
  }

  return (
    <Shell
      onSignOut={signOut}
      company={report.companyName}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ShareValScoreButton report={report} />
          <DownloadPdfButton submissionId={report.submissionId} />
        </div>
      }
    >
      <ReportView report={report} />
    </Shell>
  );
}

/**
 * The same report, as a file they can keep.
 *
 * This page and the PDF are two renderings of one `ClientReport`, so there is
 * nothing here the document leaves out. It exists because the only route to
 * the file used to be the Complete screen at the end of the questionnaire: a
 * client who came back to their results later had no way to download anything.
 */
/**
 * Share the ValScore. The Objective Score page carries the same control for the
 * other product, and both open the one dialog so the two cards cannot drift.
 */
function ShareValScoreButton({ report }: { report: ClientReport }) {
  const [open, setOpen] = useState(false);
  const hasMoney = report.basisAmount != null && report.basisAmount > 0;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 bg-white"
        onClick={() => setOpen(true)}
      >
        <Share2 className="mr-1.5 h-3.5 w-3.5" />
        Share
      </Button>
      <ShareScoreDialog
        open={open}
        onOpenChange={setOpen}
        variant="valscore"
        score={report.score}
        company={report.companyName}
        midpoint={hasMoney ? report.midpoint : null}
        completedOn={report.completedOn}
      />
    </>
  );
}

function DownloadPdfButton({ submissionId }: { submissionId: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await generateClientPdf(submissionId);
    } catch {
      const { toast } = await import("sonner");
      toast.error("We couldn't build your PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 bg-white"
      onClick={() => void download()}
      disabled={busy}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {busy ? "Preparing…" : "Download your ValScore"}
    </Button>
  );
}

/* ------------------------------------------------------------------ */

function Shell({
  children,
  onSignOut,
  company,
  action,
}: {
  children: React.ReactNode;
  onSignOut: () => void | Promise<void>;
  company?: string;
  /** Right-hand control on the toolbar row. Absent on the blocked states. */
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen" style={{ background: "#eef1f5" }}>
      <header style={{ background: BRAND.navy }}>
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
          <span className="text-[15px] font-bold tracking-wide text-white">KRITERION</span>
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
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/client" })}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: BRAND.muted }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to your portal
          </button>
          {action ? <div className="ml-auto">{action}</div> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

function Blocked({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Button className="mt-5" onClick={onBack}>
        Back to your portal
      </Button>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
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

function ReportView({ report }: { report: ClientReport }) {
  const hasMoney = report.basisAmount != null && report.basisAmount > 0;
  const topArea = report.areas.slice().sort((a, b) => b.available - a.available)[0];

  return (
    <>
      {/* HERO */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-[30px] gap-y-4">
          <div className="min-w-[130px] shrink-0">
            <div
              className="text-[64px] font-extrabold leading-[0.9] tracking-[-2px]"
              style={{ color: BRAND.teal }}
            >
              {displayScore(report.score)}
            </div>
            <div
              className="mt-2 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: BRAND.muted }}
            >
              ValScore
            </div>
            {/*
             * The band label is deliberately absent. Andrew, 2026-09-18: the band
             * stays internal for now and appears in nothing a client reads.
             * `report.bandLabel` is still assembled, because the advisor screens
             * use it and because "for now" was the word used.
             */}
          </div>
          <div className="min-w-[15rem] flex-1">
            <p className="text-[14.5px] leading-relaxed" style={{ color: BRAND.ink }}>
              Your own answers across eight areas, reviewed by a Kriterion advisor against what a
              buyer would conclude from the same facts. This is a separate assessment from your
              Objective Score, built from different evidence, so the two will not match.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.muted }}>
              As we assess more agencies this will also show where you sit against them. Today the
              number stands on its own.
            </p>
          </div>
        </div>
      </Card>

      {/* VERDICT. Always rendered so the report keeps its shape, with a neutral
          stand-in when the advisor has written nothing. The stand-in makes no
          claim about this business. */}
      <Card title="What a buyer would conclude">
        <p className="max-w-[46ch] text-[17px] leading-[1.45]" style={{ color: BRAND.ink }}>
          {verdictOrStandIn(report)}
        </p>
      </Card>

      {/* VALUE */}
      <Card title="What the model supports today">
        <div
          className="grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3"
          style={{ borderColor: "#e4e9ef", background: "#e4e9ef" }}
        >
          <ValueCell
            k="Indicative value"
            v={hasMoney ? formatValuationRange(report.midpoint) : "Not yet priced"}
            s={
              hasMoney
                ? `Midpoint ${formatCurrency(round10k(report.midpoint))}. That is ${report.multiple.toFixed(2)} times the ${report.basisLabel} of ${formatCurrency(report.basisAmount ?? 0)} you gave us.`
                : "We do not have your income figure on file yet. Your advisor can add it and the figures will follow."
            }
          />
          <ValueCell
            k="What it rests on"
            v="Your answers, not your accounts"
            s="We have not seen your financials, contracts or client agreements."
          />
          <ValueCell
            k="What is holding it back"
            v={topArea && topArea.available > 0 ? topArea.name : "Nothing outstanding"}
            s={
              topArea && topArea.available > 0
                ? `${topArea.available} of the ${report.totalAvailable} points still available sit in this one area.`
                : "You have captured everything this assessment measures."
            }
          />
        </div>
      </Card>

      {/* FINDINGS */}
      {report.findings.length > 0 ? (
        <Card title="The things a buyer raises first">
          <div className="flex flex-col gap-3">
            {report.findings.map((f, i) => (
              <Finding key={`${f.area}-${i}`} finding={f} index={i} />
            ))}
          </div>
        </Card>
      ) : null}

      {/* AREAS */}
      <Card title="Where your points are, and where they are not">
        <div className="flex flex-col gap-1.5">
          {report.areas
            .slice()
            .sort((a, b) => b.available - a.available)
            .map((a) => (
              <AreaRow key={a.key} area={a} scale={Math.max(...report.areas.map((x) => x.total))} />
            ))}
        </div>
        <div
          className="mt-3.5 flex items-center justify-between border-t-2 pt-3"
          style={{ borderColor: "#e4e9ef" }}
        >
          <span
            className="text-[11.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: BRAND.muted }}
          >
            Still available across all eight areas
          </span>
          <span className="text-[16px] font-extrabold" style={{ color: BRAND.tealDark }}>
            {report.totalAvailable} points
          </span>
        </div>
      </Card>

      {/* PLAN */}
      {report.actions.length > 0 ? (
        <Card title="Your plan, in the order that moves the number most">
          <div className="flex flex-col gap-2.5">
            {report.actions.map((a, i) => (
              <div
                key={`${a.problem}-${i}`}
                className="rounded-lg border p-[14px_16px]"
                style={{ borderColor: "#e4e9ef" }}
              >
                <div
                  className="flex flex-wrap gap-x-3 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: BRAND.muted }}
                >
                  <span>{a.area ?? "Your plan"}</span>
                  {a.available != null && a.available > 0 ? (
                    <span style={{ color: BRAND.teal }}>{a.available} points available</span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[15px] font-semibold" style={{ color: BRAND.ink }}>
                  {a.problem}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed" style={{ color: BRAND.muted }}>
                  {a.action}
                </p>
              </div>
            ))}
          </div>
          {report.uncoveredAreas.length > 0 ? (
            <p
              className="mt-3 rounded-lg border border-dashed p-[12px_14px] text-[13px] leading-relaxed"
              style={{ borderColor: "#e4e9ef", color: BRAND.muted }}
            >
              <b style={{ color: BRAND.ink }}>
                {report.uncoveredAreas.length === 1
                  ? "One area has points available and nothing prescribed yet."
                  : `${report.uncoveredAreas.length} areas have points available and nothing prescribed yet.`}
              </b>{" "}
              {report.uncoveredAreas.join(", ")}. Your advisor will pick those up at the review
              conversation.
            </p>
          ) : null}
        </Card>
      ) : null}

      <ValuationDisclaimer hasRange={hasMoney} />

      {/*
       * Three states, because this page now serves two products. A reviewed
       * client has findings to talk through. A full-service client still waiting
       * has a ValScore coming and nothing to book yet. An objective-only client
       * has a finished product and an upsell, not a pending appointment.
       */}
      <div
        className="mt-[18px] flex flex-wrap items-center gap-4 rounded-[14px] p-[22px]"
        style={{ background: BRAND.navy }}
      >
        <div className="min-w-[16rem] flex-1">
          <p className="text-[16px] font-semibold text-white">Talk it through with your advisor</p>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "#c3d2df" }}>
            Forty-five minutes on the findings above, what a buyer would actually do with them, and
            which one to take on first.
          </p>
        </div>
        <Button
          className="shrink-0 bg-white text-[#0e1c2b] hover:bg-white/90"
          onClick={() => toastBook()}
        >
          Book the conversation
        </Button>
      </div>
    </>
  );
}

/**
 * Booking is not built. Saying so is better than a button that looks live and
 * does nothing, and better than hiding the call to action the whole page builds
 * towards.
 */
function toastBook() {
  import("sonner").then(({ toast }) => {
    toast.info("Your advisor will be in touch to arrange this.");
  });
}

function ValueCell({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="bg-white p-[16px_18px]">
      <div className="text-[10.5px] uppercase tracking-[0.11em]" style={{ color: BRAND.muted }}>
        {k}
      </div>
      <div
        className="mt-1.5 text-[19px] font-extrabold leading-[1.15] tracking-[-0.3px]"
        style={{ color: BRAND.navy }}
      >
        {v}
      </div>
      <div className="mt-1.5 text-[12.5px] leading-[1.45]" style={{ color: BRAND.muted }}>
        {s}
      </div>
    </div>
  );
}

function Finding({ finding, index }: { finding: ReportFinding; index: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "#e4e9ef" }}>
      <div
        className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b p-[14px_16px]"
        style={{ borderColor: "#eef2f6" }}
      >
        <span className="pt-0.5 text-[12px] font-bold" style={{ color: BRAND.teal }} aria-hidden>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3
          className="min-w-[12rem] flex-1 text-[15.5px] font-semibold leading-[1.3]"
          style={{ color: BRAND.ink }}
        >
          {finding.title}
        </h3>
        {finding.available > 0 ? (
          <span
            className="shrink-0 rounded px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
            style={{ background: "#fbf1dd", color: "#a56a12" }}
          >
            {finding.available} points
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2.5 p-[14px_16px]">
        {finding.evidence.length > 0 ? (
          <p className="text-[12.5px] leading-[1.55]" style={{ color: BRAND.muted }}>
            <b>What you told us in this area:</b> {finding.evidence.join("; ")}.
          </p>
        ) : null}
        {finding.consequence ? (
          <p
            className="border-l-2 pl-3.5 text-[14px] leading-relaxed"
            style={{ borderColor: "#e4e9ef", color: BRAND.ink }}
          >
            {finding.consequence}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AreaRow({ area, scale }: { area: ReportArea; scale: number }) {
  const pct = (n: number) => `${((n / Math.max(scale, 1)) * 100).toFixed(1)}%`;
  return (
    <div className="grid items-center gap-3 md:grid-cols-[13rem_1fr_3.5rem]">
      <span className="text-[13.5px]" style={{ color: BRAND.ink }}>
        {area.name}
      </span>
      <span
        className="flex h-[18px] overflow-hidden rounded-sm border"
        style={{ borderColor: "#eef2f6", background: "#f4f7f9" }}
      >
        <i style={{ width: pct(area.earned), background: BRAND.teal }} />
        <i style={{ width: pct(area.available), background: BRAND.teal, opacity: 0.2 }} />
      </span>
      <span
        className="text-[13px] font-semibold md:text-right"
        style={{ color: area.available > 0 ? BRAND.tealDark : BRAND.muted }}
      >
        {area.available > 0 ? `+${area.available}` : "—"}
      </span>
    </div>
  );
}
