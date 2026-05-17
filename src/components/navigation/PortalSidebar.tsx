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
import { DigitalClock } from "@/components/portal/DigitalClock";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { buildIsActive } from "@/lib/navActiveMatcher";

export interface PortalSidebarNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  /** Optional badge text shown on the right of the row. The value is
   *  read from this function so the badge can be live (e.g. count of
   *  overdue tasks) without the config object having to know how to
   *  fetch state. Return null to hide the badge. Wave 70.7. */
  badge?: (() => { text: string; tone?: "default" | "warning" | "critical" | "info"; pulse?: boolean } | null);
  /** Optional dynamic description override. Lets the nav item show
   *  "Nothing on today" instead of the static description when count
   *  is zero. Wave 70.7. */
  liveDescription?: (() => string | null);
  /** Optional icon overlay -- e.g. small flame badge on top-right of
   *  the base icon during service hours. Wave 70.7. */
  iconOverlay?: (() => React.ReactNode);
}

export interface PortalSidebarSection {
  /** Stable id for localStorage section-open persistence -- never change once shipped. */
  id: string;
  title: string;
  defaultOpen: boolean;
  items: PortalSidebarNavItem[];
  /** When true, this section renders as a footer treatment: no
   *  collapsible header, smaller items, muted styling, sits below
   *  the main sections separated by a divider. Used for "less
   *  frequent" items like Notifications + Settings. Wave 70.7. */
  footerTreatment?: boolean;
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
  /** Wave 70.7 -- optional render slot for "live state" content
   *  (mode badge + count strip) that mounts above the nav sections
   *  on both desktop + mobile. Kept as a render function so the
   *  config can be statically declared and the live-fetching
   *  components mount inside the sidebar's React tree. */
  renderTopSlot?: () => React.ReactNode;
  /** Wave 70.7 -- optional smart quick action provider for the
   *  mobile drawer. When supplied, overrides the static
   *  mobileQuickActions list with a context-aware set (e.g.
   *  rotating by service mode). Receives `onNavigate` so the
   *  custom component can close the drawer after a tap. */
  renderMobileQuickActions?: (ctx: { onNavigate: () => void }) => React.ReactNode;
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

