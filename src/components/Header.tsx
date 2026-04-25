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
import { Menu, X, User, LogOut, Settings, ChevronDown } from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { RegionSwitcher } from "@/components/RegionSwitcher";
import { UserRole } from "@/types/app";

// Helper function to get the correct dashboard path for each role
const getDashboardPath = (role: UserRole, companySlug?: string): string => {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return "/super-admin/dashboard";
    case UserRole.COMPANY_ADMIN:
    case UserRole.ADMIN:
      return companySlug ? `/${companySlug}/admin/dashboard` : "/admin/dashboard";
    case UserRole.CLIENT:
      return companySlug ? `/${companySlug}/client-portal/dashboard` : "/client-portal/dashboard";
    case UserRole.DRIVER:
      return companySlug ? `/${companySlug}/team-portal/driver/dashboard` : "/team-portal/driver/dashboard";
    case UserRole.KITCHEN:
      return companySlug ? `/${companySlug}/team-portal/kitchen/dashboard` : "/team-portal/kitchen/dashboard";
    case UserRole.SHOPPING:
      return companySlug ? `/${companySlug}/team-portal/shopping/dashboard` : "/team-portal/shopping/dashboard";
    case UserRole.CLEANING:
      return companySlug ? `/${companySlug}/team-portal/cleaning/dashboard` : "/team-portal/cleaning/dashboard";
    case UserRole.STAFF:
      return companySlug ? `/${companySlug}/team-portal/general/job-progress` : "/team-portal/general/job-progress";
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

        {/* Desktop navigation */}
        <div className="hidden lg:flex lg:gap-x-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-semibold leading-6 text-slate-900 hover:text-purple-600 dark:text-slate-100 dark:hover:text-purple-400 transition-colors"
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4 items-center">
          <RegionSwitcher />
          <ThemeSwitch />
          
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

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-700">
          <div className="space-y-2 px-4 pb-3 pt-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {item.name}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href={dashboardPath}
                  className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-purple-600 hover:bg-purple-50"
                >
                  Dashboard
                </Link>
                <Link
                  href="/account/settings"
                  className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left rounded-lg px-3 py-2 text-base font-semibold leading-7 text-red-600 hover:bg-red-50"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Sign In
                </Link>
                <Link
                  href="/company-signup"
                  className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-purple-600 hover:bg-purple-50"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}