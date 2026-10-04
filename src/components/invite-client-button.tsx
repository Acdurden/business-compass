/**
 * "Invite a client", shared by the advisor dashboard and the submissions list.
 *
 * Each person is invited by name and gets a link of their own. The link works
 * once, creates an account for the address it was issued to and no other, sets
 * their plan, and can be revoked. The window keeps the list of who has been
 * invited and where each invite stands, which until 2026-10-04 was recorded
 * nowhere.
 *
 * The two reusable plan links are still here, folded away. They are for the
 * case where someone cannot be invited by name, and they are copy-only: the
 * invite email greets its reader by name and calls the link theirs, neither of
 * which is true of a link anybody can use.
 *
 * It loads its own data rather than taking it as a prop. Two callers each
 * fetching the same list and passing it down is how the two copies drift.
 *
 * Emailing opens a draft first: nothing in Kriterion sends without someone
 * reading it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Link as LinkIcon, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createClientInvite,
  getActiveInviteCodes,
  listClientInvites,
  revokeClientInvite,
  type ClientInvite,
  type InviteLink,
} from "@/lib/client-invites.functions";
import { SendEmailDialog } from "@/components/send-email-dialog";

type Plan = "full" | "objective";

const PLAN_NAME: Record<Plan, string> = { full: "Full service", objective: "Objective only" };
const PLAN_DETAIL: Record<Plan, string> = {
  full: "Includes advisor review",
  objective: "Self-assessment only",
};

function siteOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://kriterionbvi.com";
}

function inviteUrl(code: string): string {
  return `${siteOrigin()}/invite?code=${code}`;
}

/** Clipboard, with the fallback for browsers and frames that refuse the API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Where one invite stands, as a sentence an advisor reads at a glance. */
function statusLine(invite: ClientInvite): string {
  switch (invite.status) {
    case "accepted":
      return `Signed up ${shortDate(invite.acceptedAt)}`;
    case "revoked":
      return "Revoked. The link no longer works.";
    case "sent":
      return invite.sendCount > 1
        ? `Emailed ${invite.sendCount} times, last on ${shortDate(invite.sentAt)}`
        : `Emailed ${shortDate(invite.sentAt)}`;
    default:
      return `Link created ${shortDate(invite.createdAt)}. Not emailed from Kriterion.`;
  }
}

function PlanChip({ plan }: { plan: Plan }) {
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {PLAN_NAME[plan]}
    </span>
  );
}

function InviteRow({
  invite,
  onEmail,
  onRevoke,
}: {
  invite: ClientInvite;
  onEmail: (invite: ClientInvite) => void;
  onRevoke: (invite: ClientInvite) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  /** Revoking kills a link someone may be about to use, so it takes two clicks. */
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    },
    [],
  );
  const open = invite.status === "created" || invite.status === "sent";

  async function handleCopy() {
    if (await copyText(inviteUrl(invite.token))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy the link");
    }
  }

  async function handleRevoke() {
    if (!confirming) {
      setConfirming(true);
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirming(false), 4000);
      return;
    }
    if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    setRevoking(true);
    try {
      await onRevoke(invite);
    } finally {
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <li className="min-w-0 rounded-lg border border-border p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-sm font-medium">
          {invite.firstName ? `${invite.firstName} · ` : ""}
          {invite.email}
        </span>
        <PlanChip plan={invite.plan} />
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{statusLine(invite)}</p>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEmail(invite)}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {invite.status === "sent" ? "Email again" : "Email it"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={confirming ? "text-destructive hover:text-destructive" : ""}
            disabled={revoking}
            onClick={() => void handleRevoke()}
          >
            {revoking ? "Revoking…" : confirming ? "Click again to revoke" : "Revoke"}
          </Button>
        </div>
      )}
    </li>
  );
}

