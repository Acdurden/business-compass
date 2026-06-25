import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";

import { requireAdvisorAuth } from "@/lib/require-advisor-auth";

function shortCode() {
  return (
    Date.now().toString(36).slice(-4) +
    Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

export const Route = createFileRoute("/advisor/")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  component: AdvisorEntryPage,
});

type RecentSubmission = {
  submission_id: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  updated_at: string;
};

const PUBLISHED_CLIENT_ORIGIN = "https://valscore.lovable.app";

function getClientLinkOrigin() {
  const { origin, hostname } = window.location;
  const isLovableEditorPreview =
    hostname.includes("lovableproject.com") ||
    hostname.includes("lovable.app") && hostname.includes("preview");

  return isLovableEditorPreview ? PUBLISHED_CLIENT_ORIGIN : origin;
}

function AdvisorEntryPage() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [opening, setOpening] = useState(false);
  const [recent, setRecent] = useState<RecentSubmission[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(getClientLinkOrigin());
    loadRecent();
  }, []);

  async function loadRecent() {
    const { data } = await supabase
      .from("submissions")
      .select("submission_id,company_name,client_status,advisor_status,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    setRecent((data ?? []) as RecentSubmission[]);
  }

  async function open(submissionId: string) {
    const trimmed = submissionId.trim();
    if (!trimmed) return;
    setOpening(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("submission_id")
      .eq("submission_id", trimmed)
      .maybeSingle();
    setOpening(false);
    if (error || !data) {
      toast.error("No submission found with that ID");
      return;
    }
    navigate({ to: "/advisor/$submissionId", params: { submissionId: trimmed } });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) return;
    if (name.length > 200) {
      toast.error("Company name is too long");
      return;
    }
    setCreating(true);
    const submissionId = shortCode();
    const { data, error } = await supabase.rpc("start_client_submission", {
      p_submission_id: submissionId,
      p_company_name: name,
    });
    setCreating(false);
    if (error || !data) {
      toast.error("Could not create submission. Please try again.");
      console.error(error);
      return;
    }
    setCreatedToken(data as string);
    setCompanyName("");
    void loadRecent();
    toast.success("Submission created");
  }

  const clientUrl = createdToken ? `${origin}/q/${createdToken}` : "";

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Advisor portal
          </p>
          <Button variant="ghost" asChild size="sm">
            <Link to="/">Client view</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 pt-14 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create a client submission
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the company name to generate a new client link you can send
            to your client.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
        >
          <div>
            <Label htmlFor="company" className="text-xs uppercase tracking-wide text-muted-foreground">
              Company name
            </Label>
            <Input
              id="company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Advisory Ltd."
              maxLength={200}
              autoFocus
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={creating || !companyName.trim()} size="lg">
            {creating ? "Creating…" : "Create submission"}
          </Button>
        </form>

        {createdToken && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-3">
            <div>
              <p className="text-sm font-semibold text-primary">Client link ready</p>
              <p className="text-xs text-muted-foreground mt-1">
                Send this link to your client so they can begin the questionnaire.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-muted-foreground break-all flex-1">
                {clientUrl}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void copy(clientUrl, "Client link")}
                title="Copy link"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" asChild title="Open">
                <Link to="/q/$token" params={{ token: createdToken }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Open a client submission
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the submission ID to begin the advisor questionnaire.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void open(id);
          }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
        >
          <div>
            <Label htmlFor="sid" className="text-xs uppercase tracking-wide text-muted-foreground">
              Submission ID
            </Label>
            <Input
              id="sid"
              value={id}
              onChange={(e) => setId(e.target.value.toUpperCase())}
              placeholder="e.g. 3Y5PWSI6JO"
              className="mt-1.5 font-mono tracking-wider"
            />
          </div>
          <Button type="submit" disabled={opening || !id.trim()} size="lg">
            {opening ? "Opening…" : "Open submission"}
          </Button>
        </form>

        {recent.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Recent submissions
            </h2>
            <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {recent.map((s) => (
                <li key={s.submission_id}>
                  <button
                    type="button"
                    onClick={() => void open(s.submission_id)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/40 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.company_name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {s.submission_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] shrink-0">
                      <StatusPill label="Client" status={s.client_status} />
                      <StatusPill label="Advisor" status={s.advisor_status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed");
  }
}

function StatusPill({ label, status }: { label: string; status: string }) {
  const tone =
    status === "complete"
      ? "bg-primary/10 text-primary border-primary/30"
      : status === "inprogress"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tone}`}>
      <span className="opacity-60">{label}</span>
      <span className="font-medium capitalize">{status.replace("inprogress", "in progress").replace("notstarted", "not started")}</span>
    </span>
  );
}
