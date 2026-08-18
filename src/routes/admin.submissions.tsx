import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Link as LinkIcon,
  Check,
  KeyRound,
  Users,
  MoreHorizontal,
  ArrowRight,
  Trash2,
  ListChecks,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import { generateSubmissionPdf } from "@/lib/generate-submission-pdf";
import {
  getActiveInviteCodes,
  type InviteLink,
} from "@/lib/client-invites.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetClientPassword } from "@/lib/password-admin.functions";
import { TempPasswordDialog } from "@/components/temp-password-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  deleteSubmission,
  listAllSubmissions,
  setAdvisorStatus,
} from "@/lib/advisor-submissions.functions";

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
  plan: string;
  updated_at: string;
  owner_user_id: string | null;
  advisor_id: string | null;
};

function normalizeAdvisoryStatus(
  status: string | null | undefined,
): "notstarted" | "inprogress" | "submitted" | "final" {
  if (status === "submitted" || status === "final" || status === "inprogress")
    return status;
  return "notstarted";
}

const ADVISORY_STATUS_LABEL: Record<string, string> = {
  notstarted: "Not started",
  inprogress: "In progress",
  submitted: "Submitted",
  final: "Final",
};

const CLIENT_STATUS_LABEL: Record<string, string> = {
  notstarted: "Not started",
  inprogress: "In progress",
  submitted: "Submitted",
  complete: "Complete",
};

// -------------------------------------------------------------------------
// Pipeline logic — one place that decides, for a row, the plain-English next
// step and which single action is primary.
// -------------------------------------------------------------------------

type PrimaryKind =
  "awaiting_client" | "do_advisory" | "mark_final" | "view_results";

function clientReady(clientStatus: string): boolean {
  return clientStatus === "submitted" || clientStatus === "complete";
}

function derive(r: Row): { kind: PrimaryKind; next: string } {
  const adv = normalizeAdvisoryStatus(r.advisor_status);
  if (!clientReady(r.client_status)) {
    return r.client_status === "inprogress"
      ? {
          kind: "awaiting_client",
          next: "Client is completing their assessment.",
        }
      : {
          kind: "awaiting_client",
          next: "Waiting on the client to start their assessment.",
        };
  }
  if (adv === "notstarted")
    return { kind: "do_advisory", next: "Ready for your advisory interview." };
  if (adv === "inprogress")
    return {
      kind: "do_advisory",
      next: "Advisory in progress — resume when ready.",
    };
  if (adv === "submitted")
    return {
      kind: "mark_final",
      next: "Advisory submitted — review & finalize.",
    };
  return { kind: "view_results", next: "Complete — results ready to share." };
}

// Action-first ordering: rows that need the advisor float to the top.
function sortPriority(r: Row): number {
  const adv = normalizeAdvisoryStatus(r.advisor_status);
  if (
    clientReady(r.client_status) &&
    (adv === "notstarted" || adv === "inprogress")
  )
    return 0;
  if (adv === "submitted") return 1;
  if (r.client_status === "inprogress") return 2;
  if (r.client_status === "notstarted") return 3;
  if (adv === "final") return 5;
  return 4;
}

type FilterKey =
  | "all"
  | "awaiting_advisory"
  | "client_in_progress"
  | "submitted"
  | "not_started"
  | "adv_final";

function matchesFilter(r: Row, filter: FilterKey): boolean {
  const adv = normalizeAdvisoryStatus(r.advisor_status);
  switch (filter) {
    case "awaiting_advisory":
      return (
        clientReady(r.client_status) && adv !== "submitted" && adv !== "final"
      );
    case "client_in_progress":
      return r.client_status === "inprogress";
    case "submitted":
      return r.client_status === "submitted";
    case "not_started":
      return r.client_status === "notstarted";
    case "adv_final":
      return adv === "final";
    default:
      return true;
  }
}

// -------------------------------------------------------------------------
// Small presentational bits
// -------------------------------------------------------------------------

