import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Mail,
  Phone,
  MapPin,
  Building2,
  Users,
  ArrowRight,
} from "lucide-react";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { isWhiteLabelRow } from "@/lib/branding/applyBranding";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Wave 70.23 -- route classification. The Footer is mounted on every
 * page (83 import sites) but the marketing footer makes no sense on
 * internal tools like /admin, /team-portal/* and the client portal.
 *
 * Public / marketing routes -> full marketing footer (existing)
 * Internal routes           -> slim footer (tenant attribution +
 *                              legal links only)
 *
 * The detection strips any tenant slug prefix (/{slug}/admin/...)
 * before matching, mirroring what the middleware does.
 */
export function classifyFooterRoute(pathname: string): "marketing" | "internal" {
  return classifyRoute(pathname);
}

function classifyRoute(pathname: string): "marketing" | "internal" {
  // Strip leading /{slug} if it precedes a known internal namespace.
  const stripped = pathname.replace(
    /^\/[^/]+(?=\/(?:admin|team-portal|client-portal|client|c|account|subscription|auth)(?:\/|$))/,
    "",
  );
  const isInternal =
    stripped === "/admin" ||
    stripped.startsWith("/admin/") ||
    stripped.startsWith("/team-portal/") ||
    stripped.startsWith("/client-portal/") ||
    stripped.startsWith("/client/") ||
    stripped.startsWith("/c/") ||
    stripped.startsWith("/account/") ||
    stripped.startsWith("/subscription/") ||
    stripped.startsWith("/auth/");
  return isInternal ? "internal" : "marketing";
}

/**
 * Slim internal footer for /admin, /team-portal/* and /client-portal/*.
 *
 * Bobby's rule: backend / staff tools don't need "About / Features /
 * Pricing / Blog / Help Center / Documentation / Video Tutorials" --
 * those are sales surfaces. What an internal user actually needs in a
 * footer is: tenant attribution, © year, and the legal links POPIA
 * requires (Privacy + Terms). That's it.
 *
 * No big slate-gradient block, no contact details, no resources list.
 * Single calm hairline divider, slate-500 text, sits flush at the
 * bottom of the page content.
 */
