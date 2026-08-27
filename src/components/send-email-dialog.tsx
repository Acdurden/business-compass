/**
 * The compose window: one click opens a draft, the advisor reads it, edits it
 * if they want, and sends.
 *
 * Nothing in Kriterion sends on its own. The approved design was "one click,
 * you approve" — an automated nudge is a different product from an advisor who
 * chose to send something, and this is the screen that keeps the difference.
 *
 * The draft arrives with its tags already resolved, so what is on screen is
 * literally what leaves. There is no second substitution pass to disagree with
 * what was read.
 */

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getEmailDraft, sendComposedEmail, type EmailDraft } from "@/lib/email-compose.functions";
import type { EmailTemplateKey } from "@/lib/email-templates";

export function SendEmailDialog({
  open,
  onOpenChange,
  templateKey,
  submissionId,
  plan,
  title,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: EmailTemplateKey;
  submissionId?: string;
  /** Which invite link to use. Only meaningful for the invite email. */
  plan?: "full" | "objective";
  title: string;
  onSent?: () => void;
}) {
  const loadDraft = useServerFn(getEmailDraft);
  const send = useServerFn(sendComposedEmail);

  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  /** Defaults to the advisor's own first name; editable for this one message. */
  const [fromName, setFromName] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDraft(null);
    setError(null);
    loadDraft({
      data: { key: templateKey, submissionId: submissionId ?? null, plan: plan ?? null },
    })
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setTo(d.to ?? "");
        setSubject(d.subject);
        setBody(d.body);
        setFromName(d.fromName);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not build the draft");
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateKey, submissionId, plan, loadDraft]);

  async function onSend() {
    if (!draft) return;
    setSending(true);
    try {
      const result = await send({
        data: {
          key: draft.key,
          to: to.trim(),
          subject,
          body,
          fromName: fromName.trim(),
          ctaLabel: draft.ctaLabel,
          ctaUrl: draft.ctaUrl,
        },
      });
      toast.success(`Sent to ${result.to}.`, {
        description: result.detail || undefined,
        duration: 12000,
      });
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  const blocked = draft?.blocked ?? null;
  const ready = Boolean(draft) && !blocked && to.trim().length > 0 && subject.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Read it before it goes. Anything you change here applies to this one email only &mdash;
            the standard wording lives on the Emails screen.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !draft ? (
          <p className="text-sm text-muted-foreground">Building the draft…</p>
        ) : (
          <div className="space-y-4">
            {blocked && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12.5px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {blocked}
              </p>
            )}
            {!blocked && draft.warning && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2.5 text-[12.5px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {draft.warning}
              </p>
            )}

            <div>
              <Label
                htmlFor="send-from"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                From
              </Label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="send-from"
                  className="sm:max-w-[220px]"
                  value={fromName}
                  placeholder="Your name"
                  onChange={(e) => setFromName(e.target.value)}
                  disabled={Boolean(blocked)}
                />
                {/*
                 * The address is shown, never typed. Cloudflare authorises
                 * sending for the whole domain, so the address is a settled fact
                 * rather than a per-message choice, and a field would only
                 * create ways to fail.
                 */}
                <span className="rounded-md border border-dashed border-border px-3 py-2 font-mono text-[12.5px] text-muted-foreground">
                  {draft.fromEmail ?? "no sending address set"}
                </span>
              </div>
              {draft.fromName !== fromName ? (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  Changed for this email only. The sign-off at the end of the message is separate,
                  so change that too if it should match.
                </p>
              ) : draft.fromNameIsFallback ? (
                <p className="mt-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-200">
                  No name is saved on your advisor account, so this is the standard wording standing
                  in. Add one on the Advisors screen and it will fill in by itself next time.
                </p>
              ) : (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  From your advisor account. Change it here and only this email is affected.
                </p>
              )}
            </div>

            <div>
              <Label
                htmlFor="send-to"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                To
              </Label>
              <Input
                id="send-to"
                type="email"
                className="mt-1.5"
                value={to}
                placeholder="client@example.com"
                onChange={(e) => setTo(e.target.value)}
                disabled={Boolean(blocked)}
              />
            </div>

            <div>
              <Label
                htmlFor="send-subject"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Subject
              </Label>
              <Input
                id="send-subject"
                className="mt-1.5"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={Boolean(blocked)}
              />
            </div>

            <div>
              <Label
                htmlFor="send-body"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Message
              </Label>
              <Textarea
                id="send-body"
                className="mt-1.5 min-h-[260px] leading-relaxed"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={Boolean(blocked)}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The <code>[button]</code> line becomes a button pointing at{" "}
                <span className="font-mono">{draft.ctaUrl}</span>.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void onSend()} disabled={!ready || sending}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
