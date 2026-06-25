import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  ShoppingCart,
  MapPin,
  Receipt,
  User,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";
import { useCloseOnDesktop, useSyncSidebarCollapsed } from "@/lib/useCloseOnDesktop";
import { useNavScrollRestore } from "@/hooks/useNavScrollRestore";
import { MobileSearchTrigger, MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { buildIsActive } from "@/lib/navActiveMatcher";

interface ClientNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ClientNavSection {
  /** Stable id for localStorage persistence - never change once shipped. */
  id: string;
  title: string;
  /** Initial open state if no preference is stored yet. */
  defaultOpen: boolean;
  items: ClientNavItem[];
}

export function ClientNav() {
  const router = useRouter();
  const { profile, user } = useAuth() as any;
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);
  // Desktop sidebar scroll persistence (mobile sheet resets on close,
  // so we don't bother with a ref there).
  const desktopScrollRef = useNavScrollRestore<HTMLElement>("client-portal-nav");
  const [isCollapsed, setIsCollapsed] = useState(false);
  useSyncSidebarCollapsed(isCollapsed);

  // Resolve the tenant slug for this client so every link in the
  // sidebar lands on /{slug}/client-portal/... rather than the bare
  // /client-portal/... URL. Order of preference:
  //   1. router.query.company_slug - set by the next.config rewrite
  //      when the user is already on a /[slug]/client-portal page.
  //   2. user_metadata.last_company_slug - written by the callback on
  //      every magic-link sign-in (see /[slug]/auth/callback).
  //   3. profile.companies.slug - the slug joined off the profiles row.
  // Falls back to "" when none resolve, in which case links behave
  // exactly as before (bare /client-portal/* URLs still work via the
  // page files).
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    user?.user_metadata?.last_company_slug ||
    (Array.isArray(profile?.companies)
      ? profile?.companies?.[0]?.slug
      : profile?.companies?.slug) ||
    "";

  // Wraps a bare client-portal href with the slug prefix when we have
  // one. Idempotent - if the href is already slug-prefixed, returns it
  // unchanged.
  const withSlug = (href: string) => {
    if (!resolvedSlug) return href;
    if (href.startsWith(`/${resolvedSlug}/`)) return href;
    if (href.startsWith("/client-portal")) return `/${resolvedSlug}${href}`;
    return href;
  };

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("clientNav-collapsed");
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("clientNav-collapsed", JSON.stringify(newState));
  };

  const clientNavSections: ClientNavSection[] = [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        { name: "Dashboard", href: "/client-portal/dashboard", icon: LayoutDashboard },
      ]
    },
    {
      id: "orders",
      title: "Bookings",
      defaultOpen: true,
      items: [
        { name: "Quotes", href: "/client-portal/quotes", icon: FileText },
        { name: "Bookings", href: "/client-portal/my-orders", icon: ShoppingCart },
        { name: "Live tracking", href: "/client-portal/tracking", icon: MapPin },
        { name: "Billing & invoices", href: "/client-portal/billing", icon: Receipt },
      ]
    },
    {
      id: "account",
      title: "Account",
      defaultOpen: true,
      items: [
        { name: "Profile", href: "/client-portal/profile", icon: User },
      ]
    }
  ];

  // Active-state check with sub-path matching ("/" boundary so
  // /client-portal/quotes does not light up /client-portal/quotes-archive),
  // query-param disambiguation, and longest-match resolution. The
  // earlier `asPath.startsWith(withSlug(path))` matcher was prone to
  // partial-prefix collisions and didn't pick the most-specific entry
  // when a sub-route was open. See navActiveMatcher.ts.
  const allHrefs = clientNavSections.flatMap((s) => s.items.map((i) => i.href));
  const isActive = buildIsActive(allHrefs, { router, withSlug });

  const handleSignOut = async () => {
    await signOutAndRedirect(profile);
  };

  return (
    <>
      {/* Mobile Header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
              <Menu className="h-6 w-6" />
            </Button>
            <Link href={withSlug("/client-portal/dashboard")} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">Client Portal</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <MobileSearchTrigger accent="bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary" hint="Search orders, invoices..." />
              <MobileQuickActions
                onNavigate={() => setOpen(false)}
                actions={[
                  { href: withSlug("/client-portal/my-orders"), label: "Bookings",        sub: "Active + history", icon: ShoppingCart, accent: "from-brand-primary to-brand-secondary" },
                  { href: withSlug("/client-portal/tracking"), label: "Live tracking",    sub: "Driver ETA",       icon: MapPin,       accent: "from-brand-primary to-brand-secondary" },
                  { href: withSlug("/client-portal/billing"),  label: "Billing",          sub: "Pay + invoices",   icon: Receipt,      accent: "from-brand-primary to-brand-secondary" },
                ]}
              />
              <div className="pt-2 mt-2 border-t border-slate-100 space-y-4">
              {clientNavSections.map((section) => {
                const containsActive = section.items.some((i) => isActive(i.href));
                return (
                  <CollapsibleNavSection
                    key={section.id}
                    title={section.title}
                    storageKey={`client:${section.id}`}
                    defaultOpen={section.defaultOpen}
                    containsActiveRoute={containsActive}
                  >
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          href={withSlug(item.href)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                            isActive(item.href)
                              ? "bg-brand-primary/10 text-brand-primary font-medium dark:bg-brand-primary/15 dark:text-brand-primary"
                              : "text-slate-700 hover:bg-brand-primary/10 hover:text-brand-primary dark:text-slate-300 dark:hover:bg-brand-primary/10 dark:hover:text-brand-primary"
                          }`}
                          onClick={() => setOpen(false)}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </CollapsibleNavSection>
                );
              })}
              </div>
            </nav>
            <div
              className="border-t border-slate-200 px-4 py-3 flex-shrink-0 bg-white"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}
            >
              <Button
                variant="ghost"
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleSignOut}
              >
                <LogOut className="w-5 h-5 mr-3" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar. Width matches AdminNav + staff sidebars
          (lg:w-72 xl:w-80) so the shared Layout/PortalLayout offset is
          correct for every role. */}
      <div className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 ${
        isCollapsed ? "lg:w-20" : "lg:w-72 xl:w-80"
      }`}>
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href={withSlug("/client-portal/dashboard")} className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-sm">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-semibold text-slate-900 dark:text-white">Client Portal</h1>
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
                <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-sm">
                  <User className="w-5 h-5 text-white" />
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav ref={desktopScrollRef} className="flex-1 p-4 space-y-4 overflow-y-auto">
            {clientNavSections.map((section) => {
              const containsActive = section.items.some((i) => isActive(i.href));
              const linkRows = section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={withSlug(item.href)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive(item.href)
                        ? "bg-brand-primary/10 text-brand-primary font-medium dark:bg-brand-primary/15 dark:text-brand-primary"
                        : "text-slate-700 hover:bg-brand-primary/10 hover:text-brand-primary dark:text-slate-300 dark:hover:bg-brand-primary/10 dark:hover:text-brand-primary"
                    } ${isCollapsed ? "justify-center" : ""}`}
                    title={isCollapsed ? item.name : ""}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span>{item.name}</span>}
                  </Link>
                );
              });
              return (
                <CollapsibleNavSection
                  key={section.id}
                  title={section.title}
                  storageKey={`client:${section.id}`}
                  defaultOpen={section.defaultOpen}
                  containsActiveRoute={containsActive}
                  flatMode={isCollapsed}
                >
                  {linkRows}
                </CollapsibleNavSection>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-slate-200 space-y-2">
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
            <Button
              variant="ghost"
              className={`w-full text-red-600 hover:text-red-700 hover:bg-red-50 ${
                isCollapsed ? "justify-center px-2" : "justify-start"
              }`}
              onClick={handleSignOut}
              title={isCollapsed ? "Sign Out" : ""}
            >
              <LogOut className="w-5 h-5" />
              {!isCollapsed && <span className="ml-3">Sign Out</span>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