export function SlimInternalFooter({
  displayName,
  isWhiteLabeled,
}: {
  displayName: string;
  isWhiteLabeled: boolean;
}) {
  const currentYear = new Date().getFullYear();
  // Wave 70.27 -- pinned to the bottom of the viewport with `fixed`
  // so it never leaves dead whitespace between content and footer
  // on short admin pages (the page wrappers use min-h-screen which
  // forces them to 100vh tall even when content is short -- if the
  // footer were a normal block, that whole 100vh would render
  // before the footer hit the page bottom). Offsets for the
  // admin / portal sidebars on lg+ so the footer doesn't render
  // under the nav. backdrop-blur + 95% bg so content scrolling
  // underneath stays legible.
  return (
    <footer
      className="fixed bottom-0 left-0 right-0 lg:left-64 xl:left-72 z-30 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="px-4 py-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>© {currentYear} {displayName}.</span>
            {isWhiteLabeled && (
              <Link
                href="https://cateringms.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>Powered by CateringMS</span>
              </Link>
            )}
          </div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Footer() {
  // Wave 70.23 fix -- ALL hooks must run unconditionally and in the
  // same order every render (React rules-of-hooks). The previous
  // version returned the slim footer early BEFORE the auth/ref/
  // state/effect hooks ran, which the linter correctly rejected.
  // Now: run every hook first, decide which variant to render last.
  const currentYear = new Date().getFullYear();
  const branding = useBrandingRow();
  const isWhiteLabeled = isWhiteLabelRow(branding);
  const router = useRouter();
  const variant = classifyRoute(router?.pathname || "/");

  // Auth state drives whether we show the "Sign in" CTA card. The
  // block doesn't help anyone who's already inside their portal --
  // it just adds noise to authenticated dashboards. Hidden when
  // signed in. (Moved up so the hook always runs.)
  const { user } = useAuth() as any;
  const isSignedIn = !!user;

  // Footer-below-the-fold spacer hooks. Always declared so the
  // hook order is stable across renders, even when the slim
  // internal footer takes over below.
  const footerRef = useRef<HTMLElement | null>(null);
  const spacerRef = useRef(0);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    // Spacer only matters for the marketing footer + signed-in
    // dashboards. Slim internal footer doesn't need the spacer
    // because internal pages have their own bottom padding.
    if (variant !== "marketing") return;
    if (!isSignedIn) return;

    const recompute = () => {
      const f = footerRef.current;
      if (!f) return;
      const rect = f.getBoundingClientRect();
      const winH = window.innerHeight;
      const currentTop = rect.top + window.scrollY;
      const targetTop = winH;
      const naturalTop = currentTop - spacerRef.current;
      const needed = Math.max(0, Math.round(targetTop - naturalTop));
      if (Math.abs(spacerRef.current - needed) >= 2) {
        spacerRef.current = needed;
        setSpacerHeight(needed);
      }
    };

    recompute();
    const timers = [setTimeout(recompute, 80), setTimeout(recompute, 300), setTimeout(recompute, 1000)];
    window.addEventListener("resize", recompute);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", recompute);
    };
  }, [isSignedIn, variant]);

  // Wave 70.26 -- on internal routes the slim footer is mounted
  // globally via _app.tsx (GlobalInternalFooter) so every admin /
  // team-portal / client-portal page gets it automatically, even
  // the 30+ pages that never imported <Footer /> in the first place.
  //
  // Per-page <Footer /> mounts on internal routes therefore become
  // no-ops to avoid double-rendering. The global mount wins.
  //
  // Marketing routes still render the per-page Footer because the
  // marketing pages explicitly mount it.
  if (variant === "internal") {
    return null;
  }

  const displayName = branding?.companyName || "CateringMS";
  const displayLogo = branding?.logoUrl;

  const quickLinks = [
    { name: "About", href: "/about" },
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Security", href: "/security" },
    { name: "Blog", href: "/blog" },
    { name: "Contact", href: "/contact" },
    { name: "Support", href: "/support" }
  ];

  return (
    <>
      {/* Pushes the footer below the visible viewport on short signed-in
          pages. Sized to whatever leftover space the page has at first
          paint, so long pages stay tight and short ones don't surface
          the footer until the user actively scrolls. */}
      {isSignedIn && spacerHeight > 0 && (
        <div aria-hidden style={{ height: spacerHeight }} />
      )}
    <footer ref={footerRef} className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white mt-20">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/*
          Sign-in CTA card. Only shown to UNAUTHENTICATED visitors --
          on every authenticated dashboard the team already has their
          own nav, so the old six-portal grid was just noise.
          Two clean entry points:
            1. Catering business -> /auth/login + /company-signup
            2. Event customer    -> log in via the link in their
                                    booking email (their company
                                    portal lives at /{slug}/client/login
                                    which they shouldn't have to type)
        */}
        {!isSignedIn && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-8 mb-12 border border-slate-600">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Catering company CTA */}
              <div className="bg-slate-900/50 border border-slate-600 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-900/30 text-purple-300">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-semibold text-white">Catering business</h4>
                </div>
                <p className="text-sm text-slate-300 mb-4">
                  Sign in to manage quotes, orders, kitchen prep, drivers and clients.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/auth/login">
                    <Button size="sm" className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white hover:opacity-90">
                      Sign in
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                  <Link href="/company-signup">
                    <Button size="sm" variant="outline" className="border-slate-500 text-slate-200 hover:text-white hover:bg-slate-800">
                      Sign up free
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Event customer CTA */}
              <div className="bg-slate-900/50 border border-slate-600 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-900/30 text-blue-300">
                    <Users className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-semibold text-white">Booked an event?</h4>
                </div>
                <p className="text-sm text-slate-300 mb-4">
                  Open the "Track your event" link in your booking confirmation email, it takes you straight to your portal.
                </p>
                <p className="text-xs text-slate-400">
                  Lost the email? Reply to your last quote and the catering team will resend it.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            {displayLogo ? (
              <img
                src={displayLogo}
                alt={displayName}
                className="h-12 object-contain mb-4"
              />
            ) : (
              <h3 className="text-2xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent mb-4">
                {displayName}
              </h3>
            )}
            <p className="text-slate-300 mb-6 max-w-md">
              {isWhiteLabeled
                ? `Complete catering management solution powered by advanced technology.`
                : `Complete solution for South African catering businesses. Automate your operations, increase profitability, and deliver exceptional service.`}
            </p>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Cape Town, South Africa</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>+27 (0) 21 123 4567</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>support@cateringplatform.co.za</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Quick Links</h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href}>
                    <span className="text-slate-300 hover:text-white transition-colors text-sm">
                      {link.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Resources</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/blog">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Blog
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/help">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Help Center
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/documentation">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Documentation
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/tutorials">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Video Tutorials
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with CateringMS Attribution */}
        <div className="border-t border-slate-700 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-slate-400 text-center md:text-left">
              <p>© {currentYear} {displayName}. All rights reserved.</p>
              {isWhiteLabeled && (
                <p className="mt-2">
                  <Link href="https://cateringms.com" target="_blank" rel="noopener noreferrer">
                    <span className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors">
                      <Sparkles className="w-4 h-4" />
                      <span>Powered by CateringMS - Catering Management & Process Solutions</span>
                    </span>
                  </Link>
                </p>
              )}
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link href="/privacy">
                <span className="hover:text-white transition-colors">Privacy Policy</span>
              </Link>
              <Link href="/terms">
                <span className="hover:text-white transition-colors">Terms of Service</span>
              </Link>
              <Link href="/cookies">
                <span className="hover:text-white transition-colors">Cookie Policy</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
