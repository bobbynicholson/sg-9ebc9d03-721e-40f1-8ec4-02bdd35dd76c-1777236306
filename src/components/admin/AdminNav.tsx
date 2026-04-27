import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";
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
  ShoppingCart,
  UserPlus,
  FileSpreadsheet,
  Plug,
  Route,
  User,
  X,
  ShoppingBag,
  Zap,
  BarChart3,
  Shield,
  LogOut,
  ChevronDown,
  Target,
  ChefHat,
  ChevronLeft,
  Palette
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StaffViewSwitcher } from "@/components/admin/StaffViewSwitcher";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { canAccessFinance } from "@/lib/authGuards";
import { UserRole } from "@/types/app";

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

interface AdminNavProps {
  className?: string;
}

export function AdminNav({ className }: AdminNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { profile } = useAuth();

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

  const adminNavSections: NavSection[] = [
    {
      title: "Dashboard",
      items: [
        {
          title: "Analytics Dashboard",
          href: "/admin/dashboard",
          icon: LayoutDashboard,
          description: "Business insights and metrics"
        },
        {
          title: "Notifications",
          href: "/admin/notifications",
          icon: Bell,
          description: "View all notifications"
        }
      ]
    },
    {
      title: "Core Management",
      items: [
        {
          title: "Leads",
          href: "/admin/leads",
          icon: UserPlus,
          description: "Manage potential clients"
        },
        {
          title: "Quotes",
          href: "/admin/quotes",
          icon: FileSpreadsheet,
          description: "Create and manage quotes"
        },
        {
          title: "Orders",
          href: "/admin/orders",
          icon: ClipboardList,
          description: "View and manage orders"
        },
        {
          title: "Calendar",
          href: "/admin/calendar",
          icon: Calendar,
          description: "Event scheduling"
        },
        {
          title: "Inventory",
          href: "/admin/inventory",
          icon: Package,
          description: "Stock management"
        }
      ]
    },
    {
      title: "Team Management",
      items: [
        {
          title: "Users",
          href: "/admin/users",
          icon: Users,
          description: "Manage user accounts"
        },
        {
          title: "Drivers",
          href: "/admin/driver-management",
          icon: Truck,
          description: "Manage delivery drivers"
        },
        {
          title: "Staff Hours",
          href: "/admin/staff-hours",
          icon: Clock,
          description: "Track staff working hours"
        }
      ]
    },
    {
      title: "Operations",
      items: [
        {
          title: "Job Progress Overview",
          href: "/admin/job-progress-overview",
          icon: TrendingUp,
          description: "Monitor all jobs"
        },
        {
          title: "Delivery Tracking",
          href: "/admin/tracking",
          icon: MapPin,
          description: "Live delivery tracking"
        },
        {
          title: "Route Planning",
          href: "/admin/route-planning",
          icon: Route,
          description: "Optimize delivery routes"
        },
        {
          title: "Equipment Shortages",
          href: "/admin/equipment-shortages",
          icon: Package,
          description: "Track inventory issues"
        },
        {
          title: "Regions",
          href: "/admin/regions",
          icon: MapPin,
          description: "Manage service regions"
        }
      ]
    },
    {
      title: "Communications",
      items: [
        {
          title: "Email Templates",
          href: "/admin/email-templates",
          icon: Mail,
          description: "Manage email templates"
        },
        {
          title: "After-Sales Emails",
          href: "/admin/after-sales-emails",
          icon: MessageSquare,
          description: "Follow-up communications"
        },
        {
          title: "Email Automation",
          href: "/admin/email-automation-dashboard",
          icon: Mail,
          description: "Automated email campaigns"
        },
        {
          title: "Automation Settings",
          href: "/admin/email-automation-settings",
          icon: Settings,
          description: "Configure automation"
        },
        {
          title: "Notification Settings",
          href: "/admin/notification-settings",
          icon: Bell,
          description: "Configure notifications"
        }
      ]
    },
    {
      title: "Client Portal",
      items: [
        {
          title: "Client Search",
          href: "/admin/client-search",
          icon: Search,
          description: "Search and filter clients"
        }
      ]
    },
    {
      title: "Shopping & Procurement",
      items: [
        {
          title: "Shopping Dashboard",
          href: "/admin/shopping",
          icon: ShoppingCart,
          description: "Procurement overview"
        }
      ]
    },
    {
      title: "Branding & Settings",
      items: [
        {
          title: "White Label",
          href: "/admin/white-label",
          icon: Building2,
          description: "Branding customization"
        },
        {
          title: "Integrations",
          href: "/admin/integrations",
          icon: Plug,
          description: "Connect third-party tools"
        },
        {
          title: "System Settings",
          href: "/admin/settings",
          icon: Settings,
          description: "General configuration"
        }
      ]
    },
    ...(profile && canAccessFinance(profile.role as UserRole) ? [{
      title: "Finance & Billing",
      items: [
        {
          title: "Financial Dashboard",
          href: "/admin/financial-dashboard",
          icon: DollarSign,
          description: "Financial insights"
        },
        {
          title: "Subscription",
          href: "/admin/subscription",
          icon: CreditCard,
          description: "Manage subscriptions"
        },
        {
          title: "Payment Gateways",
          href: "/admin/payment-gateways",
          icon: CreditCard,
          description: "Configure payments"
        }
      ]
    }] : []),
    ...(profile && profile.role === "super_admin" ? [{
      title: "Platform Admin",
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
        }
      ]
    }] : []),
    {
      title: "Account",
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

  const isActive = (href: string) => {
    return router.pathname === href || router.asPath === href;
  };

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

  const NavContent = () => (
    <ScrollArea className="h-full py-6 px-4">
      <div className="space-y-6">
        <CommandPaletteHint className="w-full justify-center" />
        {adminNavSections.map((section) => (
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-purple-50 hover:text-purple-700",
                      active
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-md"
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
        <SignOutBlock />
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed top-4 left-4 z-50 bg-white shadow-lg hover:shadow-xl transition-shadow"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-500 to-pink-500">
              <h2 className="text-xl font-bold text-white">Admin Portal</h2>
              <p className="text-sm text-purple-100 mt-1">Catering Management System</p>
            </div>
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">CM</span>
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 ${
        isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72"
      }`}>
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href="/admin/dashboard" className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold">CM</span>
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900 dark:text-white">Admin Portal</h1>
                    <p className="text-xs text-slate-600 dark:text-slate-400">CateringMS</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <NotificationBell />
                  {companySlug && <StaffViewSwitcher companySlug={companySlug} />}
                  <ThemeSwitch />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">CM</span>
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {adminNavSections.map((section) => (
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
                            "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-purple-50 hover:text-purple-700",
                            active
                              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-md"
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