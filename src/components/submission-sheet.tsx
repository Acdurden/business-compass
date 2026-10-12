/**
 * The submission sheet: everything an advisor can do on one submission, laid
 * out in the open instead of behind a "More actions" menu.
 *
 * Approved in `docs/admin-shell/admin-shell-preview.html`. Actions that do not
 * apply yet stay visible but disabled, with the reason beside them, so the
 * advisor learns what unlocks what instead of wondering where a button went.
 *
 * Every handler comes from `useSubmissionActions`, the same code the row's
 * next-step button runs.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  STAGE,
  clientReady,
  normalizeAdvisoryStatus,
  shortDate,
  stageDetail,
  type StageMeta,
} from "@/lib/submission-stage";
import { ownerLine, type SubmissionView } from "@/lib/use-submission-directory";
import { useSubmissionActions, type SubmissionActionHandlers } from "@/lib/use-submission-actions";

const PILL_TONE: Record<StageMeta["tone"], string> = {
  neutral: "bg-muted text-foreground/80",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  ok: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
};

export function StagePill({ stage }: { stage: SubmissionView["stage"] }) {
  const meta = STAGE[stage];
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs",
        PILL_TONE[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

export function TestPill() {
  return (
    <span className="inline-block rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:text-violet-200">
      Test
    </span>
  );
}

/**
 * The submission sheet. It keeps showing the last submission while it slides
 * shut, so the content does not blank out mid-animation.
 */
