import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/client/change-password")({
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
  },
  head: () => ({ meta: [{ title: "Set a new password" }] }),
  component: ClientChangePasswordPage,
});

function ClientChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/client" });
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            First-time setup
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Choose a new password
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            For your security, please set your own password before continuing.
          </p>
        </div>
        <div>
          <Label htmlFor="pw" className="text-xs uppercase tracking-wide text-muted-foreground">
            New password
          </Label>
          <Input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoFocus
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="pw2" className="text-xs uppercase tracking-wide text-muted-foreground">
            Confirm new password
          </Label>
          <Input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            className="mt-1.5"
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </main>
  );
}
