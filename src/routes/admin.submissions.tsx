import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, ExternalLink, LogOut } from "lucide-react";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";

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
};

function clientPath(id: string) {
  return `/questionnaire/${id}`;
}
function advisorPath(id: string) {
  return `/advisor/${id}`;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed");
  }
}

function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    void supabase
      .from("submissions")
      .select("submission_id,company_name,client_status,advisor_status,updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load submissions");
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, []);

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
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const cUrl = `${origin}${clientPath(r.submission_id)}`;
              const aUrl = `${origin}${advisorPath(r.submission_id)}`;
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
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] shrink-0">
                      <StatusPill label="Client" status={r.client_status} />
                      <StatusPill label="Advisor" status={r.advisor_status} />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <LinkBox
                      title="Client link"
                      subtitle="Objective questions"
                      url={cUrl}
                      to="/questionnaire/$submissionId"
                      submissionId={r.submission_id}
                    />
                    <LinkBox
                      title="Advisor link"
                      subtitle="Advisory questions"
                      url={aUrl}
                      to="/advisor/$submissionId"
                      submissionId={r.submission_id}
                    />
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

function LinkBox({
  title,
  subtitle,
  url,
  to,
  submissionId,
}: {
  title: string;
  subtitle: string;
  url: string;
  to: "/questionnaire/$submissionId" | "/advisor/$submissionId";
  submissionId: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copy(url, title)}
            title="Copy link"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" asChild title="Open">
            <Link to={to} params={{ submissionId }}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-[11px] font-mono text-muted-foreground break-all">
        {url}
      </p>
    </div>
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
