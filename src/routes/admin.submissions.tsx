import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  LogOut,
  FileDown,
  Mail,
  Unlock,
  RotateCcw,
  ClipboardList,
  Eye,
  Pencil,
  CheckCircle2,
  ArrowUpDown,
  Link as LinkIcon,
  Check,
  KeyRound,
  Users,
} from "lucide-react";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import { generateSubmissionPdf } from "@/lib/generate-submission-pdf";
import { inviteClient, createTestClient, createAdvisor } from "@/lib/client-invites.functions";
import { resetClientPassword } from "@/lib/password-admin.functions";
import { TempPasswordDialog } from "@/components/temp-password-dialog";
import { listAllSubmissions, setAdvisorStatus } from "@/lib/advisor-submissions.functions";

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

const CLIENT_LOGIN_URL = "https://valscore.lovable.app";

function CopyClientLoginLinkButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(CLIENT_LOGIN_URL);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = CLIENT_LOGIN_URL;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) throw new Error("execCommand copy failed");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handleCopy()}
      aria-live="polite"
      aria-label="Copy client login link"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 mr-1.5" />
      ) : (
        <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
      )}
      {copied ? "Copied!" : "Copy client login link"}
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

function normalizeAdvisoryStatus(status: string | null | undefined): "notstarted" | "inprogress" | "submitted" | "final" {
  if (status === "submitted" || status === "final" || status === "inprogress") return status;
  return "notstarted";
}

const ADVISORY_STATUS_LABEL: Record<string, string> = {
  notstarted: "Not Started",
  inprogress: "In Progress",
  submitted: "Submitted",
  final: "Final",
};

// Sort order so null/notstarted/inprogress cluster together at the start.
const ADVISORY_SORT_ORDER: Record<string, number> = {
  notstarted: 0,
  inprogress: 1,
  submitted: 2,
  final: 3,
};

