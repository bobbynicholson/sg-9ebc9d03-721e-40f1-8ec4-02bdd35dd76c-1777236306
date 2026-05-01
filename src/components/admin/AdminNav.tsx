import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";
import { useTenantHref } from "@/lib/tenantUrl";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
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
  BookOpen,
  Wand2,
  ChevronLeft,
  Palette,
  Code2,
  Sparkles,
  Receipt
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StaffViewSwitcher } from "@/components/admin/StaffViewSwitcher";
import { CommandPaletteHint } from "@/components/CommandPaletteHint";
import { canAccessFinance } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
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

  // Sidebar scroll restoration. Without this, navigating between
  // pages remounts the sidebar and the ScrollArea snaps back to the
  // top -- so an Operations item near the bottom of the menu felt
  // like it teleported away every time you clicked it. We persist
  // the scroll position in sessionStorage and on mount we either
  // restore it OR scroll the active item into view, whichever lands
  // it on screen.
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) return;
    // shadcn ScrollArea wraps the actual scroll container; the
    // [data-radix-scroll-area-viewport] is the element that scrolls.
    const viewport = root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    const KEY = "adminNav-scroll-top";
    const saved = Number(sessionStorage.getItem(KEY) || "0");

    // First, try to restore the previous scroll position. If that
    // doesn't bring the active link onto the screen, fall back to
    // scrollIntoView on the active link.
    requestAnimationFrame(() => {
      if (saved > 0) viewport.scrollTop = saved;
      const active = viewport.querySelector<HTMLElement>("[data-active='true']");
      if (active) {
        const aTop = active.offsetTop;
        const aBottom = aTop + active.offsetHeight;
        const vTop = viewport.scrollTop;
        const vBottom = vTop + viewport.clientHeight;
        if (aTop < vTop || aBottom > vBottom) {
          // Centre the active link in the viewport.
          viewport.scrollTop = Math.max(0, aTop - viewport.clientHeight / 2 + active.offsetHeight / 2);
        }
      }
    });

    const onScroll = () => {
      sessionStorage.setItem(KEY, String(viewport.scrollTop));
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  // Re-run on path change so the active link's "make me visible" check
  // fires after a navigation.
  }, [router.asPath]);

  // Live "events today" pulse: count today's active orders so the user
  // can glance at the sidebar and know if anything's running right now.
  const [todayEventCount, setTodayEventCount] = useState<number | null>(null);
  useEffect(() => {
    const cid = (profile as any)?.company_id;
    if (!cid) return;
    let cancelled = false;
    const load = async () => {
      const todayISO = new Date().toISOString().slice(0, 10);
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

  const adminNavSections: NavSection[] = [
    // Smart defaults: daily-use sections open, quarterly ones closed.
    // Single-item "Dashboard" group is rendered flat above the accordions.
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        {
          title: "Analytics Dashboard",
          href: "/admin/dashboard",
          icon: LayoutDashboard,
          description: "Business insights and metrics"
        },
        // Notifications hidden 28 Apr 2026 -- mobile drawer overlay bug
        // surfaces on click. Re-enable once the sidebar overlay is fixed
        // and the notifications page audit lands.
      ]
    },
    {
      id: "core",
      title: "Core Management",
      defaultOpen: true,
      items: [
        {
          title: "Clients",
          href: "/admin/clients",
          icon: User,
          description: "Status, last touch, suggested actions"
        },
        {
          title: "Leads",
          href: "/admin/leads",
          icon: UserPlus,
          description: "Inbound enquiries pipeline"
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
        },
        {
          title: "Menu",
          href: "/admin/menu",
          icon: BookOpen,
          description: "Build menu items + recipes"
        },
        {
          title: "Equipment",
          href: "/admin/equipment",
          icon: Package,
          description: "Chafing, tables, chairs, hire add-ons"
        },
        {
          title: "Onboarding",
          href: "/admin/onboarding",
          icon: Wand2,
          // Single entry-point for every onboarding tool (easy client list,
          // AI importer, receipt scanner) plus the imports history below.
          // Was two separate menu items which confused new tenants.
          description: "Bring your clients, orders and supplier slips on board"
        },
        {
          title: "Hire-in orders",
          href: "/admin/equipment/hire-orders",
          icon: Truck,
          description: "Procurement when you overcommit stock"
        }
      ]
    },
    {
      id: "team",
      title: "Team Management",
      defaultOpen: true,
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
          title: "Kitchen Staff",
          href: "/admin/kitchen-staff",
          icon: ChefHat,
          description: "Add staff, set rates and standard hours"
        },
        {
          title: "Wage Dashboard",
          href: "/admin/wages",
          icon: DollarSign,
          description: "Hours x rates roll-up with overtime split"
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
      id: "operations",
      title: "Operations",
      defaultOpen: true,
      items: [
        {
          title: "Dispatch Queue",
          href: "/admin/order-assignments",
          icon: ClipboardList,
          description: "Get every order to a driver, fast"
        },
        {
          title: "Live Operations",
          href: "/admin/tracking",
          icon: MapPin,
          description: "Today's jobs in flight"
        },
        {
          title: "Plan Routes",
          href: "/admin/route-planning",
          icon: Route,
          description: "Auto-assign + optimise tomorrow"
        },
        {
          title: "Vehicles",
          href: "/admin/vehicles",
          icon: Truck,
          description: "Fleet roster + cold-chain"
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
        },
        {
          title: "Shopping Dashboard",
          href: "/admin/shopping",
          icon: ShoppingCart,
          description: "Procurement overview"
        },
        {
          title: "Tax-Deductible Purchases",
          href: "/admin/tax-purchases",
          icon: Receipt,
          description: "Slip log + deductible totals for the accountant"
        },
        {
          title: "Client Search",
          href: "/admin/client-search",
          icon: Search,
          description: "Search and filter clients"
        }
      ]
    },
    {
      id: "comms",
      title: "Communications",
      defaultOpen: false,
      items: [
        {
          title: "Email & Integrations",
          href: "/admin/email-settings",
          icon: Mail,
          description: "Connect Gmail, Outlook, SMTP, Mailchimp"
        },
        {
          title: "Zapier & Webhooks",
          href: "/admin/integrations",
          icon: Zap,
          description: "Pipe leads + orders into 5,000+ apps"
        },
        {
          title: "Lead Capture Forms",
          href: "/admin/integrations/embed",
          icon: Code2,
          description: "Public embeddable forms"
        },
        {
          title: "Messaging Templates",
          href: "/admin/messaging-templates",
          icon: Sparkles,
          description: "Edit every email + WhatsApp template"
        },
        {
          title: "After-Sales Email Templates",
          href: "/admin/email-templates",
          icon: Mail,
          description: "Lifecycle automation templates"
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
      id: "branding",
      title: "Branding & Settings",
      defaultOpen: false,
      items: [
        {
          title: "Company Profile",
          href: "/admin/company-profile",
          icon: Building2,
          description: "Address, branding, lat/lng for routing"
        },
        {
          title: "White Label",
          href: "/admin/white-label",
          icon: Palette,
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

  const isActive = (href: string) => {
    // Compare against both the bare path (router.pathname is the file
    // path, always /admin/<page>) and the slug-prefixed asPath the user
    // sees in their URL bar.
    if (router.pathname === href) return true;
    if (router.asPath === href) return true;
    if (router.asPath === withSlug(href)) return true;
    return false;
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

  const NavContent = ({ mobile = false }: { mobile?: boolean } = {}) => (
    <ScrollArea ref={scrollAreaRef} className="h-full py-6 px-4">
      <div className="space-y-6">
        {mobile ? (
          <div className="space-y-3">
            <MobileSearchTrigger accent="bg-purple-50 hover:bg-purple-100 text-purple-700" hint="Search anywhere..." />
            <MobileQuickActions
              onNavigate={() => setOpen(false)}
              actions={[
                { href: withSlug("/admin/calendar"),  label: "Today's events", sub: "Calendar",       icon: Calendar,     accent: "from-purple-500 to-pink-500" },
                { href: withSlug("/admin/leads"),     label: "New leads",      sub: "Quotes inbox",   icon: UserPlus,     accent: "from-blue-500 to-indigo-500" },
                { href: withSlug("/admin/inventory"), label: "Stock outlook",  sub: "Demand vs hand", icon: Package,      accent: "from-emerald-500 to-teal-500" },
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
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm"
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
        <SignOutBlock />
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile Header (single source of truth for the mobile drawer) */}
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
                <div
                  className="px-6 py-4 border-b text-white"
                  style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
                >
                  <h2 className="text-xl font-bold">{companyName}</h2>
                  <p className="text-sm opacity-90 mt-1">
                    {todayEventCount && todayEventCount > 0
                      ? `${todayEventCount} event${todayEventCount === 1 ? "" : "s"} today`
                      : "Admin portal"}
                  </p>
                </div>
                <NavContent mobile />
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
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm"
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