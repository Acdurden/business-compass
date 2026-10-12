import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";
import { InviteClientButton } from "@/components/invite-client-button";
import { BackOfficeShell } from "@/components/back-office-shell";
import { StagePill, SubmissionSheet, TestPill } from "@/components/submission-sheet";
import {
  STAGE,
  STAGE_FILTERS,
  matchesStageFilter,
  shortDate,
  stageDetail,
  type Stage,
  type StageFilter,
} from "@/lib/submission-stage";
import { useSubmissionDirectory, type SubmissionView } from "@/lib/use-submission-directory";
import { useSubmissionActions, type SubmissionActionHandlers } from "@/lib/use-submission-actions";
import { cn } from "@/lib/utils";

/**
 * `open` is the submission whose sheet is showing, so a link (from the
 * dashboard or the command palette) can land with it already open. `filter`
 * is the chip, so the dashboard tiles can land on the right one.
 */
const searchSchema = z.object({
  open: z.string().optional(),
  filter: z.enum(["needs", "client", "final", "all"]).optional(),
});

export const Route = createFileRoute("/admin/submissions")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  head: () => ({
    meta: [{ title: "Admin · Submissions" }],
  }),
  component: AdminSubmissionsPage,
});

// Action-first ordering: rows that need the advisor float to the top.
const STAGE_ORDER: Record<Stage, number> = {
  needs: 0,
  advisory: 0,
  review: 1,
  client: 2,
  invited: 3,
  final: 5,
  complete: 5,
};

function AdminSubmissionsPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { open, filter: filterParam } = Route.useSearch();
  const filter: StageFilter = filterParam ?? "needs";
  const dir = useSubmissionDirectory();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = dir.items.filter(
      (r) =>
        matchesStageFilter(r.stage, filter) &&
        (!q ||
          r.company_name.toLowerCase().includes(q) ||
          r.ownerName.toLowerCase().includes(q) ||
          r.ownerEmail.toLowerCase().includes(q) ||
          r.submission_id.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      const pa = STAGE_ORDER[a.stage];
      const pb = STAGE_ORDER[b.stage];
      if (pa !== pb) return pa - pb;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  }, [dir.items, filter, q]);

  const counts = useMemo(() => {
    const c: Record<StageFilter, number> = { needs: 0, client: 0, final: 0, all: 0 };
    for (const r of dir.items) {
      for (const f of STAGE_FILTERS) if (matchesStageFilter(r.stage, f.key)) c[f.key] += 1;
    }
    return c;
  }, [dir.items]);

  const showTest = dir.items.some((r) => r.isTest !== null);
  const selected = open ? (dir.items.find((r) => r.submission_id === open) ?? null) : null;

  function setFilter(next: StageFilter) {
    navigate({
      search: (prev) => ({ ...prev, filter: next === "needs" ? undefined : next }),
      replace: true,
    });
  }

  function openSheet(id: string) {
    navigate({ search: (prev) => ({ ...prev, open: id }) });
  }

  function closeSheet() {
    navigate({ search: (prev) => ({ ...prev, open: undefined }), replace: true });
  }

  function handlersFor(id: string): SubmissionActionHandlers {
    return {
      onPatch: (patch) => dir.patch(id, patch),
      onDelete: () => {
        dir.remove(id);
        if (open === id) closeSheet();
      },
      onTestChange: (v) => dir.setTest(id, v),
    };
  }

  return (
    <BackOfficeShell
      active="submissions"
      title="Submissions"
      description="Click any row to see every action for that submission."
      actions={<InviteClientButton size="default" />}
      needsCount={dir.loading ? null : counts.needs}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {STAGE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-[34px] rounded-full border px-3 text-[13px] transition-colors",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-foreground/80 hover:bg-muted/60",
              )}
            >
              {f.label} <span className="opacity-70">{counts[f.key]}</span>
            </button>
          ))}
          <label className="flex h-[38px] w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-muted-foreground sm:ml-auto sm:w-auto sm:min-w-[260px]">
            <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by company or owner"
              aria-label="Filter by company or owner"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-5 pr-3 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  {showTest ? <th className="px-3 py-2 font-medium">Test</th> : null}
                  <th className="py-2 pl-3 pr-5 text-right font-medium">Next step</th>
                </tr>
              </thead>
              <tbody>
                {dir.loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-7 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-7 text-center text-muted-foreground">
                      {dir.items.length === 0 ? "No submissions yet." : "No submissions match."}
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <SubmissionRow
                      key={r.submission_id}
                      r={r}
                      showTest={showTest}
                      onOpen={() => openSheet(r.submission_id)}
                      handlers={handlersFor(r.submission_id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <SubmissionSheet
        submission={selected}
        open={!!open}
        onOpenChange={(o) => {
          if (!o) closeSheet();
        }}
        admin={dir.admin === true}
        handlers={handlersFor(selected?.submission_id ?? open ?? "")}
      />
    </BackOfficeShell>
  );
}

function SubmissionRow({
  r,
  showTest,
  onOpen,
  handlers,
}: {
  r: SubmissionView;
  showTest: boolean;
  onOpen: () => void;
  handlers: SubmissionActionHandlers;
}) {
  const a = useSubmissionActions(r, handlers);
  const meta = STAGE[r.stage];
  const owner = r.ownerName || r.ownerEmail;

  return (
    <tr
      className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/40"
      onClick={onOpen}
    >
      <td className="py-2.5 pl-5 pr-3 align-middle">
        <div className="flex items-center gap-2 font-medium">
          <span>{r.company_name || "Untitled company"}</span>
          {r.isTest ? <TestPill /> : null}
        </div>
        <div className="text-xs text-muted-foreground">{owner || "No client account"}</div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <StagePill stage={r.stage} />
        <div className="mt-1 text-xs text-muted-foreground">
          {stageDetail(r.stage, r.updated_at)}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle">{shortDate(r.updated_at)}</td>
      {showTest ? (
        <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
          {r.isTest !== null ? (
            <Switch
              checked={r.isTest}
              disabled={a.pending === "test"}
              onCheckedChange={(v) => void a.toggleTest(v)}
              aria-label={`Mark ${r.company_name || "this assessment"} as a test`}
              title="A test stays in the app but is left out of every Insights figure. Admin only."
            />
          ) : null}
        </td>
      ) : null}
      <td
        className="whitespace-nowrap py-2.5 pl-3 pr-5 text-right align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex gap-2">
          <Button
            size="sm"
            variant={meta.advisorWork ? "default" : "outline"}
            onClick={a.runNext}
            disabled={a.pending !== null}
          >
            {a.pending === "final" ? "Marking…" : meta.next}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpen}
            aria-label={`All actions for ${r.company_name || "this submission"}`}
          >
            All actions
          </Button>
        </div>
        {a.dialogs}
      </td>
    </tr>
  );
}
