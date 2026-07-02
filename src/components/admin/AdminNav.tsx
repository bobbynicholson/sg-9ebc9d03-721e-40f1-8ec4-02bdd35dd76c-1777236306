/**
 * AdminNav - tenant (company) admin sidebar.
 *
 * Wave 72 redesign: rebuilt on the shared PortalSidebar primitive (the
 * same component the kitchen / driver / shopping / cleaning portals and
 * the platform admin now use) so the tenant admin matches the rest of the
 * product - item descriptions, live badges, footer treatment, collapse,
 * notification bell + theme switch + clock, mobile drawer - all for free.
 *
 * What's preserved from the bespoke 895-line implementation:
 *   - the full Wave 70.31 information architecture (Today, Pipeline,
 *     Operations, Money[gated], Catalogue, People[+payroll gated],
 *     Settings[gated], Platform[super_admin], Account)
 *   - the live badges + liveDescriptions wired to useAdminLiveCounts
 *   - the admin-specific top-slot extras: identity strip, command-palette
 *     hint, region filter, staff-view switcher, mode badge + live strip
 *   - mode-driven smart quick actions in the mobile drawer
 *
 * role:"admin" keeps the same localStorage keys (adminNav-collapsed,
 * admin-nav scroll) the old nav used, so operators don't lose state.
 * All hrefs are bare /admin/* and PortalSidebar's withSlug() prefixes the
 * tenant slug at render time; /admin/platform/* + /account/* are global
 * prefixes so they stay un-prefixed.
 */

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
  Banknote,
  Clock,
  TrendingUp,
  Bell,
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
  ChefHat,
  BookOpen,
  Wand2,
  Palette,
  Code2,
  Sparkles,
  Receipt,
  Wallet,
  Star,
  HardHat,
  Activity,
  Shield,
  CookingPot,
} from "lucide-react";
import { useRouter } from "next/router";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessFinance } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { PortalSidebar, type PortalSidebarConfig, type PortalSidebarSection } from "@/components/navigation/PortalSidebar";
import { BRAND_PORTAL_PALETTE, BRAND_ACCENT } from "@/lib/branding/portalPalette";
import { RegionFilterDropdown } from "@/components/admin/RegionFilterDropdown";
import { StaffViewSwitcher } from "@/components/admin/StaffViewSwitcher";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { AdminSmartQuickActions } from "@/components/admin/AdminSmartQuickActions";
import { useAdminLiveCounts } from "@/hooks/useAdminLiveCounts";
import { useAdminPortalMode } from "@/hooks/useAdminPortalMode";
import { useAdminModeToast } from "@/hooks/useAdminModeToast";

interface AdminNavProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Top slot: identity strip + command-palette hint + region filter +
// staff-view switcher + live intelligence (mode badge + state strip).
// Mounts above the nav sections on both desktop expanded + mobile drawer,
// mirroring PlatformNav's renderTopSlot pattern.
// ---------------------------------------------------------------------------

