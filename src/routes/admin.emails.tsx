/**
 * Admin · Emails — the standard wording of everything Kriterion sends.
 *
 * Admins own the wording, advisors send it. When an advisor sends to a
 * particular client the draft opens pre-filled from here and can be changed for
 * that one email without touching the template.
 *
 * The preview beside the editor renders through the same `splitBody` /
 * `fillTags` the send path will use, filled from a real submission rather than
 * invented sample text — a template that reads well against made-up values and
 * badly against a real record is the whole failure mode this screen exists to
 * catch. Tags with nothing real behind them are left visible as tags and said
 * so in plain words, never quietly blanked.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Mail, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BackOfficeNav } from "@/components/back-office-nav";
import { requireAdminAuth } from "@/lib/require-admin-auth";
import { listEmailTemplates, saveEmailTemplate } from "@/lib/email-templates.functions";
import { getSendingStatus, sendTestEmail, type SendingStatus } from "@/lib/email-send.functions";
import {
  BUTTON_MARKER,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_META,
  fillTags,
  isDefaultWording,
  splitBody,
  unknownTags,
  type EmailTemplate,
  type EmailTemplateKey,
} from "@/lib/email-templates";
import { buildConfig, computeValuation, type ScoringConfig } from "@/lib/valscore_calc";
import { buildOpportunities, totalOpportunity, type SectionMeta } from "@/lib/score-display";
import { getActiveInviteCodes } from "@/lib/client-invites.functions";
import {
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";

export const Route = createFileRoute("/admin/emails")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdminAuth(location.href),
  head: () => ({ meta: [{ title: "Admin · Emails" }] }),
  component: EmailTemplatesPage,
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

/** What the preview can fill in, and what it honestly cannot. */
type PreviewValues = {
  values: Record<string, string>;
  /** Plain-language reason a template's tags are not all filled, if any. */
  caveat: string | null;
};

type SubmissionRow = {
  submission_id: string;
  company_name: string;
  advisor_status: string;
  plan: string;
  valuation_input_type: string | null;
  valuation_input_amount: number | null;
};

type ResponseRow = {
  submission_id: string;
  section_id: string | null;
  questionnaire_type: string | null;
  points_awarded: number | null;
};

type QuestionRow = {
  section_id: string;
  questionnaire_type: string;
  max_score: number | null;
};

