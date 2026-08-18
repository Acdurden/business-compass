/**
 * The advisor and admin navigation strip.
 *
 * Before this existed, every back-office page invented its own two or three
 * buttons pointing at wherever it happened to be built from. The submissions
 * list became the hub by accident, and the dashboard — the screen you land on
 * at sign-in — was reachable from nothing at all.
 *
 * This is deliberately NOT shared with the client portal. A client has their
 * own sidebar and must never be shown a control they cannot use, so nothing
 * here is rendered on a client-facing route.
 *
 * Admin-only destinations (the questionnaire editor and advisor accounts) are
 * hidden from an advisor who is not an admin, rather than shown and then
 * bounced by the route guard.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ClipboardList, LayoutDashboard, ListChecks, LogOut, Users, UserCog } from "lucide-react";

export type BackOfficeSection =
  "dashboard" | "submissions" | "clients" | "questionnaire" | "advisors" | null;

/**
 * Cached across mounts so moving between pages does not re-ask the database
 * whether this person is an admin on every navigation.
 */
let adminCheck: Promise<boolean> | null = null;

function isAdminUser(): Promise<boolean> {
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
function resetBackOfficeRoleCache() {
  adminCheck = null;
}

export function BackOfficeNav({ active }: { active: BackOfficeSection }) {
  const navigate = useNavigate();
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

  async function signOut() {
    resetBackOfficeRoleCache();
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  /**
   * Admin-only items stay hidden while the role is still unknown. Showing them
   * and taking them away a moment later reads as a glitch, and the cost of the
   * delay is one render.
   */
  const items: Array<{
    key: Exclude<BackOfficeSection, null>;
    label: string;
    to: string;
    icon: React.ReactNode;
    show: boolean;
  }> = [
    {
      key: "dashboard",
      label: "Dashboard",
      to: "/advisor",
      icon: <LayoutDashboard className="h-3.5 w-3.5" />,
      show: true,
    },
    {
      key: "submissions",
      label: "Submissions",
      to: "/admin/submissions",
      icon: <ListChecks className="h-3.5 w-3.5" />,
      show: true,
    },
    {
      key: "clients",
      label: "Clients",
      to: "/admin/clients",
      icon: <Users className="h-3.5 w-3.5" />,
      show: true,
    },
    {
      key: "questionnaire",
      label: "Questionnaire",
      to: "/admin/questionnaire",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      show: admin === true,
    },
    {
      key: "advisors",
      label: "Advisors",
      to: "/admin/advisors",
      icon: <UserCog className="h-3.5 w-3.5" />,
      show: admin === true,
    },
  ];

  return (
    <nav className="border-b border-border/60 bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-6 py-2">
        <Link
          to="/advisor"
          className="mr-3 text-[13px] font-bold tracking-[0.06em] text-foreground"
        >
          KRITERION
        </Link>

        {items
          .filter((i) => i.show)
          .map((i) => (
            <Link
              key={i.key}
              to={i.to}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                active === i.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              }`}
              aria-current={active === i.key ? "page" : undefined}
            >
              {i.icon}
              {i.label}
            </Link>
          ))}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </nav>
  );
}
