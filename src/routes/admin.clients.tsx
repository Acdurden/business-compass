import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, LogOut, Trash2 } from "lucide-react";
import {
  listClientAccounts,
  resetClientPasswordByUserId,
  deleteClientAccount,
  type ClientAccountRow,
} from "@/lib/password-admin.functions";
import { TempPasswordDialog } from "@/components/temp-password-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";

async function requireAdvisorAuth(currentHref: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({ to: "/auth", search: { redirect: currentHref } });
  }
  const { data: isAdvisor } = await supabase.rpc("has_role", {
    _user_id: data.session.user.id,
    _role: "advisor",
  });
  if (!isAdvisor) {
    toast.error("Advisor role required");
    throw redirect({ to: "/login" });
  }
  return { userId: data.session.user.id };
}

export const Route = createFileRoute("/admin/clients")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  head: () => ({ meta: [{ title: "Admin · Clients" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const navigate = useNavigate();
  const list = useServerFn(listClientAccounts);
  const [rows, setRows] = useState<ClientAccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    list()
      .then((data) => {
        setRows(data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load clients");
        setLoading(false);
      });
  }, [list]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth" });
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
            <h1 className="text-lg font-semibold tracking-tight">Clients</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/submissions">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Submissions
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading clients…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No client accounts found.</p>
        ) : (
          <ul className="rounded-xl border border-border bg-card shadow-sm divide-y divide-border">
            {rows.map((r) => (
              <li key={r.user_id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.email ?? "(no email)"}</p>
                  {r.company_names.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {r.company_names.join(", ")}
                    </p>
                  )}
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                    {r.user_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ResetClientPasswordButton userId={r.user_id} email={r.email} />
                  <DeleteClientButton
                    userId={r.user_id}
                    email={r.email}
                    onDeleted={() => setRows((prev) => prev.filter((x) => x.user_id !== r.user_id))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ResetClientPasswordButton({ userId, email }: { userId: string; email: string | null }) {
  const reset = useServerFn(resetClientPasswordByUserId);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string | null; tempPassword: string } | null>(null);

  async function handle() {
    if (
      !window.confirm(
        `Generate a new temporary password for ${email ?? "this client"}? Their old password will stop working.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await reset({ data: { userId } });
      setResult({ email: res.email, tempPassword: res.tempPassword });
      setOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/client/auth` : "/client/auth";

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
        <KeyRound className="h-3.5 w-3.5 mr-1.5" />
        {busy ? "Resetting…" : "Reset password"}
      </Button>
      <TempPasswordDialog
        open={open}
        onOpenChange={setOpen}
        email={result?.email ?? null}
        password={result?.tempPassword ?? null}
        loginUrl={loginUrl}
        title="Client password reset"
      />
    </>
  );
}

function DeleteClientButton({
  userId,
  email,
  onDeleted,
}: {
  userId: string;
  email: string | null;
  onDeleted: () => void;
}) {
  const del = useServerFn(deleteClientAccount);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await del({ data: { userId } });
      toast.success(`Deleted ${email ?? "client"}`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete client");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        {busy ? "Deleting…" : "Delete"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete client account?"
        description={`This permanently deletes the account for ${email ?? "this client"}. Their submissions will be kept but detached from any user. This cannot be undone.`}
        confirmLabel="Delete account"
        destructive
        onConfirm={() => void handle()}
      />
    </>
  );
}
