import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";
import { toast } from "sonner";

export const Route = createFileRoute("/q/$token")({
  ssr: false,
  component: ClientQuestionnaireByToken,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">Submission not found.</div>
  ),
});

function ClientQuestionnaireByToken() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("submissions")
      .select("submission_id")
      .eq("client_token", token)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setStatus("notfound");
          return;
        }
        setSubmissionId(data.submission_id);
        setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (status === "notfound") {
      toast.error("This link is invalid or has expired");
      navigate({ to: "/" });
    }
  }, [status, navigate]);

  if (status !== "ready" || !submissionId) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading questionnaire…
      </div>
    );
  }

  return (
    <QuestionnaireRunner
      submissionId={submissionId}
      questionnaireType="objective"
      statusField="client_status"
      eyebrow="Valuation questionnaire"
      finishLabel="See my results"
      exitTo="/"
      notFoundTo="/"
    />
  );
}
