/**
 * "Invite a client" — the copy-a-link dialog, shared by the advisor dashboard
 * and the submissions list.
 *
 * It loads its own invite codes rather than taking them as a prop. Two callers
 * each fetching the same list and passing it down is how the two copies drift:
 * the moment one of them forgets, a screen offers a stale plan link and the
 * client signs up on the wrong plan.
 *
 * NOTE: this copies a link for the advisor to paste into their own mail. The
 * app still cannot send it — see claude/email-and-notifications.md.
 */

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Link as LinkIcon, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getActiveInviteCodes, type InviteLink } from "@/lib/client-invites.functions";

function InviteLinkRow({ link }: { link: InviteLink }) {
  const [copied, setCopied] = useState(false);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://kriterionbvi.com";
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
          {link.plan === "full" ? "Includes advisor review" : "Self-assessment only"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function InviteClientButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const loadCodes = useServerFn(getActiveInviteCodes);
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<InviteLink[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCodes()
      .then((res) => {
        if (!cancelled) setLinks(res.links ?? []);
      })
      .catch(() => {
        // An empty list is handled below; the button must not disappear.
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadCodes]);

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        Invite a client
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a client</DialogTitle>
            <DialogDescription>
              Share a link and the client sets up their own account &mdash; no password for you to
              relay. <b>The link you send decides their plan</b>, so pick the right one.
            </DialogDescription>
          </DialogHeader>
          {links === null ? (
            <p className="text-sm text-muted-foreground">Loading the links…</p>
          ) : links.length > 0 ? (
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
            These are reusable sign-up links. A client&apos;s plan is fixed at sign-up and shown on
            their row.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
