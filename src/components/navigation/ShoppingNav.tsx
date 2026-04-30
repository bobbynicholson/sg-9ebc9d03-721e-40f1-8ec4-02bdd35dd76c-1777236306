import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTenantHref } from "@/lib/tenantUrl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Users,
  TrendingUp,
  Bell,
  Settings,
  Menu,
  ChevronRight,
  Warehouse,
  ChevronLeft,
  ChefHat,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SignOutButton } from "@/components/navigation/SignOutButton";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";

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
  /** Initial open state if no preference is stored yet. */
  defaultOpen: boolean;
  items: NavItem[];
}

interface ShoppingNavProps {
  className?: string;
  companySlug?: string;
}

export function ShoppingNav({ className, companySlug }: ShoppingNavProps) {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);
  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);
  const baseUrl = companySlug ? `/company/${companySlug}` : "";

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("shoppingNav-collapsed");
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("shoppingNav-collapsed", JSON.stringify(newState));
  };

  const shoppingNavSections: NavSection[] = [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        {
          title: "Overview",
          href: "/team-portal/shopping/dashboard",
          icon: LayoutDashboard,
          description: "Inventory overview"
        },
        {
          title: "Notifications",
          href: "/team-portal/shopping/notifications",
          icon: Bell,
          description: "Stock alerts"
        },
        {
          title: "Stock Alerts",
          href: "/team-portal/shopping/alerts",
          icon: TrendingUp,
          description: "Low stock items"
        },
        {
          title: "Kitchen Demand",
          href: "/team-portal/shopping/kitchen-demand",
          icon: ChefHat,
          description: "What the kitchen needs from upcoming orders"
        }
      ]
    },
    {
      id: "orders",
      title: "Orders",
      defaultOpen: true,
      items: [
        {
          title: "Purchase Orders",
          href: "/team-portal/shopping/orders",
          icon: ShoppingCart,
          description: "Create and track POs"
        }
      ]
    },
    {
      id: "inventory",
      title: "Inventory & Suppliers",
      defaultOpen: false,
      items: [
        {
          title: "Current Stock",
          href: "/team-portal/shopping/inventory",
          icon: Warehouse,
          description: "View inventory levels"
        },
        {
          title: "Suppliers",
          href: "/team-portal/shopping/suppliers",
          icon: Users,
          description: "Supplier database"
        },
        {
          title: "Invoices",
          href: "/team-portal/shopping/invoices",
          icon: FileText,
          description: "Purchase invoices"
        },
        {
          title: "Receipt scanner",
          href: "/team-portal/shopping/receipts",
          icon: Camera,
          description: "Photograph supplier slips, AI pulls line items"
        }
      ]
    },
    {
      id: "settings",
      title: "Settings",
      defaultOpen: false,
      items: [
        {
          title: "Shopping Settings",
          href: "/team-portal/shopping/settings",
          icon: Settings,
          description: "Configure settings"
        }
      ]
    }
  ];

  const isActive = (href: string) => {
    if (router.pathname === href) return true;
    if (router.asPath === href) return true;
    if (router.asPath === withSlug(href)) return true;
    return false;
  };

  const NavContent = ({ mobile = false }: { mobile?: boolean } = {}) => (
    <ScrollArea className="h-full py-6 px-4">
      <div className="space-y-6">
        {mobile && (
          <div className="space-y-3">
            <MobileSearchTrigger accent="bg-emerald-50 hover:bg-emerald-100 text-emerald-700" hint="Search inventory, suppliers..." />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={[
                { href: withSlug("/team-portal/shopping/alerts"),    label: "Stock alerts",   sub: "Shortfalls vs orders", icon: TrendingUp, accent: "from-red-500 to-orange-500" },
                { href: withSlug("/team-portal/shopping/orders"),    label: "Open POs",       sub: "Track deliveries",     icon: ShoppingCart, accent: "from-blue-500 to-indigo-500" },
                { href: withSlug("/team-portal/shopping/suppliers"), label: "Suppliers",      sub: "Contacts + prices",    icon: Users,        accent: "from-purple-500 to-pink-500" },
              ]}
            />
          </div>
        )}
        {shoppingNavSections.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          return (
            <CollapsibleNavSection
              key={section.id}
              title={section.title}
              storageKey={`shopping:${section.id}`}
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-green-50 hover:text-green-700",
                      active
                        ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-md"
                        : "text-slate-700"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-slate-600")} />
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
        <div className="pt-4 border-t border-slate-100"><SignOutButton /></div>
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile Navigation */}
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
                <div className="px-6 py-4 border-b bg-gradient-to-r from-green-500 to-emerald-500">
                  <h2 className="text-xl font-bold text-white">Shopping Portal</h2>
                  <p className="text-sm text-green-100 mt-1">Manage inventory</p>
                </div>
                <NavContent mobile />
              </SheetContent>
            </Sheet>
            <Link href={"/team-portal/shopping/dashboard"} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Shopping Portal</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 ${
          isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72"
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href={"/team-portal/shopping/dashboard"} className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                    <ShoppingCart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900 dark:text-white">Shopping Portal</h1>
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
                <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {shoppingNavSections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                const linkRows = section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={withSlug(item.href)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-green-50 hover:text-green-700",
                        active
                          ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-md"
                          : "text-slate-700",
                        isCollapsed ? "justify-center" : ""
                      )}
                      title={isCollapsed ? item.title : ""}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-slate-600")} />
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
                    storageKey={`shopping:${section.id}`}
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
            <SignOutButton collapsed={isCollapsed} />
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