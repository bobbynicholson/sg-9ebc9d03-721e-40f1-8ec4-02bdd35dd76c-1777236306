/**
 * PlatformNav - SaaS owner sidebar.
 *
 * Wave 71 redesign: rebuilt on the shared PortalSidebar primitive (the
 * same component the kitchen / driver / shopping / cleaning portals use)
 * so the platform admin matches the rest of the product - item
 * descriptions, toned badges, footer treatment, collapse, notification
 * bell + theme switch + clock, mobile drawer - all for free. The
 * shopping portal is the design reference.
 *
 * Platform paths are global super-admin routes (/admin/platform/*),
 * which tenantUrl's GLOBAL_PREFIXES leaves un-prefixed, so PortalSidebar's
 * withSlug() is a no-op on them. The one tenant-scoped link ("Switch to
 * tenant view" -> /admin/dashboard) is correctly slug-prefixed.
 *
 * Architecture (unchanged):
 *   Command    - the screen you open every morning (Dashboard)
 *   Tenants    - who's on the platform (Companies, Users, Subscriptions, Trials, Health, Audit)
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
  ScrollText,
  Mail,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { PortalSidebar, type PortalSidebarConfig } from "@/components/navigation/PortalSidebar";

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
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-100">
          <span className="text-[11px] font-bold text-amber-700">{initials}</span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {profile?.full_name || "Platform admin"}
            </span>
            <Badge
              variant="outline"
              className="h-4 flex-shrink-0 border-amber-200 bg-amber-50 px-1 text-[9px] text-amber-700"
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
    // Unified warm CateringMS brand accent (matches shopping + auth +
    // landing). Was the bespoke amber-on-slate treatment.
    accentGradient: "from-amber-500 to-orange-500",
    accentGradientDark: "from-amber-600 to-orange-600",
    hoverClasses: "hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10",
    activeHoverClasses: "hover:from-amber-600 hover:to-orange-600",
    mobileSubtitleClasses: "text-amber-100",
    searchAccent: "bg-amber-50 hover:bg-amber-100 text-amber-700",
    searchHint: "Search tenants, users, orders...",
    dashboardHref: "/admin/platform/dashboard",
    mobileQuickActions: [
      { href: "/admin/platform/company-database",       label: "Companies",     sub: "All tenants",    icon: Building2,   accent: "from-amber-500 to-orange-500" },
      { href: "/admin/platform/user-management",        label: "Users",         sub: "Cross-tenant",   icon: Users,       accent: "from-amber-500 to-orange-500" },
      { href: "/admin/platform/subscription-management", label: "Subscriptions", sub: "Plans + billing", icon: CreditCard,  accent: "from-amber-500 to-orange-500" },
    ],
    renderTopSlot: () => <PlatformTopSlot />,
    sections: [
      {
        id: "command",
        title: "Command",
        defaultOpen: true,
        items: [
          { title: "Platform Dashboard", href: "/admin/platform/dashboard", icon: LayoutDashboard, description: "MRR, signups, churn at a glance" },
        ],
      },
      {
        id: "tenants",
        title: "Tenants",
        defaultOpen: true,
        items: [
          { title: "Companies",      href: "/admin/platform/company-database",       icon: Building2,  description: "Every registered catering business" },
          { title: "Users",          href: "/admin/platform/user-management",        icon: Users,      description: "All accounts across all tenants" },
          {
            title: "Subscriptions",
            href: "/admin/platform/subscription-management",
            icon: CreditCard,
            description: "Active plans, upgrades, cancellations",
            badge: () => ({ text: "Live", tone: "info" }),
          },
          { title: "Trials",         href: "/admin/platform/trial-management",       icon: Calendar,   description: "Extend trials, convert to paid" },
          { title: "Tenant Health",  href: "/admin/platform/tenant-health",          icon: Activity,   description: "Stuck onboarding, dormant, payment unset" },
          { title: "Audit logs",     href: "/admin/platform/audit-logs",             icon: ScrollText, description: "Append-only trail across every tenant" },
        ],
      },
      {
        id: "revenue",
        title: "Revenue",
        defaultOpen: true,
        items: [
          { title: "Financial Dashboard", href: "/admin/platform/financial-dashboard", icon: BarChart3,     description: "Platform MRR, ARR, cohort analysis" },
          { title: "Pricing",             href: "/admin/platform/pricing-management",  icon: Tag,           description: "Plans, price tiers, feature gates" },
          { title: "Currency Monitor",    href: "/admin/platform/currency-monitoring", icon: ArrowLeftRight, description: "Live FX rates, threshold alerts" },
          { title: "Tech-stack costs",    href: "/admin/platform/tech-costs",          icon: Calculator,    description: "COGS, margin per tenant, scale curves" },
        ],
      },
      {
        id: "marketing",
        title: "Marketing",
        defaultOpen: false,
        items: [
          { title: "CMS Pages",       href: "/admin/platform/cms-pages",           icon: Globe,    description: "Landing pages, features, pricing copy" },
          { title: "Blog",           href: "/admin/platform/cms-blog",            icon: Newspaper, description: "Articles, SEO, thought leadership" },
          { title: "Platform emails", href: "/admin/platform/messaging-templates", icon: Mail,     description: "Receipts, trial reminders, owner welcome" },
        ],
      },
      {
        id: "system",
        title: "System",
        defaultOpen: false,
        items: [
          { title: "Platform Settings", href: "/admin/platform/settings",  icon: Settings, description: "Import row cap, public origin" },
          { title: "Payment Gateways",  href: "/admin/payment-gateways",   icon: Landmark, description: "Stripe, PayFast, gateway config" },
        ],
      },
      {
        id: "engineering",
        title: "Engineering",
        defaultOpen: false,
        items: [
          { title: "Running Todo", href: "/admin/platform/running-todo", icon: ListChecks, description: "Audit-derived backlog, 13 sprint groups" },
        ],
      },
      {
        id: "footer",
        title: "",
        defaultOpen: true,
        footerTreatment: true,
        items: [
          // PortalSidebar applies withSlug() to this href, so a super-
          // admin browsing a tenant lands in that tenant's admin view.
          { title: "Switch to tenant view", href: "/admin/dashboard", icon: MonitorCheck, description: "Browse as company admin" },
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}

export default PlatformNav;
