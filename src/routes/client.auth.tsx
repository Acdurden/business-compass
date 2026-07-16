import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/client/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Client sign-in" }] }),
  component: ClientAuthPage,
});

function ClientAuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "setpassword" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  // Detect invite/recovery tokens in URL hash and set the session.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token") || hash.includes("type=invite") || hash.includes("type=recovery")) {
      setMode("setpassword");
      // Supabase JS automatically parses the hash and persists the session.
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setHasRecoverySession(true);
          setEmail(data.session.user.email ?? "");
        }
      });
      return;
    }
    // If already signed in as a client, jump straight to /client.
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
        throw new Error("This account is not a client account. Use the advisor sign-in.");
      }
      if (data.user?.user_metadata?.must_change_password) {
        toast.message("Please set a new password to continue");
        navigate({ to: "/client/change-password" });
        return;
      }
      toast.success("Signed in");
      navigate({ to: "/client" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password set. You're signed in.");
      // Clean the hash so refresh doesn't re-trigger setup mode.
      window.history.replaceState(null, "", window.location.pathname);
      navigate({ to: "/client" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set password");
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/client/auth`,
      });
      if (error) throw error;
      toast.success("Password reset email sent. Check your inbox.");
      setMode("signin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Client portal
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {mode === "setpassword"
              ? "Set your password"
              : mode === "forgot"
                ? "Reset your password"
                : "Client sign-in"}
          </h1>
        </div>

        {mode === "setpassword" ? (
          <form
            onSubmit={onSetPassword}
            className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
          >
            {!hasRecoverySession && (
              <p className="text-xs text-muted-foreground">
                Validating your invite link…
              </p>
            )}
            {email && (
              <p className="text-xs text-muted-foreground">
                Setting password for <span className="font-medium">{email}</span>
              </p>
            )}
            <div>
              <Label htmlFor="new-password" className="text-xs uppercase tracking-wide text-muted-foreground">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy || !hasRecoverySession}>
              {busy ? "Saving…" : "Set password & continue"}
            </Button>
            <button
              type="button"
              onClick={() => {
                window.history.replaceState(null, "", window.location.pathname);
                setMode("signin");
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Already set your password? Sign in
            </button>
          </form>
        ) : mode === "forgot" ? (
          <form
            onSubmit={onForgot}
            className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
          >
            <p className="text-xs text-muted-foreground">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div>
              <Label htmlFor="forgot-email" className="text-xs uppercase tracking-wide text-muted-foreground">
                Email
              </Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="mt-1.5"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </form>
        ) : (
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
              {busy ? "Please wait…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Advisor?{" "}
          <Link to="/auth" className="underline">
            Advisor sign-in
          </Link>
        </p>
      </div>
    </main>
  );
}
