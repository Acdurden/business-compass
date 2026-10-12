import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * The one sign-in screen, for clients, advisors and admins alike.
 *
 * There used to be a separate advisor sign-in at `/auth`. Since 12 October
 * 2026 that address forwards here, and this page sends each person on by role
 * after they sign in. The URL keeps its old name because every invite,
 * password-reset email and bookmark a client already holds points at it.
 */

const searchSchema = z.object({
  /** Where an advisor was heading when the route guard sent them here. */
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/client/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in" }] }),
  component: ClientAuthPage,
});

/** Only ever a page on this site, and never a sign-in page (that would loop). */
function advisorDestination(redirect: string | undefined) {
  if (!redirect) return "/advisor";
  try {
    const url = new URL(redirect, window.location.origin);
    if (url.origin !== window.location.origin) return "/advisor";
    if (url.pathname === "/auth" || url.pathname === "/client/auth") {
      return "/advisor";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/advisor";
  }
}

/**
 * Where a signed-in person belongs, or null for an account with neither role.
 * Client is checked first, as the old advisor sign-in did.
 */
async function destinationFor(user: User, redirect: string | undefined): Promise<string | null> {
  const mustChange = Boolean(user.user_metadata?.must_change_password);
  const { data: isClient, error: clientError } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "client",
  });
  if (clientError) throw clientError;
  if (isClient) return mustChange ? "/client/change-password" : "/client";
  const { data: isAdvisor, error: advisorError } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "advisor",
  });
  if (advisorError) throw advisorError;
  if (isAdvisor) return mustChange ? "/advisor/change-password" : advisorDestination(redirect);
  return null;
}

function ClientAuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "setpassword" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  // Detect invite/recovery tokens in URL hash and set the session.
  useEffect(() => {
    const hash = window.location.hash;
    if (
      hash.includes("access_token") ||
      hash.includes("type=invite") ||
      hash.includes("type=recovery")
    ) {
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
    // Already signed in: go straight to wherever this person belongs.
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session) return;
        const to = await destinationFor(data.session.user, redirect);
        if (to) navigate({ to });
      })
      .catch(() => {
        // Stay on the form; signing in again will surface any real error.
      });
  }, [navigate, redirect]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Sign in returned no user session.");
      const to = await destinationFor(data.user, redirect);
      if (!to) {
        await supabase.auth.signOut();
        throw new Error("This account does not have access yet. Contact your advisor.");
      }
      if (to.endsWith("/change-password")) {
        toast.message("Please set a new password to continue");
      } else {
        toast.success("Signed in");
      }
      navigate({ to });
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
      const { data } = await supabase.auth.getUser();
      const to = data.user ? await destinationFor(data.user, redirect) : null;
      navigate({ to: to ?? "/client" });
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
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Kriterion</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {mode === "setpassword"
              ? "Set your password"
              : mode === "forgot"
                ? "Reset your password"
                : "Sign in"}
          </h1>
        </div>

        {mode === "setpassword" ? (
          <form
            onSubmit={onSetPassword}
            className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
          >
            {!hasRecoverySession && (
              <p className="text-xs text-muted-foreground">Validating your invite link…</p>
            )}
            {email && (
              <p className="text-xs text-muted-foreground">
                Setting password for <span className="font-medium">{email}</span>
              </p>
            )}
            <div>
              <Label
                htmlFor="new-password"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
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
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={busy || !hasRecoverySession}
            >
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
              <Label
                htmlFor="forgot-email"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
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
      </div>
    </main>
  );
}
