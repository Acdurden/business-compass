import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KRITERION_LOGO } from "@/assets/kriterionLogo";
import { supabase } from "@/integrations/supabase/client";
import { registerClientViaInvite } from "@/lib/client-invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/invite")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  head: () => ({
    meta: [
      { title: "Kriterion — Set up your account" },
      {
        name: "description",
        content:
          "Set up your Kriterion client account to begin your confidential business valuation assessment.",
      },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const navigate = useNavigate();
  const { code } = Route.useSearch();
  const register = useServerFn(registerClientViaInvite);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords don't match");
      return;
    }
    setBusy(true);
    setExisting(false);
    try {
      const res = await register({ data: { code, email, password } });
      if (!res.ok) {
        // Account already exists for this email.
        setExisting(true);
        toast.message("You already have an account — please sign in.");
        return;
      }
      // Account created — sign them in and drop them into the portal.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Account created. Welcome to Kriterion.");
      navigate({ to: "/client" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <img src={KRITERION_LOGO} alt="Kriterion" className="h-6 w-auto" />
          <span className="text-xs text-muted-foreground">Confidential client portal</span>
        </div>
      </header>

      <section className="flex-1 px-6 py-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Client portal · set up your account
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
              Welcome to Kriterion
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Create your account to begin your confidential business valuation assessment. You'll
              use this email and password to sign back in anytime.
            </p>
          </div>

          {!code ? (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-center">
              <p className="text-sm text-foreground font-medium">This link is incomplete.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please use the full invite link your advisor sent you, or ask them to resend it.
              </p>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
            >
              <div>
                <Label
                  htmlFor="email"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label
                  htmlFor="password"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Create password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">At least 8 characters.</p>
              </div>
              <div>
                <Label
                  htmlFor="confirm"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Confirm password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1.5"
                />
              </div>

              {existing ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  An account already exists for this email.{" "}
                  <Link to="/client/auth" className="underline font-medium">
                    Sign in instead
                  </Link>
                  .
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "Creating your account…" : "Create account & continue"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Your information is confidential and reviewed only by your advisor.
              </p>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link to="/client/auth" className="underline hover:text-foreground">
              Client sign-in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
