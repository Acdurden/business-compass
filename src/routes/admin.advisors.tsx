import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { redirect } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import {
  listAdvisorAccounts,
  resetAdvisorPassword,
  type AdvisorAccountRow,
} from "@/lib/password-admin.functions";
import { createAdvisor } from "@/lib/client-invites.functions";
import { TempPasswordDialog } from "@/components/temp-password-dialog";

async function requireAdminAuth(currentHref: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({ to: "/auth", search: { redirect: currentHref } });
  }
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: data.session.user.id,
    _role: "admin",
  });
  if (!isAdmin) {
    toast.error("Admin role required");
    throw redirect({ to: "/admin/submissions" });
  }
  return { userId: data.session.user.id };
}

export const Route = createFileRoute("/admin/advisors")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdminAuth(location.href),
  head: () => ({ meta: [{ title: "Admin · Advisors" }] }),
  component: AdvisorsPage,
});

function AdvisorsPage() {
  const navigate = useNavigate();
  const list = useServerFn(listAdvisorAccounts);
  const [rows, setRows] = useState<AdvisorAccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  function loadAdvisors() {
    setLoading(true);
    list()
      .then((data) => {
        setRows(data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load advisors");
        setLoading(false);
      });
  }

  useEffect(() => {
    loadAdvisors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <h1 className="text-lg font-semibold tracking-tight">Advisors</h1>
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

      <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
        <CreateAdvisorCard onCreated={loadAdvisors} />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading advisors…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No advisor accounts found.</p>
        ) : (
          <ul className="rounded-xl border border-border bg-card shadow-sm divide-y divide-border">
            {rows.map((r) => (
              <li key={r.user_id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate flex items-center gap-2">
                    {r.email ?? "(no email)"}
                    {r.is_admin && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                    {r.user_id}
                  </p>
                </div>
                <ResetAdvisorPasswordButton userId={r.user_id} email={r.email} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function CreateAdvisorCard({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createAdvisor);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await create({ data: { email: trimmed } });
      setResult({ email: res.email, tempPassword: res.tempPassword });
      setOpen(true);
      toast.success(`Advisor account ready: ${trimmed}`);
      setEmail("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create advisor");
    } finally {
      setBusy(false);
    }
  }

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-dashed border-primary/40 bg-card p-5 shadow-sm space-y-3"
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Create advisor account (no email)
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Creates a confirmed advisor with an auto-generated temporary password shown once. They
          will be prompted to set a new password on first sign-in at <code>/auth</code>.
        </p>
      </div>
      <div className="grid md:grid-cols-[1fr_auto] gap-3 md:items-end">
        <div>
          <Label
            htmlFor="adv-email"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Email
          </Label>
          <Input
            id="adv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="advisor@example.com"
            className="mt-1.5"
          />
        </div>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? "Creating…" : "Create advisor"}
        </Button>
      </div>
      <TempPasswordDialog
        open={open}
        onOpenChange={setOpen}
        email={result?.email ?? null}
        password={result?.tempPassword ?? null}
        loginUrl={loginUrl}
        title="Advisor account created"
      />
    </form>
  );
}

function ResetAdvisorPasswordButton({ userId, email }: { userId: string; email: string | null }) {
  const reset = useServerFn(resetAdvisorPassword);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string | null; tempPassword: string } | null>(null);

  async function handle() {
    if (
      !window.confirm(
        `Reset the password for ${email ?? "this advisor"}? They'll need the new temporary password to sign in.`,
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

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth";

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
        title="Advisor password reset"
      />
    </>
  );
}