function AdvisoryStatusPill({ status }: { status: string }) {
  const norm = normalizeAdvisoryStatus(status);
  const tone =
    norm === "final"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : norm === "submitted"
        ? "bg-primary/10 text-primary border-primary/30"
        : norm === "inprogress"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tone}`}>
      <span className="opacity-60">Advisory</span>
      <span className="font-medium">{ADVISORY_STATUS_LABEL[norm]}</span>
    </span>
  );
}

function StartAdvisoryButton({
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
  const norm = normalizeAdvisoryStatus(advisorStatus);
  // submitted/final get specialized actions elsewhere — only show this when not yet submitted.
  if (norm === "submitted" || norm === "final") return null;
  const label = norm === "inprogress" ? "Resume advisory questionnaire" : "Complete advisory questionnaire";
  return (
    <Button size="sm" asChild>
      <Link to="/advisor/$submissionId" params={{ submissionId }}>
        <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
        {label}
      </Link>
    </Button>
  );
}

function ReviewAdvisoryButton({ submissionId }: { submissionId: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <Link
        to="/advisor/$submissionId"
        params={{ submissionId }}
        search={{ mode: "review" as const }}
      >
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        Review
      </Link>
    </Button>
  );
}

function EditAdvisoryButton({
  submissionId,
  onDone,
}: {
  submissionId: string;
  onDone: () => void;
}) {
  const setStatus = useServerFn(setAdvisorStatus);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function handle() {
    if (
      !window.confirm(
        "Reopen the advisory questionnaire for editing? You'll need to resubmit when finished.",
      )
    )
      return;
    setBusy(true);
    try {
      await setStatus({ data: { submissionId, status: "inprogress" } });
      onDone();
      navigate({ to: "/advisor/$submissionId", params: { submissionId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
      <Pencil className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Reopening…" : "Edit/Update Answers"}
    </Button>
  );
}

function MarkFinalButton({
  submissionId,
  onDone,
}: {
  submissionId: string;
  onDone: () => void;
}) {
  const setStatus = useServerFn(setAdvisorStatus);
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    try {
      await setStatus({ data: { submissionId, status: "final" } });
      toast.success("Marked as final");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark as final");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" onClick={() => void handle()} disabled={busy}>
      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Marking…" : "Mark as Final"}
    </Button>
  );
}

function ViewResultsButton({
  submissionId,
  clientStatus,
}: {
  submissionId: string;
  clientStatus: string;
}) {
  const ready = clientStatus === "submitted" || clientStatus === "complete";
  if (!ready) {
    return (
      <Button size="sm" variant="outline" disabled title="Awaiting client submission">
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        View results
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" asChild>
      <Link to="/admin/results/$submissionId" params={{ submissionId }}>
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        View results
      </Link>
    </Button>
  );
}

type FilterKey =
  | "all"
  | "awaiting_advisory"
  | "client_in_progress"
  | "not_started"
  | "adv_in_progress"
  | "adv_submitted"
  | "adv_submitted_not_final"
  | "adv_final";

type SortKey = "updated_desc" | "advisory_asc" | "advisory_desc" | "company_asc";

function AdminSubmissionsPage() {
  const navigate = useNavigate();
  const listAll = useServerFn(listAllSubmissions);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("updated_desc");

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

  function updateRow(submissionId: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((x) => (x.submission_id === submissionId ? { ...x, ...patch } : x)),
    );
  }

  const q = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (q && !r.company_name.toLowerCase().includes(q) && !r.submission_id.toLowerCase().includes(q)) {
        return false;
      }
      const adv = normalizeAdvisoryStatus(r.advisor_status);
      switch (filter) {
        case "awaiting_advisory":
          return (
            (r.client_status === "submitted" || r.client_status === "complete") &&
            adv !== "submitted" && adv !== "final"
          );
        case "client_in_progress":
          return r.client_status === "inprogress";
        case "not_started":
          return r.client_status === "notstarted";
        case "adv_in_progress":
          return adv === "inprogress" || adv === "notstarted";
        case "adv_submitted":
          return adv === "submitted";
        case "adv_submitted_not_final":
          return adv === "submitted";
        case "adv_final":
          return adv === "final";
        default:
          return true;
      }
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "advisory_asc":
        case "advisory_desc": {
          const av = ADVISORY_SORT_ORDER[normalizeAdvisoryStatus(a.advisor_status)] ?? 0;
          const bv = ADVISORY_SORT_ORDER[normalizeAdvisoryStatus(b.advisor_status)] ?? 0;
          if (av !== bv) return sort === "advisory_asc" ? av - bv : bv - av;
          return (b.updated_at || "").localeCompare(a.updated_at || "");
        }
        case "company_asc":
          return a.company_name.localeCompare(b.company_name);
        default:
          return (b.updated_at || "").localeCompare(a.updated_at || "");
      }
    });
    return sorted;
  }, [rows, q, filter, sort]);

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "awaiting_advisory", label: "Awaiting my advisory" },
    { key: "client_in_progress", label: "Client in progress" },
    { key: "not_started", label: "Not started" },
    { key: "adv_in_progress", label: "Advisory: In Progress" },
    { key: "adv_submitted", label: "Advisory: Submitted" },
    { key: "adv_submitted_not_final", label: "Submitted, not Final" },
    { key: "adv_final", label: "Advisory: Final" },
  ];

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "updated_desc", label: "Recently updated" },
    { key: "advisory_asc", label: "Advisory status ↑" },
    { key: "advisory_desc", label: "Advisory status ↓" },
    { key: "company_asc", label: "Company A–Z" },
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
            <CopyClientLoginLinkButton />
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/clients">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Clients
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/advisors">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Advisors
              </Link>
            </Button>

            <Button asChild variant="ghost" size="sm">
              <Link to="/">Home</Link>
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
        <CreateAdvisorCard />


        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <Input
            placeholder="Search by company name or submission ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((f) => (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
            <span className="ml-auto self-center text-[11px] text-muted-foreground">
              {filteredRows.length} of {rows.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> Sort
            </span>
            {sortOptions.map((s) => (
              <Button
                key={s.key}
                type="button"
                size="sm"
                variant={sort === s.key ? "secondary" : "ghost"}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rows.length === 0 ? "No submissions yet." : "No submissions match your search."}
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredRows.map((r) => {
              const adv = normalizeAdvisoryStatus(r.advisor_status);
              const isSubmitted = adv === "submitted";
              const isFinal = adv === "final";
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
                    <div className="flex items-center gap-2 text-[11px] shrink-0 flex-wrap justify-end">
                      <StatusPill label="Client" status={r.client_status} />
                      <AdvisoryStatusPill status={r.advisor_status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <StartAdvisoryButton
                      submissionId={r.submission_id}
                      clientStatus={r.client_status}
                      advisorStatus={r.advisor_status}
                    />
                    {(isSubmitted || isFinal) && (
                      <>
                        <ReviewAdvisoryButton submissionId={r.submission_id} />
                        <EditAdvisoryButton
                          submissionId={r.submission_id}
                          onDone={() => updateRow(r.submission_id, { advisor_status: "inprogress" })}
                        />
                        {isSubmitted && (
                          <MarkFinalButton
                            submissionId={r.submission_id}
                            onDone={() => updateRow(r.submission_id, { advisor_status: "final" })}
                          />
                        )}
                      </>
                    )}
                    {adv !== "notstarted" && (
                      <ResetAdvisorButton
                        submissionId={r.submission_id}
                        onDone={() => updateRow(r.submission_id, { advisor_status: "notstarted" })}
                      />
                    )}
                    <ViewResultsButton
                      submissionId={r.submission_id}
                      clientStatus={r.client_status}
                    />
                    {r.client_status === "submitted" && (
                      <UnlockButton
                        submissionId={r.submission_id}
                        onDone={(next) => updateRow(r.submission_id, { client_status: next })}
                      />
                    )}
                    <ResetButton
                      submissionId={r.submission_id}
                      onDone={() => updateRow(r.submission_id, { client_status: "notstarted" })}
                    />

                    {r.owner_user_id && (
                      <ResetClientPasswordButton submissionId={r.submission_id} />
                    )}
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
      toast.success(`Test client ready: ${trimmed}`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create test client");
    } finally {
      setBusy(false);
    }
  }

  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/client/auth` : "/client/auth";

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
          Creates a confirmed client account with an auto-generated temporary password shown once. Sign in at <code>/client/auth</code>.
        </p>
      </div>
      <div className="grid md:grid-cols-[1fr_auto] gap-3 md:items-end">
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
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? "Creating…" : "Create test client"}
        </Button>
      </div>
      <TempPasswordDialog
        open={open}
        onOpenChange={setOpen}
        email={result?.email ?? null}
        password={result?.tempPassword ?? null}
        loginUrl={loginUrl}
        title="Test client created"
      />
    </form>
  );
}


