/**
 * The advisor and admin frame: a left sidebar, a top bar with the breadcrumb,
 * and the page title with its primary button.
 *
 * Replaced the horizontal strip in `back-office-nav.tsx` on 12 October 2026,
 * following the approved preview in `docs/admin-shell/admin-shell-preview.html`.
 *
 * This is deliberately NOT shared with the client portal. A client has their
 * own rail (`client-shell.tsx`) and must never be shown a control they cannot
 * use, so nothing here is rendered on a client-facing route.
 *
 * Admin-only destinations are hidden from an advisor who is not an admin,
 * rather than shown and then bounced by the route guard. The route guards and
 * the server-side admin checks stay the real boundary; this only decides what
 * to draw.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { LogOut, Menu, PanelLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  resetBackOfficeRoleCache,
  sectionLabels,
  useIsBackOfficeAdmin,
  useNeedsCount,
  useVisibleNav,
  type BackOfficeSection,
} from "@/lib/back-office";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/* ------------------------------------------------------------------------ */
/* Collapsed state                                                            */
/* ------------------------------------------------------------------------ */

const COLLAPSED_KEY = "kr-back-office-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private windows and blocked storage: the sidebar simply opens expanded.
  }
}

/* ------------------------------------------------------------------------ */
/* Shell                                                                      */
/* ------------------------------------------------------------------------ */

export type Crumb = { label: string; to?: string };

export function BackOfficeShell({
  active,
  title,
  description,
  crumbs,
  actions,
  needsCount,
  children,
}: {
  active: BackOfficeSection;
  title: React.ReactNode;
  /** One line under the title. */
  description?: React.ReactNode;
  /** Defaults to "Group / Page" for the active section. */
  crumbs?: Crumb[];
  /** The page's primary button(s), shown on the right of the title. */
  actions?: React.ReactNode;
  /**
   * A page that already holds the submission list passes its own count so the
   * badge updates the moment a row changes. Omitted, the shell asks for it.
   */
  needsCount?: number | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => !readCollapsed());

  function onOpenChange(next: boolean) {
    setOpen(next);
    writeCollapsed(!next);
  }

  const labels = sectionLabels(active);
  const trail: Crumb[] = crumbs ?? [{ label: labels.group }, { label: labels.page }];

  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      style={{ "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}
    >
      <BackOfficeSidebar active={active} needsCount={needsCount} />
      <SidebarInset className="min-w-0">
        <TopBar trail={trail} />
        <div className="flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-14 pt-7 md:px-8">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-[1_1_280px]">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
              {description ? (
                <div className="mt-1 text-[13.5px] text-muted-foreground">{description}</div>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function TopBar({ trail }: { trail: Crumb[] }) {
  const { toggleSidebar, isMobile, state } = useSidebar();
  const label = isMobile
    ? "Open menu"
    : state === "collapsed"
      ? "Expand sidebar"
      : "Collapse sidebar";
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-8">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={toggleSidebar}
        aria-label={label}
        title={label}
      >
        {isMobile ? (
          <Menu className="h-[18px] w-[18px]" />
        ) : (
          <PanelLeft className="h-[18px] w-[18px]" />
        )}
      </Button>
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap text-[13px]">
          {trail.map((c, i) => {
            const last = i === trail.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <BreadcrumbSeparator>/</BreadcrumbSeparator> : null}
                <BreadcrumbItem className="min-w-0">
                  {last ? (
                    <BreadcrumbPage className="truncate font-medium">{c.label}</BreadcrumbPage>
                  ) : c.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span className="whitespace-nowrap">{c.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}

function BackOfficeSidebar({
  active,
  needsCount,
}: {
  active: BackOfficeSection;
  needsCount: number | null | undefined;
}) {
  const navigate = useNavigate();
  const admin = useIsBackOfficeAdmin();
  const groups = useVisibleNav(admin);
  const count = useNeedsCount(needsCount);
  const { isMobile, setOpenMobile } = useSidebar();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user || cancelled) return;
      const full = String(user.user_metadata?.full_name ?? "").trim();
      setName(full || user.email || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    resetBackOfficeRoleCache();
    await supabase.auth.signOut();
    navigate({ to: "/client/auth" });
  }

  const initials =
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "K";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pb-0 pt-[18px]">
        <Link
          to="/advisor"
          className="flex min-h-6 items-baseline justify-between px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <span className="text-[15px] font-bold tracking-[0.08em] text-sidebar-primary">
            <span className="group-data-[collapsible=icon]:hidden">KRITERION</span>
            <span className="hidden group-data-[collapsible=icon]:inline">K</span>
          </span>
          <small className="text-[11px] text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden">
            Back office
          </small>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-[18px] px-1 pt-3">
        {groups.map((g) => (
          <SidebarGroup key={g.label} className="py-0">
            <SidebarGroupLabel className="h-auto gap-2 px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/65">
              {g.label}
              {g.admin ? (
                <span className="rounded border border-[oklch(0.425_0.052_88.7)] px-[5px] text-[10px] font-medium normal-case tracking-normal text-[oklch(0.77_0.078_88.1)]">
                  Admin
                </span>
              ) : null}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.key;
                  const showBadge = item.badge && count != null && count > 0;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className="h-10 gap-3 rounded-lg px-2.5 text-sm hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:justify-center [&>svg]:size-[18px]"
                      >
                        <Link
                          to={item.to}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => isMobile && setOpenMobile(false)}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {showBadge ? (
                        <SidebarMenuBadge
                          aria-label={`${count} need you`}
                          className="right-2 top-2.5 h-auto rounded-full bg-[oklch(0.807_0.135_75.8)] px-2 py-px text-[11px] font-semibold text-[oklch(0.2_0.03_75)] peer-hover/menu-button:text-[oklch(0.2_0.03_75)] peer-data-[active=true]/menu-button:text-[oklch(0.2_0.03_75)] group-data-[collapsible=icon]:right-0.5 group-data-[collapsible=icon]:top-0.5 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:px-[5px] group-data-[collapsible=icon]:text-[10px]"
                        >
                          {count}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="mx-3 border-t border-sidebar-border px-1.5 pb-4 pt-3.5">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:flex-col">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
          >
            {initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[13px] text-sidebar-primary">{name || "Signed in"}</span>
            <span className="text-[11px] text-sidebar-foreground/75">
              {admin === null ? " " : admin ? "Admin" : "Advisor"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
