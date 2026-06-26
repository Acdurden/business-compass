import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, FileDown, Mail, Unlock, RotateCcw, ClipboardList } from "lucide-react";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import { generateSubmissionPdf } from "@/lib/generate-submission-pdf";
import { inviteClient, createTestClient } from "@/lib/client-invites.functions";
import { listAllSubmissions } from "@/lib/advisor-submissions.functions";

function DownloadPdfButton({ submissionId }: { submissionId: string }) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    try {
      await generateSubmissionPdf(submissionId);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
      <FileDown className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Generating…" : "Download PDF"}
    </Button>
  );
}

export const Route = createFileRoute("/admin/submissions")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  head: () => ({
    meta: [{ title: "Admin · Submissions" }],
  }),
  component: AdminSubmissionsPage,
});

type Row = {
  submission_id: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  updated_at: string;
  owner_user_id: string | null;
  advisor_id: string | null;
};

function advisorPath(id: string) {
  return `/advisor/${id}`;
}

function AdvisoryButton({
  submissionId,
  clientStatus,
  advisorStatus,
}: {
  submissionId: string;
  clientStatus: string;
  advisorStatus: string;
}) {
  const ready = clientStatus === "submitted" || clientStatus === "complete";
  if (!ready) {
    return (
      <Button size="sm" variant="outline" disabled title="Awaiting client submission">
        <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
        Awaiting client submission
      </Button>
    );
  }
  const label =
    advisorStatus === "complete"
      ? "Review advisory answers"
      : advisorStatus === "inprogress"
        ? "Resume advisory questionnaire"
        : "Complete advisory questionnaire";
  return (
    <Button size="sm" asChild>
      <Link to="/advisor/$submissionId" params={{ submissionId }}>
        <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
        {label}
      </Link>
    </Button>
  );
}

type FilterKey = "all" | "awaiting_advisory" | "in_progress" | "complete" | "not_started";

function AdminSubmissionsPage() {
  const navigate = useNavigate();
  const listAll = useServerFn(listAllSubmissions);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth" });
  }

  useEffect(() => {
    listAll()
      .then((data) => {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load submissions");
        setLoading(false);
      });
  }, [listAll]);

  const q = search.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (q && !r.company_name.toLowerCase().includes(q) && !r.submission_id.toLowerCase().includes(q)) {
      return false;
    }
    switch (filter) {
      case "awaiting_advisory":
        return (
          (r.client_status === "submitted" || r.client_status === "complete") &&
          r.advisor_status !== "complete"
        );
      case "in_progress":
        return r.client_status === "inprogress";
      case "complete":
        return r.advisor_status === "complete";
      case "not_started":
        return r.client_status === "notstarted";
      default:
        return true;
    }
  });

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "awaiting_advisory", label: "Awaiting my advisory" },
    { key: "in_progress", label: "Client in progress" },
    { key: "not_started", label: "Not started" },
    { key: "complete", label: "Complete" },
  ];

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Admin
            </p>
            <h1 className="text-lg font-semibold tracking-tight">Submissions</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Client home</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/advisor">Advisor home</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Sign out
            </Button>
          </div>

        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <InviteClientCard />
        <CreateTestClientCard />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              return (
                <li
                  key={r.submission_id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.company_name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {r.submission_id}
                        {r.owner_user_id ? (
                          <span className="ml-2 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-sans uppercase tracking-wide text-primary">
                            Client account
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] shrink-0">
                      <StatusPill label="Client" status={r.client_status} />
                      <StatusPill label="Advisor" status={r.advisor_status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <AdvisoryButton
                      submissionId={r.submission_id}
                      clientStatus={r.client_status}
                      advisorStatus={r.advisor_status}
                    />
                    {r.client_status === "submitted" && (
                      <UnlockButton
                        submissionId={r.submission_id}
                        onDone={(next) =>
                          setRows((prev) =>
                            prev.map((x) =>
                              x.submission_id === r.submission_id
                                ? { ...x, client_status: next }
                                : x,
                            ),
                          )
                        }
                      />
                    )}
                    <ResetButton
                      submissionId={r.submission_id}
                      onDone={() =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.submission_id === r.submission_id
                              ? { ...x, client_status: "notstarted" }
                              : x,
                          ),
                        )
                      }
                    />
                    <DownloadPdfButton submissionId={r.submission_id} />
                  </div>
                </li>
              );
            })}

          </ul>
        )}
      </div>
    </main>
  );
}

function InviteClientCard() {
  const invite = useServerFn(inviteClient);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await invite({
        data: { email: trimmed, redirectTo: `${window.location.origin}/client/auth` },
      });
      toast.success(`Invite sent to ${trimmed}`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col md:flex-row md:items-end gap-3"
    >
      <div className="flex-1">
        <Label htmlFor="invite-email" className="text-xs uppercase tracking-wide text-muted-foreground">
          Invite a client
        </Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@example.com"
          className="mt-1.5"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Sends an email invite. The client sets their password and lands on the client portal.
        </p>
      </div>
      <Button type="submit" disabled={busy || !email.trim()}>
        <Mail className="h-3.5 w-3.5 mr-1.5" />
        {busy ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}

function CreateTestClientCard() {
  const create = useServerFn(createTestClient);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || password.length < 8) return;
    setBusy(true);
    try {
      await create({ data: { email: trimmed, password } });
      toast.success(`Test client ready: ${trimmed}`);
      setEmail("");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create test client");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-dashed border-border bg-card p-5 shadow-sm space-y-3"
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Create test client (no email)
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Creates a confirmed client account with the password you choose. Sign in at <code>/client/auth</code>.
        </p>
      </div>
      <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 md:items-end">
        <div>
          <Label htmlFor="test-email" className="text-xs uppercase tracking-wide text-muted-foreground">
            Email
          </Label>
          <Input
            id="test-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test-client@example.com"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="test-password" className="text-xs uppercase tracking-wide text-muted-foreground">
            Password (min 8)
          </Label>
          <Input
            id="test-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="choose a password"
            className="mt-1.5 font-mono"
          />
        </div>
        <Button type="submit" disabled={busy || !email.trim() || password.length < 8}>
          {busy ? "Creating…" : "Create test client"}
        </Button>
      </div>
    </form>
  );
}

function UnlockButton({
  submissionId,
  onDone,
}: {
  submissionId: string;
  onDone: (nextStatus: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    const { error } = await supabase.rpc("advisor_unlock_submission", {
      p_submission_id: submissionId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not unlock");
      return;
    }
    toast.success("Unlocked — client can edit again");
    onDone("inprogress");
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
      <Unlock className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Unlocking…" : "Unlock"}
    </Button>
  );
}

function ResetButton({
  submissionId,
  onDone,
}: {
  submissionId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    if (
      !window.confirm(
        "Reset this client's questionnaire? All of their objective answers will be cleared.",
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.rpc("advisor_reset_client_responses", {
      p_submission_id: submissionId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not reset");
      return;
    }
    toast.success("Client questionnaire reset");
    onDone();
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Resetting…" : "Reset client answers"}
    </Button>
  );
}







function StatusPill({ label, status }: { label: string; status: string }) {
  const tone =
    status === "complete"
      ? "bg-primary/10 text-primary border-primary/30"
      : status === "inprogress"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tone}`}
    >
      <span className="opacity-60">{label}</span>
      <span className="font-medium capitalize">
        {status
          .replace("inprogress", "in progress")
          .replace("notstarted", "not started")}
      </span>
    </span>
  );
}
