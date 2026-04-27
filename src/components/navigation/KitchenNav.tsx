import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ChefHat,
  ClipboardList,
  Package,
  Calendar,
  Clock,
  Bell,
  Settings,
  Menu,
  ChevronRight,
  Utensils,
  ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SignOutButton } from "@/components/navigation/SignOutButton";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface KitchenNavProps {
  className?: string;
  companySlug?: string;
}

export function KitchenNav({ className, companySlug }: KitchenNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const baseUrl = companySlug ? `/company/${companySlug}` : "";

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("kitchenNav-collapsed");
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("kitchenNav-collapsed", JSON.stringify(newState));
  };

  const kitchenNavSections: NavSection[] = [
    {
      title: "Dashboard",
      items: [
        {
          title: "Overview",
          href: "/team-portal/kitchen/dashboard",
          icon: LayoutDashboard,
          description: "Today's production"
        },
        {
          title: "Notifications",
          href: "/team-portal/kitchen/notifications",
          icon: Bell,
          description: "Kitchen alerts"
        }
      ]
    },
    {
      title: "Production",
      items: [
        {
          title: "Prep List",
          href: "/team-portal/kitchen/prep-list",
          icon: ClipboardList,
          description: "Daily prep tasks"
        },
        {
          title: "Production Schedule",
          href: "/team-portal/kitchen/production",
          icon: Calendar,
          description: "Upcoming orders"
        },
        {
          title: "Duty Roster",
          href: "/team-portal/kitchen/duty",
          icon: Clock,
          description: "Staff on duty"
        }
      ]
    },
    {
      title: "Menu & Inventory",
      items: [
        {
          title: "Menu Items",
          href: "/team-portal/kitchen/menu",
          icon: Utensils,
          description: "Manage menu"
        },
        {
          title: "Kitchen Stock",
          href: "/team-portal/kitchen/stock",
          icon: Package,
          description: "Inventory levels"
        }
      ]
    },
    {
      title: "Settings",
      items: [
        {
          title: "Kitchen Settings",
          href: "/team-portal/kitchen/settings",
          icon: Settings,
          description: "Configure kitchen"
        }
      ]
    }
  ];

  const isActive = (href: string) => {
    return router.pathname === href || router.asPath === href;
  };

  const NavContent = () => (
    <ScrollArea className="h-full py-6 px-4">
      <div className="space-y-6">
        {kitchenNavSections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section.title}
            </h3>
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-orange-50 hover:text-orange-700",
                      active
                        ? "bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-md"
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
            </div>
          </div>
        ))}
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
                <div className="px-6 py-4 border-b bg-gradient-to-r from-orange-500 to-red-500">
                  <h2 className="text-xl font-bold text-white">Kitchen Portal</h2>
                  <p className="text-sm text-orange-100 mt-1">Manage production</p>
                </div>
                <NavContent />
              </SheetContent>
            </Sheet>
            <Link href={"/team-portal/kitchen/dashboard"} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-600 to-red-600 rounded-lg flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Kitchen Portal</span>
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
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 ${
          isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72"
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href={"/team-portal/kitchen/dashboard"} className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                    <ChefHat className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900 dark:text-white">Kitchen Portal</h1>
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
                <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                  <ChefHat className="w-5 h-5 text-white" />
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {kitchenNavSections.map((section) => (
                <div key={section.title}>
                  {!isCollapsed && (
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
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-orange-50 hover:text-orange-700",
                            active
                              ? "bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-md"
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
                    })}
                  </div>
                </div>
              ))}
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