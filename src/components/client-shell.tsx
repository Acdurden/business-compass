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
import { BRAND } from "@/lib/score-display";
import { KRITERION_LOGO } from "@/assets/kriterionLogo";

export type ClientPlan = "objective" | "full";
export type ClientStage = "new" | "progress" | "awaiting" | "complete";

export type NavTarget =
  | "/client"
  | "/client/objective-score"
  | "/client/questionnaire"
  | "/client/valscore"
  | "/client/advisor-calibration";

type NavItem = {
  label: string;
  to?: NavTarget;
  active?: boolean;
  locked?: boolean;
  /** Why it's greyed out, shown on hover. */
  reason?: string;
  /** Marked "Optional" in the rail: a separate service, never a required step. */
  optional?: boolean;
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
  /*
   * Results unlock on submission, not on review. Everyone who finishes the
   * questionnaire has an Objective Score, which is a finished product in its own
   * right; a ValScore is a separate assessment that arrives later for
   * full-service clients. This item was gated on `done` until 2026-09-18, which
   * locked a full-service client out of a result they had already completed.
   */
  const hasResults = stage === "complete" || stage === "awaiting";
  /*
   * Opportunities, Documents and Account used to sit here as permanently locked
   * items reading "Coming soon". Removed 2026-09-18 at Andrew's instruction: a
   * pilot client reading three dead links learns that a third of the product
   * does not exist, which is a fact about our roadmap and not about their
   * business. They come back as real items when they are real.
   */
  /*
   * Navigation agreed 13 October 2026 (Adam, Dan, Andrew session of 10
   * October): Dashboard / Business Health Assessment / My Rating & Findings /
   * Advisor Calibration / Sign out.
   *
   * The rating and findings are part of the assessment itself (Product 1), so
   * they open the moment the client submits, with no advisor step. Advisor
   * Calibration is a separate, optional service: it is never locked and never
   * presented as the thing that unlocks results. Only one item is ever locked,
   * so the rail does not read as a list of withheld features.
   */
  return [
    { label: "Dashboard", to: "/client", active: active === "/client" },
    {
      label: "Business Health Assessment",
      // Before a submission exists, the company name is asked for on the dashboard.
      to: hasSubmission ? "/client/questionnaire" : "/client",
      active: active === "/client/questionnaire",
    },
    {
      label: "My Rating & Findings",
      to: "/client/objective-score",
      active: active === "/client/objective-score",
      locked: !hasResults,
      reason: "Ready when you finish your assessment",
    },
    ...(plan === "full" && hasSubmission
      ? [
          {
            /*
             * Full-service clients with a submission only. Pages default the
             * plan to "full" before a submission exists, so the check on
             * hasSubmission keeps a second locked item out of a new client's
             * rail. The pilot is objective-only and never sees this item.
             */
            label: "ValScore",
            to: "/client/valscore",
            active: active === "/client/valscore",
            locked: !done,
            reason: "Available when your advisor's review is complete",
          } satisfies NavItem,
        ]
      : []),
    {
      label: "Advisor Calibration",
      to: "/client/advisor-calibration",
      active: active === "/client/advisor-calibration",
      optional: true,
    },
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
        <div className="px-[18px] pb-[18px]">
          <img
            src={KRITERION_LOGO}
            alt="Kriterion"
            className="block h-auto w-[150px]"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <div className="mt-1.5 text-[11px] tracking-[0.04em]" style={{ color: "#6f8698" }}>
            kriterionbvi.com
          </div>
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
                  color: item.active ? "#ffffff" : "#a8bccd",
                  fontWeight: item.active ? 600 : 400,
                }}
              >
                <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-current opacity-60" />
                {item.label}
                {item.optional ? (
                  <span
                    className="ml-auto rounded-full border px-1.5 py-px text-[9.5px] uppercase tracking-[0.08em]"
                    style={{ borderColor: "#1e3549", color: "#6f8698" }}
                  >
                    Optional
                  </span>
                ) : null}
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
          <img
            src={KRITERION_LOGO}
            alt="Kriterion"
            className="block h-auto w-[120px]"
            style={{ filter: "brightness(0) invert(1)" }}
          />
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
        {/* Phones get the same destinations as a scrolling row under the header. */}
        <nav
          className="flex gap-1.5 overflow-x-auto px-4 pb-3 md:hidden"
          style={{ background: BRAND.navy }}
          aria-label="Sections"
        >
          {items
            .filter((item) => item.to)
            .map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.locked}
                title={item.locked ? item.reason : undefined}
                onClick={() => item.to && onNavigate(item.to)}
                className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] disabled:opacity-40"
                style={{
                  borderColor: item.active ? BRAND.teal : "#1e3549",
                  background: item.active ? BRAND.teal : "transparent",
                  color: item.active ? "#ffffff" : "#a8bccd",
                }}
              >
                {item.label}
              </button>
            ))}
        </nav>
        <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-7">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
