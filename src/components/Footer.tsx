import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Sparkles } from "lucide-react";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { isWhiteLabelRow } from "@/lib/branding/applyBranding";
import { useAuth } from "@/contexts/AuthContext";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Wave 70.23 - route classification. The Footer is mounted on every
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
    /^\/[^/]+(?=\/(?:admin|team-portal|client-portal|client|c|account|subscription)(?:\/|$))/,
    "",
  );
  // Note (2026-06-12): /auth/* is deliberately NOT internal anymore.
  // The sign-in / sign-up pages now use the full-height AuthShell
  // split-panel layout, which carries its own in-flow footer. The
  // global FIXED slim footer overlapped that design and looked
  // broken, so auth pages opt out of it here.
  const isInternal =
    stripped === "/admin" ||
    stripped.startsWith("/admin/") ||
    stripped.startsWith("/team-portal/") ||
    stripped.startsWith("/client-portal/") ||
    stripped.startsWith("/client/") ||
    stripped.startsWith("/c/") ||
    stripped.startsWith("/account/") ||
    stripped.startsWith("/subscription/");
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
 * Single calm hairline divider, slate-500 text. It stays in normal document
 * flow on every viewport so it never covers scrollable page content.
 */
export function SlimInternalFooter({
  displayName,
  isWhiteLabeled,
}: {
  displayName: string;
  isWhiteLabeled: boolean;
}) {
  const currentYear = new Date().getFullYear();
  return (
    <footer
      className="internal-footer-shell border-t border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 lg:ml-72 xl:ml-80"
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
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Footer() {
  // Wave 70.23 fix - ALL hooks must run unconditionally and in the
  // same order every render (React rules-of-hooks). The previous
  // version returned the slim footer early BEFORE the auth/ref/
  // state/effect hooks ran, which the linter correctly rejected.
  // Now: run every hook first, decide which variant to render last.
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

  // Wave 70.26 - on internal routes the slim footer is mounted
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

  // The marketing footer IS the warm landing footer - one voice across the
  // whole public site. The old slate-gradient block (gradient wordmark,
  // placeholder contact details, links to pages that never existed and a
  // bulky sign-in card grid) is gone.
  return (
    <>
      {/* Pushes the footer below the visible viewport on short signed-in
          pages. Sized to whatever leftover space the page has at first
          paint, so long pages stay tight and short ones don't surface
          the footer until the user actively scrolls. */}
      {isSignedIn && spacerHeight > 0 && (
        <div aria-hidden style={{ height: spacerHeight }} />
      )}
      <div ref={footerRef as React.RefObject<HTMLDivElement>} className="mt-20">
        <LandingFooter
          displayName={displayName}
          logoUrl={displayLogo || null}
          isWhiteLabeled={isWhiteLabeled}
        />
      </div>
    </>
  );
}
