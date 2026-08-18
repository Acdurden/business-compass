import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    setIsRecovery(hash.get("type") === "recovery" || query.get("type") === "recovery");
  }, []);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setMessage("Password reset email sent. Check your inbox for the reset link.");
      toast.success("Password reset email sent");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not send reset email";
      setError(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast.success("Password updated");
      navigate({ to: "/auth" });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not update password";
      setError(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form
        onSubmit={isRecovery ? updatePassword : sendReset}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Account access
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {isRecovery ? "Choose a new password" : "Reset your password"}
          </h1>
        </div>

        {isRecovery ? (
          <>
            <div>
              <Label
                htmlFor="password"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                New password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label
                htmlFor="confirm"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Confirm new password
              </Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                className="mt-1.5"
              />
            </div>
          </>
        ) : (
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
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : isRecovery ? "Update password" : "Send reset email"}
        </Button>

        {message ? (
          <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
