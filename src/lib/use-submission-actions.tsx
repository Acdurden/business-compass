/**
 * Every action an advisor can take on one submission, and the dialogs they
 * open.
 *
 * Moved out of the submissions row on 12 October 2026, when the "More actions"
 * dropdown was replaced by the submission sheet. The handler bodies are the
 * ones the dropdown called, unchanged; only where they live moved, so the row's
 * next-step button and the sheet run the same code.
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateSubmissionPdf } from "@/lib/generate-submission-pdf";
import { resetClientPassword } from "@/lib/password-admin.functions";
import { deleteSubmission, setAdvisorStatus } from "@/lib/advisor-submissions.functions";
import { setSubmissionTest } from "@/lib/research-desk.functions";
import type { AdvisorSubmissionRow } from "@/lib/advisor-submissions.functions";
import { TempPasswordDialog } from "@/components/temp-password-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SendEmailDialog } from "@/components/send-email-dialog";
import type { SubmissionView } from "@/lib/use-submission-directory";

export type SubmissionActionHandlers = {
  onPatch: (patch: Partial<AdvisorSubmissionRow>) => void;
  onDelete: () => void;
  onTestChange: (next: boolean) => void;
};

export function useSubmissionActions(r: SubmissionView, h: SubmissionActionHandlers) {
  const navigate = useNavigate();
  const setStatus = useServerFn(setAdvisorStatus);
  const resetPw = useServerFn(resetClientPassword);
  const del = useServerFn(deleteSubmission);
  const setTest = useServerFn(setSubmissionTest);

  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "reset_client" | "reset_advisor" | "delete">(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwResult, setPwResult] = useState<{
    email: string | null;
    tempPassword: string;
  } | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);

  async function markFinal() {
    setPending("final");
    try {
      await setStatus({
        data: { submissionId: r.submission_id, status: "final" },
      });
      toast.success("Marked as final");
      h.onPatch({ advisor_status: "final" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark as final");
    } finally {
      setPending(null);
    }
  }

  async function reopenEdit() {
    if (
      !window.confirm(
        "Reopen the advisory questionnaire for editing? You'll need to resubmit when finished.",
      )
    )
      return;
    setPending("edit");
    try {
      await setStatus({
        data: { submissionId: r.submission_id, status: "inprogress" },
      });
      h.onPatch({ advisor_status: "inprogress" });
      navigate({
        to: "/advisor/$submissionId",
        params: { submissionId: r.submission_id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen");
    } finally {
      setPending(null);
    }
  }

  async function unlock() {
    setPending("unlock");
    const { error } = await supabase.rpc("advisor_unlock_submission", {
      p_submission_id: r.submission_id,
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "Could not unlock");
      return;
    }
    toast.success("Unlocked. The client can edit again.");
    h.onPatch({ client_status: "inprogress" });
  }

  async function resetClientAnswers() {
    setPending("reset_client");
    const { error } = await supabase.rpc("advisor_reset_client_responses", {
      p_submission_id: r.submission_id,
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "Could not reset");
      return;
    }
    toast.success("Client questionnaire reset");
    h.onPatch({ client_status: "notstarted" });
  }

  async function resetAdvisorAnswers() {
    setPending("reset_advisor");
    const { error } = await supabase.rpc("advisor_reset_advisor_responses", {
      p_submission_id: r.submission_id,
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "Could not reset");
      return;
    }
    toast.success("Advisor answers reset");
    h.onPatch({ advisor_status: "notstarted" });
  }

  async function resetPassword() {
    if (
      !window.confirm(
        "Reset this client's password? They'll be signed out and will need the new temporary password to sign in.",
      )
    )
      return;
    setPending("pw");
    try {
      const res = await resetPw({ data: { submissionId: r.submission_id } });
      setPwResult({ email: res.email, tempPassword: res.tempPassword });
      setPwOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setPending(null);
    }
  }

  async function toggleTest(next: boolean) {
    setPending("test");
    try {
      const res = await setTest({ data: { submissionId: r.submission_id, isTest: next } });
      h.onTestChange(res.isTest);
      toast.success(res.isTest ? "Marked as a test" : "Marked as a real assessment");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the test setting");
    } finally {
      setPending(null);
    }
  }

  async function downloadPdf() {
    setPending("pdf");
    try {
      await generateSubmissionPdf(r.submission_id);
    } catch (err) {
      console.error(err);
      toast.error("Could not generate PDF");
    } finally {
      setPending(null);
    }
  }

  async function deleteRow() {
    setPending("delete");
    try {
      await del({ data: { submissionId: r.submission_id } });
      toast.success("Submission deleted");
      h.onDelete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete submission");
    } finally {
      setPending(null);
    }
  }

  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/client/auth` : "/client/auth";

  /** The sign-in page every client uses. Their own email and password get them in. */
  async function copyLoginLink() {
    try {
      await navigator.clipboard.writeText(loginUrl);
      toast.success("Client login link copied");
    } catch {
      toast.error(`Could not copy. The link is ${loginUrl}`);
    }
  }

  /**
   * "Resend invite". Every submission belongs to someone who already accepted
   * their invite and has an account, so the invite link itself is spent. What
   * reaches them is the reminder email, opened as a draft the advisor reads and
   * sends. Nothing goes out without that click.
   */
  function openReminder() {
    setReminderOpen(true);
  }

  function openAdvisory() {
    navigate({ to: "/advisor/$submissionId", params: { submissionId: r.submission_id } });
  }

  function openPlan() {
    navigate({ to: "/advisor/plan/$submissionId", params: { submissionId: r.submission_id } });
  }

  /** The one next step for this submission's stage, as its button reads in `STAGE`. */
  function runNext() {
    switch (r.stage) {
      case "invited":
        openReminder();
        return;
      case "client":
        void copyLoginLink();
        return;
      case "needs":
      case "advisory":
        openAdvisory();
        return;
      case "review":
        void markFinal();
        return;
      case "final":
        openPlan();
        return;
      case "complete":
        navigate({
          to: "/admin/results/$submissionId",
          params: { submissionId: r.submission_id },
        });
        return;
    }
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirm === "reset_client"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset client answers?"
        description="This will permanently clear all objective answers for this client. This action cannot be undone."
        confirmLabel="Reset client answers"
        destructive
        onConfirm={() => void resetClientAnswers()}
      />
      <ConfirmDialog
        open={confirm === "reset_advisor"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset advisor answers?"
        description="This will permanently clear all advisory responses and set the advisor status back to Not Started. This action cannot be undone."
        confirmLabel="Reset advisor answers"
        destructive
        onConfirm={() => void resetAdvisorAnswers()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this submission?"
        description={
          <>
            This permanently deletes {r.company_name ? <strong>{r.company_name}</strong> : "this"}
            &rsquo;s submission and all of its answers (objective and advisory).
            {r.owner_user_id
              ? " The client's login stays active, so they could start a new assessment."
              : ""}{" "}
            This cannot be undone.
          </>
        }
        confirmLabel="Delete submission"
        destructive
        onConfirm={() => void deleteRow()}
      />
      <TempPasswordDialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        email={pwResult?.email ?? null}
        password={pwResult?.tempPassword ?? null}
        loginUrl={loginUrl}
        title="Client password reset"
      />
      {reminderOpen ? (
        <SendEmailDialog
          open={reminderOpen}
          onOpenChange={setReminderOpen}
          templateKey="nudge"
          submissionId={r.submission_id}
          title={`Remind ${r.company_name || "this client"}`}
        />
      ) : null}
    </>
  );

  return {
    pending,
    runNext,
    markFinal,
    reopenEdit,
    unlock,
    resetPassword,
    toggleTest,
    downloadPdf,
    copyLoginLink,
    openReminder,
    askConfirm: setConfirm,
    dialogs,
  };
}
