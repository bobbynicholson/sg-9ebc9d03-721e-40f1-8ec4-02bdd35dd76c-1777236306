/**
 * Shared sidebar for the staff portals (kitchen, driver, shopping,
 * cleaning). Each role hands in a `config` describing its branding,
 * sections, and mobile quick actions; everything else - mobile drawer,
 * desktop sidebar, collapse state, scroll restoration, slug-aware
 * hrefs, active-route matching - is identical.
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
import { useBrandingRow } from "@/lib/branding/useBranding";

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
  /** Optional icon overlay - e.g. small flame badge on top-right of
   *  the base icon during service hours. Wave 70.7. */
  iconOverlay?: (() => React.ReactNode);
}

export interface PortalSidebarSection {
  /** Stable id for localStorage section-open persistence - never change once shipped. */
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
   *  background, usually the full tenant palette. */
  accentGradient: string;
  /** Same gradient for the desktop logo tile. */
  accentGradientDark: string;
  /** Hover classes for nav links, usually brand-token based. */
  hoverClasses: string;
  /** Active-link hover override. */
  activeHoverClasses: string;
  /** Mobile drawer subtitle text colour. */
  mobileSubtitleClasses: string;
  /** Mobile search accent classes + hint copy. */
  searchAccent: string;
  searchHint: string;
  mobileQuickActions: PortalSidebarMobileQuickAction[];
  dashboardHref: string;
  sections: PortalSidebarSection[];
  /** Wave 70.7 - optional render slot for "live state" content
   *  (mode badge + count strip) that mounts above the nav sections
   *  on both desktop + mobile. Kept as a render function so the
   *  config can be statically declared and the live-fetching
   *  components mount inside the sidebar's React tree. */
  renderTopSlot?: () => React.ReactNode;
  /** Wave 70.7 - optional smart quick action provider for the
   *  mobile drawer. When supplied, overrides the static
   *  mobileQuickActions list with a context-aware set (e.g.
   *  rotating by service mode). Receives `onNavigate` so the
   *  custom component can close the drawer after a tap. */
  renderMobileQuickActions?: (ctx: { onNavigate: () => void }) => React.ReactNode;
  /** Which brand token this portal uses for small chrome accents. Drives the
   *  shared `--portal-accent-rgb` var so portal chrome that isn't in
   *  the nav (PortalHeader icon tile, etc.) matches the nav colour.
   *  Defaults to "primary" so admin-selected primary remains the lead
   *  colour across every portal. */
  leadToken?: "primary" | "accent" | "secondary";
  /** "dark" renders the rail, mobile top bar and drawer in forced dark
   *  chrome regardless of the page theme, by scoping Tailwind's `dark`
   *  class to the nav subtree. Every dark: style in the tree already
   *  exists, so the rail stays pixel-identical to the dark-mode nav.
   *  Used by the platform (super admin) portal to visually separate the
   *  SaaS command centre from tenant surfaces.
   *
   *  "brand" paints the rail, mobile top bar and drawer in the TENANT'S
   *  own colours (a primary→secondary gradient from the white-label
   *  palette, softly deepened for contrast) with white-glass rows - the
   *  same command-centre structure as the platform rail, but wearing the
   *  colours the admin chose instead of fixed slate. Repaints live when
   *  branding changes because it reads the --brand-*-rgb vars.
   *  Default: follow theme. */
  appearance?: "light" | "dark" | "brand";
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

  // Wave 70.7c - external open trigger. The kitchen service FAB
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

