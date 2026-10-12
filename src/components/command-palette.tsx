/**
 * The back office command palette: Ctrl K (Cmd K on a Mac) from any advisor or
 * admin page.
 *
 * Approved in `docs/admin-shell/admin-shell-preview.html`. It finds a client by
 * company or owner, goes to any page this person may see, and starts the
 * common actions. It respects the same admin gating as the sidebar: the "Go to"
 * list is the sidebar's own list, and admin actions appear only for admins.
 *
 * Filtering is done here rather than by the command library's fuzzy match, so
 * that "exactly one client matches" means what it says, and so the actions
 * listed for that client stay visible although their names do not contain what
 * was typed.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useVisibleNav } from "@/lib/back-office";
import { STAGE, clientReady } from "@/lib/submission-stage";
import { useSubmissionDirectory, type SubmissionView } from "@/lib/use-submission-directory";
import { useSubmissionActions } from "@/lib/use-submission-actions";

/** An action on one submission that needs its dialogs to outlive the palette. */
export type PaletteSubmissionAction = "next" | "copy" | "reset";

export function CommandPalette({
  open,
  onOpenChange,
  admin,
  onInvite,
  onSubmissionAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: boolean | null;
  onInvite: () => void;
  onSubmissionAction: (view: SubmissionView, action: PaletteSubmissionAction) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <DialogDescription className="sr-only">
        Find a client, go to a page, or start an action.
      </DialogDescription>
      {open ? (
        <PaletteBody
          admin={admin}
          close={() => onOpenChange(false)}
          onInvite={onInvite}
          onSubmissionAction={onSubmissionAction}
        />
      ) : null}
    </CommandDialog>
  );
}

function PaletteBody({
  admin,
  close,
  onInvite,
  onSubmissionAction,
}: {
  admin: boolean | null;
  close: () => void;
  onInvite: () => void;
  onSubmissionAction: (view: SubmissionView, action: PaletteSubmissionAction) => void;
}) {
  const navigate = useNavigate();
  const dir = useSubmissionDirectory();
  const groups = useVisibleNav(admin);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const clients = useMemo(
    () =>
      q
        ? dir.items.filter(
            (v) =>
              v.company_name.toLowerCase().includes(q) ||
              v.ownerName.toLowerCase().includes(q) ||
              v.ownerEmail.toLowerCase().includes(q),
          )
        : [],
    [dir.items, q],
  );
  const only = clients.length === 1 ? clients[0] : null;

  const pages = groups.flatMap((g) =>
    g.items
      .filter((i) => !q || i.label.toLowerCase().includes(q))
      .map((i) => ({ ...i, group: g.label })),
  );

  const actions = [
    { key: "invite", label: "Invite client", hint: "Action", run: onInvite },
    ...(admin === true
      ? [
          {
            key: "create-advisor",
            label: "Create advisor account",
            hint: "Admin",
            run: () => navigate({ to: "/admin/advisors", hash: "create-advisor" }),
          },
          {
            key: "questionnaire",
            label: "Edit questionnaire",
            hint: "Admin",
            run: () => navigate({ to: "/admin/questionnaire" }),
          },
        ]
      : []),
  ].filter((a) => !q || a.label.toLowerCase().includes(q));

  function run(fn: () => void) {
    close();
    fn();
  }

  return (
    <>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a client, page or action"
      />
      <CommandList className="max-h-[52vh]">
        <CommandEmpty>{q && dir.loading ? "Loading clients…" : "No matches"}</CommandEmpty>

        {clients.length > 0 ? (
          <CommandGroup heading="Clients">
            {clients.map((v) => (
              <CommandItem
                key={v.submission_id}
                value={`client-${v.submission_id}`}
                onSelect={() =>
                  run(() =>
                    navigate({ to: "/admin/submissions", search: { open: v.submission_id } }),
                  )
                }
              >
                <span className="truncate">{v.company_name || "Untitled company"}</span>
                <Hint>{STAGE[v.stage].label}</Hint>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {only ? (
          <CommandGroup heading={`Actions for ${only.company_name || "this client"}`}>
            <CommandItem
              value="client-next"
              onSelect={() => run(() => onSubmissionAction(only, "next"))}
            >
              {STAGE[only.stage].next}
              <Hint>Next step</Hint>
            </CommandItem>
            {clientReady(only.client_status) ? (
              <CommandItem
                value="client-results"
                onSelect={() =>
                  run(() =>
                    navigate({
                      to: "/admin/results/$submissionId",
                      params: { submissionId: only.submission_id },
                    }),
                  )
                }
              >
                View results
              </CommandItem>
            ) : null}
            {/* When copying the link is already the next step, it is listed once. */}
            {only.stage !== "client" ? (
              <CommandItem
                value="client-copy"
                onSelect={() => run(() => onSubmissionAction(only, "copy"))}
              >
                Copy client login link
              </CommandItem>
            ) : null}
            {only.owner_user_id ? (
              <CommandItem
                value="client-reset"
                onSelect={() => run(() => onSubmissionAction(only, "reset"))}
              >
                Reset client password
              </CommandItem>
            ) : null}
          </CommandGroup>
        ) : null}

        {pages.length > 0 ? (
          <CommandGroup heading="Go to">
            {pages.map((p) => (
              <CommandItem
                key={p.key}
                value={`page-${p.key}`}
                onSelect={() => run(() => navigate({ to: p.to }))}
              >
                {p.label}
                <Hint>{p.group}</Hint>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {actions.length > 0 ? (
          <CommandGroup heading="Actions">
            {actions.map((a) => (
              <CommandItem key={a.key} value={`action-${a.key}`} onSelect={() => run(a.run)}>
                {a.label}
                <Hint>{a.hint}</Hint>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="flex gap-4 border-t border-border px-[18px] py-2.5 text-xs text-muted-foreground">
        <span>Up and down to move</span>
        <span>Enter to open</span>
        <span>Esc to close</span>
      </div>
    </>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto shrink-0 text-xs text-muted-foreground">{children}</span>;
}

/**
 * Runs one submission action picked in the palette, then stays mounted so the
 * dialogs it opens (the reminder email, the temporary password) outlive the
 * palette that started them.
 */
export function PaletteActionHost({
  view,
  action,
}: {
  view: SubmissionView;
  action: PaletteSubmissionAction;
}) {
  const a = useSubmissionActions(view, {
    onPatch: () => {},
    onDelete: () => {},
    onTestChange: () => {},
  });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (action === "next") a.runNext();
    else if (action === "copy") void a.copyLoginLink();
    else void a.resetPassword();
  }, [a, action]);

  return a.dialogs;
}
