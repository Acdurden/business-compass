/**
 * Every submission with the facts a row, the submission sheet and the command
 * palette need about it: who owns it, when they were invited, who the advisor
 * is, where it stands, and (for those allowed to see it) whether it is a test.
 *
 * Each fact comes from a call that already existed. Nothing here decides who
 * may see what: the server functions do that, and a call this person may not
 * make simply leaves its fact blank.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listAllSubmissions, type AdvisorSubmissionRow } from "@/lib/advisor-submissions.functions";
import { listAdvisorAccounts, listClientAccounts } from "@/lib/password-admin.functions";
import { listClientInvites } from "@/lib/client-invites.functions";
import { listTestSubmissionIds } from "@/lib/research-desk.functions";
import { useResearchDeskAccess } from "@/lib/use-research-desk-access";
import { useIsBackOfficeAdmin } from "@/lib/back-office";
import { stageOf, type Stage } from "@/lib/submission-stage";

export type SubmissionView = AdvisorSubmissionRow & {
  stage: Stage;
  /** First name and email where known; either may be empty. */
  ownerName: string;
  ownerEmail: string;
  /** When their invite was created, or null when no invite matches. */
  invitedAt: string | null;
  /** When their account was created; the fallback when there is no invite. */
  accountCreatedAt: string | null;
  advisorLabel: string;
  /** Null when this person may not see the test switch, or the flags did not load. */
  isTest: boolean | null;
};

/** "Dana (dana@example.com)", or whichever half exists. */
export function ownerLine(v: Pick<SubmissionView, "ownerName" | "ownerEmail">): string {
  if (v.ownerName && v.ownerEmail) return `${v.ownerName} (${v.ownerEmail})`;
  return v.ownerName || v.ownerEmail || "No client account";
}

export function useSubmissionDirectory() {
  const listAll = useServerFn(listAllSubmissions);
  const listClients = useServerFn(listClientAccounts);
  const listInvites = useServerFn(listClientInvites);
  const listAdvisors = useServerFn(listAdvisorAccounts);
  const listTests = useServerFn(listTestSubmissionIds);
  const admin = useIsBackOfficeAdmin();
  /*
   * Test flags come from their own call rather than the shared list, so an
   * advisor without research desk access never receives them. Same rule as
   * before this hook existed.
   */
  const deskAccess = useResearchDeskAccess();

  const [rows, setRows] = useState<AdvisorSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<
    Map<string, { name: string; email: string; createdAt: string | null }>
  >(new Map());
  const [invitedByEmail, setInvitedByEmail] = useState<Map<string, string>>(new Map());
  const [advisorNames, setAdvisorNames] = useState<Map<string, string>>(new Map());
  const [testIds, setTestIds] = useState<Set<string> | null>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAll()
      .then((data) => {
        if (cancelled) return;
        setRows(data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Failed to load submissions");
        setLoading(false);
      });
    // The rest are details. Each one failing leaves its column blank.
    listClients()
      .then((list) => {
        if (cancelled) return;
        setClients(
          new Map(
            list.map((c) => [
              c.user_id,
              { name: c.first_name, email: c.email ?? "", createdAt: c.created_at },
            ]),
          ),
        );
      })
      .catch((err) => console.warn("Client accounts did not load", err));
    listInvites()
      .then(({ invites }) => {
        if (cancelled) return;
        const m = new Map<string, string>();
        for (const i of invites) {
          if (i.status === "accepted" && !m.has(i.email.toLowerCase())) {
            m.set(i.email.toLowerCase(), i.createdAt);
          }
        }
        setInvitedByEmail(m);
      })
      .catch((err) => console.warn("Invites did not load", err));
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setMe(data.session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [listAll, listClients, listInvites]);

  useEffect(() => {
    if (admin !== true) return;
    let cancelled = false;
    listAdvisors()
      .then((list) => {
        if (cancelled) return;
        setAdvisorNames(new Map(list.map((a) => [a.user_id, a.full_name || a.email || "Advisor"])));
      })
      .catch((err) => console.warn("Advisor names did not load", err));
    return () => {
      cancelled = true;
    };
  }, [admin, listAdvisors]);

  useEffect(() => {
    if (deskAccess !== true) return;
    let cancelled = false;
    listTests()
      .then((ids) => {
        if (!cancelled) setTestIds(new Set(ids));
      })
      .catch((err) => {
        console.warn("Test flags did not load", err);
      });
    return () => {
      cancelled = true;
    };
  }, [deskAccess, listTests]);

  const items = useMemo<SubmissionView[]>(
    () =>
      rows.map((r) => {
        const owner = r.owner_user_id ? clients.get(r.owner_user_id) : undefined;
        const email = owner?.email ?? "";
        const advisorLabel = !r.advisor_id
          ? "Not assigned"
          : r.advisor_id === me
            ? "You"
            : (advisorNames.get(r.advisor_id) ?? "Another advisor");
        return {
          ...r,
          stage: stageOf(r),
          ownerName: owner?.name ?? "",
          ownerEmail: email,
          invitedAt: email ? (invitedByEmail.get(email.toLowerCase()) ?? null) : null,
          accountCreatedAt: owner?.createdAt ?? null,
          advisorLabel,
          isTest: testIds ? testIds.has(r.submission_id) : null,
        };
      }),
    [rows, clients, invitedByEmail, advisorNames, testIds, me],
  );

  const patch = useCallback((submissionId: string, p: Partial<AdvisorSubmissionRow>) => {
    setRows((prev) => prev.map((x) => (x.submission_id === submissionId ? { ...x, ...p } : x)));
  }, []);

  const remove = useCallback((submissionId: string) => {
    setRows((prev) => prev.filter((x) => x.submission_id !== submissionId));
  }, []);

  const setTest = useCallback((submissionId: string, isTest: boolean) => {
    setTestIds((prev) => {
      const next = new Set(prev ?? []);
      if (isTest) next.add(submissionId);
      else next.delete(submissionId);
      return next;
    });
  }, []);

  return { loading, items, admin, patch, remove, setTest };
}
