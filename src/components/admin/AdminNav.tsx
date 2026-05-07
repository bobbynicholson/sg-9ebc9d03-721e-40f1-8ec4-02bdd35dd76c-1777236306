import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";
import { useTenantHref } from "@/lib/tenantUrl";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { useNavScrollRestore } from "@/hooks/useNavScrollRestore";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Users,
  Settings,
  Mail,
  MapPin,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { RegionFilterDropdown } from "@/components/admin/RegionFilterDropdown";
import { StaffViewSwitcher } from "@/components/admin/StaffViewSwitcher";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { canAccessFinance, isCompanyAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { toLocalISO } from "@/lib/localDate";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
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

  // Live "events today" pulse: count today's active orders so the user
  // can glance at the sidebar and know if anything's running right now.
  const [todayEventCount, setTodayEventCount] = useState<number | null>(null);
  useEffect(() => {
    const cid = (profile as any)?.company_id;
    if (!cid) return;
    let cancelled = false;
    const load = async () => {
      const todayISO = toLocalISO(new Date());
      const { count } = await (await import("@/integrations/supabase/client")).supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .eq("event_date", todayISO)
        .neq("status", "cancelled");
      if (!cancelled) setTodayEventCount(count ?? 0);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [(profile as any)?.company_id]);

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

  // Stage-1 restructure (signed off May 2026). Restructure decisions:
  //   - Refunds stays in Core (kept ungated; not moved behind the
  //     canAccessFinance gate Financial uses).
  //   - Inventory + Menu + Equipment + Hire-in pulled out of Core into
  //     dedicated Offering and Stock sections so Core daily-use stays
  //     scannable (was 12 items, now 8).
  //   - Departments renamed to "Teams" to match existing role naming.
  //   - Suppliers moves from Operations to Stock (operator tool, not
  //     a finance ledger).
  //   - Tax Overview moves from Operations to Financial. Shopping
  //     Dashboard moves from Operations to Teams (it's the shopping
  //     team's home).
  //   - Job Progress and HR Solutions surfaced for the first time in
  //     the nav (existing pages, were unreachable from sidebar).
  //   - Communications collapses 4 lifecycle / automation entries into
  //     a single "Lifecycle Emails" link (the sub-pages still resolve
  //     by URL; Stage 2 builds the hub-with-tabs).
  //   - Duplicate /admin/integrations link removed from Branding (sole
  //     copy now under Communications as "Zapier & Webhooks").
  //   - Stock + Wages flipped to defaultOpen:true (daily-use).
  //   - Sections marked NEW (Offering / Stock / Teams / Wages) are
  //     just regroupings of existing pages -- no Stage-2 dashboards
  //     yet. Those land in a follow-up commit.
  const adminNavSections: NavSection[] = [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        { title: "Analytics Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, description: "Business insights and metrics" },
      ],
    },
    {
      id: "core",
      title: "Core Management",
      defaultOpen: true,
      items: [
        { title: "Contacts",      href: "/admin/contacts",      icon: MessageSquare,    description: "CRM inbox -- everyone you've touched, sorted by next action" },
        { title: "Leads",         href: "/admin/leads",         icon: UserPlus,         description: "Active enquiry pipeline" },
        { title: "Quotes",        href: "/admin/quotes",        icon: FileSpreadsheet,  description: "Create and manage quotes" },
        { title: "Orders",        href: "/admin/orders",        icon: ClipboardList,    description: "View and manage orders" },
        { title: "Invoices",      href: "/admin/invoices",      icon: Receipt,          description: "Invoices issued for orders" },
        { title: "Refunds",       href: "/admin/refunds",       icon: CreditCard,       description: "Cancellation refunds, mark as paid" },
        { title: "Calendar",      href: "/admin/calendar",      icon: Calendar,         description: "Event scheduling" },
        { title: "Client Search", href: "/admin/client-search", icon: Search,           description: "Search and filter clients" },
      ],
    },
    {
      id: "offering",
      title: "Offering",
      defaultOpen: false,
      items: [
        { title: "Offering Hub", href: "/admin/offering", icon: Sparkles, description: "Menu + Equipment health at a glance" },
        { title: "Menu",         href: "/admin/menu",     icon: BookOpen, description: "Build menu items + recipes" },
        // Equipment moved to Stock as a hub-with-tabs (Catalog /
        // Availability / Shortages / Hire-in). Reachable from the
        // Offering Hub tile and from Stock.
      ],
    },
    {
      id: "stock",
      title: "Stock",
      defaultOpen: true, // Daily-use: kitchen + shopping check stock several times a day.
      items: [
        { title: "Stock Overview",     href: "/admin/stock",                 icon: BarChart3,    description: "Pressure feed: low ingredients, equipment commitments, hire-in due" },
        { title: "Food & Ingredients", href: "/admin/inventory",             icon: Package,      description: "Pantry + chiller stock outlook" },
        { title: "Equipment",          href: "/admin/equipment",             icon: Layers,       description: "Catalog, availability, shortages and hire-in -- all tabs" },
        { title: "Suppliers",          href: "/admin/suppliers",             icon: Building2,    description: "Supplier hub: contacts, products, spend" },
        // Hire-in lives as a tab inside /admin/equipment now. The
        // standalone /admin/equipment/hire-orders URL still resolves
        // for old bookmarks + notification deep-links.
      ],
    },
    {
      id: "teams",
      title: "Teams",
      defaultOpen: false,
      items: [
        { title: "Teams Hub", href: "/admin/teams",           icon: Briefcase,   description: "Monday-morning glance across every team" },
        { title: "Kitchen",   href: "/admin/teams/kitchen",   icon: ChefHat,     description: "Kitchen staff, duties, recipes" },
        { title: "Drivers",   href: "/admin/teams/drivers",   icon: Truck,       description: "Driver roster, settlement, routes, vehicles" },
        { title: "Shopping",  href: "/admin/shopping",        icon: ShoppingBag, description: "Procurement: buy now, plan ahead, scan slips" },
        { title: "Cleaning",  href: "/admin/teams/cleaning",  icon: Sparkles,    description: "Cleaning roster + workflows" },
      ],
    },
    // Wages exposes pay rates + R amounts -- gated behind the same
    // canAccessFinance check as Financial. region_admin / sales_admin
    // shouldn't be browsing what their colleagues earn. Public holidays
    // is config (operational), so it stays visible for everyone -- it
    // moves into Operations rather than Wages.
    ...(profile && canAccessFinance(profile.role as UserRole) ? [{
      id: "wages",
      title: "Wages",
      defaultOpen: true, // Daily/weekly use around payday + month-close.
      items: [
        { title: "All Wages Dashboard", href: "/admin/wages",             icon: Wallet,     description: "Hours x rates roll-up with overtime split" },
        { title: "Staff & Rates",       href: "/admin/staff",             icon: ChefHat,    description: "Pay rates per staff member" },
        { title: "Staff Hours",         href: "/admin/staff-hours",       icon: Clock,      description: "Track staff working hours" },
        { title: "Driver Settlement",   href: "/admin/driver-settlement", icon: DollarSign, description: "Per-driver pay summary -- hourly + distance + callout" },
      ],
    }] : []),
    {
      id: "operations",
      title: "Operations",
      defaultOpen: false,
      items: [
        { title: "Dispatch Queue",      href: "/admin/order-assignments",     icon: ClipboardList, description: "Get every order to a driver, fast" },
        { title: "Live Operations",     href: "/admin/tracking",              icon: MapPin,        description: "Today's jobs in flight" },
        { title: "Plan Routes",         href: "/admin/route-planning",        icon: Route,         description: "Auto-assign + optimise tomorrow" },
        { title: "Vehicles",            href: "/admin/vehicles",              icon: Truck,         description: "Fleet roster + cold-chain" },
        { title: "Regions",             href: "/admin/regions",               icon: MapPin,        description: "Manage service regions" },
        { title: "Equipment Shortages", href: "/admin/equipment?tab=shortages", icon: Bell,        description: "Track inventory issues" },
        { title: "Job Progress",        href: "/admin/job-progress-overview", icon: BarChart3,     description: "Cross-team progress on today's jobs" },
        { title: "Public Holidays",     href: "/admin/public-holidays",       icon: Calendar,      description: "SA gazetted dates + company customs. Drives the 2x BCEA rate." },
      ],
    },
    // Finance is role-gated: only owner / company_admin / super_admin
    // see it. Hides invoiced totals + cashflow from staff who only need
    // ops visibility. Refunds was deliberately NOT moved here -- the
    // gating would lock restricted admins out of refund processing.
    ...(profile && canAccessFinance(profile.role as UserRole) ? [{
      id: "finance",
      title: "Financial",
      defaultOpen: false,
      items: [
        { title: "Financial Dashboard", href: "/admin/financial-dashboard", icon: BarChart3, description: "Revenue, profitability, cashflow" },
        { title: "Tax Overview",        href: "/admin/tax-purchases",       icon: Receipt,   description: "Deductible totals + CSV export for the accountant" },
      ],
    }] : []),
    {
      id: "team",
      title: "Team Management",
      defaultOpen: false,
      items: [
        { title: "Full team",    href: "/admin/users",        icon: Users,     description: "Everyone with a login -- owners, admins, staff" },
        { title: "Onboarding",   href: "/admin/onboarding",   icon: Wand2,     description: "Bring your clients, orders and supplier slips on board" },
        { title: "HR Solutions", href: "/admin/hr-solutions", icon: Briefcase, description: "Compliance, contracts, day-to-day HR" },
      ],
    },
    {
      id: "comms",
      title: "Communications",
      defaultOpen: false,
      items: [
        { title: "Email Settings",        href: "/admin/email-settings",      icon: Mail,           description: "Connect Gmail, Outlook, SMTP, Mailchimp" },
        { title: "Zapier & Webhooks",     href: "/admin/integrations",        icon: Zap,            description: "Pipe leads + orders into 5,000+ apps" },
        { title: "Lead Capture Forms",    href: "/admin/integrations/embed",  icon: Code2,          description: "Public embeddable forms" },
        { title: "Messaging Templates",   href: "/admin/messaging-templates", icon: Sparkles,       description: "Edit every email + WhatsApp template" },
        // The four-route Lifecycle Emails hub didn't ship in Stage 2 --
        // we keep the link pointing at the templates page and label it
        // honestly until the hub-with-tabs lands. The After-Sales /
        // Automation URLs still resolve directly for old bookmarks.
        { title: "Email Templates",       href: "/admin/email-templates",     icon: MessageSquare, description: "After-sales follow-ups + automation templates" },
        { title: "Notification Settings", href: "/admin/notification-settings", icon: Bell,         description: "Configure notifications" },
      ],
    },
    // Branding + system settings are company-wide -- only company-level
    // admins should reach them. region_admin / sales_admin lose this
    // section. Duplicate Integrations link removed -- sole copy lives
    // under Communications now.
    ...(profile && isCompanyAdmin(profile.role as UserRole) ? [{
      id: "branding",
      title: "Branding & Settings",
      defaultOpen: false,
      items: [
        { title: "Company Profile", href: "/admin/company-profile", icon: Building2, description: "Address, branding, lat/lng for routing" },
        { title: "White Label",     href: "/admin/white-label",     icon: Palette,   description: "Branding customization" },
        { title: "System Settings", href: "/admin/settings",        icon: Settings,  description: "General configuration" },
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

  const NavContent = ({ mobile = false, hideSignOut = false }: { mobile?: boolean; hideSignOut?: boolean } = {}) => (
    <ScrollArea ref={scrollAreaRef} className="h-full py-6 px-4">
      <div className="space-y-6">
        {mobile ? (
          <div className="space-y-3">
            <MobileSearchTrigger accent="bg-purple-50 hover:bg-purple-100 text-purple-700" hint="Search anywhere..." />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={[
                { href: withSlug("/admin/calendar"), label: "Today's events", sub: "Calendar",                icon: Calendar, accent: "from-purple-500 to-pink-500" },
                { href: withSlug("/admin/leads"),    label: "New leads",      sub: "Quotes inbox",            icon: UserPlus, accent: "from-blue-500 to-indigo-500" },
                // Repointed from /admin/inventory to /admin/stock as
                // part of the Stage-3 cleanup. The new Stock hub mixes
                // ingredients + equipment commitments + hire-in pending,
                // which matches operator intent of "what needs my
                // attention right now" better than the food-only
                // inventory page did.
                { href: withSlug("/admin/stock"),    label: "Stock outlook",  sub: "Pressure across the board", icon: Package, accent: "from-emerald-500 to-teal-500" },
              ]}
            />
          </div>
        ) : (
          <CommandPaletteHint className="w-full justify-center" />
        )}
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
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={withSlug(item.href)}
                    onClick={() => setOpen(false)}
                    data-active={active ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-white" : "text-slate-500")} />
                    <span className="flex-1 truncate">{item.title}</span>
                    {active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  </Link>
                );
              })}
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
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
            <div className="space-y-6">
              {adminNavSections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                const linkRows = section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={withSlug(item.href)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-sm"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                        isCollapsed ? "justify-center" : ""
                      )}
                      title={isCollapsed ? item.title : ""}
                    >
                      <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-white" : "text-slate-500")} />
                      {!isCollapsed && <span className="flex-1 truncate">{item.title}</span>}
                      {!isCollapsed && active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                    </Link>
                  );
                });
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
