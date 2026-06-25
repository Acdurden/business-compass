import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
  // 10-char base36 token, easy to share
  return (
    Date.now().toString(36).slice(-4) +
    Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

function StartPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
          <span className="text-xs text-muted-foreground">
            Confidential · ~10 min
          </span>
        </div>
      </header>

      <section className="flex-1 grid place-items-center px-6 py-16">
        <div className="w-full max-w-xl">
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
              autoFocus
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
      </section>
    </main>
  );
}