export function SubmissionSheet({
  submission,
  open,
  onOpenChange,
  admin,
  handlers,
}: {
  submission: SubmissionView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Delete is admin only. */
  admin: boolean;
  handlers: SubmissionActionHandlers;
}) {
  const [shown, setShown] = useState<SubmissionView | null>(submission);
  useEffect(() => {
    if (submission) setShown(submission);
  }, [submission]);

  return (
    <Sheet open={open && !!shown} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-[560px]"
      >
        {shown ? <SheetBody v={shown} admin={admin} handlers={handlers} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  v,
  admin,
  handlers,
}: {
  v: SubmissionView;
  admin: boolean;
  handlers: SubmissionActionHandlers;
}) {
  const navigate = useNavigate();
  const a = useSubmissionActions(v, handlers);
  const meta = STAGE[v.stage];
  const ready = clientReady(v.client_status);
  const adv = normalizeAdvisoryStatus(v.advisor_status);
  const advisoryOut = v.stage === "review" || v.stage === "final";
  const busy = a.pending !== null;
  const id = { submissionId: v.submission_id };

  const steps: Array<{ title: string; detail: string }> = [
    { title: "Invited", detail: v.invitedAt ? shortDate(v.invitedAt) : "Account created" },
    {
      title: "Founder Questionnaire",
      detail: ready ? "Submitted" : v.stage === "client" ? "In progress" : "Not started",
    },
    {
      title: "Advisory review",
      detail:
        v.plan === "objective" && !advisoryOut
          ? "Not on this plan"
          : advisoryOut
            ? "Done"
            : adv === "inprogress"
              ? "In progress"
              : "Not started",
    },
    {
      title: "Final and action plan",
      detail:
        v.stage === "final" || v.stage === "complete" ? shortDate(v.updated_at) : "After review",
    },
  ];

  const planReady = ready && (advisoryOut || v.plan === "objective");

  return (
    <>
      <SheetHeader className="space-y-3 border-b border-border bg-card px-[22px] py-[18px] text-left">
        <div className="pr-8">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            Submission {v.isTest ? <TestPill /> : null}
          </p>
          <SheetTitle className="mb-1 mt-0.5 text-[22px] font-semibold tracking-tight">
            {v.company_name || "Untitled company"}
          </SheetTitle>
          <SheetDescription className="text-[13.5px] text-foreground/80">
            {ownerLine(v)}. {stageDetail(v.stage, v.updated_at)}.
          </SheetDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={a.runNext} disabled={busy}>
            {a.pending === "final" ? "Marking…" : meta.next}
          </Button>
          {v.stage === "advisory" ? (
            <Button variant="outline" onClick={() => void a.markFinal()} disabled={busy}>
              Mark as final
            </Button>
          ) : null}
        </div>
        <ol aria-label="Progress" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {steps.map((s, i) => {
            const state = i < meta.step ? "done" : i === meta.step ? "now" : "next";
            return (
              <li
                key={s.title}
                aria-current={state === "now" ? "step" : undefined}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-xs",
                  state === "done" &&
                    "border-transparent bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
                  state === "now" && "border-transparent bg-primary text-primary-foreground",
                  state === "next" && "border-dashed border-border bg-card text-muted-foreground",
                )}
              >
                <b className="text-[12.5px] font-medium">{s.title}</b>
                {s.detail}
              </li>
            );
          })}
        </ol>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] pb-8 pt-[18px]">
        <ActionGroup title="Review" note="Everything an advisor does on this submission, in order.">
          <ActionRow
            label="Review client answers"
            note={ready ? "Read only" : "After the client submits"}
            disabled={!ready || busy}
            onClick={() =>
              navigate({ to: "/admin/results/$submissionId", params: id, hash: "client-answers" })
            }
          />
          {advisoryOut ? (
            <>
              <ActionRow
                label="Edit / update advisory answers"
                note="Reopens the advisory"
                disabled={busy}
                onClick={() => void a.reopenEdit()}
              />
              <ActionRow
                label="Review advisory answers"
                note="Read only"
                disabled={busy}
                onClick={() =>
                  navigate({
                    to: "/advisor/$submissionId",
                    params: id,
                    search: { mode: "review" as const },
                  })
                }
              />
            </>
          ) : (
            <ActionRow
              label={adv === "inprogress" ? "Continue advisory" : "Start advisory"}
              note={
                !ready
                  ? "After the client submits"
                  : v.plan === "objective"
                    ? "Not on this plan"
                    : ""
              }
              disabled={!ready || busy}
              onClick={() => navigate({ to: "/advisor/$submissionId", params: id })}
            />
          )}
          <ActionRow
            label="View results"
            note={!ready ? "After the client submits" : advisoryOut ? "Combined" : "Objective only"}
            disabled={!ready || busy}
            onClick={() => navigate({ to: "/admin/results/$submissionId", params: id })}
          />
          <ActionRow
            label="Action plan"
            note={!ready ? "After the client submits" : planReady ? "" : "After advisory"}
            disabled={!planReady || busy}
            onClick={() => navigate({ to: "/advisor/plan/$submissionId", params: id })}
          />
          <ActionRow
            label="Internal PDF"
            note={
              ready
                ? a.pending === "pdf"
                  ? "Generating…"
                  : "Download"
                : "After the client submits"
            }
            disabled={!ready || busy}
            onClick={() => void a.downloadPdf()}
          />
        </ActionGroup>

        <ActionGroup title="Client account" note={v.ownerEmail || "No email on file"}>
          <ActionRow
            label="Copy client login link"
            note="They sign in with their own email"
            disabled={busy}
            onClick={() => void a.copyLoginLink()}
          />
          <ActionRow
            label="Resend invite"
            note={ready ? "The client has submitted" : "A reminder email you review first"}
            disabled={ready || busy}
            onClick={a.openReminder}
          />
          <ActionRow
            label="Unlock questionnaire"
            note={
              v.client_status === "submitted"
                ? "Lets the client edit again"
                : ready
                  ? "Not available after review"
                  : "The client has not submitted"
            }
            disabled={v.client_status !== "submitted" || busy}
            onClick={() => void a.unlock()}
          />
          <ActionRow
            label="Reset password"
            note={v.owner_user_id ? "Issues a temporary password" : "No client account"}
            disabled={!v.owner_user_id || busy}
            onClick={() => void a.resetPassword()}
          />
        </ActionGroup>

        <ActionGroup title="Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <Fact label="Invited">
              {v.invitedAt
                ? shortDate(v.invitedAt)
                : v.accountCreatedAt
                  ? `Account created ${shortDate(v.accountCreatedAt)}`
                  : "Not recorded"}
            </Fact>
            <Fact label="Last update">{shortDate(v.updated_at)}</Fact>
            <Fact label="Status">{meta.label}</Fact>
            <Fact label="Advisor">{v.advisorLabel}</Fact>
            <Fact label="Plan">{v.plan === "objective" ? "Objective only" : "Full service"}</Fact>
            <Fact label="Submission ID">
              <span className="break-all font-mono text-[11.5px]">{v.submission_id}</span>
            </Fact>
          </dl>
        </ActionGroup>

        <section className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-[18px] py-4">
          <h3 className="text-[14.5px] font-semibold text-destructive">Danger zone</h3>
          <p className="mb-1 text-[12.5px] text-foreground/75">
            Each of these asks you to confirm and cannot be undone.
          </p>
          <DangerRow
            label="Reset advisor answers"
            note={adv === "notstarted" ? "Nothing to reset yet" : ""}
            disabled={adv === "notstarted" || busy}
            onClick={() => a.askConfirm("reset_advisor")}
          />
          <DangerRow
            label="Reset client answers"
            disabled={busy}
            onClick={() => a.askConfirm("reset_client")}
          />
          {admin ? (
            <DangerRow
              label="Delete submission"
              solid
              disabled={busy}
              onClick={() => a.askConfirm("delete")}
            />
          ) : null}
        </section>
      </div>
      {a.dialogs}
    </>
  );
}

function ActionGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card px-[18px] py-4">
      <h3 className="text-[14.5px] font-semibold">{title}</h3>
      {note ? <p className="mb-1 break-words text-[12.5px] text-muted-foreground">{note}</p> : null}
      {children}
    </section>
  );
}

function ActionRow({
  label,
  note,
  disabled,
  onClick,
}: {
  label: string;
  note?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-card"
    >
      <span>{label}</span>
      {note ? (
        <span className="ml-auto text-right text-xs text-muted-foreground">{note}</span>
      ) : null}
    </button>
  );
}

function DangerRow({
  label,
  note,
  solid,
  disabled,
  onClick,
}: {
  label: string;
  note?: string;
  solid?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        solid
          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          : "border border-destructive/40 bg-card text-destructive hover:bg-destructive/5",
      )}
    >
      <span>{label}</span>
      {note ? <span className="ml-auto text-xs opacity-80">{note}</span> : null}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
