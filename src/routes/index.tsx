import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Business Valuation Questionnaire" },
      {
        name: "description",
        content:
          "Get a data-driven estimate of your business's value in under 10 minutes.",
      },
    ],
  }),
  component: StartPage,
});

function shortCode() {
  return (
    Date.now().toString(36).slice(-4) +
    Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

function StartPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resumeId, setResumeId] = useState("");
  const [opening, setOpening] = useState(false);


  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) return;
    if (name.length > 200) {
      toast.error("Company name is too long");
      return;
    }
    setSubmitting(true);
    const submissionId = shortCode();
    const { error } = await supabase.from("submissions").insert({
      submission_id: submissionId,
      company_name: name,
      client_status: "inprogress",
    });
    setSubmitting(false);
    if (error) {
      toast.error("Could not start. Please try again.");
      console.error(error);
      return;
    }
    navigate({
      to: "/questionnaire/$submissionId",
      params: { submissionId },
    });
  }

  async function openSubmission(submissionId: string) {
    const trimmed = submissionId.trim();
    if (!trimmed) return;
    setOpening(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("submission_id,client_status")
      .eq("submission_id", trimmed)
      .maybeSingle();
    setOpening(false);
    if (error || !data) {
      toast.error("No submission found with that ID");
      return;
    }
    if (data.client_status === "complete") {
      navigate({ to: "/results/$submissionId", params: { submissionId: trimmed } });
    } else {
      navigate({ to: "/questionnaire/$submissionId", params: { submissionId: trimmed } });
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center text-sm font-semibold">
              V
            </div>
            <span className="font-semibold tracking-tight">Valuation</span>
          </div>
          <span className="text-xs text-muted-foreground">Confidential · ~10 min</span>
        </div>
      </header>

      <section className="flex-1 px-6 py-16">
        <div className="mx-auto w-full max-w-xl space-y-12">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              Business valuation questionnaire
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
              What is your business worth?
            </h1>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Answer 24 short questions across 9 areas of your business.
              We'll combine your responses with a single financial input to
              estimate your valuation.
            </p>

            <form
              onSubmit={handleStart}
              className="mt-10 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <Label htmlFor="company" className="text-sm font-medium">
                Company name
              </Label>
              <Input
                id="company"
                required
                maxLength={200}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Advisory Ltd."
                className="mt-2"
              />
              <Button
                type="submit"
                disabled={submitting || !companyName.trim()}
                className="mt-5 w-full"
                size="lg"
              >
                {submitting ? "Starting…" : "Begin questionnaire"}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Your answers are saved as you go.
              </p>
            </form>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Resume an existing submission
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void openSubmission(resumeId);
              }}
              className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
            >
              <div>
                <Label htmlFor="sid" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Submission ID
                </Label>
                <Input
                  id="sid"
                  value={resumeId}
                  onChange={(e) => setResumeId(e.target.value.toUpperCase())}
                  placeholder="e.g. 3Y5PWSI6JO"
                  className="mt-1.5 font-mono tracking-wider"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={opening || !resumeId.trim()}>
                {opening ? "Opening…" : "Open submission"}
              </Button>
            </form>
          </div>

        </div>
      </section>
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
      <span className="font-medium capitalize">
        {status.replace("inprogress", "in progress").replace("notstarted", "not started")}
      </span>
    </span>
  );
}
