/**
 * The client portal's chrome: the navy rail, the nav, and the page frame.
 *
 * Extracted from `client.index.tsx` when My Assessment became its own route.
 * Two pages sharing one nav is the whole point — the previous version hardcoded
 * Dashboard as the active item, which was fine while the dashboard was the only
 * page and wrong the moment it was not.
 *
 * Deliberately NOT shared with the back office. A client must never be shown a
 * control they cannot use, and the two navigations answer different questions.
 */

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { BRAND } from "@/lib/score-display";

export type ClientPlan = "objective" | "full";
export type ClientStage = "new" | "progress" | "awaiting" | "complete";

export type NavTarget =
  "/client" | "/client/assessment" | "/client/questionnaire" | "/client/summary";

type NavItem = {
  label: string;
  to?: NavTarget;
  active?: boolean;
  locked?: boolean;
  /** Why it's greyed out, shown on hover. */
  reason?: string;
  upgrade?: boolean;
  onClick?: () => void;
};

function navItems(
  stage: ClientStage,
  plan: ClientPlan,
  hasSubmission: boolean,
  active: NavTarget,
  onSignOut: () => void,
): NavItem[] {
  const done = stage === "complete";
  const soon = "Available when your results are ready";
  const unbuilt = "Coming soon";
  return [
    { label: "Dashboard", to: "/client", active: active === "/client" },
    {
      /**
       * Points at the assessment page rather than straight into the
       * questionnaire. The page is the permanent record of what the client
       * said, and it carries the route back into the questionnaire itself.
       */
      label: "My assessment",
      to: "/client/assessment",
      active: active === "/client/assessment",
      locked: !hasSubmission,
      reason: "Starts when you begin your assessment",
    },
    {
      label: "Score & valuation",
      to: "/client/summary",
      active: active === "/client/summary",
      locked: !done,
      reason: soon,
    },
    { label: "Opportunities", locked: true, reason: unbuilt },
    { label: "Documents", locked: true, reason: unbuilt },
    ...(plan === "objective" && done
      ? [
          {
            label: "Upgrade: Advisor review",
            upgrade: true,
            onClick: () => toast.info("We'll be in touch about adding an advisor review."),
          } satisfies NavItem,
        ]
      : []),
    { label: "Account", locked: true, reason: unbuilt },
    { label: "Sign out", onClick: onSignOut },
  ];
}

export function ClientShell({
  children,
  email,
  company,
  stage,
  plan,
  hasSubmission,
  active,
  onSignOut,
  onNavigate,
}: {
  children: React.ReactNode;
  email: string;
  company: string;
  stage: ClientStage;
  plan: ClientPlan;
  hasSubmission: boolean;
  /** Which page is showing, so the rail highlights the right item. */
  active: NavTarget;
  onSignOut: () => void | Promise<void>;
  onNavigate: (to: NavTarget) => void;
}) {
  const items = navItems(stage, plan, hasSubmission, active, () => void onSignOut());

  return (
    <div className="flex min-h-screen" style={{ background: "#eef1f5" }}>
      <aside
        className="hidden w-[214px] shrink-0 flex-col py-[18px] md:flex"
        style={{ background: BRAND.navy, color: "#c3d2df" }}
      >
        <div className="px-[18px] pb-[18px] text-[15px] font-bold tracking-wide text-white">
          KRITERION
        </div>
        <nav className="flex flex-col">
          {items.map((item) =>
            item.locked ? (
              <span
                key={item.label}
                title={item.reason}
                className="flex cursor-default items-center gap-2.5 border-l-[3px] border-transparent px-[18px] py-2.5 text-[13px] opacity-[0.34]"
              >
                <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-current opacity-60" />
                {item.label}
                <span aria-hidden>🔒</span>
              </span>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => (item.onClick ? item.onClick() : item.to && onNavigate(item.to))}
                className="flex items-center gap-2.5 border-l-[3px] px-[18px] py-2.5 text-left text-[13px] transition-colors hover:bg-[#16293a] hover:text-white"
                style={{
                  borderLeftColor: item.active ? BRAND.teal : "transparent",
                  background: item.active ? "#16293a" : "transparent",
                  color: item.active ? "#ffffff" : item.upgrade ? "#7fd3ce" : "#a8bccd",
                  fontWeight: item.active ? 600 : 400,
                }}
              >
                <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-current opacity-60" />
                {item.label}
              </button>
            ),
          )}
        </nav>
        <div
          className="mt-auto border-t px-[18px] pt-4 text-[11.5px] leading-[1.5]"
          style={{ borderColor: "#1e3549", color: "#6f8698" }}
        >
          {company || "Your business"}
          <br />
          {email}
        </div>
      </aside>

      {/* Phones don't get the rail — just the brand and a way out. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center justify-between px-5 py-3 md:hidden"
          style={{ background: BRAND.navy }}
        >
          <span className="text-[15px] font-bold tracking-wide text-white">KRITERION</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-[#c3d2df] hover:bg-white/10 hover:text-white"
            onClick={() => void onSignOut()}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </header>
        <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-7">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
