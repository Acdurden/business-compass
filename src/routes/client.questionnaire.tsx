import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";

export const Route = createFileRoute("/client/questionnaire")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/client/auth" });
    const { data: isClient } = await supabase.rpc("has_role", {
      _user_id: data.session.user.id,
      _role: "client",
    });
    if (!isClient) throw redirect({ to: "/client/auth" });
  },
  head: () => ({ meta: [{ title: "Your assessment" }] }),
  component: ClientQuestionnaire,
});

function ClientQuestionnaire() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.rpc("get_my_client_submission").then(({ data }) => {
      const row = (data ?? [])[0] as
        | { client_token: string; client_status: string }
        | undefined;
      setToken(row?.client_token ?? null);
      setStatus(row?.client_status ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center text-sm">
        No assessment yet. <a className="underline ml-1" href="/client">Go to portal</a>
      </div>
    );
  }
  if (status === "submitted" || status === "complete") {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center text-sm">
        Your assessment has been submitted.{" "}
        <a className="underline ml-1" href="/client">Back to portal</a>
      </div>
    );
  }

  return (
    <QuestionnaireRunner
      mode="client"
      token={token}
      questionnaireType="objective"
      statusField="client_status"
      eyebrow="Your assessment"
      finishLabel="Submit"
      finishMode="submitlock"
      exitTo="/client"
      notFoundTo="/client"
      requireFinancialInput
    />
  );
}
