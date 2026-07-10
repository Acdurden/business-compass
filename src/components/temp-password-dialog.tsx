import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function TempPasswordDialog({
  open,
  onOpenChange,
  email,
  password,
  loginUrl,
  title = "Temporary password created",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string | null;
  password: string | null;
  loginUrl: string;
  title?: string;
}) {
  const [copied, setCopied] = useState<"pw" | "all" | null>(null);

  async function copy(text: string, kind: "pw" | "all") {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  const shareText =
    email && password
      ? `Sign-in URL: ${loginUrl}\nEmail: ${email}\nTemporary password: ${password}`
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Share these credentials with the user. This password is shown once —
            copy it now. The user should change it after signing in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
            <p>
              <span className="text-muted-foreground">Sign-in URL: </span>
              <code>{loginUrl}</code>
            </p>
            <p>
              <span className="text-muted-foreground">Email: </span>
              <code>{email ?? "—"}</code>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Password: </span>
              <code className="font-mono">{password ?? "—"}</code>
              {password && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copy(password, "pw")}
                >
                  {copied === "pw" ? (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {copied === "pw" ? "Copied" : "Copy"}
                </Button>
              )}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {shareText && (
            <Button
              variant="outline"
              onClick={() => void copy(shareText, "all")}
            >
              {copied === "all" ? (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1.5" />
              )}
              {copied === "all" ? "Copied all" : "Copy all"}
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
