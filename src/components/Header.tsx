import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Menu, X, User, LogOut, Settings, ChevronDown,
  Sparkles, MapPin, Package, ChefHat, Mail, Users,
  Phone, MessageSquare, BookOpen, LifeBuoy, FileText,
  CreditCard, Building2, Briefcase,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { RegionSwitcher } from "@/components/RegionSwitcher";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { UserRole } from "@/types/app";

// Helper function to get the correct dashboard path for each role
const getDashboardPath = (role: UserRole, companySlug?: string): string => {
  const adminPath = companySlug ? `/${companySlug}/admin/dashboard` : "/admin/dashboard";
  
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return "/super-admin/dashboard";
    case UserRole.COMPANY_ADMIN:
    case UserRole.ADMIN:
    case UserRole.COMPANY_ADMIN:
      return adminPath;
    case UserRole.DRIVER:
      return "/team-portal/driver/dashboard";
    case UserRole.KITCHEN_STAFF:
    case UserRole.KITCHEN_STAFF:
      return "/team-portal/kitchen/dashboard";
    case UserRole.SHOPPING_STAFF:
    case UserRole.SHOPPING_STAFF:
      return "/team-portal/shopping/dashboard";
    case UserRole.CLEANING_STAFF:
    case UserRole.CLEANING_STAFF:
      return "/team-portal/cleaning/dashboard";
    case UserRole.CLIENT:
      return "/client-portal/dashboard";
    default:
      return "/";
  }
};

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut, profile, activeRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const navigation = [
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Contact", href: "/contact" },
    { name: "Support", href: "/support" },
  ];

  const featuresMenu = [
    { name: "Lead Management",      href: "/features/lead-management",      desc: "Capture and convert quote enquiries", icon: Users },
    { name: "Kitchen Management",   href: "/features/kitchen-management",   desc: "Recipes, prep lists, production schedule", icon: ChefHat },
    { name: "Inventory Management", href: "/features/inventory-management", desc: "Stock vs demand, automatic alerts", icon: Package },
    { name: "GPS Tracking",         href: "/features/gps-tracking",         desc: "Live driver locations and ETAs", icon: MapPin },
    { name: "Email Automation",     href: "/features/email-automation",     desc: "Quotes, confirmations, after-sales", icon: Mail },
    { name: "All features",         href: "/features",                      desc: "Browse the full platform overview", icon: Sparkles },
  ];

  const pricingMenu = [
    { name: "Plans & pricing", href: "/pricing",        desc: "Compare tiers, see what's included", icon: CreditCard },
    { name: "For agencies",    href: "/pricing#agency", desc: "Multi-tenant rates for resellers", icon: Building2 },
    { name: "Start free trial",href: "/company-signup", desc: "Spin up your tenant in 60 seconds", icon: Sparkles },
  ];

  const contactMenu = [
    { name: "Sales",          href: "/contact",         desc: "Talk to a real human about your fit", icon: Briefcase },
    { name: "Book a demo",    href: "/demo",            desc: "30-min walk-through with your data", icon: Phone },
    { name: "WhatsApp us",    href: "https://wa.me/27000000000", desc: "Quick questions, quick answers", icon: MessageSquare, external: true },
  ];

  const supportMenu = [
    { name: "Help centre",   href: "/support",   desc: "Search articles and guides", icon: LifeBuoy },
    { name: "Documentation", href: "/blog",      desc: "Setup walkthroughs and tips", icon: BookOpen },
    { name: "Status page",   href: "/security",  desc: "Uptime, security, compliance", icon: FileText },
  ];

  // Get the correct dashboard path based on active role
  const dashboardPath = user && activeRole 
    ? getDashboardPath(activeRole as UserRole, profile?.company_slug)
    : "/";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/80">
      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 lg:px-8">
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              CateringMS
            </span>
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-700 dark:text-slate-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Toggle menu</span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Desktop navigation, mega menus */}
        <div className="hidden lg:flex lg:gap-x-1">
          <MegaMenu label="Features" rootHref="/features" items={featuresMenu} cols={2} wide />
          <MegaMenu label="Pricing"  rootHref="/pricing"  items={pricingMenu}  cols={1} />
          <MegaMenu label="Contact"  rootHref="/contact"  items={contactMenu}  cols={1} />
          <MegaMenu label="Support"  rootHref="/support"  items={supportMenu}  cols={1} />
        </div>

        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4 items-center">
          <RegionSwitcher />
          <ThemeSwitch />
          
          {user && <RoleSwitcher variant="compact" showLabel={false} />}
          
          {user ? (
            <>
              <Link href={dashboardPath}>
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                  Dashboard →
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden xl:inline">{user.email}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link href="/account/settings" className="flex items-center cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/company-signup">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu, persona-aware, action-first */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-700 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 pb-6 pt-3 space-y-4">
            {/* Primary CTA cluster, what most mobile visitors actually came for */}
            {user ? (
              <Link
                href={dashboardPath}
                className="flex items-center justify-between rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3.5 text-base font-semibold text-white shadow-md"
              >
                <span>Open my dashboard</span>
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </Link>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/company-signup"
                  className="flex flex-col items-start rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 px-4 py-3 text-white shadow-md"
                >
                  <span className="text-[11px] uppercase tracking-wide opacity-80">Free 14-day trial</span>
                  <span className="text-base font-semibold">Start now</span>
                </Link>
                <Link
                  href="/auth/login"
                  className="flex flex-col items-start rounded-xl border-2 border-slate-200 dark:border-slate-700 px-4 py-3"
                >
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Existing tenant</span>
                  <span className="text-base font-semibold text-slate-900 dark:text-slate-100">Sign in</span>
                </Link>
              </div>
            )}

            {/* Quick links, the 3 things mobile visitors poke before committing */}
            <div className="grid grid-cols-3 gap-2">
              <QuickTile href="/pricing"        label="Pricing"  icon={CreditCard} />
              <QuickTile href="/demo"           label="Demo"     icon={Phone} />
              <QuickTile href="https://wa.me/27000000000" label="WhatsApp" icon={MessageSquare} external />
            </div>

            {/* Persona switch, different audiences want different doors */}
            {!user && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  I'm signing in as a...
                </p>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <Link href="/auth/login" className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center font-medium text-slate-900 dark:text-slate-100">
                    Catering<br />owner
                  </Link>
                  <Link href="/auth/login" className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center font-medium text-slate-900 dark:text-slate-100">
                    Team<br />member
                  </Link>
                  <Link href="/auth/login" className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center font-medium text-slate-900 dark:text-slate-100">
                    Booking<br />client
                  </Link>
                </div>
              </div>
            )}

            {/* Browse the platform */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1 mb-1">
                Browse
              </p>
              <div className="space-y-1">
                <MobileMenuSection label="Features" rootHref="/features" items={featuresMenu} />
                <MobileMenuSection label="Pricing"  rootHref="/pricing"  items={pricingMenu} />
                <MobileMenuSection label="Contact"  rootHref="/contact"  items={contactMenu} />
                <MobileMenuSection label="Support"  rootHref="/support"  items={supportMenu} />
              </div>
            </div>

            {/* Authed extras, only useful if you're already in */}
            {user && (
              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/account/settings"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full text-left rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}

            {/* Footer chrome, region & theme only matter on long sessions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <RegionSwitcher />
              <ThemeSwitch />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function QuickTile({
  href, label, icon: Icon, external,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
}) {
  const inner = (
    <span className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
      <Icon className="h-4 w-4 text-purple-600 dark:text-purple-300" />
      {label}
    </span>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}

interface MegaItem {
  name: string;
  href: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
}

function MegaMenu({
  label, rootHref, items, cols, wide,
}: {
  label: string;
  rootHref: string;
  items: MegaItem[];
  cols: 1 | 2;
  wide?: boolean;
}) {
  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Link
          href={rootHref}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-semibold text-slate-900 hover:text-purple-600 hover:bg-slate-50 dark:text-slate-100 dark:hover:text-purple-400 dark:hover:bg-slate-800 transition-colors"
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={8}
        className={`p-3 z-[60] ${wide ? "w-[640px]" : "w-[360px]"}`}
      >
        <Link
          href={rootHref}
          className="block mb-2 px-3 py-2 rounded-md bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 hover:from-purple-100 hover:to-pink-100"
        >
          <div className="text-sm font-semibold text-purple-700 dark:text-purple-300">
            {label} overview
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Jump to the {label.toLowerCase()} hub
          </div>
        </Link>
        <ul className={`grid gap-1.5 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const inner = (
              <span className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span className="w-9 h-9 rounded-md bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.name}
                  </span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {item.desc}
                  </span>
                </span>
              </span>
            );
            return (
              <li key={item.name}>
                {item.external ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="block">
                    {inner}
                  </a>
                ) : (
                  <Link href={item.href} className="block">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}

function MobileMenuSection({
  label, rootHref, items,
}: {
  label: string;
  rootHref: string;
  items: MegaItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
      <div className="flex items-center justify-between">
        <Link
          href={rootHref}
          className="block flex-1 rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Toggle ${label} submenu`}
          className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {open && (
        <ul className="pl-3 pb-2 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const inner = (
              <span className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Icon className="w-4 h-4 text-purple-600 dark:text-purple-300 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </span>
            );
            return (
              <li key={item.name}>
                {item.external ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer">{inner}</a>
                ) : (
                  <Link href={item.href}>{inner}</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}