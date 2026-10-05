/**
 * PlatformNav - SaaS owner sidebar.
 *
 * Wave 71 redesign: rebuilt on the shared PortalSidebar primitive (the
 * same component the kitchen / driver / shopping / cleaning portals use)
 * so the platform admin matches the rest of the product - item
 * descriptions, toned badges, footer treatment, collapse, notification
 * bell, theme switch, and mobile drawer - all for free. The shared
 * portal sidebar is the design reference.
 *
 * Platform paths are global super-admin routes (/admin/platform/*),
 * which tenantUrl's GLOBAL_PREFIXES leaves un-prefixed, so PortalSidebar's
 * withSlug() is a no-op on them. The one tenant-scoped link ("Switch to
 * tenant view" -> /admin/dashboard) is correctly slug-prefixed.
 *
 * Architecture (unchanged):
 *   Command    - the screen you open every morning (Dashboard)
 *   Companies  - who's on the platform (Companies, Users, Subscriptions, Trials, Health, Audit)
 *   Revenue    - money signals (Financial, Pricing, Currency, Tech costs)
 *   Marketing  - public-facing content (CMS Pages, Blog, Emails)
 *   System     - infrastructure (Settings, Payment Gateways)
 *   Engineering - internal backlog (Running Todo)
 *   Footer     - Switch to tenant view
 */

import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Calendar,
  Tag,
  ArrowLeftRight,
  Newspaper,
  Crown,
  ListChecks,
  Landmark,
  MonitorCheck,
  BarChart3,
  Globe,
  Calculator,
  Settings,
  Activity,
  AlertTriangle,
  ScrollText,
  Mail,
  Brain,
  ShieldCheck,
  Percent,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { PortalSidebar, type PortalSidebarConfig } from "@/components/navigation/PortalSidebar";
import { BRAND_ACCENT, BRAND_PORTAL_PALETTE } from "@/lib/branding/portalPalette";

interface PlatformNavProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Top slot: command-palette hint + identity strip (desktop expanded only).
// Mirrors ShoppingNav's renderTopSlot pattern - lets the statically
// declared config mount live, auth-aware content inside the sidebar tree.
// ---------------------------------------------------------------------------