function AdminTopSlot({ companySlug }: { companySlug: string }) {
  const { profile, company } = useAuth() as any;
  const companyName = company?.company_name || "Admin Portal";
  const initials =
    (companyName as string)
      .split(" ")
      .map((s: string) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "CM";

  return (
    <div className="space-y-3">
      <CommandPaletteHint className="w-full justify-center" />

      {/* Company identity */}
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-primary/30 bg-brand-primary/10">
          <span className="text-[11px] font-bold text-brand-primary">{initials}</span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {companyName}
            </span>
            <Badge
              variant="outline"
              className="h-4 flex-shrink-0 border-brand-primary/20 bg-brand-primary/10 px-1 text-[9px] text-brand-primary"
            >
              Admin
            </Badge>
          </div>
          <div className="truncate text-[11px] leading-tight text-slate-400">
            {profile?.full_name || profile?.email || ""}
          </div>
        </div>
      </div>

      {/* Compact utility row: region scope + (super-admin) staff-view
          switch. Matched to the platform sidebar's restraint - the mode
          badge + 2x3 live-state pill grid that used to sit here were
          dropped from the nav (that live intelligence lives on the
          dashboard) so the navigation isn't pushed down the rail. */}
      <div className="flex flex-wrap items-center gap-2">
        <RegionFilterDropdown />
        {companySlug && <StaffViewSwitcher companySlug={companySlug} />}
      </div>
    </div>
  );
}

export function AdminNav(_: AdminNavProps = {}) {
  const router = useRouter();
  const { profile } = useAuth() as any;

  // Live intelligence hooks - badges + liveDescriptions below close over
  // these so the operator sees urgency inline without opening a page.
  const liveCounts = useAdminLiveCounts();
  const portalMode = useAdminPortalMode();
  useAdminModeToast();

  const companySlug =
    profile?.company_slug || (router.query.company_slug as string) || "";

  // Wave 70.31 information architecture (signed off May 2026). Section ids
  // are stable - never rename or operators lose saved open/closed state.
  const sections: PortalSidebarSection[] = [
    {
      id: "today",
      title: "Today",
      defaultOpen: true,
      items: [
        {
          title: "Dashboard",
          href: "/admin/dashboard",
          icon: LayoutDashboard,
          description: "Daily overview",
          liveDescription: () => {
            const bits: string[] = [];
            if (liveCounts.eventsToday > 0) bits.push(`${liveCounts.eventsToday} event${liveCounts.eventsToday === 1 ? "" : "s"}`);
            if (liveCounts.inTransitNow > 0) bits.push(`${liveCounts.inTransitNow} live`);
            return bits.length ? bits.join(" · ") : "Quiet - catch up";
          },
        },
        {
          title: "Dispatch",
          href: "/admin/order-assignments",
          icon: ClipboardList,
          description: "Driver assignments",
          badge: () => liveCounts.dispatchGaps > 0
            ? { text: `${liveCounts.dispatchGaps} gap${liveCounts.dispatchGaps === 1 ? "" : "s"}`, tone: "critical" as const, pulse: portalMode.mode === "ops" }
            : null,
        },
        {
          title: "Live operations",
          href: "/admin/tracking",
          icon: MapPin,
          description: "Today + GPS",
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
      title: "Sales",
      defaultOpen: true,
      items: [
        { title: "Contacts",      href: "/admin/contacts",      icon: MessageSquare,    description: "Inbox and follow-ups" },
        {
          title: "Leads",
          href: "/admin/leads",
          icon: UserPlus,
          description: "New enquiries",
          badge: () => liveCounts.newLeadsToday > 0
            ? { text: `${liveCounts.newLeadsToday} today`, tone: "info" as const }
            : null,
        },
        {
          title: "Quotes",
          href: "/admin/quotes",
          icon: FileSpreadsheet,
          description: "Build and send quotes",
          badge: () => liveCounts.quotesOverdue > 0
            ? { text: `${liveCounts.quotesOverdue} overdue`, tone: "warning" as const }
            : null,
        },
        {
          title: "Orders",
          href: "/admin/orders",
          icon: Package,
          description: "Booked events",
          liveDescription: () => liveCounts.eventsToday > 0
            ? `${liveCounts.eventsToday} today`
            : "Booked events",
        },
        {
          title: "Invoices",
          href: "/admin/invoices",
          icon: Receipt,
          description: "Payments and status",
          badge: () => liveCounts.unpaidValue > 0
            ? { text: "overdue", tone: "critical" as const }
            : null,
        },
        { title: "Reviews",       href: "/admin/reviews",       icon: Star,             description: "Client ratings + comments" },
      ],
    },
    {
      id: "operations",
      title: "Operations",
      defaultOpen: false,
      items: [
        { title: "Routes",          href: "/admin/route-planning",  icon: Route,         description: "Plan tomorrow" },
        { title: "Vehicles",        href: "/admin/vehicles",        icon: Truck,         description: "Fleet and cold chain" },
        { title: "Regions",         href: "/admin/regions",         icon: Map,           description: "Manage service regions" },
      ],
    },
    // MONEY - finance nucleus, gated to finance-bearing roles.
    ...(profile && canAccessFinance(profile.role as UserRole) ? [{
      id: "money",
      title: "Finance",
      defaultOpen: false,
      items: [
        { title: "Finance overview", href: "/admin/financial-dashboard", icon: Banknote, description: "Revenue and margin" },
        { title: "Recurring invoices", href: "/admin/recurring-invoices", icon: Receipt, description: "Repeat billing schedules" },
        { title: "Cashflow",         href: "/admin/cashflow-dashboard",  icon: TrendingUp, description: "30-day forecast" },
        { title: "Balances",         href: "/admin/outstanding-balances", icon: Wallet, description: "Client money due" },
        { title: "Payables",         href: "/admin/payables",      icon: FileText,   description: "Supplier invoices" },
        { title: "Fixed costs",      href: "/admin/fixed-costs",   icon: Wallet,     description: "Recurring costs" },
        { title: "Refunds",         href: "/admin/refunds",       icon: CreditCard, description: "Cancellation refunds" },
        { title: "Tax & purchases", href: "/admin/tax-purchases", icon: FileText,   description: "VAT and deductions" },
        { title: "Health checks",    href: "/admin/money-health", icon: Activity, description: "Money and email drift" },
      ],
    } as PortalSidebarSection] : []),
    {
      id: "catalogue",
      title: "Catalogue",
      defaultOpen: false,
      items: [
        { title: "Offering",            href: "/admin/offering",            icon: Sparkles,    description: "Menu and equipment hub" },
        { title: "Menu",                href: "/admin/menu",                icon: BookOpen,    description: "Items and recipes" },
        { title: "Stock",               href: "/admin/stock",               icon: BarChart3,   description: "Low and committed stock" },
        { title: "Inventory",           href: "/admin/inventory",           icon: Package,     description: "Pantry and chiller" },
        { title: "Equipment",           href: "/admin/equipment",           icon: Layers,      description: "Availability and hire-in" },
        { title: "Suppliers",           href: "/admin/suppliers",           icon: Building2,   description: "Contacts, products, spend" },
        { title: "Outsource",           href: "/admin/outsource-providers", icon: HardHat,     description: "External event help" },
        { title: "Shopping",            href: "/admin/shopping",            icon: ShoppingBag, description: "Buy lists and slips" },
      ],
    },
    {
      id: "people",
      title: "Team",
      defaultOpen: false,
      items: [
        { title: "Teams hub",     href: "/admin/teams",          icon: Briefcase, description: "All teams at a glance" },
        { title: "Users & roles",  href: "/admin/users",          icon: Users,     description: "Access and permissions" },
        { title: "Kitchen",       href: "/admin/teams/kitchen",  icon: ChefHat,   description: "Prep staff and duties" },
        { title: "Drivers",       href: "/admin/teams/drivers",  icon: Truck,     description: "Roster and routes" },
        { title: "Driver schedule", href: "/admin/driver-schedule", icon: Clock,   description: "Weekly shift grid" },
        { title: "Cleaning",      href: "/admin/teams/cleaning", icon: Sparkles,  description: "Roster and workflows" },
        { title: "HR",            href: "/admin/hr-solutions",   icon: Briefcase, description: "Contracts and compliance" },
        ...((profile && [
          UserRole.SUPER_ADMIN,
          UserRole.OWNER,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
        ].includes(profile.role as UserRole)) ? [
          { title: "Holiday calendar", href: "/admin/public-holidays", icon: CalendarHeart, description: "Payroll rate dates" },
        ] : []),
        { title: "Onboarding",    href: "/admin/onboarding",     icon: Wand2,     description: "Import clients and orders" },
        // Payroll cluster - same finance gate as Money.
        ...(profile && canAccessFinance(profile.role as UserRole) ? [
          { title: "Wages",            href: "/admin/wages",             icon: Wallet,     description: "Hours, rates, overtime" },
          { title: "Staff rates",      href: "/admin/staff",             icon: Users,      description: "Pay rates" },
          { title: "Staff hours",      href: "/admin/staff-hours",       icon: Clock,      description: "Time worked" },
          { title: "Driver settlement", href: "/admin/driver-settlement", icon: Banknote, description: "Distance and callouts" },
          { title: "Kitchen settlement", href: "/admin/kitchen-settlement", icon: Banknote, description: "Kitchen payslips and balances" },
        ] : []),
      ],
    },
    // SETTINGS - config nucleus, gated to full-company owners/admins.
    ...(profile && [
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ].includes(profile.role as UserRole) ? [{
      id: "settings",
      title: "Settings",
      defaultOpen: false,
      items: [
        { title: "Company",               href: "/admin/company-profile",       icon: Building2,     description: "Address and routing" },
        { title: "Branding",              href: "/admin/white-label",           icon: Palette,       description: "Logo, colours, fonts" },
        { title: "Kitchen",               href: "/admin/kitchen-settings",      icon: CookingPot,    description: "Prep and dietary rules" },
        { title: "Email",                 href: "/admin/email-settings",        icon: Mail,          description: "SMTP and providers" },
        { title: "Integrations",          href: "/admin/integrations",          icon: Zap,           description: "Apps and webhooks" },
        { title: "Lead forms",            href: "/admin/integrations/embed",    icon: Code2,         description: "Public forms" },
        { title: "Messages",              href: "/admin/email-templates",       icon: MessageSquare, description: "Email and WhatsApp templates" },
        { title: "Notifications",         href: "/admin/notification-settings", icon: Bell,          description: "Routing and opt-ins" },
        { title: "Audit log",             href: "/admin/audit-logs",            icon: Shield,        description: "Compliance trail - who did what" },
        ...(profile && canAccessFinance(profile.role as UserRole)
          ? [{ title: "Subscription", href: "/admin/subscription", icon: CreditCard, description: "Your CateringMS plan and billing" }]
          : []),
        { title: "System",                href: "/admin/settings",              icon: Settings,      description: "General settings" },
      ],
    } as PortalSidebarSection] : []),
    // PLATFORM - super_admin only. /admin/platform/* are global prefixes.
    ...(profile && profile.role === "super_admin" ? [{
      id: "platform",
      title: "Platform",
      defaultOpen: false,
      items: [
        { title: "Platform Dashboard",      href: "/admin/platform/dashboard",              icon: LayoutDashboard, description: "Platform overview" },
        { title: "Company Database",        href: "/admin/platform/company-database",       icon: Building2,       description: "Manage all companies" },
        { title: "User Management",         href: "/admin/platform/user-management",        icon: Users,           description: "Platform-wide users" },
        { title: "Subscription Management", href: "/admin/platform/subscription-management", icon: CreditCard,      description: "Platform subscriptions" },
        { title: "Pricing Management",      href: "/admin/platform/pricing-management",     icon: Banknote,      description: "Manage pricing tiers" },
        { title: "Trial Management",        href: "/admin/platform/trial-management",       icon: Clock,           description: "Manage trial periods" },
        { title: "Currency Monitoring",     href: "/admin/platform/currency-monitoring",    icon: TrendingUp,      description: "Monitor exchange rates" },
        { title: "CMS Blog",                href: "/admin/platform/cms-blog",               icon: FileText,        description: "Manage blog content" },
        { title: "CMS Pages",               href: "/admin/platform/cms-pages",              icon: Globe,           description: "Manage static pages" },
        { title: "SA Tax Rules",            href: "/admin/platform/tax-rules",              icon: FileText,        description: "Edit slip-scanner deductibility rules" },
      ],
    } as PortalSidebarSection] : []),
    {
      id: "account",
      title: "",
      defaultOpen: true,
      footerTreatment: true,
      items: [
        { title: "My Profile", href: "/account/settings", icon: User, description: "Personal settings" },
      ],
    },
  ];

  const config: PortalSidebarConfig = {
    role: "admin",
    title: "Admin",
    mobileSubtitle: "Operations & admin",
    brandIcon: LayoutDashboard,
    appearance: "dark",
    // Tenant brand accent - resolves to THIS company's colours via the
    // brand-* CSS vars (set by TenantBrandingApplier), falling back to
    // the CateringMS default for non-white-label tenants.
    ...BRAND_PORTAL_PALETTE,
    searchHint: "Search anywhere...",
    dashboardHref: "/admin/dashboard",
    mobileQuickActions: [
      { href: "/admin/dashboard", label: "Dashboard", sub: "Live metrics",   icon: LayoutDashboard, accent: BRAND_ACCENT },
      { href: "/admin/orders",    label: "Orders",    sub: "All orders",     icon: Package,         accent: BRAND_ACCENT },
      { href: "/admin/quotes",    label: "Quotes",    sub: "Create + manage", icon: FileSpreadsheet, accent: BRAND_ACCENT },
    ],
    // Mode-driven smart quick actions replace the static trio on mobile.
    renderMobileQuickActions: ({ onNavigate }) => <AdminSmartQuickActions onNavigate={onNavigate} />,
    renderTopSlot: () => <AdminTopSlot companySlug={companySlug} />,
    sections,
  };

  return <PortalSidebar config={config} />;
}

export default AdminNav;
