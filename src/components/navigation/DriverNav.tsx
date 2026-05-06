import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTenantHref } from "@/lib/tenantUrl";
import { useNavScrollRestore } from "@/hooks/useNavScrollRestore";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Truck,
  MapPin,
  DollarSign,
  Calendar,
  User,
  Bell,
  Settings,
  Menu,
  ChevronRight,
  Navigation,
  Home,
  LogOut,
  ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SignOutButton } from "@/components/navigation/SignOutButton";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { buildIsActive } from "@/lib/navActiveMatcher";

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

interface DriverNavProps {
  className?: string;
  companySlug?: string;
}

const navItems = [
  { href: "/team-portal/driver/dashboard", label: "Dashboard", icon: Home },
  { href: "/team-portal/driver/routes", label: "My Routes", icon: Navigation },
  { href: "/team-portal/driver/tracking", label: "Tracking", icon: MapPin },
  { href: "/team-portal/driver/deliveries", label: "Deliveries", icon: Truck },
];

export function DriverNav({ className, companySlug }: DriverNavProps) {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);
  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);
  // Driver pages live at /team-portal/driver/* (no slug). Keep the prop for
  // backward compatibility but ignore for routing purposes.
  const baseUrl = "";
  void companySlug;

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("driverNav-collapsed");
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("driverNav-collapsed", JSON.stringify(newState));
  };

  const driverNavSections: NavSection[] = [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        {
          title: "Overview",
          href: `/team-portal/driver/dashboard`,
          icon: LayoutDashboard,
          description: "Today's summary"
        },
        {
          title: "Notifications",
          href: `/team-portal/driver/notifications`,
          icon: Bell,
          description: "View alerts"
        }
      ]
    },
    {
      id: "deliveries",
      title: "Deliveries",
      defaultOpen: true,
      items: [
        {
          title: "Today's Routes",
          href: `${baseUrl}/team-portal/driver/routes`,
          icon: Navigation,
          description: "Your delivery routes"
        },
        {
          title: "All Deliveries",
          href: `${baseUrl}/team-portal/driver/deliveries`,
          icon: Truck,
          description: "Delivery history"
        },
        {
          title: "GPS Tracking",
          href: `${baseUrl}/team-portal/driver/tracking`,
          icon: MapPin,
          description: "Live tracking"
        }
      ]
    },
    {
      id: "earnings",
      title: "Earnings",
      defaultOpen: false,
      items: [
        {
          title: "My Earnings",
          href: `/team-portal/driver/earnings`,
          icon: DollarSign,
          description: "View your earnings"
        },
        {
          title: "Schedule",
          href: `/team-portal/driver/schedule`,
          icon: Calendar,
          description: "Work schedule"
        }
      ]
    },
    {
      id: "account",
      title: "Account",
      defaultOpen: false,
      items: [
        {
          title: "My Profile",
          href: `/account/settings`,
          icon: User,
          description: "Update profile"
        }
      ]
    }
  ];

  // Path-vs-href matcher with slug-prefix awareness, sub-path
  // matching ("/" boundary), query-param disambiguation, and
  // longest-match resolution. See navActiveMatcher.ts.
  const allHrefs = driverNavSections.flatMap((s) => s.items.map((i) => i.href));
  const isActive = buildIsActive(allHrefs, { router, withSlug });

  const desktopScrollRef = useNavScrollRestore<HTMLDivElement>("driver-nav");

  const NavContent = ({ mobile = false, hideSignOut = false }: { mobile?: boolean; hideSignOut?: boolean } = {}) => (
    <ScrollArea ref={mobile ? undefined : desktopScrollRef} className="h-full py-6 px-4">
      <div className="space-y-6">
        {mobile && (
          <div className="space-y-3">
            <MobileSearchTrigger accent="bg-blue-50 hover:bg-blue-100 text-blue-700" hint="Search routes, deliveries..." />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={[
                { href: withSlug("/team-portal/driver/routes"),      label: "Today's routes",   sub: "What you're driving",  icon: Navigation, accent: "from-blue-500 to-indigo-500" },
                { href: withSlug("/team-portal/driver/tracking"),   label: "Live tracking",    sub: "Update status",        icon: MapPin,     accent: "from-emerald-500 to-teal-500" },
                { href: withSlug("/team-portal/driver/earnings"),   label: "My earnings",      sub: "Hours + pay",          icon: DollarSign, accent: "from-amber-500 to-orange-500" },
              ]}
            />
          </div>
        )}
        {driverNavSections.map((section) => {
          const containsActive = section.items.some((i) => isActive(i.href));
          return (
            <CollapsibleNavSection
              key={section.id}
              title={section.title}
              storageKey={`driver:${section.id}`}
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-blue-50 hover:text-blue-700",
                      active
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-md"
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
        {!hideSignOut && (
          <div className="pt-4 border-t border-slate-100"><SignOutButton /></div>
        )}
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile Navigation */}
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
                  className="px-6 py-4 border-b bg-gradient-to-r from-blue-500 to-indigo-500 flex-shrink-0"
                  style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))" }}
                >
                  <h2 className="text-xl font-bold text-white">Driver Portal</h2>
                  <p className="text-sm text-blue-100 mt-1">Manage deliveries</p>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <NavContent mobile hideSignOut />
                </div>
                <div
                  className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex-shrink-0 bg-white dark:bg-slate-900"
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}
                >
                  <SignOutButton />
                </div>
              </SheetContent>
            </Sheet>
            <Link href="/team-portal/driver/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Truck className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Driver Portal</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href="/team-portal/driver/dashboard" className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900 dark:text-white">Driver Portal</h1>
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
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {driverNavSections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                const linkRows = section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={withSlug(item.href)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-blue-50 hover:text-blue-700",
                        active
                          ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-md"
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
                    storageKey={`driver:${section.id}`}
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