/**
 * PlatformNav -- SaaS owner sidebar.
 *
 * Architecture:
 *   Command    -- the one screen you open every morning (Dashboard)
 *   Tenants    -- who's on the platform (Companies, Users, Subscriptions, Trials)
 *   Revenue    -- money signals (Financial Dashboard, Pricing, Currency Monitor)
 *   Marketing  -- public-facing content (CMS Pages, Blog)
 *   System     -- infrastructure (Payment Gateways)
 *   Engineering -- internal backlog (Running Todo)
 *
 * Collapsed mode: 64px icon rail. Section headers hide; icons + tooltips only.
 * Mobile: full-width Sheet from left edge.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Calendar,
  Tag,
  ArrowLeftRight,
  Newspaper,
  Menu,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Crown,
  ListChecks,
  Landmark,
  MonitorCheck,
  BarChart3,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAndRedirect } from "@/lib/signOut";
import { useAuth } from "@/contexts/AuthContext";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** One-liner shown under the title in expanded mode. */
  sub?: string;
  /** Optional pill label -- e.g. "Live" or a count. */
  tag?: string;
  tagVariant?: "default" | "secondary" | "destructive" | "outline";
}

interface NavSection {
  /** Stable id for localStorage persistence -- never change once shipped. */
  id: string;
  title: string;
  defaultOpen: boolean;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------

const NAV: NavSection[] = [
  {
    id: "command",
    title: "Command",
    defaultOpen: true,
    items: [
      {
        title: "Platform Dashboard",
        href: "/admin/platform/dashboard",
        icon: LayoutDashboard,
        sub: "MRR, signups, churn at a glance",
      },
    ],
  },
  {
    id: "tenants",
    title: "Tenants",
    defaultOpen: true,
    items: [
      {
        title: "Companies",
        href: "/admin/platform/company-database",
        icon: Building2,
        sub: "Every registered catering business",
      },
      {
        title: "Users",
        href: "/admin/platform/user-management",
        icon: Users,
        sub: "All accounts across all tenants",
      },
      {
        title: "Subscriptions",
        href: "/admin/platform/subscription-management",
        icon: CreditCard,
        sub: "Active plans, upgrades, cancellations",
        tag: "Live",
      },
      {
        title: "Trials",
        href: "/admin/platform/trial-management",
        icon: Calendar,
        sub: "Extend trials, convert to paid",
      },
    ],
  },
  {
    id: "revenue",
    title: "Revenue",
    defaultOpen: true,
    items: [
      {
        title: "Financial Dashboard",
        href: "/admin/financial-dashboard",
        icon: BarChart3,
        sub: "Revenue, ARR, cohort analysis",
      },
      {
        title: "Pricing",
        href: "/admin/platform/pricing-management",
        icon: Tag,
        sub: "Plans, price tiers, feature gates",
      },
      {
        title: "Currency Monitor",
        href: "/admin/platform/currency-monitoring",
        icon: ArrowLeftRight,
        sub: "Live FX rates, threshold alerts",
      },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    defaultOpen: false,
    items: [
      {
        title: "CMS Pages",
        href: "/admin/platform/cms-pages",
        icon: Globe,
        sub: "Landing pages, features, pricing copy",
      },
      {
        title: "Blog",
        href: "/admin/platform/cms-blog",
        icon: Newspaper,
        sub: "Articles, SEO, thought leadership",
      },
    ],
  },
  {
    id: "system",
    title: "System",
    defaultOpen: false,
    items: [
      {
        title: "Payment Gateways",
        href: "/admin/payment-gateways",
        icon: Landmark,
        sub: "Stripe, PayFast, gateway config",
      },
    ],
  },
  {
    id: "engineering",
    title: "Engineering",
    defaultOpen: false,
    items: [
      {
        title: "Running Todo",
        href: "/admin/platform/running-todo",
        icon: ListChecks,
        sub: "Audit-derived backlog, 13 sprint groups",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}

function NavLink({ item, active, collapsed, onClick }: NavLinkProps) {
  const Icon = item.icon;

  if (collapsed) {
    return (
      <Link
        href={item.href}
        onClick={onClick}
        title={item.title}
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-all",
          active
            ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
        )}
      >
        <Icon className="h-4.5 w-4.5 flex-shrink-0" />
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
        active
          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
          : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
          active
            ? "bg-white/20"
            : "bg-slate-100 group-hover:bg-slate-200",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            active ? "text-white" : "text-slate-500 group-hover:text-slate-700",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-medium leading-tight", active ? "text-white" : "text-slate-800")}>
          {item.title}
        </div>
        {item.sub && (
          <div className={cn("text-xs mt-0.5 truncate leading-tight", active ? "text-orange-100" : "text-slate-400")}>
            {item.sub}
          </div>
        )}
      </div>
      {item.tag && !active && (
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 border-0"
        >
          {item.tag}
        </Badge>
      )}
      {active && <ChevronRight className="h-3.5 w-3.5 text-white/70 flex-shrink-0" />}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// User identity strip
// ---------------------------------------------------------------------------

function UserStrip({ collapsed, profile }: { collapsed: boolean; profile: any }) {
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : (profile?.email?.[0] ?? "?").toUpperCase();

  if (collapsed) {
    return (
      <div
        className="flex justify-center py-3"
        title={profile?.full_name || profile?.email || "Platform admin"}
      >
        <div className="w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center">
          <span className="text-xs font-bold text-amber-700">{initials}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
      <div className="w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-amber-700">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {profile?.full_name || "Platform admin"}
        </div>
        <div className="text-xs text-slate-400 truncate">{profile?.email || ""}</div>
      </div>
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 h-4 bg-amber-50 border-amber-200 text-amber-700 flex-shrink-0"
      >
        Owner
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PlatformNavProps {
  className?: string;
}

export function PlatformNav({ className }: PlatformNavProps) {
  const router = useRouter();
  const { profile } = useAuth() as any;
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);
  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutAndRedirect(profile);
  };

  const isActive = (href: string) =>
    router.pathname === href || router.asPath === href;

  // -------------------------------------------------------------------------
  // Sign-out button
  // -------------------------------------------------------------------------

  const SignOutButton = ({ collapsed = false }: { collapsed?: boolean }) => (
    <Button
      variant="ghost"
      onClick={handleSignOut}
      disabled={signingOut}
      title="Sign out"
      className={cn(
        "w-full text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors",
        collapsed ? "justify-center px-2 py-2.5 h-auto" : "justify-start gap-3 px-3 h-auto py-2.5",
      )}
    >
      <LogOut className="h-4 w-4 flex-shrink-0" />
      {!collapsed && (
        <span className="text-sm">{signingOut ? "Signing out..." : "Sign out"}</span>
      )}
    </Button>
  );

  // -------------------------------------------------------------------------
  // Switch to tenant view
  // -------------------------------------------------------------------------

  const SwitchToTenantLink = ({ collapsed = false }: { collapsed?: boolean }) => {
    const active = isActive("/admin/dashboard");
    if (collapsed) {
      return (
        <Link
          href="/admin/dashboard"
          title="Switch to tenant view"
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-all",
            active
              ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
          )}
        >
          <MonitorCheck className="h-4.5 w-4.5" />
        </Link>
      );
    }
    return (
      <Link
        href="/admin/dashboard"
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
          active
            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            active ? "bg-white/20" : "bg-slate-100 group-hover:bg-slate-200",
          )}
        >
          <MonitorCheck className={cn("h-4 w-4", active ? "text-white" : "text-slate-400")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-medium", active ? "text-white" : "text-slate-600")}>
            Switch to Tenant View
          </div>
          <div className={cn("text-xs mt-0.5", active ? "text-orange-100" : "text-slate-400")}>
            Browse as company admin
          </div>
        </div>
      </Link>
    );
  };

  // -------------------------------------------------------------------------
  // Core nav content (shared mobile + desktop)
  // -------------------------------------------------------------------------

  const NavContent = ({
    collapsed = false,
    mobile = false,
  }: {
    collapsed?: boolean;
    mobile?: boolean;
  }) => (
    <ScrollArea className="flex-1">
      <div className={cn("space-y-1", collapsed ? "px-3 py-4" : "px-4 py-4")}>
        {/* User strip (desktop only -- mobile has it in header) */}
        {!mobile && !collapsed && (
          <div className="-mx-4 mb-3">
            <UserStrip collapsed={false} profile={profile} />
          </div>
        )}

        {mobile && (
          <div className="space-y-3 mb-4">
            <MobileSearchTrigger
              accent="bg-amber-50 hover:bg-amber-100 text-amber-700"
              hint="Search tenants, users, orders..."
            />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={[
                {
                  href: "/admin/platform/company-database",
                  label: "Companies",
                  sub: "All tenants",
                  icon: Building2,
                  accent: "from-amber-500 to-orange-500",
                },
                {
                  href: "/admin/platform/user-management",
                  label: "Users",
                  sub: "Cross-tenant",
                  icon: Users,
                  accent: "from-purple-500 to-pink-500",
                },
                {
                  href: "/admin/platform/subscription-management",
                  label: "Subscriptions",
                  sub: "Plans + billing",
                  icon: CreditCard,
                  accent: "from-emerald-500 to-teal-500",
                },
              ]}
            />
          </div>
        )}

        {!collapsed && !mobile && (
          <div className="mb-4">
            <CommandPaletteHint className="w-full justify-center" />
          </div>
        )}

        {/* Sections */}
        {NAV.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          return (
            <CollapsibleNavSection
              key={section.id}
              title={section.title}
              storageKey={`platform:${section.id}`}
              defaultOpen={section.defaultOpen}
              containsActiveRoute={containsActive}
              flatMode={collapsed}
            >
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  onClick={() => setOpen(false)}
                />
              ))}
            </CollapsibleNavSection>
          );
        })}

