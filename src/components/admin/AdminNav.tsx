import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";
import { useTenantHref } from "@/lib/tenantUrl";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { useNavScrollRestore } from "@/hooks/useNavScrollRestore";
import { MobileSearchTrigger } from "@/components/portal/MobileDrawerExtras";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Users,
  Settings,
  Mail,
  MapPin,
  Map,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  Package,
  Building2,
  DollarSign,
  Search,
  Clock,
  TrendingUp,
  Bell,
  Menu,
  ChevronRight,
  Briefcase,
  MessageSquare,
  Truck,
  Layers,
  Calendar,
  CalendarHeart,
  UserPlus,
  FileSpreadsheet,
  Route,
  User,
  ShoppingBag,
  Zap,
  BarChart3,
  LogOut,
  ChefHat,
  BookOpen,
  Wand2,
  ChevronLeft,
  Palette,
  Code2,
  Sparkles,
  Receipt,
  Wallet,
  HardHat,
  Activity,
  Shield,
  CookingPot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { DigitalClock } from "@/components/portal/DigitalClock";
import { RegionFilterDropdown } from "@/components/admin/RegionFilterDropdown";
import { StaffViewSwitcher } from "@/components/admin/StaffViewSwitcher";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { canAccessFinance, isCompanyAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
// Wave 70.31 live intelligence layer.
import { AdminModeBadge } from "@/components/admin/AdminModeBadge";
import { AdminLiveStateStrip } from "@/components/admin/AdminLiveStateStrip";
import { AdminSmartQuickActions } from "@/components/admin/AdminSmartQuickActions";
import { useAdminLiveCounts } from "@/hooks/useAdminLiveCounts";
import { useAdminPortalMode } from "@/hooks/useAdminPortalMode";
import { useAdminModeToast } from "@/hooks/useAdminModeToast";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  /** Wave 70.31 -- optional live badge. Receives the live counts +
   *  mode so individual items can react (e.g. "5 overdue" critical
   *  when quotesOverdue > 0). Return null to render no badge. */
  badge?: () => { text: string; tone?: "default" | "warning" | "critical" | "info"; pulse?: boolean } | null;
  /** Wave 70.31 -- optional dynamic description override. */
  liveDescription?: () => string | null;
}

interface NavSection {
  /** Stable id for localStorage persistence -- never change once shipped. */
  id: string;
  title: string;
  /** Whether this section is open the first time a user sees it. Pick
   *  based on usage frequency: daily-use sections open, quarterly sections
   *  closed. The user can override and we remember their choice. */
  defaultOpen: boolean;
  items: NavItem[];
}

interface AdminNavProps {
  className?: string;
}

