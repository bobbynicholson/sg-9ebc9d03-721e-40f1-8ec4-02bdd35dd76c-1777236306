import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, ChefHat, Menu, Moon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/authContextCore";
import { useAfterIdle } from "@/hooks/useAfterIdle";
import { UserRole } from "@/types/app";

// The header is on every public page, so its dropdown/tooltip-based controls
// load after the page instead of in its first bundle: once the browser is
// idle, or straight away when someone points at, focuses or touches one.
// Each placeholder is the exact markup the control renders on the server, so
// nothing moves when the real one takes over.
function RegionSwitcherPlaceholder() {
  return (
    <Button variant="ghost" size="icon" className="relative group">
      <span className="text-2xl">🇿🇦</span>
      <span className="sr-only">Change region</span>
      <div className="absolute bottom-full mb-2 hidden group-hover:block px-2 py-1 bg-gray-800 text-white text-xs rounded-md">
        South Africa
      </div>
    </Button>
  );
}
function ThemeSwitchPlaceholder() {
  return (
    <Button variant="ghost" size="icon" disabled className="h-11 w-11 cursor-not-allowed opacity-60" aria-label="Theme switching">
      <Moon className="h-5 w-5 text-slate-500" />
    </Button>
  );
}
const RegionSwitcher = dynamic(
  () => import("@/components/RegionSwitcher").then((module) => module.RegionSwitcher),
  { ssr: false, loading: RegionSwitcherPlaceholder },
);
const ThemeSwitch = dynamic(
  () => import("@/components/ThemeSwitch").then((module) => module.ThemeSwitch),
  { ssr: false, loading: ThemeSwitchPlaceholder },
);

function LoadWhenIdle({ placeholder, children }: { placeholder: ReactNode; children: ReactNode }) {
  const idle = useAfterIdle();
  const [wanted, setWanted] = useState(false);
  if (idle || wanted) return <>{children}</>;
  const want = () => setWanted(true);
  return (
    <span className="contents" onPointerEnter={want} onFocus={want} onTouchStart={want}>
      {placeholder}
    </span>
  );
}

function HeaderSwitchers() {
  return (
    <>
      <LoadWhenIdle placeholder={<RegionSwitcherPlaceholder />}><RegionSwitcher /></LoadWhenIdle>
      <LoadWhenIdle placeholder={<ThemeSwitchPlaceholder />}><ThemeSwitch /></LoadWhenIdle>
    </>
  );
}
const LandingAccountMenu = dynamic(
  () => import("./LandingAccountMenu").then((module) => module.LandingAccountMenu),
  { ssr: false, loading: () => null },
);

function getDashboardPath(role: UserRole, companySlug?: string) {
  const adminPath = companySlug ? "/" + companySlug + "/admin/dashboard" : "/admin/dashboard";
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return "/admin/platform/dashboard";
    case UserRole.COMPANY_ADMIN:
    case UserRole.ADMIN:
    case UserRole.OWNER:
    case UserRole.REGION_ADMIN:
    case UserRole.SALES_ADMIN:
      return adminPath;
    case UserRole.DRIVER:
      return "/team-portal/driver/dashboard";
    case UserRole.WAITER:
      return "/team-portal/waiter/dashboard";
    case UserRole.KITCHEN_MANAGER:
    case UserRole.KITCHEN_STAFF:
      return "/team-portal/kitchen/today";
    case UserRole.SHOPPING_STAFF:
      return "/team-portal/shopping/dashboard";
    case UserRole.CLEANING_MANAGER:
    case UserRole.CLEANING_STAFF:
      return "/team-portal/cleaning/dashboard";
    case UserRole.CLIENT:
      return "/client-portal/dashboard";
    default:
      return "/";
  }
}

/** Shared public header used by the landing pages, product pages, and regional routes. */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user, profile, activeRole, signOut } = useAuth();
  const currentPath = (router.asPath || router.pathname || "").split(/[?#]/)[0];
  const localePrefix = /^(\/(?:us|uk|eu))(?:\/|$)/.exec(currentPath)?.[1] || "";
  const homeHref = localePrefix || "/";
  const pricingHref = localePrefix ? localePrefix + "/pricing" : "/pricing";
  const role = (activeRole || user?.active_role || user?.role || UserRole.CLIENT) as UserRole;
  const dashboardPath = getDashboardPath(role, profile?.company_slug);
  const nav = [
    { name: "How it works", href: homeHref + "#process" },
    { name: "Features", href: "/features" },
    { name: "Pricing", href: pricingHref },
    { name: "Try the demo", href: "/demo" },
  ];

  useEffect(() => {
    setOpen(false);
  }, [router.asPath]);

  const handleSignOut = async () => {
    await signOut();
    await router.push(homeHref);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-stone-200/70 bg-stone-50/95 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 lg:px-8">
        <Link href={homeHref} className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500">
            <ChefHat className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            CateringMS
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <HeaderSwitchers />
          {user ? (
            <LandingAccountMenu email={user.email} dashboardPath={dashboardPath} onSignOut={handleSignOut} />
          ) : (
            <>
              <Button asChild variant="ghost" className="rounded-full text-stone-700 hover:bg-stone-100">
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button asChild className="rounded-full bg-amber-800 px-5 font-semibold text-white shadow-sm hover:bg-amber-900">
                <Link href="/company-signup">Start free trial <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="landing-navigation"
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </nav>

      <div id="landing-navigation" hidden={!open} className="border-t border-stone-200/70 bg-stone-50 lg:hidden">
        <div className="space-y-1 px-4 pb-5 pt-3">
          {nav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="block rounded-lg px-3 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-100"
            >
              {item.name}
            </Link>
          ))}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
            <HeaderSwitchers />
          </div>
          {user ? (
            <div className="grid grid-cols-1 gap-2 pt-3">
              <Button asChild className="w-full rounded-full bg-amber-800 font-semibold text-white hover:bg-amber-900">
                <Link href={dashboardPath}>Open dashboard</Link>
              </Button>
              <Button asChild variant="outline" className="w-full rounded-full">
                <Link href="/account/settings">Account settings</Link>
              </Button>
              <Button type="button" variant="ghost" className="w-full rounded-full text-rose-700" onClick={handleSignOut}>Sign out</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 pt-3">
              <Button asChild className="w-full rounded-full bg-amber-800 font-semibold text-white hover:bg-amber-900">
                <Link href="/company-signup">Start free trial <ArrowRight className="size-4" aria-hidden="true" /></Link>
              </Button>
              <Button asChild variant="ghost" className="w-full rounded-full text-stone-700 hover:bg-stone-100">
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