type Tone = "green" | "blue" | "amber" | "gray";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "green":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "blue":
      return "bg-primary/10 text-primary border-primary/30";
    case "amber":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function clientTone(status: string): Tone {
  return status === "complete"
    ? "green"
    : status === "submitted"
      ? "blue"
      : status === "inprogress"
        ? "amber"
        : "gray";
}

function advisoryTone(adv: string): Tone {
  return adv === "final"
    ? "green"
    : adv === "submitted"
      ? "blue"
      : adv === "inprogress"
        ? "amber"
        : "gray";
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${toneClass(
        tone,
      )}`}
    >
      <span className="opacity-60">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function InviteLinkRow({ link }: { link: InviteLink }) {
  const [copied, setCopied] = useState(false);
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://kriterionbvi.com";
  const url = `${origin}/invite?code=${link.code}`;

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
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
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {link.plan === "full" ? "Full service" : "Objective only"}
        </span>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {link.plan === "full"
            ? "Includes advisor review"
            : "Self-assessment only"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
          {copied ? (
            <Check className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
          )}
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function InviteClientButton({ links }: { links: InviteLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Mail className="h-3.5 w-3.5 mr-1.5" />
        Invite a client
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a client</DialogTitle>
            <DialogDescription>
              Share a link and the client sets up their own account &mdash; no
              password for you to relay.{" "}
              <b>The link you send decides their plan</b>, so pick the right
              one.
            </DialogDescription>
          </DialogHeader>
          {links.length > 0 ? (
            <div className="flex flex-col gap-2">
              {links.map((l) => (
                <InviteLinkRow key={l.code} link={l} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active invite link is configured yet.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            These are reusable sign-up links. A client&apos;s plan is fixed at
            sign-up and shown on their row.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

// -------------------------------------------------------------------------
// Row
// -------------------------------------------------------------------------

function SubmissionRow({
  r,
  onPatch,
  onDelete,
}: {
  r: Row;
  onPatch: (patch: Partial<Row>) => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const setStatus = useServerFn(setAdvisorStatus);
  const resetPw = useServerFn(resetClientPassword);
  const del = useServerFn(deleteSubmission);

  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    null | "reset_client" | "reset_advisor" | "delete"
  >(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwResult, setPwResult] = useState<{
    email: string | null;
    tempPassword: string;
  } | null>(null);

  const adv = normalizeAdvisoryStatus(r.advisor_status);
  const ready = clientReady(r.client_status);
  const { kind, next } = derive(r);

  async function markFinal() {
    setPending("final");
    try {
      await setStatus({
        data: { submissionId: r.submission_id, status: "final" },
      });
      toast.success("Marked as final");
      onPatch({ advisor_status: "final" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark as final",
      );
    } finally {
      setPending(null);
    }
  }

  async function reopenEdit() {
    if (
      !window.confirm(
        "Reopen the advisory questionnaire for editing? You'll need to resubmit when finished.",
      )
    )
      return;
    setPending("edit");
    try {
      await setStatus({
        data: { submissionId: r.submission_id, status: "inprogress" },
      });
      onPatch({ advisor_status: "inprogress" });
      navigate({
        to: "/advisor/$submissionId",
        params: { submissionId: r.submission_id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen");
    } finally {
      setPending(null);
    }
  }

  async function unlock() {
    setPending("unlock");
    const { error } = await supabase.rpc("advisor_unlock_submission", {
      p_submission_id: r.submission_id,
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "Could not unlock");
      return;
    }
    toast.success("Unlocked — client can edit again");
    onPatch({ client_status: "inprogress" });
  }

  async function resetClientAnswers() {
    setPending("reset_client");
    const { error } = await supabase.rpc("advisor_reset_client_responses", {
      p_submission_id: r.submission_id,
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "Could not reset");
      return;
    }
    toast.success("Client questionnaire reset");
    onPatch({ client_status: "notstarted" });
  }

  async function resetAdvisorAnswers() {
    setPending("reset_advisor");
    const { error } = await supabase.rpc("advisor_reset_advisor_responses", {
      p_submission_id: r.submission_id,
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "Could not reset");
      return;
    }
    toast.success("Advisor answers reset");
    onPatch({ advisor_status: "notstarted" });
  }

  async function resetPassword() {
    if (
      !window.confirm(
        "Reset this client's password? They'll be signed out and will need the new temporary password to sign in.",
      )
    )
      return;
    setPending("pw");
    try {
      const res = await resetPw({ data: { submissionId: r.submission_id } });
      setPwResult({ email: res.email, tempPassword: res.tempPassword });
      setPwOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not reset password",
      );
    } finally {
      setPending(null);
    }
  }

  async function downloadPdf() {
    setPending("pdf");
    try {
      await generateSubmissionPdf(r.submission_id);
    } catch (err) {
      console.error(err);
      toast.error("Could not generate PDF");
    } finally {
      setPending(null);
    }
  }

  async function deleteRow() {
    setPending("delete");
    try {
      await del({ data: { submissionId: r.submission_id } });
      toast.success("Submission deleted");
      onDelete();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete submission",
      );
    } finally {
      setPending(null);
    }
  }

  const pwLoginUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/client/auth`
      : "/client/auth";

  let primary: React.ReactNode;
  if (kind === "awaiting_client") {
    primary = (
      <Button size="sm" variant="outline" disabled className="opacity-70">
        <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
        Awaiting client
      </Button>
    );
  } else if (kind === "do_advisory") {
    primary = (
      <Button size="sm" asChild>
        <Link
          to="/advisor/$submissionId"
          params={{ submissionId: r.submission_id }}
        >
          <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
          {adv === "inprogress" ? "Resume advisory" : "Complete advisory"}
        </Link>
      </Button>
    );
  } else if (kind === "mark_final") {
    primary = (
      <Button
        size="sm"
        onClick={() => void markFinal()}
        disabled={pending === "final"}
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
        {pending === "final" ? "Marking…" : "Mark as Final"}
      </Button>
    );
  } else {
    primary = (
      <Button size="sm" asChild>
        <Link
          to="/admin/results/$submissionId"
          params={{ submissionId: r.submission_id }}
        >
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          View results
        </Link>
      </Button>
    );
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 md:grid md:grid-cols-[2.1fr_1.9fr_1.6fr_auto] md:items-center md:gap-4">
      {/* Company */}
      <div className="min-w-0">
        <p className="font-medium truncate flex items-center gap-2">
          <span className="truncate">{r.company_name}</span>
          <span
            className={
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
              (r.plan === "objective"
                ? "border-border bg-muted text-muted-foreground"
                : "border-primary/25 bg-primary/10 text-primary")
            }
            title={
              r.plan === "objective"
                ? "Objective only - self-assessment, no advisor review included"
                : "Full service - includes an advisor review"
            }
          >
            {r.plan === "objective" ? "Objective" : "Full service"}
          </span>
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span className="truncate">{r.submission_id}</span>
          {r.owner_user_id ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-sans uppercase tracking-wide text-primary">
              Account
            </span>
          ) : null}
        </p>
      </div>

      {/* Progress track */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill
          label="Client"
          value={CLIENT_STATUS_LABEL[r.client_status] ?? r.client_status}
          tone={clientTone(r.client_status)}
        />
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <Pill
          label="Advisory"
          value={ADVISORY_STATUS_LABEL[adv]}
          tone={advisoryTone(adv)}
        />
      </div>

      {/* Next step */}
      <p className="text-xs text-muted-foreground">{next}</p>

      {/* Action */}
      <div className="flex items-center gap-2 md:justify-end">
        {primary}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="px-2"
              disabled={pending !== null}
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              More actions
            </DropdownMenuLabel>

            {(adv === "submitted" || adv === "final") && (
              <DropdownMenuItem asChild>
                <Link
                  to="/advisor/$submissionId"
                  params={{ submissionId: r.submission_id }}
                  search={{ mode: "review" as const }}
                >
                  <Eye className="h-4 w-4" />
                  Review advisory
                </Link>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem asChild>
              <Link
                to="/advisor/plan/$submissionId"
                params={{ submissionId: r.submission_id }}
              >
                <ListChecks className="h-4 w-4" />
                Action plan
              </Link>
            </DropdownMenuItem>

            {ready && kind !== "view_results" && (
              <DropdownMenuItem asChild>
                <Link
                  to="/admin/results/$submissionId"
                  params={{ submissionId: r.submission_id }}
                >
                  <Eye className="h-4 w-4" />
                  View results
                </Link>
              </DropdownMenuItem>
            )}

            {(adv === "submitted" || adv === "final") && (
              <DropdownMenuItem onSelect={() => void reopenEdit()}>
                <Pencil className="h-4 w-4" />
                Edit / update answers
              </DropdownMenuItem>
            )}

            <DropdownMenuItem onSelect={() => void downloadPdf()}>
              <FileDown className="h-4 w-4" />
              Download PDF
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Client controls
            </DropdownMenuLabel>

            {r.client_status === "submitted" && (
              <DropdownMenuItem onSelect={() => void unlock()}>
                <Unlock className="h-4 w-4" />
                Unlock client
              </DropdownMenuItem>
            )}

            {r.owner_user_id && (
              <DropdownMenuItem onSelect={() => void resetPassword()}>
                <KeyRound className="h-4 w-4" />
                Reset password
              </DropdownMenuItem>
            )}

            {adv !== "notstarted" && (
              <DropdownMenuItem
                onSelect={() => setConfirm("reset_advisor")}
                className="text-destructive focus:text-destructive"
              >
                <RotateCcw className="h-4 w-4" />
                Reset advisor answers
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              onSelect={() => setConfirm("reset_client")}
              className="text-destructive focus:text-destructive"
            >
              <RotateCcw className="h-4 w-4" />
              Reset client answers
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setConfirm("delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete submission
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirm === "reset_client"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset client answers?"
        description="This will permanently clear all objective answers for this client. This action cannot be undone."
        confirmLabel="Reset client answers"
        destructive
        onConfirm={() => void resetClientAnswers()}
      />
      <ConfirmDialog
        open={confirm === "reset_advisor"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset advisor answers?"
        description="This will permanently clear all advisory responses and set the advisor status back to Not Started. This action cannot be undone."
        confirmLabel="Reset advisor answers"
        destructive
        onConfirm={() => void resetAdvisorAnswers()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this submission?"
        description={
          <>
            This permanently deletes{" "}
            {r.company_name ? <strong>{r.company_name}</strong> : "this"}
            &rsquo;s submission and all of its answers (objective and advisory).
            {r.owner_user_id
              ? " The client's login stays active, so they could start a new assessment."
              : ""}{" "}
            This cannot be undone.
          </>
        }
        confirmLabel="Delete submission"
        destructive
        onConfirm={() => void deleteRow()}
      />
      <TempPasswordDialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        email={pwResult?.email ?? null}
        password={pwResult?.tempPassword ?? null}
        loginUrl={pwLoginUrl}
        title="Client password reset"
      />
    </li>
  );
}

// -------------------------------------------------------------------------
// Summary tile
// -------------------------------------------------------------------------

function SummaryTile({
  num,
  label,
  active,
  accent,
  onClick,
}: {
  num: number;
  label: string;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      } ${active ? "ring-2 ring-primary/50" : "hover:bg-muted/40"}`}
    >
      <div
        className={`text-2xl font-bold leading-none tracking-tight ${accent ? "text-primary" : ""}`}
      >
        {num}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

function AdminSubmissionsPage() {
  const navigate = useNavigate();
  const listAll = useServerFn(listAllSubmissions);
  const getInviteCodes = useServerFn(getActiveInviteCodes);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
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
        toast.error(
          err instanceof Error ? err.message : "Failed to load submissions",
        );
        setLoading(false);
      });
  }, [listAll]);

  useEffect(() => {
    getInviteCodes()
      .then((res) => setInviteLinks(res.links ?? []))
      .catch(() => setInviteLinks([]));
  }, [getInviteCodes]);

  function updateRow(submissionId: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((x) =>
        x.submission_id === submissionId ? { ...x, ...patch } : x,
      ),
    );
  }

  function removeRow(submissionId: string) {
    setRows((prev) => prev.filter((x) => x.submission_id !== submissionId));
  }

  const q = search.trim().toLowerCase();
  const searched = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          r.company_name.toLowerCase().includes(q) ||
          r.submission_id.toLowerCase().includes(q),
      ),
    [rows, q],
  );

  const visible = useMemo(() => {
    const list = searched.filter((r) => matchesFilter(r, filter));
    return [...list].sort((a, b) => {
      const pa = sortPriority(a);
      const pb = sortPriority(b);
      if (pa !== pb) return pa - pb;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  }, [searched, filter]);

  const count = (f: FilterKey) =>
    rows.filter((r) => matchesFilter(r, f)).length;

  const chips: { key: FilterKey; label: string; n: number }[] = [
    { key: "all", label: "All", n: rows.length },
    {
      key: "awaiting_advisory",
      label: "Needs my advisory",
      n: count("awaiting_advisory"),
    },
    {
      key: "client_in_progress",
      label: "Client in progress",
      n: count("client_in_progress"),
    },
    { key: "submitted", label: "Submitted", n: count("submitted") },
    { key: "adv_final", label: "Final", n: count("adv_final") },
  ];

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Admin
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              Submissions
            </h1>
          </div>
          <div className="flex gap-2">
            <InviteClientButton links={inviteLinks} />
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
              <Link to="/admin/questionnaire">
                <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                Questionnaire
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Home</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile
            num={count("awaiting_advisory")}
            label="Awaiting your advisory"
            accent
            active={filter === "awaiting_advisory"}
            onClick={() =>
              setFilter((f) =>
                f === "awaiting_advisory" ? "all" : "awaiting_advisory",
              )
            }
          />
          <SummaryTile
            num={count("client_in_progress")}
            label="Client in progress"
            active={filter === "client_in_progress"}
            onClick={() =>
              setFilter((f) =>
                f === "client_in_progress" ? "all" : "client_in_progress",
              )
            }
          />
          <SummaryTile
            num={count("not_started")}
            label="Not started"
            active={filter === "not_started"}
            onClick={() =>
              setFilter((f) => (f === "not_started" ? "all" : "not_started"))
            }
          />
          <SummaryTile
            num={count("adv_final")}
            label="Final"
            active={filter === "adv_final"}
            onClick={() =>
              setFilter((f) => (f === "adv_final" ? "all" : "adv_final"))
            }
          />
        </div>

        {/* Toolbar */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <Input
            placeholder="Search by company name or submission ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <Button
                key={c.key}
                type="button"
                size="sm"
                variant={filter === c.key ? "default" : "outline"}
                onClick={() => setFilter(c.key)}
              >
                {c.label}
                <span className="ml-1.5 opacity-60">{c.n}</span>
              </Button>
            ))}
            <span className="ml-auto self-center text-[11px] text-muted-foreground">
              {visible.length} of {rows.length}
            </span>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No submissions yet."
              : "No submissions match your search."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="hidden border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[2.1fr_1.9fr_1.6fr_auto] md:gap-4">
              <div>Company</div>
              <div>Progress</div>
              <div>Next step</div>
              <div className="text-right">Action</div>
            </div>
            <ul className="divide-y divide-border">
              {visible.map((r) => (
                <SubmissionRow
                  key={r.submission_id}
                  r={r}
                  onPatch={(patch) => updateRow(r.submission_id, patch)}
                  onDelete={() => removeRow(r.submission_id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
