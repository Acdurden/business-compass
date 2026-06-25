import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { requireAdvisorAuth } from "@/lib/require-advisor-auth";

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

function AdvisorEntryPage() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [opening, setOpening] = useState(false);
  const [recent, setRecent] = useState<RecentSubmission[]>([]);

  useEffect(() => {
    void supabase
      .from("submissions")
      .select("submission_id,company_name,client_status,advisor_status,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setRecent((data ?? []) as RecentSubmission[]));
  }, []);

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
            Open a client submission
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the submission ID your client received to begin the advisor
            questionnaire.
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
              autoFocus
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
