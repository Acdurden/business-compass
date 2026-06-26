import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Advisor sign-in" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in, bounce away.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: redirect ?? "/admin/submissions" });
      }
    });
  }, [navigate, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: isClient } = await supabase.rpc("has_role", {
          _user_id: data.user!.id,
          _role: "client",
        });
        if (isClient) {
          toast.success("Signed in");
          navigate({ to: "/client" });
          return;
        }
        const { data: isAdvisor } = await supabase.rpc("has_role", {
          _user_id: data.user!.id,
          _role: "advisor",
        });
        if (!isAdvisor) {
          await supabase.auth.signOut();
          throw new Error("This account does not have advisor access.");
        }
        if (data.user?.user_metadata?.must_change_password) {
          toast.message("Please set a new password to continue");
          navigate({ to: "/advisor/change-password" });
          return;
        }
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (error) throw error;
        toast.success("Account created");
      }
      navigate({ to: redirect ?? "/admin/submissions" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Internal access
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Advisor sign-in" : "Create advisor account"}
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
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
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "Need to create the first advisor account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Client questionnaire?{" "}
          <Link to="/" className="underline">
            Go to client home
          </Link>
        </p>
      </div>
    </main>
  );
}