  // Publish this portal's lead accent to a shared CSS var so
  // portal chrome rendered outside the nav (PortalHeader icon tile, page
  // accents that opt into `portal-accent`) matches the nav colour. The
  // value points at the existing brand-*-rgb triplet, so it tracks
  // white-label re-theming live. Reset to primary on unmount so neutral
  // portal chrome keeps using the admin-selected lead colour.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const token = config.leadToken ?? "primary";
    const ref =
      token === "accent" ? "var(--brand-accent-rgb)" :
      token === "secondary" ? "var(--brand-secondary-rgb)" :
      "var(--brand-primary-rgb)";
    root.style.setProperty("--portal-accent-rgb", ref);
    return () => { root.style.setProperty("--portal-accent-rgb", "var(--brand-primary-rgb)"); };
  }, [config.leadToken]);

  const collapseKey = `${config.role}Nav-collapsed`;
  const forceDark = config.appearance === "dark";
  const forceBrand = config.appearance === "brand";
  // Brand rail paint: tenant primary→secondary gradient under a soft
  // slate scrim so white type is legible on ANY admin-chosen hue while
  // the surface still clearly reads as the brand colour (never generic
  // dark). Written as full literals so Tailwind JIT emits them.
  const BRAND_SURFACE =
    "bg-[linear-gradient(180deg,rgba(2,6,23,0.28),rgba(2,6,23,0.44)),linear-gradient(170deg,rgb(var(--brand-primary-rgb)),rgb(var(--brand-secondary-rgb)))]";
  // On the brand rail the config's brand-tinted hover/search classes are
  // tone-on-tone (invisible); swap them for white-glass equivalents.
  const searchAccent = forceBrand
    ? "bg-white/10 hover:bg-white/15 text-white"
    : config.searchAccent;
  const signOutBrandClass = forceBrand
    ? "border-transparent bg-transparent text-white/75 hover:border-white/15 hover:bg-white/10 hover:text-white"
    : undefined;

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

  // Tenant logo. When the company has uploaded a white-label logo we
  // show it in the brand tile instead of the generic role glyph, so the
  // admin + team portals carry the tenant's identity (not just colour).
  // Falls back to the gradient + BrandIcon for non-white-label tenants.
  const branding = useBrandingRow();
  const logoUrl = branding?.logoUrl || null;
  const companyName = branding?.companyName || config.mobileSubtitle || "Workspace";
  const LogoTile = ({ size }: { size: "sm" | "lg" }) => {
    const box = size === "sm" ? "w-8 h-8 rounded-lg" : "w-9 h-9 rounded-lg shadow-sm";
    const glyph = size === "sm" ? "w-4 h-4" : "w-5 h-5";
    if (logoUrl) {
      return (
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden bg-white border border-slate-200 dark:border-slate-700",
            box,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={config.title} className="w-full h-full object-contain p-0.5" />
        </div>
      );
    }
    return (
      <div className={cn("bg-gradient-to-br flex items-center justify-center", box, config.accentGradientDark)}>
        <BrandIcon className={cn(glyph, "text-white")} />
      </div>
    );
  };

  // Wave 70.7 - shared row renderer so the same row treatment is
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

    const badgeTone = forceBrand
      ? (
        // Glass badges for the brand-painted rail. Semantic hues survive
        // (rose = critical, amber = warning) but as light tints that stay
        // readable on any brand colour.
        badge?.tone === "critical" ? "bg-rose-400/25 text-rose-50 border-rose-200/40" :
        badge?.tone === "warning"  ? "bg-amber-300/25 text-amber-50 border-amber-200/40" :
        badge?.tone === "info"     ? "bg-white/15 text-white border-white/25" :
        "bg-white/10 text-white/85 border-white/20"
      )
      : (
        badge?.tone === "critical" ? "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" :
        badge?.tone === "warning"  ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" :
        badge?.tone === "info"     ? "bg-brand-accent/10 text-brand-accent border-brand-accent/20" :
        "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
      );

    return (
      <Link
        key={item.href}
        href={withSlug(item.href)}
        onClick={onClickAfterNav}
        className={cn(
          // Wave 70.41b - overflow-hidden so long badges + descriptions
          // never bleed outside the sidebar's right edge. Matches the
          // AdminNav fix Bobby flagged on "1 gap" badge overflow.
          // Density per dashboard best practice: ~40px rows (py-2.5), 14px
          // labels, 20px icons. Specific transition, not `all`.
          "group relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-transparent transition-colors duration-150",
          footer ? "px-3 py-2 text-[13px] font-medium" : "px-3 py-2.5 text-sm font-medium",
          // Brand rail: white-glass rows (brand-tinted states would be
          // tone-on-tone against the brand-painted surface).
          forceBrand
            ? active
              ? "border-white/25 bg-white/15 text-white shadow-sm"
              : footer ? "text-white/70" : "text-white/85"
            : active
              ? "border-brand-primary/20 bg-brand-primary/[0.07] text-slate-950 shadow-sm dark:border-brand-primary/30 dark:bg-brand-primary/10 dark:text-white"
              : footer ? "text-slate-600 dark:text-slate-400" : "text-slate-700 dark:text-slate-300",
          !active && (forceBrand ? "hover:bg-white/10 hover:text-white" : config.hoverClasses),
          collapsed ? "justify-center" : "",
        )}
        title={collapsed ? item.title : ""}
      >
        {/* Icon chip: a small rounded tile behind every nav glyph. Gives the
            rail a consistent visual anchor column and makes the active route
            read instantly (brand-tinted chip) without shouting. Footer rows
            stay chip-less so the deprioritised block keeps its lighter feel. */}
        <span
          className={cn(
            "relative flex flex-shrink-0 items-center justify-center transition-colors duration-150",
            footer
              ? ""
              : cn(
                  "h-8 w-8 rounded-lg border",
                  forceBrand
                    ? active
                      ? "border-white/30 bg-white/20"
                      : "border-white/10 bg-white/10 group-hover:border-white/20 group-hover:bg-white/15"
                    : active
                      ? "border-brand-primary/25 bg-brand-primary/10"
                      : "border-slate-200/70 bg-slate-100/70 group-hover:border-slate-300/80 group-hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-800/70 dark:group-hover:border-slate-600/80 dark:group-hover:bg-slate-800",
                ),
          )}
        >
          <Icon
            className={cn(
              footer ? "h-4 w-4" : "h-[18px] w-[18px]",
              forceBrand
                ? active
                  ? "text-white"
                  : "text-white/80 group-hover:text-white"
                : active
                  ? "text-brand-primary"
                  : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200",
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
                <div className={cn(
                  "text-[11px] truncate",
                  forceBrand ? "text-white/60" : "text-slate-500/90 dark:text-slate-400",
                )}>{description}</div>
              )}
            </div>
            {badge && !active && (
              <span
                className={cn(
                  // Wave 70.41b - max-width + truncate so long badge
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
            {active && (
              <ChevronRight
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  forceBrand ? "text-white" : "text-brand-primary",
                )}
              />
            )}
          </>
        )}
        {active && !collapsed && (
          <span
            className={cn(
              "absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full",
              forceBrand ? "bg-white" : "bg-brand-primary",
            )}
            aria-hidden="true"
          />
        )}
      </Link>
    );
  };

  const NavBody = ({
    mobile = false,
    hideSignOut = false,
  }: { mobile?: boolean; hideSignOut?: boolean } = {}) => (
    <ScrollArea
      className="h-full px-3 py-4"
    >
      <div className="space-y-4">
        {mobile && (
          <div className="space-y-3">
            <MobileSearchTrigger accent={searchAccent} hint={config.searchHint} />
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
        {/* Wave 70.7 - top slot (service mode + live state strip) */}
        {config.renderTopSlot && (
          <div>{config.renderTopSlot()}</div>
        )}
        {config.sections.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          if (section.footerTreatment) {
            // Footer sections render flat with a top divider, no
            // accordion. Visually deprioritised relative to main nav.
            return (
              <div key={section.id} className={cn(
                "pt-3 mt-2 border-t space-y-0.5",
                forceBrand ? "border-white/15" : "border-slate-200/80 dark:border-slate-700/60",
              )}>
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
              brandMode={forceBrand}
            >
              {section.items.map((item) => renderNavRow(item, {
                active: isActive(item.href),
                onClickAfterNav: () => setOpen(false),
              }))}
            </CollapsibleNavSection>
          );
        })}
        {!hideSignOut && (
          <div className={cn(
            "pt-4 border-t",
            forceBrand ? "border-white/15" : "border-slate-100 dark:border-slate-800",
          )}>
            <SignOutButton
              className={signOutBrandClass}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Wave 70.7c - skip-to-content link for keyboard / screen
          reader users. Visible only on focus. Targets #main-content
          which page layouts can opt into by adding the id to their
          main wrapper. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-brand-primary focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {/* Mobile header */}
      <div
        className={cn(
          "lg:hidden fixed top-0 left-0 right-0 z-50 border-b",
          // The `dark` class only affects DESCENDANTS (class strategy uses a
          // descendant selector), so the bar's own surface must be set
          // explicitly when the rail is forced dark.
          forceDark
            ? "dark bg-slate-950 border-slate-800"
            : forceBrand
              ? cn("dark border-black/10", BRAND_SURFACE)
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation menu"
                  className={forceBrand ? "text-white hover:bg-white/10 hover:text-white" : undefined}
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className={cn(
                  "w-[300px] sm:w-[350px] max-w-[85vw] p-0 flex flex-col",
                  forceDark && "dark border-slate-800 bg-slate-950 text-slate-100",
                  forceBrand && cn("dark border-black/10 text-white", BRAND_SURFACE),
                )}
              >
                <div
                  className={cn(
                    "flex-shrink-0 border-b px-4 py-3",
                    forceBrand
                      ? "border-white/15 bg-white/10"
                      : "border-slate-200 bg-[linear-gradient(180deg,rgb(var(--portal-accent-rgb)/0.07),rgb(var(--portal-accent-rgb)/0.02))] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgb(var(--portal-accent-rgb)/0.12),transparent)]",
                  )}
                  style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))" }}
                >
                  <Link
                    href={withSlug(config.dashboardHref)}
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <LogoTile size="lg" />
                    <div className="min-w-0">
                      <h2 className={cn("truncate text-sm font-semibold", forceBrand ? "text-white" : "text-slate-950 dark:text-white")}>{config.title}</h2>
                      <p className={cn("truncate text-xs", forceBrand ? "text-white/70" : "text-slate-600 dark:text-slate-400")}>{companyName}</p>
                    </div>
                  </Link>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <NavBody mobile hideSignOut />
                </div>
                {/* Pinned sign-out so the operator can always leave --
                    not buried under the nav scroll. */}
                <div
                  className={cn(
                    "border-t px-4 py-3 flex-shrink-0",
                    forceBrand
                      ? "border-white/15 bg-black/10"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
                  )}
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}
                >
                  <SignOutButton
                    className={signOutBrandClass}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Link href={withSlug(config.dashboardHref)} className="flex items-center gap-2 min-w-0">
              <LogoTile size="sm" />
              <span className={cn("font-bold truncate", forceBrand ? "text-white" : "text-slate-900 dark:text-white")}>{config.title}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Desktop sidebar. Width MUST match the team-portal page
          wrappers' lg:pl-72 xl:pl-80 offset - the old lg:w-64 xl:w-72
          left a permanent 32px dead gutter between nav and content. */}
      <div
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:border-r transition-all duration-300",
          // Same descendant-selector caveat as the mobile bar: the rail's
          // own surface needs explicit dark classes when forced dark.
          forceDark
            ? "dark lg:border-slate-800 lg:bg-slate-950"
            : forceBrand
              ? cn("dark lg:border-black/10 text-white", BRAND_SURFACE)
              : "lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900",
          isCollapsed ? "lg:w-20" : "lg:w-72 xl:w-80",
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand wash: the header block opens with a soft tint of the
              portal's lead colour (tracks white-label re-theming via the
              --portal-accent-rgb var) so the rail carries identity without
              a loud gradient. */}
          <div
            className={cn(
              "flex flex-col gap-3 border-b px-4 py-3",
              forceBrand
                ? "border-white/15 bg-white/10"
                : "border-slate-200 bg-[linear-gradient(180deg,rgb(var(--portal-accent-rgb)/0.07),rgb(var(--portal-accent-rgb)/0.02))] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgb(var(--portal-accent-rgb)/0.12),transparent)]",
            )}
          >
            {!isCollapsed ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Link href={withSlug(config.dashboardHref)} className="flex items-center gap-3 min-w-0 flex-1">
                    <LogoTile size="lg" />
                    <div className="min-w-0">
                      <h1 className={cn("font-bold truncate", forceBrand ? "text-white" : "text-slate-900 dark:text-white")}>{config.title}</h1>
                      <p className={cn("text-xs truncate", forceBrand ? "text-white/70" : "text-slate-600 dark:text-slate-400")}>{companyName}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <NotificationBell />
                    <ThemeSwitch />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <LogoTile size="lg" />
                <NotificationBell />
                <ThemeSwitch />
              </div>
            )}
          </div>

          {/* desktopScrollRef MUST live on this real desktop ScrollArea.
              It used to be wired only to NavBody's ScrollArea, which is
              rendered for mobile (ref={mobile ? undefined : ...}) so the
              ref always resolved to undefined and useNavScrollRestore
              attached to nothing - the desktop menu reset to the top on
              every navigation. */}
          <ScrollArea ref={desktopScrollRef} className="flex-1 px-3 py-4">
            <div className="space-y-4">
              {/* Wave 70.7 - desktop top slot (service mode + live state) */}
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
                        "pt-3 mt-2 border-t space-y-0.5",
                        forceBrand ? "border-white/15" : "border-slate-200/80 dark:border-slate-700/60",
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
                    brandMode={forceBrand}
                  >
                    {linkRows}
                  </CollapsibleNavSection>
                );
              })}
            </div>
          </ScrollArea>

          <div
            className={cn(
              "p-4 border-t space-y-2",
              forceBrand ? "border-white/15" : "border-slate-200 dark:border-slate-700",
            )}
          >
            <SignOutButton
              collapsed={isCollapsed}
              className={signOutBrandClass}
            />
            <Button
              variant="ghost"
              className={cn(
                "w-full",
                forceBrand
                  ? "text-white/75 hover:bg-white/10 hover:text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800",
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
