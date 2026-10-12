/**
 * The back office role check, nav list and sidebar badge count, shared by the
 * shell (`back-office-shell.tsx`) and the pages that need the same answers.
 *
 * Kept out of the component file so that file exports only components.
 */

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Mail,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listAllSubmissions } from "@/lib/advisor-submissions.functions";
import { needsAdvisor } from "@/lib/submission-stage";

export type BackOfficeSection =
  | "dashboard"
  | "submissions"
  | "clients"
  | "market-data"
  | "insights"
  | "questionnaire"
  | "emails"
  | "advisors";

/* ------------------------------------------------------------------------ */
/* Role                                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Cached across mounts so moving between pages does not re-ask the database
 * whether this person is an admin on every navigation.
 */
let adminCheck: Promise<boolean> | null = null;

export function isAdminUser(): Promise<boolean> {
  if (!adminCheck) {
    adminCheck = (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return false;
      const { data: admin } = await supabase.rpc("has_role", {
        _user_id: data.session.user.id,
        _role: "admin",
      });
      return admin === true;
    })().catch(() => false);
  }
  return adminCheck;
}

/** Forget the cached role. Called on sign-out so the next user is re-checked. */
export function resetBackOfficeRoleCache() {
  adminCheck = null;
  lastNeedsCount = null;
}

/** `null` while still asking, then true or false. */
export function useIsBackOfficeAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void isAdminUser().then((v) => {
      if (!cancelled) setAdmin(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return admin;
}

/* ------------------------------------------------------------------------ */
/* Navigation                                                                 */
/* ------------------------------------------------------------------------ */

export type NavItem = {
  key: BackOfficeSection;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
};

export type NavGroup = { label: string; admin: boolean; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Work",
    admin: false,
    items: [
      { key: "dashboard", label: "Dashboard", to: "/advisor", icon: LayoutDashboard },
      {
        key: "submissions",
        label: "Submissions",
        to: "/admin/submissions",
        icon: ListChecks,
        badge: true,
      },
      { key: "clients", label: "Clients", to: "/admin/clients", icon: Users },
    ],
  },
  {
    label: "Research",
    admin: true,
    items: [
      { key: "market-data", label: "Market data", to: "/admin/market-data", icon: BarChart3 },
      { key: "insights", label: "Insights", to: "/admin/insights", icon: TrendingUp },
    ],
  },
  {
    label: "Settings",
    admin: true,
    items: [
      {
        key: "questionnaire",
        label: "Questionnaire",
        to: "/admin/questionnaire",
        icon: ClipboardList,
      },
      { key: "emails", label: "Emails", to: "/admin/emails", icon: Mail },
      { key: "advisors", label: "Advisors", to: "/admin/advisors", icon: UserCog },
    ],
  },
];

/**
 * The nav groups this person may see. Admin-only groups stay hidden while the
 * role is still unknown: showing them and taking them away a moment later
 * reads as a glitch, and the cost of the delay is one render. Items whose page
 * has not been built yet (the research desk) are left out entirely.
 */
export function useVisibleNav(admin: boolean | null): NavGroup[] {
  const router = useRouter();
  const routes = router.routesByPath as unknown as Record<string, unknown>;
  return NAV.filter((g) => !g.admin || admin === true)
    .map((g) => ({ ...g, items: g.items.filter((i) => i.to in routes) }))
    .filter((g) => g.items.length > 0);
}

export function sectionLabels(section: BackOfficeSection): { group: string; page: string } {
  for (const g of NAV) {
    const item = g.items.find((i) => i.key === section);
    if (item) return { group: g.label, page: item.label };
  }
  return { group: "Work", page: "Dashboard" };
}

/* ------------------------------------------------------------------------ */
/* Sidebar badge                                                              */
/* ------------------------------------------------------------------------ */

/** Kept between pages so the badge does not blink out on every navigation. */
let lastNeedsCount: number | null = null;

export function useNeedsCount(override: number | null | undefined): number | null {
  const listAll = useServerFn(listAllSubmissions);
  const [count, setCount] = useState<number | null>(lastNeedsCount);

  useEffect(() => {
    if (override !== undefined) return;
    let cancelled = false;
    listAll()
      .then((rows) => {
        const n = (rows ?? []).filter(needsAdvisor).length;
        lastNeedsCount = n;
        if (!cancelled) setCount(n);
      })
      .catch(() => {
        // The badge is a convenience. A failure leaves the last known count.
      });
    return () => {
      cancelled = true;
    };
  }, [override, listAll]);

  if (typeof override === "number") {
    lastNeedsCount = override;
    return override;
  }
  return count;
}