function PlatformTopSlot() {
  const { profile } = useAuth() as any;
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : (profile?.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="space-y-3">
      <CommandPaletteHint className="w-full justify-center" />
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-primary/30 bg-brand-primary/10">
          <span className="text-[11px] font-bold text-brand-primary">{initials}</span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {profile?.full_name || "Platform admin"}
            </span>
            <Badge
              variant="outline"
              className="h-4 flex-shrink-0 border-brand-primary/20 bg-brand-primary/10 px-1 text-[9px] text-brand-primary"
            >
              Platform
            </Badge>
          </div>
          <div className="truncate text-[11px] leading-tight text-slate-400">
            {profile?.email || ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlatformNav(_: PlatformNavProps = {}) {
  const config: PortalSidebarConfig = {
    role: "platform",
    title: "Platform Admin",
    mobileSubtitle: "CateringMS internal",
    brandIcon: Crown,
    // Forced-dark command rail: the super admin area reads instantly as
    // "platform, not tenant" even in light mode. Team/tenant portals keep
    // the theme-following light rail.
    appearance: "dark",
    ...BRAND_PORTAL_PALETTE,
    searchHint: "Search companies, users, orders...",
    dashboardHref: "/admin/platform/dashboard",
    mobileQuickActions: [
      { href: "/admin/platform/company-database",       label: "Companies",     sub: "All companies",  icon: Building2,   accent: BRAND_ACCENT },
      { href: "/admin/platform/user-management",        label: "Users",         sub: "All users",      icon: Users,       accent: BRAND_ACCENT },
      { href: "/admin/platform/subscription-management", label: "Subscriptions", sub: "Plans + billing", icon: CreditCard,  accent: BRAND_ACCENT },
    ],
    renderTopSlot: () => <PlatformTopSlot />,
    // Grouped the way a platform owner works: what's happening, who the
    // customers are, money, content, then settings. Short descriptions so
    // every item reads on one line; quieter groups start folded.
    sections: [
      {
        id: "command",
        title: "Overview",
        defaultOpen: true,
        items: [
          { title: "Dashboard",     href: "/admin/platform/dashboard",     icon: LayoutDashboard, description: "Revenue and growth" },
          { title: "Company health", href: "/admin/platform/tenant-health", icon: Activity,        description: "Stuck or quiet companies" },
          { title: "Payment issues", href: "/admin/platform/payment-issues", icon: AlertTriangle,  description: "Billing setup problems" },
          { title: "Activity log",  href: "/admin/platform/audit-logs",    icon: ScrollText,      description: "Who did what" },
        ],
      },
      {
        id: "tenants",
        title: "Customers",
        defaultOpen: true,
        items: [
          { title: "Companies",     href: "/admin/platform/company-database",        icon: Building2,  description: "All catering businesses" },
          { title: "Users",         href: "/admin/platform/user-management",         icon: Users,      description: "Every account" },
          { title: "Subscriptions", href: "/admin/platform/subscription-management", icon: CreditCard, description: "Plans and cancellations" },
          { title: "Trials",        href: "/admin/platform/trial-management",        icon: Calendar,   description: "Extend or convert" },
        ],
      },
      {
        id: "revenue",
        title: "Money",
        defaultOpen: false,
        items: [
          { title: "Revenue",          href: "/admin/platform/financial-dashboard", icon: BarChart3,      description: "MRR and trends" },
          { title: "Pricing",          href: "/admin/platform/pricing-management",  icon: Tag,            description: "Plans and prices" },
          { title: "Tech costs",       href: "/admin/platform/tech-costs",          icon: Calculator,     description: "Costs and margin" },
          { title: "Currency",         href: "/admin/platform/currency-monitoring", icon: ArrowLeftRight, description: "Exchange rates" },
          { title: "Tax rules",        href: "/admin/platform/tax-rules",           icon: Percent,        description: "Slip deductibility" },
          { title: "Payment gateways", href: "/admin/payment-gateways",             icon: Landmark,       description: "Stripe, PayFast, Yoco" },
        ],
      },
      {
        id: "marketing",
        title: "Website",
        defaultOpen: false,
        items: [
          { title: "Pages",           href: "/admin/platform/cms-pages",           icon: Globe,     description: "Landing and pricing copy" },
          { title: "Blog",            href: "/admin/platform/cms-blog",            icon: Newspaper, description: "Articles and SEO" },
          { title: "Platform emails", href: "/admin/platform/messaging-templates", icon: Mail,      description: "Receipts and reminders" },
        ],
      },
      {
        id: "system",
        title: "Settings",
        defaultOpen: false,
        items: [
          { title: "Platform settings", href: "/admin/platform/settings",     icon: Settings,    description: "Import limits, origin" },
          { title: "AI brain",          href: "/admin/ai-brain",              icon: Brain,       description: "Assistant knowledge" },
          { title: "AI access",         href: "/admin/ai-brain/access",       icon: ShieldCheck, description: "Live-data access by role" },
          { title: "Running to-do",     href: "/admin/platform/running-todo", icon: ListChecks,  description: "Engineering backlog" },
        ],
      },
      {
        id: "footer",
        title: "",
        defaultOpen: true,
        footerTreatment: true,
        items: [
          // A platform owner must choose the company explicitly before
          // entering a tenant workspace. Sending this through withSlug()
          // would silently open whichever stale/dev slug happens to be in
          // auth context, which is both confusing and unsafe.
          { title: "Open a company", href: "/admin/platform/company-database#company-records", icon: MonitorCheck, description: "View as that company" },
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}

export default PlatformNav;