  // Wave 70.7c -- external open trigger. The kitchen service FAB
  // sits at the bottom-left during service hours and dispatches
  // this event to open the same drawer the top-burger opens. Other
  // portal-specific FABs can use the same pattern.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setOpen(true);
    const eventName = `${config.role}-fab:open-nav`;
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [config.role]);

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

  // Wave 70.7 -- shared row renderer so the same row treatment is
  // used in the mobile drawer + desktop expanded + desktop collapsed
  // modes. Honours per-item badge, live description, icon overlay,
  // and footer treatment (smaller font, muted, no description).
  const renderNavRow = (
    item: PortalSidebarNavItem,
    {
      active,
      collapsed = false,
      footer = false,
      onClickAfterNav,
    }: { active: boolean; collapsed?: boolean; footer?: boolean; onClickAfterNav?: () => void },
  ) => {
    const Icon = item.icon;
    const badge = item.badge ? item.badge() : null;
    const liveDesc = item.liveDescription ? item.liveDescription() : null;
    const overlay = item.iconOverlay ? item.iconOverlay() : null;
    const description = liveDesc !== null ? liveDesc : (item.description || null);

    const badgeTone =
      badge?.tone === "critical" ? "bg-rose-100 text-rose-800 border-rose-200" :
      badge?.tone === "warning"  ? "bg-amber-100 text-amber-800 border-amber-200" :
      badge?.tone === "info"     ? "bg-blue-100 text-blue-800 border-blue-200" :
      "bg-slate-100 text-slate-700 border-slate-200";

    return (
      <Link
        key={item.href}
        href={withSlug(item.href)}
        onClick={onClickAfterNav}
        className={cn(
          // Wave 70.41b -- overflow-hidden so long badges + descriptions
          // never bleed outside the sidebar's right edge. Matches the
          // AdminNav fix Bobby flagged on "1 gap" badge overflow.
          "group flex items-center gap-3 rounded-lg transition-all overflow-hidden",
          footer ? "px-3 py-2 text-[13px] font-medium" : "px-4 py-3 text-sm font-medium",
          config.hoverClasses,
          active
            ? `bg-gradient-to-r ${config.accentGradient} text-white ${config.activeHoverClasses} shadow-md`
            : footer ? "text-slate-600 dark:text-slate-400" : "text-slate-700",
          collapsed ? "justify-center" : "",
        )}
        title={collapsed ? item.title : ""}
      >
        <span className="relative flex-shrink-0">
          <Icon
            className={cn(
              footer ? "h-4 w-4" : "h-5 w-5",
              active ? "text-white" : footer ? "text-slate-500" : "text-slate-600",
            )}
          />
          {overlay && (
            <span className="absolute -top-1 -right-1 pointer-events-none">{overlay}</span>
          )}
        </span>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="truncate">{item.title}</div>
              {description && !active && !footer && (
                <div className="text-[11px] text-slate-500/80 truncate">{description}</div>
              )}
            </div>
            {badge && !active && (
              <span
                className={cn(
                  // Wave 70.41b -- max-width + truncate so long badge
                  // text doesn't push the row past the sidebar edge.
                  // flex-shrink-0 keeps the badge from being squashed
                  // when the title is short; max-w + truncate cap it
                  // when the title is long.
                  "inline-flex items-center justify-center px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tabular-nums flex-shrink-0 max-w-[80px] truncate",
                  badgeTone,
                  badge.pulse ? "motion-safe:animate-pulse" : "",
                )}
                aria-label={badge.text}
                title={badge.text}
              >
                {badge.text}
              </span>
            )}
            {active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
          </>
        )}
      </Link>
    );
  };

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
            {config.renderMobileQuickActions ? (
              config.renderMobileQuickActions({ onNavigate: () => setOpen(false) })
            ) : (
              <MobileQuickActions
                onNavigate={() => setOpen(false)}
                actions={config.mobileQuickActions.map((a) => ({
                  ...a,
                  href: withSlug(a.href),
                }))}
              />
            )}
          </div>
        )}
        {/* Wave 70.7 -- top slot (service mode + live state strip) */}
        {config.renderTopSlot && (
          <div>{config.renderTopSlot()}</div>
        )}
        {config.sections.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          if (section.footerTreatment) {
            // Footer sections render flat with a top divider, no
            // accordion. Visually deprioritised relative to main nav.
            return (
              <div key={section.id} className="pt-3 mt-2 border-t border-slate-200/80 dark:border-slate-700/60 space-y-0.5">
                {section.items.map((item) => renderNavRow(item, {
                  active: isActive(item.href),
                  footer: true,
                  onClickAfterNav: () => setOpen(false),
                }))}
              </div>
            );
          }
          return (
            <CollapsibleNavSection
              key={section.id}
              title={section.title}
              storageKey={`${config.role}:${section.id}`}
              defaultOpen={section.defaultOpen}
              containsActiveRoute={containsActive}
            >
              {section.items.map((item) => renderNavRow(item, {
                active: isActive(item.href),
                onClickAfterNav: () => setOpen(false),
              }))}
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
      {/* Wave 70.7c -- skip-to-content link for keyboard / screen
          reader users. Visible only on focus. Targets #main-content
          which page layouts can opt into by adding the id to their
          main wrapper. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-orange-600 focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

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
            {/* Wave 70.10 -- digital clock in the mobile header.
                Compact variant so it fits next to the bell + theme
                switch without crowding. */}
            <DigitalClock variant="mobile" className="hidden xs:inline-flex sm:inline-flex" />
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
          <div className="flex flex-col gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <div className="flex items-center justify-between">
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
                </div>
                {/* Wave 70.10 -- digital clock under the brand on
                    the desktop sidebar. Two-line variant: HH:mm
                    bold on top, day + date underneath. Live-ticking
                    every second so the operator always sees current
                    time without checking their phone. */}
                <DigitalClock variant="sidebar" />
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
            <div className="space-y-5">
              {/* Wave 70.7 -- desktop top slot (service mode + live state) */}
              {config.renderTopSlot && !isCollapsed && (
                <div>{config.renderTopSlot()}</div>
              )}
              {config.sections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                const linkRows = section.items.map((item) =>
                  renderNavRow(item, {
                    active: isActive(item.href),
                    collapsed: isCollapsed,
                  }),
                );
                if (section.footerTreatment) {
                  return (
                    <div
                      key={section.id}
                      className={cn(
                        "pt-3 mt-2 border-t border-slate-200/80 dark:border-slate-700/60 space-y-0.5",
                        isCollapsed ? "" : "",
                      )}
                    >
                      {linkRows}
                    </div>
                  );
                }
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
