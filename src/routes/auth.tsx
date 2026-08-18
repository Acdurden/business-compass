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

const AUTH_TIMEOUT_MS = 15000;

function describeAuthError(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Authentication failed";
}

function withTimeout<T>(promise: PromiseLike<T>, label: string) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out. Please try again.`));
      }, AUTH_TIMEOUT_MS);
    }),
  ]);
}

function advisorDestination(redirect: string | undefined) {
  if (!redirect) return "/admin/submissions";
  try {
    const url = new URL(redirect, window.location.origin);
    if (url.origin !== window.location.origin) return "/admin/submissions";
    if (url.pathname === "/auth" || url.pathname === "/client/auth") {
      return "/admin/submissions";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin/submissions";
  }
}

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // If already signed in, bounce away.
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          navigate({ to: advisorDestination(redirect) });
        }
      })
      .catch((err) => {
        setAuthError(`Could not read existing session: ${describeAuthError(err)}`);
      });
  }, [navigate, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setAuthError(null);
    setStatus("Signing in…");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          "Sign in",
        );
        if (error) throw error;
        if (!data.user) throw new Error("Sign in returned no user session.");

        setStatus("Checking account access…");
        const { data: isClient, error: clientRoleError } = await supabase.rpc("has_role", {
          _user_id: data.user.id,
          _role: "client",
        });
        if (clientRoleError) throw clientRoleError;
        if (isClient) {
          toast.success("Signed in");
          setStatus("Opening client area…");
          await navigate({ to: "/client" });
          return;
        }
        const { data: isAdvisor, error: advisorRoleError } = await withTimeout(
          supabase.rpc("has_role", {
            _user_id: data.user.id,
            _role: "advisor",
          }),
          "Advisor access check",
        );
        if (advisorRoleError) throw advisorRoleError;
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
        setStatus("Opening advisor dashboard…");
      } else {
        const { error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + "/auth" },
          }),
          "Account creation",
        );
        if (error) throw error;
        toast.success("Account created");
      }
      await navigate({ to: advisorDestination(redirect) });
    } catch (err) {
      const message = describeAuthError(err);
      console.error("Advisor sign-in failed", err);
      setAuthError(message);
      toast.error(message);
    } finally {
      setStatus(null);
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
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? (status ?? "Please wait…") : mode === "signin" ? "Sign in" : "Create account"}
          </Button>

          {status ? (
            <p className="text-center text-xs text-muted-foreground" aria-live="polite">
              {status}
            </p>
          ) : null}

          {authError ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {authError}
            </p>
          ) : null}

          <p className="text-center text-[11px] text-muted-foreground">
            Advisor accounts are created by an existing advisor from the admin panel.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Can't get in?{" "}
          <Link to="/reset-password" className="underline">
            Reset your password
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Client questionnaire?{" "}
          <Link to="/login" className="underline">
            Go to client home
          </Link>
        </p>
      </div>
    </main>
  );
}
