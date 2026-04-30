/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UnifiedSidebar -- single component that renders every role's sidebar.
 *
 * Why this exists: we used to have 8 hand-rolled Nav files
 * (AdminNav, DriverNav, KitchenNav, ...) each with ~200 lines of
 * duplicated mobile/desktop/collapse logic. Adding a page meant editing
 * deep JSX in whichever file matched the role. This file replaces all
 * eight, driven by `navConfig.ts`.
 *
 * What it owns:
 *   - Mobile top bar with Sheet drawer
 *   - Desktop fixed sidebar with icon-rail collapse mode
 *   - Per-section accordion (CollapsibleNavSection) with active-route
 *     auto-expansion
 *   - Active-link highlight using the role's tone palette
 *   - Sign out button at the bottom
 *   - Z-index normalised (mobile bar z-40, mobile drawer z-50, desktop
 *     sidebar lg:z-30) so dashboard cards never punch through.
 *
 * What it does NOT own:
 *   - Page content padding -- DashboardShell handles that so this
 *     component stays focused.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, ChevronRight, ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SignOutButton } from "@/components/navigation/SignOutButton";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import {
  RoleNav,
  visibleItems,
  visibleSections,
} from "@/config/navConfig";

interface UnifiedSidebarProps {
  /** The role config to render. Pass the result of getNavForRole(role). */
  nav: RoleNav;
  /** The caller's role string -- used to hide gated items inside shared sections. */
  role: string;
  /** Optional brand override for the active gradient. When the caller is
   *  an admin and the company has primary_color/secondary_color set,
   *  DashboardShell threads them through here. */
  brandPrimary?: string | null;
  brandSecondary?: string | null;
  /** Optional company display name shown in the sidebar header. */
  companyName?: string;
  /** Optional company logo URL for the header tile. */
  companyLogo?: string;
}

export function UnifiedSidebar({
  nav,
  role,
  brandPrimary,
  brandSecondary,
  companyName,
  companyLogo,
}: UnifiedSidebarProps) {
  const router = useRouter();
  const storagePrefix = nav.tone.storagePrefix;

  const [mobileOpen, setMobileOpen] = useState(false);
  useCloseOnDesktop(mobileOpen, setMobileOpen);

  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);

  // Persist desktop collapsed state per role so a driver flipping a
  // tablet doesn't lose their preferred view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(`${storagePrefix}Nav-collapsed`);
    if (saved) setIsCollapsed(saved === "true");
  }, [storagePrefix]);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${storagePrefix}Nav-collapsed`, String(next));
    }
  };

  const isActive = (href: string) => {
    // Exact match wins; otherwise treat any descendant of the href as
    // "still inside that area" (e.g. /admin/quotes/new lights up
    // "Quotes"). The root '/' guard avoids '/admin' matching everything.
    if (router.pathname === href || router.asPath === href) return true;
    if (!href || href === "/") return false;
    return router.pathname.startsWith(href + "/") || router.asPath.startsWith(href + "/");
  };

  // Inline brand override on the active gradient. We only use the brand
  // colours if both are present -- a half-set palette would look broken.
  const activeGradientStyle =
    brandPrimary && brandSecondary
      ? { background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)` }
      : undefined;
  const activeGradientClass = activeGradientStyle ? "" : `bg-gradient-to-r ${nav.tone.active}`;

  const PortalIcon = nav.tone.portalIcon;
  const sectionsToRender = visibleSections(nav, role);

  const renderItem = (item: ReturnType<typeof visibleItems>[number], opts: { mobile: boolean }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => opts.mobile && setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all",
          nav.tone.hover,
          nav.tone.hoverText,
          active
            ? `${activeGradientClass} text-white shadow-md hover:opacity-95`
            : "text-slate-700 dark:text-slate-200",
          !opts.mobile && isCollapsed && !active ? "justify-center" : "",
          !opts.mobile && isCollapsed && active ? "justify-center" : "",
        )}
        style={active && activeGradientStyle ? activeGradientStyle : undefined}
        title={!opts.mobile && isCollapsed ? item.label : undefined}
      >
        <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-slate-500 dark:text-slate-400")} />
        {(opts.mobile || !isCollapsed) && (
          <div className="flex-1 min-w-0">
            <div className="truncate">{item.label}</div>
            {item.description && !active && (
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.description}</div>
            )}
          </div>
        )}
        {(opts.mobile || !isCollapsed) && active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
      </Link>
    );
  };

  const renderSections = (mobile: boolean) =>
    sectionsToRender.map((section) => {
      const items = visibleItems(section, role);
      const containsActive = items.some((i) => isActive(i.href));
      return (
        <CollapsibleNavSection
          key={section.id}
          title={section.label}
          storageKey={`${storagePrefix}:${section.id}`}
          defaultOpen={section.defaultOpen ?? true}
          containsActiveRoute={containsActive}
          flatMode={!mobile && isCollapsed}
        >
          {items.map((item) => renderItem(item, { mobile }))}
        </CollapsibleNavSection>
      );
    });

  // Header tile -- uses brand colours if set, otherwise the role's default
  // tone gradient.
  const headerTile = (
    <div
      className={cn(
        "relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0",
        activeGradientStyle ? "" : `bg-gradient-to-br ${nav.tone.active}`,
      )}
      style={activeGradientStyle}
    >
      {companyLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={companyLogo} alt={companyName || nav.tone.portalLabel} className="w-full h-full rounded-xl object-cover" />
      ) : (
        <PortalIcon className="w-5 h-5 text-white" />
      )}
    </div>
  );

  const titleText = companyName || nav.tone.portalLabel;
  const subtitleText = companyName ? nav.tone.portalLabel : nav.tone.portalSubLabel;

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0 z-50">
                <div
                  className={cn(
                    "px-6 py-4 border-b text-white flex items-center justify-between",
                    activeGradientStyle ? "" : `bg-gradient-to-r ${nav.tone.header}`,
                  )}
                  style={activeGradientStyle}
                >
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold truncate">{titleText}</h2>
                    <p className={cn("text-sm mt-1", nav.tone.headerSub)}>{subtitleText}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-72px)] py-6 px-4">
                  <div className="space-y-6">
                    {renderSections(true)}
                    <div className="pt-4 border-t border-slate-100">
                      <SignOutButton />
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Link href={nav.tone.homeHref} className="flex items-center gap-2 min-w-0">
              {headerTile}
              <span className="font-bold text-slate-900 dark:text-white truncate">{titleText}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30",
          "border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
          "transition-all duration-300",
          isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72",
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href={nav.tone.homeHref} className="flex items-center gap-3 min-w-0">
                  {headerTile}
                  <div className="min-w-0">
                    <h1 className="font-bold text-slate-900 dark:text-white truncate">{titleText}</h1>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{subtitleText}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  <NotificationBell />
                  <ThemeSwitch />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <Link href={nav.tone.homeHref}>{headerTile}</Link>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Items */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">{renderSections(false)}</div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <SignOutButton collapsed={isCollapsed} />
            <Button
              variant="ghost"
              className={cn(
                "w-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800",
                isCollapsed ? "justify-center px-2" : "justify-start",
              )}
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <>
                  <ChevronLeft className="w-5 h-5 mr-3" />
                  Collapse
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