function SharedLinkRow({ link }: { link: InviteLink }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(link.code);

  async function handleCopy() {
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy the link");
    }
  }

  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{PLAN_NAME[link.plan]}</span>
        <span className="text-[11px] text-muted-foreground">{PLAN_DETAIL[link.plan]}</span>
      </div>
      {/*
       * `min-w-0` on the URL is load-bearing. A flex item defaults to
       * `min-width: auto`, so the long invite URL refuses to shrink below its
       * own single-line width, `truncate` never gets to truncate anything, and
       * the whole row pushes out past the dialog, which is exactly how the
       * buttons once ended up sitting on the page behind the modal.
       */}
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
          {url}
        </code>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => void handleCopy()}>
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function InviteClientButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const loadCodes = useServerFn(getActiveInviteCodes);
  const loadInvites = useServerFn(listClientInvites);
  const create = useServerFn(createClientInvite);
  const revoke = useServerFn(revokeClientInvite);

  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<InviteLink[] | null>(null);
  const [invites, setInvites] = useState<ClientInvite[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<Plan>("full");
  const [busy, setBusy] = useState<"email" | "copy" | null>(null);
  /** The invite whose email is open in the compose window, if any. */
  const [composing, setComposing] = useState<ClientInvite | null>(null);

  const refreshInvites = useCallback(async () => {
    try {
      const res = await loadInvites();
      setInvites(res.invites ?? []);
      setListError(null);
    } catch (err) {
      setInvites([]);
      setListError(err instanceof Error ? err.message : "Could not load the invites");
    }
  }, [loadInvites]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void refreshInvites();
    loadCodes()
      .then((res) => {
        if (!cancelled) setLinks(res.links ?? []);
      })
      .catch(() => {
        // An empty list is handled below; the window must still open.
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadCodes, refreshInvites]);

  const emailLooksRight = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleCreate(then: "email" | "copy") {
    if (!emailLooksRight) {
      toast.error("Enter the email address of the person you are inviting");
      return;
    }
    setBusy(then);
    try {
      const invite = await create({ data: { email: email.trim(), firstName, plan } });
      setFirstName("");
      setEmail("");
      await refreshInvites();
      if (then === "email") {
        setComposing(invite);
      } else if (await copyText(inviteUrl(invite.token))) {
        toast.success(`Link copied. It works once, for ${invite.email} only.`);
      } else {
        toast.message("The invite is created. Use Copy link on its row below.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the invite");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(invite: ClientInvite) {
    try {
      await revoke({ data: { token: invite.token } });
      toast.success(`Revoked. The link sent to ${invite.email} no longer works.`);
      await refreshInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the invite");
    }
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        Invite a client
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Invite a client</DialogTitle>
            <DialogDescription>
              Each person gets a link of their own. It works once, only for the address you enter,
              and <b>it decides their plan</b>. They set their own password, so there is nothing for
              you to relay.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate("email");
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div>
                <Label
                  htmlFor="invite-first-name"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  First name
                </Label>
                <Input
                  id="invite-first-name"
                  className="mt-1.5 bg-background"
                  value={firstName}
                  autoComplete="off"
                  maxLength={60}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <Label
                  htmlFor="invite-email"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  className="mt-1.5 bg-background"
                  value={email}
                  autoComplete="off"
                  placeholder="owner@agency.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {(["full", "objective"] as Plan[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={plan === p}
                    onClick={() => setPlan(p)}
                    className={`rounded-md border px-3 py-2 text-left transition-colors ${
                      plan === p
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-foreground/30"
                    }`}
                  >
                    <span className="block text-sm font-medium">{PLAN_NAME[p]}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {PLAN_DETAIL[p]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={busy !== null || !emailLooksRight}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {busy === "email" ? "Creating…" : "Write the invite email"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null || !emailLooksRight}
                onClick={() => void handleCreate("copy")}
              >
                <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                {busy === "copy" ? "Creating…" : "Just copy their link"}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The email opens as a draft for you to read before it goes. The first name is used in
              the greeting; leave it empty and the greeting line is left out.
            </p>
          </form>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Invites</p>
            {invites === null ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading the invites…</p>
            ) : listError ? (
              <p className="mt-2 text-sm text-destructive">{listError}</p>
            ) : invites.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nobody has been invited by name yet.
              </p>
            ) : (
              <ul className="mt-2 flex min-w-0 flex-col gap-2">
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.token}
                    invite={invite}
                    onEmail={setComposing}
                    onRevoke={handleRevoke}
                  />
                ))}
              </ul>
            )}
          </div>

          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Reusable sign-up links</summary>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Anyone holding one of these can sign up on that plan, as many times as it is used.
              Reach for one only when you cannot invite someone by name. They are not for the invite
              email, which greets its reader by name and calls the link theirs.
            </p>
            {links === null ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading the links…</p>
            ) : links.length > 0 ? (
              <div className="mt-2 flex min-w-0 flex-col gap-2 pb-1">
                {links.map((l) => (
                  <SharedLinkRow key={l.code} link={l} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No reusable link is active.</p>
            )}
          </details>

          {/*
           * Inside this dialog's content on purpose. A second dialog opened from
           * within the first stacks above it and hands focus back when it
           * closes; rendered beside it, the two would each try to own the page.
           */}
          {composing && (
            <SendEmailDialog
              open
              onOpenChange={(next) => {
                if (!next) setComposing(null);
              }}
              templateKey="invite"
              inviteToken={composing.token}
              title={`Invite ${composing.firstName || composing.email}`}
              onSent={() => void refreshInvites()}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
