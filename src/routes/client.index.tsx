import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, CheckCircle2, Clock, BarChart3, ListChecks } from "lucide-react";
import { toast } from "sonner";

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

function ClientHome() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<MySubmission | null>(null);
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

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Client portal
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              {email || "Welcome"}
            </h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign out
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-16">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sub === null || sub.client_status === "notstarted" ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Welcome to your business assessment
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              This short questionnaire helps us understand your business across
              the areas that matter most for valuation — from financials and
              operations to market position and growth potential. It takes about
              10–15 minutes, and your advisor will review your responses and
              follow up with personalised insights and next steps.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">10–15 minutes</p>
                  <p className="text-xs text-muted-foreground">Save as you go</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Key business areas</p>
                  <p className="text-xs text-muted-foreground">Finance, ops, market &amp; more</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Advisor review</p>
                  <p className="text-xs text-muted-foreground">Personalised follow-up</p>
                </div>
              </div>
            </div>

            <form
              onSubmit={startNew}
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
                {busy ? "Starting…" : "Begin Assessment"}
              </Button>
            </form>
          </div>
        ) : sub.client_status === "submitted" ||
          sub.client_status === "complete" ? (
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              Submitted
            </h2>
            <p className="mt-2 text-muted-foreground">
              Thank you — your assessment for{" "}
              <span className="font-medium text-foreground">
                {sub.company_name}
              </span>{" "}
              has been submitted. Your advisor will follow up with your
              results.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Continue your assessment
            </h2>
            <p className="mt-3 text-muted-foreground">
              {sub.company_name}
            </p>
            <Button
              size="lg"
              className="mt-8"
              onClick={() => navigate({ to: "/client/questionnaire" })}
            >
              Continue
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