        {/* Bottom utilities */}
        <div
          className={cn(
            "pt-4 mt-2 border-t border-slate-100 space-y-1",
            collapsed && "px-0",
          )}
        >
          <SwitchToTenantLink collapsed={collapsed} />
          <SignOutButton collapsed={collapsed} />
        </div>
      </div>
    </ScrollArea>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Mobile header bar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[360px] p-0 flex flex-col">
                {/* Mobile sheet header */}
                <div className="px-5 py-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                      <Crown className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Platform Admin</h2>
                      <p className="text-xs text-amber-100">CateringMS internal</p>
                    </div>
                  </div>
                </div>
                <NavContent mobile />
              </SheetContent>
            </Sheet>

            <Link href="/admin/platform/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center shadow-sm">
                <Crown className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 text-sm">Platform</span>
            </Link>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Desktop sidebar                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn(
          // lg:left-0 is required: without it, position:fixed falls back
          // to the element's static x-position, which on this page is
          // pushed right by the parent's lg:pl-72 padding -- making the
          // sidebar overlap the dashboard cards instead of pinning to
          // the left edge.
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:border-r lg:border-slate-200 lg:bg-white transition-all duration-300 z-40 shadow-sm",
          isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72",
          className,
        )}
      >
        {/* Sidebar header */}
        <div
          className={cn(
            "flex-shrink-0 border-b border-slate-200 bg-gradient-to-r from-amber-500 to-orange-500",
            isCollapsed ? "px-4 py-4" : "px-5 py-4",
          )}
        >
          {isCollapsed ? (
            <div className="flex justify-center">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Crown className="h-5 w-5 text-white" />
              </div>
            </div>
          ) : (
            <Link href="/admin/platform/dashboard" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shadow group-hover:bg-white/30 transition-colors">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white text-sm leading-tight">Platform Admin</h1>
                <p className="text-xs text-amber-100 leading-tight mt-0.5">CateringMS internal</p>
              </div>
            </Link>
          )}
        </div>

        {/* Collapsed avatar */}
        {isCollapsed && (
          <UserStrip collapsed profile={profile} />
        )}

        {/* Nav */}
        <NavContent collapsed={isCollapsed} />

        {/* Collapse toggle */}
        <div className="flex-shrink-0 p-3 border-t border-slate-100">
          <Button
            variant="ghost"
            className={cn(
              "w-full h-9 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors rounded-lg",
              isCollapsed ? "justify-center px-2" : "justify-start gap-2.5 px-3",
            )}
            onClick={() => setIsCollapsed((c) => !c)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