function EmailTemplatesPage() {
  const load = useServerFn(listEmailTemplates);
  const save = useServerFn(saveEmailTemplate);
  const loadSendingStatus = useServerFn(getSendingStatus);
  const sendTest = useServerFn(sendTestEmail);
  const loadInviteCodes = useServerFn(getActiveInviteCodes);

  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [current, setCurrent] = useState<EmailTemplateKey>("invite");
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [preview, setPreview] = useState<PreviewValues>({ values: {}, caveat: null });
  const [showTags, setShowTags] = useState(false);
  const [sending, setSending] = useState<SendingStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  /* ---------------- templates ---------------- */

  useEffect(() => {
    let cancelled = false;
    load()
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
        setDraft(rows.find((r) => r.key === "invite") ?? null);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not load the templates");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /**
   * Whether anything can actually be sent. Asked rather than assumed, so the
   * test button is never offered when pressing it could only fail.
   */
  useEffect(() => {
    let cancelled = false;
    loadSendingStatus()
      .then((status) => {
        if (!cancelled) setSending(status);
      })
      .catch(() => {
        if (!cancelled) {
          setSending({ hasToken: false, hasAccount: false, missingSender: [], ready: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadSendingStatus]);

  async function onSendTest() {
    if (!draft) return;
    setTesting(true);
    try {
      const result = await sendTest({ data: { key: draft.key, to: testTo.trim() || null } });
      toast.success(`Cloudflare accepted it for ${result.to}.`, {
        description: result.detail || "It returned no detail.",
        duration: 30000,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the test");
    } finally {
      setTesting(false);
    }
  }

  function selectTemplate(key: EmailTemplateKey) {
    if (!templates) return;
    setCurrent(key);
    setJustSaved(false);
    setDraft(templates.find((t) => t.key === key) ?? EMAIL_TEMPLATE_DEFAULTS[key]);
  }

  const saved = templates?.find((t) => t.key === current) ?? null;

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return (
      draft.fromName !== saved.fromName ||
      (draft.fromEmail ?? "") !== (saved.fromEmail ?? "") ||
      draft.subject !== saved.subject ||
      draft.body !== saved.body ||
      draft.ctaLabel !== saved.ctaLabel
    );
  }, [draft, saved]);

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await save({
        data: {
          key: draft.key,
          fromName: draft.fromName,
          fromEmail: draft.fromEmail,
          subject: draft.subject,
          body: draft.body,
          ctaLabel: draft.ctaLabel,
        },
      });
      setTemplates((prev) => (prev ?? []).map((t) => (t.key === result.key ? result : t)));
      setDraft(result);
      setJustSaved(true);
      toast.success("Saved. Every email of this kind now uses this wording.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function onRevert() {
    if (!draft) return;
    setDraft({ ...EMAIL_TEMPLATE_DEFAULTS[draft.key] });
    setJustSaved(false);
  }

  function insertTag(tag: string) {
    const field = document.getElementById("template-body") as HTMLTextAreaElement | null;
    if (!field || !draft) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const next = draft.body.slice(0, start) + tag + draft.body.slice(end);
    setDraft({ ...draft, body: next });
    setJustSaved(false);
    window.requestAnimationFrame(() => {
      field.focus();
      field.selectionStart = start + tag.length;
      field.selectionEnd = start + tag.length;
    });
  }

  /* ---------------- preview values from a real record ---------------- */

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      const origin = typeof window === "undefined" ? "" : window.location.origin;

      const [subsRes, responsesRes, questionsRes, sectionsRes, bandsRes, multiplesRes] =
        await Promise.all([
          supabase
            .from("submissions")
            .select(
              "submission_id,company_name,advisor_status,plan,valuation_input_type,valuation_input_amount",
            )
            .order("updated_at", { ascending: false }),
          supabase
            .from("responses")
            .select("submission_id,section_id,questionnaire_type,points_awarded"),
          supabase
            .from("questions")
            .select("section_id,questionnaire_type,max_score")
            .eq("active", true),
          supabase
            .from("sections")
            .select("section_id,section_name,questionnaire_type,sort_order")
            .eq("active", true),
          supabase.from("score_bands").select("band_type,min_score,max_score,label"),
          supabase.from("valuation_multiples").select("band_index,nfi_multiple,ebitda_multiple"),
        ]);
      if (cancelled) return;

      const questions = (questionsRes.data ?? []) as QuestionRow[];
      const objectiveQuestions = questions.filter(
        (q) => q.questionnaire_type === "objective",
      ).length;

      const values: Record<string, string> = {};
      if (objectiveQuestions > 0) values["{{total}}"] = String(objectiveQuestions);

      // The invite link is a real active code, not a shape of one.
      try {
        const codes = await loadInviteCodes();
        if (cancelled) return;
        const full = codes.links.find((l) => l.plan === "full") ?? codes.links[0];
        if (full) values["{{link}}"] = `${origin}/invite?code=${full.code}`;
      } catch {
        // An advisor without the codes still gets a usable screen.
      }

      const submissions = (subsRes.data ?? []) as SubmissionRow[];
      const responses = (responsesRes.data ?? []) as ResponseRow[];
      const sections = (sectionsRes.data ?? []) as SectionMeta[];

      let config: ScoringConfig | null = null;
      if (!bandsRes.error && !multiplesRes.error) {
        config = buildConfig(bandsRes.data ?? [], multiplesRes.data ?? []);
      }

      /**
       * The most recently reviewed submission that actually carries advisory
       * answers. Without both, any ValScore shown would be the objective half
       * alone — the same trap the client summary and the dashboard guard.
       */
      const reviewed = submissions.find((s) => {
        if (s.advisor_status !== "submitted" && s.advisor_status !== "final") return false;
        return responses.some(
          (r) => r.submission_id === s.submission_id && r.questionnaire_type === "advisory",
        );
      });

      let caveat: string | null = null;

      if (reviewed && config) {
        const own = responses.filter((r) => r.submission_id === reviewed.submission_id);
        const computed = computeValuation(
          own,
          questions,
          {
            valuationInputType:
              (reviewed.valuation_input_type as "netfeeincome" | "ebitda" | null) ??
              DEFAULT_VALUATION_INPUT_TYPE,
            valuationInputAmount: Number(
              reviewed.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT,
            ),
            targetValuation: 0,
          },
          config,
        );
        const plan = reviewed.plan === "objective" ? "objective" : "full";
        const opportunities = buildOpportunities(sections, computed.sectionScores, plan);

        values["{{company}}"] = reviewed.company_name;
        values["{{valscore}}"] = String(Math.round(computed.valScore));
        values["{{band}}"] = computed.adjusted.marketPosition.toLowerCase();
        values["{{opportunity}}"] = String(totalOpportunity(opportunities));
        if (opportunities.length > 0) {
          values["{{top_area}}"] = opportunities[0].name;
          values["{{top_points}}"] = String(Math.round(opportunities[0].totalGap));
        }

        const problemsRes = await supabase
          .from("submission_problems")
          .select("id")
          .eq("submission_id", reviewed.submission_id);
        if (cancelled) return;
        const problemIds = ((problemsRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);
        let actionCount = 0;
        if (problemIds.length > 0) {
          const curesRes = await supabase
            .from("submission_cures")
            .select("id")
            .in("submission_problem_id", problemIds);
          if (cancelled) return;
          actionCount = (curesRes.data ?? []).length;
        }
        values["{{action_count}}"] = String(actionCount);
      } else {
        caveat =
          "No reviewed submission carries advisory answers yet, so the score, the opportunity and the company name are shown as tags rather than filled in.";
      }

      if (cancelled) return;
      setPreview({ values, caveat });
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [loadInviteCodes]);

  /* ---------------- render ---------------- */

  if (!templates || !draft) {
    return (
      <main className="min-h-screen">
        <BackOfficeNav active={"emails"} />
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-sm text-muted-foreground">Loading the templates…</p>
        </div>
      </main>
    );
  }

  const meta = EMAIL_TEMPLATE_META[draft.key];
  const blocks = splitBody(draft.body);
  const buttonMissing = !blocks.some((b) => b.kind === "button");
  const strayTags = unknownTags(`${draft.subject}\n${draft.body}`, draft.key);

  /**
   * `{{advisor_name}}` is the sender name from the From line — the same name a
   * client sees the message come from — so the preview must track the field
   * above it rather than a stored value.
   */
  const previewValues: Record<string, string> = {
    ...preview.values,
    "{{advisor_name}}": draft.fromName,
  };
  if (draft.key === "password_reset" && typeof window !== "undefined") {
    previewValues["{{link}}"] = `${window.location.origin}/reset-password`;
  }

  const fill = (text: string) => (showTags ? text : fillTags(text, previewValues));

  return (
    <main className="min-h-screen">
      <BackOfficeNav active={"emails"} />

      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
          <h1 className="text-lg font-semibold tracking-tight">Emails</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The standard wording for everything Kriterion sends. Saving here changes the default for
            everyone; an advisor sending to one client still gets a draft they can change for that
            email alone.
          </p>
        </div>
      </header>

      {sending && !sending.ready ? (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="text-[12.5px] leading-relaxed">
              <p className="font-medium">
                Nothing can be sent yet. You can still write the wording.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {[
                  !sending.hasAccount || !sending.hasToken
                    ? "Kriterion has no credentials for the sending service."
                    : null,
                  sending.missingSender.length > 0
                    ? `${sending.missingSender.length} of ${EMAIL_TEMPLATE_KEYS.length} templates have no sender address.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* template list */}
        <nav className="h-fit overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {EMAIL_TEMPLATE_KEYS.map((key) => {
            const t = templates.find((row) => row.key === key) ?? EMAIL_TEMPLATE_DEFAULTS[key];
            const edited = !isDefaultWording(t);
            const on = key === current;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectTemplate(key)}
                className={`block w-full border-b border-border px-4 py-3 text-left last:border-b-0 transition-colors ${
                  on ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{EMAIL_TEMPLATE_META[key].name}</span>
                  {edited && (
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        on ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      edited
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] ${
                    on ? "text-primary-foreground/75" : "text-muted-foreground"
                  }`}
                >
                  {EMAIL_TEMPLATE_META[key].when}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* editor */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">{meta.name}</h2>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label
                    htmlFor="from-name"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Sender name
                  </Label>
                  <Input
                    id="from-name"
                    className="mt-1.5"
                    value={draft.fromName}
                    onChange={(e) => {
                      setDraft({ ...draft, fromName: e.target.value });
                      setJustSaved(false);
                    }}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="from-email"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Sender address
                  </Label>
                  <Input
                    id="from-email"
                    type="email"
                    className="mt-1.5"
                    placeholder="not set yet"
                    value={draft.fromEmail ?? ""}
                    onChange={(e) => {
                      setDraft({ ...draft, fromEmail: e.target.value || null });
                      setJustSaved(false);
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Replies go to this address, so it should be a mailbox someone reads. It must also be
                one the sending service has been verified to send from — until that is set up,
                nothing can leave the app whatever is typed here.
              </p>

              <div>
                <Label
                  htmlFor="template-subject"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Subject line
                </Label>
                <Input
                  id="template-subject"
                  className="mt-1.5"
                  value={draft.subject}
                  onChange={(e) => {
                    setDraft({ ...draft, subject: e.target.value });
                    setJustSaved(false);
                  }}
                />
              </div>

              <div>
                <Label
                  htmlFor="template-body"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Body
                </Label>
                <Textarea
                  id="template-body"
                  className="mt-1.5 min-h-[300px] leading-relaxed"
                  value={draft.body}
                  onChange={(e) => {
                    setDraft({ ...draft, body: e.target.value });
                    setJustSaved(false);
                  }}
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Leave a blank line between paragraphs. The <code>{BUTTON_MARKER}</code> line is
                  where the button sits — move that line to move the button.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meta.tags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      title={t.describes}
                      onClick={() => insertTag(t.tag)}
                      className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[11px] text-foreground/80 transition-colors hover:bg-muted/60"
                    >
                      {t.tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label
                  htmlFor="template-cta"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Button label
                </Label>
                <Input
                  id="template-cta"
                  className="mt-1.5"
                  value={draft.ctaLabel}
                  onChange={(e) => {
                    setDraft({ ...draft, ctaLabel: e.target.value });
                    setJustSaved(false);
                  }}
                />
              </div>

              {(buttonMissing || strayTags.length > 0) && (
                <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  {buttonMissing && (
                    <p className="flex items-start gap-2 text-[12.5px] text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      There is no <code>{BUTTON_MARKER}</code> line, so this email would go out with
                      no button in it.
                    </p>
                  )}
                  {strayTags.length > 0 && (
                    <p className="flex items-start gap-2 text-[12.5px] text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {strayTags.join(", ")}{" "}
                      {strayTags.length === 1 ? "is not a tag" : "are not tags"} this email can fill
                      in. It would reach the client exactly as written.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-border bg-card px-5 py-3">
              <Button onClick={() => void onSave()} disabled={!dirty || busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={onRevert} disabled={busy}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Revert to the Kriterion default
              </Button>
              <Input
                aria-label="Send the test to"
                className="h-9 w-full sm:w-56"
                placeholder="your own address"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => void onSendTest()}
                disabled={testing || dirty || !sending?.ready || !draft.fromEmail}
                title={
                  !sending?.ready
                    ? "Sending is not switched on yet"
                    : dirty
                      ? "Save first, so the test matches what would go out"
                      : !draft.fromEmail
                        ? "This template has no sender address yet"
                        : undefined
                }
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {testing ? "Sending…" : testTo.trim() ? "Send a test" : "Send a test to myself"}
              </Button>
              <span
                className={`ml-auto text-[12.5px] ${
                  dirty ? "font-medium text-destructive" : "text-muted-foreground"
                }`}
              >
                {dirty
                  ? "Unsaved changes"
                  : justSaved
                    ? "Saved — every email of this kind now uses this wording"
                    : "No unsaved changes"}
              </span>
            </div>
          </section>

          {/* preview */}
          <section className="space-y-3">
            <div className="flex overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                aria-pressed={showTags}
                onClick={() => setShowTags(true)}
                className={`flex-1 px-3 py-2 text-[12px] transition-colors ${
                  showTags ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                }`}
              >
                Show the tags
              </button>
              <button
                type="button"
                aria-pressed={!showTags}
                onClick={() => setShowTags(false)}
                className={`flex-1 px-3 py-2 text-[12px] transition-colors ${
                  showTags ? "bg-card text-muted-foreground" : "bg-primary text-primary-foreground"
                }`}
              >
                Filled in with real data
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 bg-primary px-5 py-3 text-primary-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold tracking-[0.16em]">KRITERION</span>
              </div>
              <div className="border-b border-border px-5 pb-3 pt-4">
                <p className="text-[15px] font-semibold tracking-tight">{fill(draft.subject)}</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  from {draft.fromName} &lt;{draft.fromEmail ?? "address not set"}&gt;
                </p>
              </div>
              <div className="px-5 py-4">
                {blocks.length === 0 && (
                  <p className="text-[12.5px] text-destructive">
                    The body is empty, so there is nothing to send.
                  </p>
                )}
                {blocks.map((block, i) =>
                  block.kind === "button" ? (
                    <span
                      key={`button-${i}`}
                      className="mb-4 inline-block rounded-md bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground"
                    >
                      {fill(draft.ctaLabel)}
                    </span>
                  ) : (
                    <p
                      key={`p-${i}`}
                      className="mb-3 whitespace-pre-line text-[13.5px] leading-relaxed"
                    >
                      {fill(block.text)}
                    </p>
                  ),
                )}
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  Kriterion Business Value Intelligence · kriterionbvi.com
                  <br />
                  Reply to this message to reach your advisor directly.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card px-4 py-3 text-[12.5px] text-muted-foreground shadow-sm">
              <p>
                <span className="font-medium text-foreground">What is behind the tags.</span>{" "}
                {meta.note}
              </p>
              {preview.caveat && <p className="mt-2">{preview.caveat}</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
