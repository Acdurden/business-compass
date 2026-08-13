import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KRITERION_LOGO } from "@/assets/kriterionLogo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kriterion — Client sign-in" },
      {
        name: "description",
        content:
          "Sign in to your Kriterion client portal to start or continue your business valuation assessment.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in as a client, jump straight to /client.
  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: isClient } = await supabase.rpc("has_role", {
        _user_id: data.session.user.id,
        _role: "client",
      });
      if (isClient) navigate({ to: "/client" });
    });
  }, [navigate]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: isClient } = await supabase.rpc("has_role", {
        _user_id: data.user!.id,
        _role: "client",
      });
      if (!isClient) {
        await supabase.auth.signOut();
        throw new Error("This account is not a client account. Please use the advisor sign-in.");
      }
      if (data.user?.user_metadata?.must_change_password) {
        toast.message("Please set a new password to continue");
        navigate({ to: "/client/change-password" });
        return;
      }
      toast.success("Signed in");
      navigate({ to: "/client" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed. Please check your email and password.");
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
              Client portal
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Sign in to start or continue your business valuation assessment.
            </p>
          </div>

          <form
            onSubmit={onSignIn}
            className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
          >
            <div>
              <Label htmlFor="email" className="text-xs uppercase tracking-wide text-muted-foreground">
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
              <Label htmlFor="password" className="text-xs uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Advisor?{" "}
            <Link to="/auth" className="underline hover:text-foreground">
              Advisor sign-in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
