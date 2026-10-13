/**
 * Advisor Calibration: the optional, separately available expert review.
 *
 * Agreed in the 10 October 2026 session (Adam, Dan, Andrew). The Business
 * Health Assessment is Product 1 and stands on its own: the client gets their
 * rating and findings when they finish. Advisor Calibration is Product 2. It is
 * never a required step and never the thing that unlocks results, so this page
 * says so plainly and asks for nothing.
 *
 * The button records interest the same way the old "Upgrade: Advisor review"
 * item did: a confirmation on screen, nothing stored. Wiring it to a real
 * request is a separate piece of work.
 */
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ClientShell,
  type ClientPlan,
  type ClientStage,
  type NavTarget,
} from "@/components/client-shell";
import { BRAND } from "@/lib/score-display";

export const Route = createFileRoute("/client/advisor-calibration")({
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
  head: () => ({ meta: [{ title: "Advisor Calibration" }] }),
  component: AdvisorCalibration,
});

type MySubmission = {
  submission_id: string;
  client_status: string;
  company_name: string;
};

function AdvisorCalibration() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<MySubmission | null>(null);
  const [plan, setPlan] = useState<ClientPlan>("objective");
  const [reviewed, setReviewed] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: session } = await supabase.auth.getSession();
      if (cancelled) return;
      setEmail(session.session?.user.email ?? "");
      const { data } = await supabase.rpc("get_my_client_submission");
      if (cancelled) return;
      const row = (data ?? [])[0] as MySubmission | undefined;
      if (!row) return;
      setSub(row);
      const { data: extra } = await supabase
        .from("submissions")
        .select("advisor_status,plan")
        .eq("submission_id", row.submission_id)
        .maybeSingle();
      if (cancelled) return;
      setPlan(extra?.plan === "objective" ? "objective" : "full");
      setReviewed(extra?.advisor_status === "submitted" || extra?.advisor_status === "final");
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

  const submitted = sub?.client_status === "submitted" || sub?.client_status === "complete";
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
      active="/client/advisor-calibration"
      onSignOut={signOut}
      onNavigate={(to: NavTarget) => navigate({ to })}
    >
      <div className="mx-auto max-w-[860px]">
        <div className="mb-[18px] text-center">
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: BRAND.muted }}>
            Optional · Available separately
          </p>
          <h1 className="mt-1 text-[23px] font-semibold tracking-tight">Advisor Calibration</h1>
          <p className="mt-1.5 text-[13.5px]" style={{ color: BRAND.muted }}>
            Not required to complete your assessment or see your findings.
          </p>
        </div>
        <section
          className="mb-4 rounded-[13px] border bg-white p-5"
          style={{ borderColor: "#e4e9ef" }}
        >
          <p className="max-w-[640px] text-[14px] leading-[1.65]">
            Your rating and findings stand on their own. Advisor Calibration adds an experienced
            advisor who reviews your answers with you, brings in context a questionnaire can&apos;t
            capture, and explores the findings that matter most for your plans.
          </p>
          <Button
            size="lg"
            className="mt-5"
            onClick={() => {
              setAsked(true);
              toast.info("We'll be in touch about Advisor Calibration.");
            }}
          >
            Ask about Advisor Calibration
          </Button>
          {asked ? (
            <p className="mt-3 text-[13px] font-semibold" style={{ color: BRAND.tealDark }}>
              Thanks. We&apos;ll be in touch about Advisor Calibration.
            </p>
          ) : null}
        </section>
      </div>
    </ClientShell>
  );
}
