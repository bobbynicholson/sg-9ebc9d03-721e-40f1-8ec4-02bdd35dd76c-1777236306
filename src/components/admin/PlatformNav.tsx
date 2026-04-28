import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  DollarSign,
  Calendar,
  Tag,
  Activity,
  FileText,
  Newspaper,
  ArrowLeftRight,
  Menu,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Crown,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAndRedirect } from "@/lib/signOut";
import { useAuth } from "@/contexts/AuthContext";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";

interface PlatformNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface PlatformNavSection {
  title: string;
  items: PlatformNavItem[];
}

const sections: PlatformNavSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Platform Dashboard",
        href: "/admin/platform/dashboard",
        icon: LayoutDashboard,
        description: "Sales & metrics",
      },
    ],
  },
  {
    title: "Customers",
    items: [
      {
        title: "Companies",
        href: "/admin/platform/company-database",
        icon: Building2,
        description: "All registered tenants",
      },
      {
        title: "Users",
        href: "/admin/platform/user-management",
        icon: Users,
        description: "Cross-tenant users",
      },
    ],
  },
  {
    title: "Revenue",
    items: [
      {
        title: "Subscriptions",
        href: "/admin/platform/subscription-management",
        icon: CreditCard,
        description: "Billing & plans",
      },
      {
        title: "Trials",
        href: "/admin/platform/trial-management",
        icon: Calendar,
        description: "Extend or convert trials",
      },
      {
        title: "Pricing",
        href: "/admin/platform/pricing-management",
        icon: Tag,
        description: "Plans & price tiers",
      },
      {
        title: "Currency Monitor",
        href: "/admin/platform/currency-monitoring",
        icon: ArrowLeftRight,
        description: "FX rates & alerts",
      },
    ],
  },
  {
    title: "Finance & Billing",
    items: [
      {
        title: "Financial Dashboard",
        href: "/admin/financial-dashboard",
        icon: DollarSign,
        description: "Financial insights",
      },
      {
        title: "Subscription",
        href: "/admin/subscription",
        icon: CreditCard,
        description: "Manage subscriptions",
      },
      {
        title: "Payment Gateways",
        href: "/admin/payment-gateways",
        icon: CreditCard,
        description: "Configure payments",
      },
    ],
  },
  {
    title: "Marketing",
    items: [
      {
        title: "CMS Pages",
        href: "/admin/platform/cms-pages",
        icon: FileText,
        description: "Marketing pages",
      },
      {
        title: "Blog",
        href: "/admin/platform/cms-blog",
        icon: Newspaper,
        description: "Blog posts",
      },
    ],
  },
  {
    title: "Engineering",
    items: [
      {
        title: "Running Todo",
        href: "/admin/platform/running-todo",
        icon: ListChecks,
        description: "Audit-derived backlog",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        title: "Switch to Tenant",
        href: "/admin/dashboard",
        icon: Activity,
        description: "View as company admin",
      },
    ],
  },
];

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

  const SignOutButton = ({ collapsed = false }: { collapsed?: boolean }) => (
    <Button
      variant="ghost"
      onClick={handleSignOut}
      disabled={signingOut}
      title="Sign out"
      className={cn(
        "w-full border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
        collapsed ? "justify-center px-2" : "justify-start gap-3 px-4",
      )}
    >
      <LogOut className="h-4 w-4" />
      {!collapsed && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
    </Button>
  );

  const NavContent = ({ collapsed = false, mobile = false }: { collapsed?: boolean; mobile?: boolean }) => (
    <ScrollArea className="h-full p-4">
      <div className="space-y-6">
        {mobile ? (
          <div className="space-y-3">
            <MobileSearchTrigger accent="bg-amber-50 hover:bg-amber-100 text-amber-700" hint="Search tenants, users..." />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={[
                { href: "/admin/platform/company-database",      label: "Companies",       sub: "All tenants",          icon: Building2,   accent: "from-amber-500 to-orange-500" },
                { href: "/admin/platform/user-management",       label: "Users",           sub: "Cross-tenant",         icon: Users,       accent: "from-purple-500 to-pink-500" },
                { href: "/admin/platform/subscription-management", label: "Subscriptions", sub: "Billing + plans",      icon: CreditCard,  accent: "from-emerald-500 to-teal-500" },
              ]}
            />
          </div>
        ) : (
          !collapsed && <CommandPaletteHint className="w-full justify-center" />
        )}
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <h3 className="mb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                      collapsed ? "justify-center" : "",
                    )}
                    title={collapsed ? item.title : ""}
                  >
                    <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-white" : "text-slate-500")} />
                    {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
                    {!collapsed && active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <div className="pt-2"><SignOutButton collapsed={collapsed} /></div>
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-500 to-orange-500">
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-white" />
                    <h2 className="text-xl font-bold text-white">Platform Admin</h2>
                  </div>
                  <p className="text-sm text-amber-100 mt-1">CateringMS internal</p>
                </div>
                <NavContent mobile />
              </SheetContent>
            </Sheet>
            <Link href="/admin/platform/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                <Crown className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Platform</span>
            </Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-red-600 hover:bg-red-50"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 z-40",
          isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72",
          className,
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-500 to-orange-500">
            {!isCollapsed ? (
              <Link href="/admin/platform/dashboard" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shadow-lg">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-white">Platform Admin</h1>
                  <p className="text-xs text-amber-100">CateringMS internal</p>
                </div>
              </Link>
            ) : (
              <div className="flex justify-center">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Crown className="h-5 w-5 text-white" />
                </div>
              </div>
            )}
          </div>

          <NavContent collapsed={isCollapsed} />

          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="ghost"
              className={cn(
                "w-full text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                isCollapsed ? "justify-center px-2" : "justify-start",
              )}
              onClick={() => setIsCollapsed((c) => !c)}
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
