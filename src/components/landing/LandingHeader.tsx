import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Menu, X, ChefHat, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Focused marketing navigation: explain the workflow, show features and
// pricing, let visitors try the demo, then offer one clear signup action.
const NAV = [
  { name: "How it works", href: "/#process" },
  { name: "Features", href: "/features" },
  { name: "Pricing", href: "/pricing" },
  { name: "Try the demo", href: "/demo" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [router.asPath]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-stone-200/70 bg-stone-50/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <ChefHat className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            CateringMS
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors duration-150 ease-standard hover:bg-stone-100 hover:text-stone-900"
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button
            asChild
            variant="ghost"
            className="rounded-full text-stone-700 hover:bg-stone-100"
          >
            <Link href="/auth/login">Sign In</Link>
          </Button>
          <Button
            asChild
            className="group rounded-full bg-gradient-to-b from-amber-700 to-amber-800 px-5 font-semibold text-white shadow-md shadow-amber-900/20 hover:from-amber-800 hover:to-amber-900"
          >
            <Link href="/company-signup">
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="landing-navigation"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile panel */}
      <div
        id="landing-navigation"
        hidden={!open}
        className="border-t border-stone-200/70 bg-stone-50 lg:hidden"
      >
        <div className="space-y-1 px-4 pb-5 pt-3">
          {NAV.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="block rounded-lg px-3 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-100"
            >
              {item.name}
            </Link>
          ))}
          <div className="grid grid-cols-1 gap-2 pt-3">
            <Button
              asChild
              className="w-full rounded-full bg-gradient-to-b from-amber-700 to-amber-800 font-semibold text-white hover:from-amber-800 hover:to-amber-900"
            >
              <Link href="/company-signup">
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="w-full rounded-full text-stone-700 hover:bg-stone-100"
            >
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