function CreateAdvisorCard() {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create advisor");
    } finally {
      setBusy(false);
    }
  }

  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth";

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
          Creates a confirmed advisor with an auto-generated temporary password shown once. They will be prompted to set a new password on first sign-in at <code>/auth</code>.
        </p>
      </div>
      <div className="grid md:grid-cols-[1fr_auto] gap-3 md:items-end">
        <div>
          <Label htmlFor="adv-email" className="text-xs uppercase tracking-wide text-muted-foreground">
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

function ResetAdvisorButton({
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
        "Reset advisor answers for this submission? All advisory responses will be cleared and status set back to Not started.",
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.rpc("advisor_reset_advisor_responses", {
      p_submission_id: submissionId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not reset");
      return;
    }
    toast.success("Advisor answers reset");
    onDone();
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Resetting…" : "Reset advisor answers"}
    </Button>
  );
}

  return (
    <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Resetting…" : "Reset client answers"}
    </Button>
  );
}

function ResetClientPasswordButton({ submissionId }: { submissionId: string }) {
  const reset = useServerFn(resetClientPassword);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string | null; tempPassword: string } | null>(null);

  async function handle() {
    if (
      !window.confirm(
        "Reset this client's password? They'll be signed out and will need the new temporary password to sign in.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await reset({ data: { submissionId } });
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