export function AdminNav({ className }: AdminNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);
  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);
  const [signingOut, setSigningOut] = useState(false);
  const { profile, company } = useAuth() as any;
  // Slug-aware href wrapper. Every internal link rendered by AdminNav
  // gets prefixed with the company slug so URLs read
  // /spit-braai-delivery/admin/<page> end-to-end. Bare /admin/<page>
  // hrefs in NAV_ITEMS keep the source readable; withSlug applies the
  // prefix at render time.
  const { withSlug } = useTenantHref();
  const companyName  = company?.company_name || "Admin Portal";
  const primaryColor   = company?.primary_color   || "#9333ea";
  const secondaryColor = company?.secondary_color || "#ec4899";
  // First two letters of the company name for the avatar tile
  const initials = (companyName as string)
    .split(" ")
    .map((s: string) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "CM";

  // Sidebar scroll restoration. Pure restore -- the operator chose
  // where to look, we don't auto-scroll the active item into view
  // and override that. Hook handles the Radix ScrollArea viewport
  // lookup + sessionStorage persistence.
  const scrollAreaRef = useNavScrollRestore<HTMLDivElement>("admin-nav");

  // Wave 70.31 -- live intelligence hooks. These replace the
  // standalone todayEventCount fetch that used to live here (the
  // count is now part of useAdminLiveCounts.eventsToday).
  const liveCounts = useAdminLiveCounts();
  const portalMode = useAdminPortalMode();
  useAdminModeToast();
  // Kept under the old name for the brand-tile pulse + drawer
  // subtitle copy so we don't have to touch the JSX below.
  const todayEventCount = liveCounts.eventsToday;

  // Close mobile drawer on every route change
  useEffect(() => {
    setOpen(false);
  }, [router.pathname]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutAndRedirect(profile);
  };
  
  // Get company slug for the view switcher
  const companySlug = profile?.company_slug || (router.query.company_slug as string) || "";

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("adminNav-collapsed");
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("adminNav-collapsed", JSON.stringify(newState));
  };

  // Wave 70.31 restructure (signed off May 2026):
  //
  //   12 sections collapsed to 8 around the owner's mental model:
  //
  //     TODAY      - live ops surface, always open, 4 items
  //     PIPELINE   - customer journey (was "Core Management")
  //     OPERATIONS - in-house execution
  //     MONEY      - all finance in one nucleus (gated)
  //     CATALOGUE  - stock + offering + suppliers merged
  //     PEOPLE     - team management + teams hub + HR merged
  //     SETTINGS   - all config + comms + audit log in one nucleus (gated)
  //     PLATFORM   - super_admin only (unchanged)
  //
  //   Key moves:
  //     - Audit Log surfaced in nav for the first time (Settings)
  //     - Wages folded into Money (was its own section)
  //     - "Team Management" + "Teams" + Wages-staff bits merged into People
  //     - "Communications" + "Branding & Settings" merged into Settings
  //     - Stock + Offering + Suppliers + Outsource + Shopping merged into Catalogue
  //
  //   Icon collisions resolved:
  //     - Financial Dashboard: DollarSign (was BarChart3 = collision with Stock + Job Progress)
  //     - Job Progress: Activity (was BarChart3)
  //     - Regions: Map (was MapPin = collision with Live Operations)
  //     - Public Holidays: CalendarHeart (was Calendar = collision)
  //     - Kitchen Settings: CookingPot (was ChefHat = collision with Kitchen)
  //
  //   Live wiring: badges + liveDescriptions on Today + Pipeline + Money
  //   items read from useAdminLiveCounts so the operator sees urgency
  //   inline without opening a page.
  const adminNavSections: NavSection[] = [
    {
      id: "today",
      title: "Today",
      defaultOpen: true,
      items: [
        {
          title: "Dashboard",
          href: "/admin/dashboard",
          icon: LayoutDashboard,
          description: "Live metrics + alerts",
          liveDescription: () => {
            const bits: string[] = [];
            if (liveCounts.eventsToday > 0) bits.push(`${liveCounts.eventsToday} event${liveCounts.eventsToday === 1 ? "" : "s"}`);
            if (liveCounts.inTransitNow > 0) bits.push(`${liveCounts.inTransitNow} live`);
            return bits.length ? bits.join(" · ") : "Quiet -- catch up";
          },
        },
        {
          title: "Dispatch",
          href: "/admin/order-assignments",
          icon: ClipboardList,
          description: "Assign drivers",
          badge: () => liveCounts.dispatchGaps > 0
            ? { text: `${liveCounts.dispatchGaps} gap${liveCounts.dispatchGaps === 1 ? "" : "s"}`, tone: "critical" as const, pulse: portalMode.mode === "ops" }
            : null,
        },
        {
          title: "Live operations",
          href: "/admin/tracking",
          icon: MapPin,
          description: "Today's jobs in flight",
          badge: () => liveCounts.inTransitNow > 0
            ? { text: `${liveCounts.inTransitNow} driving`, tone: "default" as const, pulse: true }
            : null,
        },
        {
          title: "Calendar",
          href: "/admin/calendar",
          icon: Calendar,
          description: "Event schedule",
        },
      ],
    },
    {
      id: "pipeline",
      title: "Pipeline",
      defaultOpen: true,
      items: [
        { title: "Contacts",      href: "/admin/contacts",      icon: MessageSquare,    description: "CRM inbox -- next-action sorted" },
        {
          title: "Leads",
          href: "/admin/leads",
          icon: UserPlus,
          description: "Active enquiry pipeline",
          badge: () => liveCounts.newLeadsToday > 0
            ? { text: `${liveCounts.newLeadsToday} today`, tone: "info" as const }
            : null,
        },
        {
          title: "Quotes",
          href: "/admin/quotes",
          icon: FileSpreadsheet,
          description: "Create and manage quotes",
          badge: () => liveCounts.quotesOverdue > 0
            ? { text: `${liveCounts.quotesOverdue} overdue`, tone: "warning" as const }
            : null,
        },
        { title: "Orders",        href: "/admin/orders",        icon: Package,          description: "All orders" },
        { title: "Client search", href: "/admin/client-search", icon: Search,           description: "Find any client" },
      ],
    },
    {
      id: "operations",
      title: "Operations",
      defaultOpen: false,
      items: [
        { title: "Plan routes",    href: "/admin/route-planning",        icon: Route,    description: "Auto-assign + optimise tomorrow" },
        { title: "Vehicles",       href: "/admin/vehicles",              icon: Truck,    description: "Fleet roster + cold-chain" },
        { title: "Regions",        href: "/admin/regions",               icon: Map,      description: "Manage service regions" },
        { title: "Job progress",   href: "/admin/job-progress-overview", icon: Activity, description: "Cross-team progress on today's jobs" },
        { title: "Public holidays", href: "/admin/public-holidays",      icon: CalendarHeart, description: "SA gazetted dates -- drives 2x BCEA rate" },
      ],
    },
    // MONEY -- one nucleus for everything financial. Gated.
    // Refunds stays here too (was previously in Core Mgmt ungated).
    // Restricted admins lose Refunds visibility -- acceptable
    // tradeoff for a single financial nucleus. The /admin/refunds
    // page still loads directly for anyone with link access.
    ...(profile && canAccessFinance(profile.role as UserRole) ? [{
      id: "money",
      title: "Money",
      defaultOpen: false,
      items: [
        { title: "Financial dashboard", href: "/admin/financial-dashboard", icon: DollarSign, description: "Revenue, profitability, cashflow" },
        {
          title: "Invoices",
          href: "/admin/invoices",
          icon: Receipt,
          description: "Issued + payment status",
          badge: () => liveCounts.unpaidValue > 0
            ? { text: "overdue", tone: "critical" as const }
            : null,
        },
        { title: "Refunds",             href: "/admin/refunds",             icon: CreditCard,    description: "Cancellation refunds" },
        { title: "Wages dashboard",     href: "/admin/wages",               icon: Wallet,        description: "Hours x rates with overtime split" },
        { title: "Staff & rates",       href: "/admin/staff",               icon: Users,         description: "Pay rates per staff member" },
        { title: "Staff hours",         href: "/admin/staff-hours",         icon: Clock,         description: "Track staff working hours" },
        { title: "Driver settlement",   href: "/admin/driver-settlement",   icon: DollarSign,    description: "Per-driver pay -- hourly + distance + callout" },
        { title: "Tax & purchases",     href: "/admin/tax-purchases",       icon: FileText,      description: "VAT exposure + deductible export" },
      ],
    }] : []),
    {
      id: "catalogue",
      title: "Catalogue",
      defaultOpen: false,
      items: [
        { title: "Offering hub",       href: "/admin/offering",            icon: Sparkles,  description: "Menu + Equipment health" },
        { title: "Menu",               href: "/admin/menu",                icon: BookOpen,  description: "Build items + recipes" },
        { title: "Stock overview",     href: "/admin/stock",               icon: BarChart3, description: "Pressure feed: low + commitments + hire-in" },
        { title: "Inventory",          href: "/admin/inventory",           icon: Package,   description: "Pantry + chiller outlook" },
        { title: "Equipment",          href: "/admin/equipment",           icon: Layers,    description: "Catalog, availability, shortages, hire-in" },
        { title: "Suppliers",          href: "/admin/suppliers",           icon: Building2, description: "Contacts, products, spend" },
        { title: "Outsource providers", href: "/admin/outsource-providers", icon: HardHat,   description: "Per-event chefs, florists, photographers" },
        { title: "Shopping",           href: "/admin/shopping",            icon: ShoppingBag, description: "Procurement: buy now, plan, slips" },
      ],
    },
    {
      id: "people",
      title: "People",
      defaultOpen: false,
      items: [
        { title: "Teams hub",      href: "/admin/teams",          icon: Briefcase,    description: "Monday glance across every team" },
        { title: "Full team",      href: "/admin/users",          icon: Users,        description: "Everyone with a login" },
        { title: "Kitchen team",   href: "/admin/teams/kitchen",  icon: ChefHat,      description: "Kitchen staff + duties" },
        { title: "Drivers team",   href: "/admin/teams/drivers",  icon: Truck,        description: "Driver roster + routes" },
        { title: "Cleaning team",  href: "/admin/teams/cleaning", icon: Sparkles,     description: "Cleaning roster + workflows" },
        { title: "HR solutions",   href: "/admin/hr-solutions",   icon: Briefcase,    description: "Compliance, contracts, HR" },
        { title: "Onboarding",     href: "/admin/onboarding",     icon: Wand2,        description: "Bring clients + orders + slips on board" },
      ],
    },
    // SETTINGS -- one nucleus for everything config. Gated to
    // company-admin. Includes comms, branding, integrations, audit
    // log (NEW in nav -- previously a hidden page).
    ...(profile && isCompanyAdmin(profile.role as UserRole) ? [{
      id: "settings",
      title: "Settings",
      defaultOpen: false,
      items: [
        { title: "Company profile",     href: "/admin/company-profile",       icon: Building2,     description: "Address, branding, lat/lng for routing" },
        { title: "Branding",            href: "/admin/white-label",           icon: Palette,       description: "Logo, colours, white-label" },
        { title: "Kitchen rules",       href: "/admin/kitchen-settings",      icon: CookingPot,    description: "Prep timing, BCEA thresholds, dietary alerts" },
        { title: "Email",               href: "/admin/email-settings",        icon: Mail,          description: "SMTP, Gmail, Outlook, Mailchimp" },
        { title: "Integrations",        href: "/admin/integrations",          icon: Zap,           description: "Zapier, webhooks, 5,000+ apps" },
        { title: "Lead capture forms",  href: "/admin/integrations/embed",    icon: Code2,         description: "Public embeddable forms" },
        { title: "Messaging templates", href: "/admin/messaging-templates",   icon: MessageSquare, description: "Edit every email + WhatsApp template" },
        { title: "Lifecycle emails",    href: "/admin/email-templates",       icon: Sparkles,      description: "After-sales follow-ups + automation" },
        { title: "Notifications",       href: "/admin/notification-settings", icon: Bell,          description: "Channel routing + opt-ins" },
        { title: "Audit log",           href: "/admin/audit-logs",            icon: Shield,        description: "Compliance trail -- who did what" },
        { title: "System",              href: "/admin/settings",              icon: Settings,      description: "General configuration" },
      ],
    }] : []),
    ...(profile && profile.role === "super_admin" ? [{
      id: "platform",
      title: "Platform Admin",
      defaultOpen: false,
      items: [
        {
          title: "Platform Dashboard",
          href: "/admin/platform/dashboard",
          icon: LayoutDashboard,
          description: "Platform overview"
        },
        {
          title: "Company Database",
          href: "/admin/platform/company-database",
          icon: Building2,
          description: "Manage all companies"
        },
        {
          title: "User Management",
          href: "/admin/platform/user-management",
          icon: Users,
          description: "Platform-wide users"
        },
        {
          title: "Subscription Management",
          href: "/admin/platform/subscription-management",
          icon: CreditCard,
          description: "Platform subscriptions"
        },
        {
          title: "Pricing Management",
          href: "/admin/platform/pricing-management",
          icon: DollarSign,
          description: "Manage pricing tiers"
        },
        {
          title: "Trial Management",
          href: "/admin/platform/trial-management",
          icon: Clock,
          description: "Manage trial periods"
        },
        {
          title: "Currency Monitoring",
          href: "/admin/platform/currency-monitoring",
          icon: TrendingUp,
          description: "Monitor exchange rates"
        },
        {
          title: "CMS Blog",
          href: "/admin/platform/cms-blog",
          icon: FileText,
          description: "Manage blog content"
        },
        {
          title: "CMS Pages",
          href: "/admin/platform/cms-pages",
          icon: Globe,
          description: "Manage static pages"
        },
        {
          title: "SA Tax Rules",
          href: "/admin/platform/tax-rules",
          icon: FileText,
          description: "Edit slip-scanner deductibility rules"
        }
      ]
    }] : []),
    {
      id: "account",
      title: "Account",
      defaultOpen: false,
      items: [
        {
          title: "My Profile",
          href: "/account/settings",
          icon: User,
          description: "Personal settings"
        }
      ]
    }
  ];

  // Path-vs-href matcher used by both highlight logic and section
  // auto-expand. Matches sub-paths so /admin/onboarding/imports lights
  // up the Onboarding entry; the trailing "/" boundary check keeps
  // /admin/orders from matching /admin/order-assignments.
  //
  // Query-param awareness: when an href specifies query params (e.g.
  // /admin/equipment?tab=shortages), every key in the href's query
  // must match the current URL's query for the entry to count as
  // active. Plain hrefs (no query) match path-only as before. This
  // lets two nav items share a path but disambiguate by tab -- the
  // longest-match resolver below then picks the more specific one.
  const splitHref = (h: string): { path: string; query: URLSearchParams | null } => {
    const i = h.indexOf("?");
    if (i < 0) return { path: h, query: null };
    return { path: h.slice(0, i), query: new URLSearchParams(h.slice(i + 1)) };
  };

  const matchesHref = (href: string) => {
    const { path: hrefPath, query: hrefQuery } = splitHref(href);
    const slugHrefPath = splitHref(withSlug(href)).path;
    const stripQuery = (p: string) => p.split("?")[0];
    // Candidates are the *current* location -- the user's actual URL.
    // slugHrefPath is the link being tested, NOT a current-location
    // value, so it must never appear here. (Older code had it in this
    // list, which made the third comparison `c === slugHrefPath`
    // trivially true on the link's own iteration -- every nav item
    // ended up "matching", and the longest-match resolver lit up the
    // longest href on every page.)
    const candidates = [
      stripQuery(router.pathname),
      stripQuery(router.asPath),
    ];
    let pathMatched = false;
    for (const c of candidates) {
      if (c === hrefPath || c === slugHrefPath) { pathMatched = true; break; }
      if (c.startsWith(hrefPath + "/") || c.startsWith(slugHrefPath + "/")) { pathMatched = true; break; }
    }
    if (!pathMatched) return false;
    // No query in the href: pure path match wins.
    if (!hrefQuery) return true;
    // Href specifies query keys: every one of them must match the
    // current URL's query value to count as active.
    const currentQ = new URLSearchParams(router.asPath.split("?")[1] || "");
    for (const [k, v] of hrefQuery.entries()) {
      if (currentQ.get(k) !== v) return false;
    }
    return true;
  };

  // Longest-match resolution. When the active route is /admin/equipment/
  // hire-orders, BOTH Equipment (`/admin/equipment`) and Hire-in Orders
  // (`/admin/equipment/hire-orders`) match via the prefix rule -- but only
  // the more specific one should visually highlight. We resolve once per
  // render: collect every nav href that matches, sort by length desc,
  // pick the longest. `isActive` then becomes equality against that
  // single winner.
  const activeHref = (() => {
    const all = adminNavSections.flatMap((s) => s.items.map((i) => i.href));
    const matching = all.filter(matchesHref);
    if (matching.length === 0) return null;
    return matching.sort((a, b) => b.length - a.length)[0];
  })();
  const isActive = (href: string) => href === activeHref;

  const SignOutBlock = ({ collapsed = false }: { collapsed?: boolean }) => (
    <Button
      variant="ghost"
      onClick={handleSignOut}
      disabled={signingOut}
      title="Sign out"
      className={cn(
        "w-full mt-3 border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
        collapsed ? "justify-center px-2" : "justify-start gap-3 px-4"
      )}
    >
      <LogOut className="h-4 w-4" />
      {!collapsed && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
    </Button>
  );

  // Wave 70.31 -- shared nav row renderer that honours the new
  // badge + liveDescription fields on NavItem. Used in both the
  // mobile drawer and the desktop sidebar so the treatment stays
  // identical across breakpoints.
  const renderNavRow = (item: NavItem, opts: { active: boolean; collapsed?: boolean; onClickAfterNav?: () => void }) => {
    const Icon = item.icon;
    const badge = item.badge ? item.badge() : null;
    const liveDesc = item.liveDescription ? item.liveDescription() : null;
    const desc = liveDesc !== null ? liveDesc : item.description ?? null;
    const badgeTone =
      badge?.tone === "critical" ? "bg-rose-100 text-rose-800 border-rose-200" :
      badge?.tone === "warning"  ? "bg-amber-100 text-amber-800 border-amber-200" :
      badge?.tone === "info"     ? "bg-blue-100 text-blue-800 border-blue-200" :
      "bg-slate-100 text-slate-700 border-slate-200";

    return (
      <Link
        key={item.href}
        href={withSlug(item.href)}
        onClick={opts.onClickAfterNav}
        data-active={opts.active ? "true" : undefined}
        title={opts.collapsed ? item.title : ""}
        className={cn(
          // Wave 70.41b -- overflow-hidden so badges + descriptions
          // never bleed outside the sidebar's right edge (Bobby
          // flagged the "1 gap" badge on Dispatch leaking into the
          // main content area). Combined with the badge max-width
          // below this caps the row content within the row width.
          "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors overflow-hidden",
          opts.active
            ? "bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-sm"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
          opts.collapsed ? "justify-center" : "",
        )}
      >
        <Icon className={cn("h-4 w-4 flex-shrink-0", opts.active ? "text-white" : "text-slate-500")} />
        {!opts.collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="truncate">{item.title}</div>
              {desc && !opts.active && (
                <div className="text-[10px] text-slate-500/80 truncate">{desc}</div>
              )}
            </div>
            {badge && !opts.active && (
              <span
                className={cn(
                  // Wave 70.41b -- max-width + truncate cap badge
                  // width so badges with long text ("12 overdue")
                  // don't push the row past the sidebar edge.
                  // title attribute preserves the full text on hover.
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
            {opts.active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
          </>
        )}
      </Link>
    );
  };

  const NavContent = ({ mobile = false, hideSignOut = false }: { mobile?: boolean; hideSignOut?: boolean } = {}) => (
    <ScrollArea ref={scrollAreaRef} className="h-full py-6 px-4">
      <div className="space-y-5">
        {mobile ? (
          <div className="space-y-3">
            <MobileSearchTrigger accent="bg-purple-50 hover:bg-purple-100 text-purple-700" hint="Search anywhere..." />
            {/* Wave 70.31 -- mode-driven smart quick actions replace
                the static trio. Rotates by mode (setup/quiet/pipeline/
                ops/review). */}
            <AdminSmartQuickActions onNavigate={() => setOpen(false)} />
          </div>
        ) : (
          <CommandPaletteHint className="w-full justify-center" />
        )}
        {/* Wave 70.31 -- live intelligence layer above the sections.
            Mode badge + 2x3 live state pill grid. Mounted on both
            mobile drawer + desktop expanded sidebar. */}
        <div className="space-y-2">
          <AdminModeBadge />
          <AdminLiveStateStrip />
        </div>
        {adminNavSections.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          return (
            <CollapsibleNavSection
              key={section.id}
              title={section.title}
              storageKey={`admin:${section.id}`}
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
        {!hideSignOut && <SignOutBlock />}
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile Header (single source of truth for the mobile drawer) */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[300px] sm:w-[350px] max-w-[85vw] p-0 flex flex-col"
              >
                <div
                  className="px-6 py-4 border-b text-white flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                    paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))",
                  }}
                >
                  <h2 className="text-xl font-bold">{companyName}</h2>
                  <p className="text-sm opacity-90 mt-1">
                    {todayEventCount && todayEventCount > 0
                      ? `${todayEventCount} event${todayEventCount === 1 ? "" : "s"} today`
                      : "Admin portal"}
                  </p>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <NavContent mobile hideSignOut />
                </div>
                {/* Pinned sign-out so the most-used 'leave the app' action is
                    one tap away on mobile, not buried under 50 nav items. */}
                <div
                  className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex-shrink-0 bg-white dark:bg-slate-900"
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}
                >
                  <SignOutBlock />
                </div>
              </SheetContent>
            </Sheet>
            <Link href={withSlug("/admin/dashboard")} className="flex items-center gap-2 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
              >
                {company?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logo_url} alt={companyName} className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <span className="text-white font-bold text-xs">{initials}</span>
                )}
              </div>
              <span className="font-bold text-slate-900 dark:text-white truncate">{companyName}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {/* Wave 70.10 -- digital clock in mobile header. Hidden
                on the smallest screens so the brand + bell + theme
                still fit comfortably. */}
            <DigitalClock variant="mobile" className="hidden sm:inline-flex" />
            <RegionFilterDropdown />
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 ${
        isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72"
      }`}>
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex flex-col gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <div className="flex items-center justify-between gap-2">
                <Link href={withSlug("/admin/dashboard")} className="flex items-center gap-3 min-w-0">
                  <div
                    className="relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
                  >
                    {company?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={company.logo_url} alt={companyName} className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <span className="text-white font-bold">{initials}</span>
                    )}
                    {!!todayEventCount && todayEventCount > 0 && (
                      <span
                        className="absolute -top-1 -right-1 flex h-3 w-3"
                        title={`${todayEventCount} event${todayEventCount === 1 ? "" : "s"} on today`}
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-white" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-bold text-slate-900 dark:text-white truncate">{companyName}</h1>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {todayEventCount && todayEventCount > 0
                        ? `${todayEventCount} event${todayEventCount === 1 ? "" : "s"} today`
                        : "Admin portal"}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <RegionFilterDropdown />
                  <NotificationBell />
                  {companySlug && <StaffViewSwitcher companySlug={companySlug} />}
                  <ThemeSwitch />
                </div>
                </div>
                {/* Wave 70.10 -- digital clock under the brand row.
                    Two-line variant: HH:mm + day/date, ticking
                    every second so the admin sees current time
                    without checking their phone. */}
                <DigitalClock variant="sidebar" />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <div
                  className="relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
                  title={companyName}
                >
                  {company?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={company.logo_url} alt={companyName} className="w-full h-full rounded-xl object-cover" />
                  ) : (
                    <span className="text-white font-bold text-sm">{initials}</span>
                  )}
                  {!!todayEventCount && todayEventCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-white" />
                    </span>
                  )}
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-5">
              {/* Wave 70.31 -- live intelligence layer on the desktop
                  sidebar too. Hidden when the sidebar is collapsed to
                  icon-only mode (no room for pills + badge). */}
              {!isCollapsed && (
                <div className="space-y-2">
                  <AdminModeBadge />
                  <AdminLiveStateStrip />
                </div>
              )}
              {adminNavSections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                const linkRows = section.items.map((item) => renderNavRow(item, {
                  active: isActive(item.href),
                  collapsed: isCollapsed,
                }));
                return (
                  <CollapsibleNavSection
                    key={section.id}
                    title={section.title}
                    storageKey={`admin:${section.id}`}
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

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <SignOutBlock collapsed={isCollapsed} />
            <Button
              variant="ghost"
              className={`w-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 ${
                isCollapsed ? "justify-center px-2" : "justify-start"
              }`}
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
