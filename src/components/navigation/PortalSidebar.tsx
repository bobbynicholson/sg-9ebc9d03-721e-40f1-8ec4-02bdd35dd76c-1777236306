/**
 * Shared sidebar for the staff portals (kitchen, driver, shopping,
 * cleaning). Each role hands in a `config` describing its branding,
 * sections, and mobile quick actions; everything else -- mobile drawer,
 * desktop sidebar, collapse state, scroll restoration, slug-aware
 * hrefs, active-route matching -- is identical.
 *
 * Replaces 4 ~390-line per-role nav files (KitchenNav, DriverNav,
 * ShoppingNav, CleaningNav) that diverged only in icons, accent
 * colours, and section data.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Menu,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantHref } from "@/lib/tenantUrl";
import { useNavScrollRestore } from "@/hooks/useNavScrollRestore";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SignOutButton } from "@/components/navigation/SignOutButton";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { buildIsActive } from "@/lib/navActiveMatcher";

export interface PortalSidebarNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

export interface PortalSidebarSection {
  /** Stable id for localStorage section-open persistence -- never change once shipped. */
  id: string;
  title: string;
  defaultOpen: boolean;
  items: PortalSidebarNavItem[];
}

export interface PortalSidebarMobileQuickAction {
  href: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

export interface PortalSidebarConfig {
  /** Stable role key. Used as the localStorage prefix for collapse +
   *  per-section open state + scroll restore. Never change once
   *  shipped or every operator loses their saved nav state. */
  role: string;
  title: string;
  mobileSubtitle: string;
  brandIcon: React.ComponentType<{ className?: string }>;
  /** Tailwind gradient for the mobile drawer header + active link
   *  background, e.g. "from-orange-500 to-red-500". */
  accentGradient: string;
  /** Same gradient one shade deeper for the desktop logo tile,
   *  e.g. "from-orange-600 to-red-600". */
  accentGradientDark: string;
  /** Hover classes for nav links, e.g. "hover:bg-orange-50 hover:text-orange-700". */
  hoverClasses: string;
  /** Active-link hover override, e.g. "hover:from-orange-600 hover:to-red-600". */
  activeHoverClasses: string;
  /** Mobile drawer subtitle text colour, e.g. "text-orange-100". */
  mobileSubtitleClasses: string;
  /** Mobile search accent classes + hint copy. */
  searchAccent: string;
  searchHint: string;
  mobileQuickActions: PortalSidebarMobileQuickAction[];
  dashboardHref: string;
  sections: PortalSidebarSection[];
}

interface PortalSidebarProps {
  config: PortalSidebarConfig;
}

export function PortalSidebar({ config }: PortalSidebarProps) {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);
  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);

  const collapseKey = `${config.role}Nav-collapsed`;

  useEffect(() => {
    const saved = localStorage.getItem(collapseKey);
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, [collapseKey]);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(collapseKey, JSON.stringify(newState));
  };

  const allHrefs = config.sections.flatMap((s) => s.items.map((i) => i.href));
  const isActive = buildIsActive(allHrefs, { router, withSlug });

  const desktopScrollRef = useNavScrollRestore<HTMLDivElement>(`${config.role}-nav`);
  const BrandIcon = config.brandIcon;

  const NavBody = ({
    mobile = false,
    hideSignOut = false,
  }: { mobile?: boolean; hideSignOut?: boolean } = {}) => (
    <ScrollArea
      ref={mobile ? undefined : desktopScrollRef}
      className="h-full py-6 px-4"
    >
      <div className="space-y-6">
        {mobile && (
          <div className="space-y-3">
            <MobileSearchTrigger accent={config.searchAccent} hint={config.searchHint} />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={config.mobileQuickActions.map((a) => ({
                ...a,
                href: withSlug(a.href),
              }))}
            />
          </div>
        )}
        {config.sections.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          return (
            <CollapsibleNavSection
              key={section.id}
              title={section.title}
              storageKey={`${config.role}:${section.id}`}
              defaultOpen={section.defaultOpen}
              containsActiveRoute={containsActive}
            >
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={withSlug(item.href)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all",
                      config.hoverClasses,
                      active
                        ? `bg-gradient-to-r ${config.accentGradient} text-white ${config.activeHoverClasses} shadow-md`
                        : "text-slate-700",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 flex-shrink-0",
                        active ? "text-white" : "text-slate-600",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.title}</div>
                      {item.description && !active && (
                        <div className="text-xs text-slate-500 truncate">{item.description}</div>
                      )}
                    </div>
                    {active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  </Link>
                );
              })}
            </CollapsibleNavSection>
          );
        })}
        {!hideSignOut && (
          <div className="pt-4 border-t border-slate-100"><SignOutButton /></div>
        )}
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[300px] sm:w-[350px] max-w-[85vw] p-0 flex flex-col"
              >
                <div
                  className={cn(
                    "px-6 py-4 border-b bg-gradient-to-r flex-shrink-0",
                    config.accentGradient,
                  )}
                  style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))" }}
                >
                  <h2 className="text-xl font-bold text-white">{config.title}</h2>
                  <p className={cn("text-sm mt-1", config.mobileSubtitleClasses)}>
                    {config.mobileSubtitle}
                  </p>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <NavBody mobile hideSignOut />
                </div>
                {/* Pinned sign-out so the operator can always leave --
                    not buried under the nav scroll. */}
                <div
                  className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex-shrink-0 bg-white dark:bg-slate-900"
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}
                >
                  <SignOutButton />
                </div>
              </SheetContent>
            </Sheet>
            <Link href={config.dashboardHref} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 bg-gradient-to-br rounded-lg flex items-center justify-center",
                  config.accentGradientDark,
                )}
              >
                <BrandIcon className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">{config.title}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300",
          isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72",
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href={config.dashboardHref} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 bg-gradient-to-br rounded-xl flex items-center justify-center shadow-lg",
                      config.accentGradientDark,
                    )}
                  >
                    <BrandIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900 dark:text-white">{config.title}</h1>
                    <p className="text-xs text-slate-600 dark:text-slate-400">CateringMS</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <NotificationBell />
                  <ThemeSwitch />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <div
                  className={cn(
                    "w-10 h-10 bg-gradient-to-br rounded-xl flex items-center justify-center shadow-lg",
                    config.accentGradientDark,
                  )}
                >
                  <BrandIcon className="w-5 h-5 text-white" />
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {config.sections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                const linkRows = section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={withSlug(item.href)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all",
                        config.hoverClasses,
                        active
                          ? `bg-gradient-to-r ${config.accentGradient} text-white ${config.activeHoverClasses} shadow-md`
                          : "text-slate-700",
                        isCollapsed ? "justify-center" : "",
                      )}
                      title={isCollapsed ? item.title : ""}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 flex-shrink-0",
                          active ? "text-white" : "text-slate-600",
                        )}
                      />
                      {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{item.title}</div>
                          {item.description && !active && (
                            <div className="text-xs text-slate-500 truncate">{item.description}</div>
                          )}
                        </div>
                      )}
                      {!isCollapsed && active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                    </Link>
                  );
                });
                return (
                  <CollapsibleNavSection
                    key={section.id}
                    title={section.title}
                    storageKey={`${config.role}:${section.id}`}
                    defaultOpen={section.defaultOpen}
                    containsActiveRoute={containsActive}
                    flatMode={isCollapsed}
                  >
                    {linkRows}
                  </CollapsibleNavSection>
                );
              })}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <SignOutButton collapsed={isCollapsed} />
            <Button
              variant="ghost"
              className={cn(
                "w-full text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                isCollapsed ? "justify-center px-2" : "justify-start",
              )}
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
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
      </div>
    </>
  );
}
