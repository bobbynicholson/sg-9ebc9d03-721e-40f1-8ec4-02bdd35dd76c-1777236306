import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantBrandingApplier } from "@/components/TenantBrandingApplier";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalInternalFooter } from "@/components/GlobalInternalFooter";
import "@/styles/globals.css";

// Elegant display serif for marketing headings (opt-in via Tailwind's
// `font-display`). Self-hosted by next/font — no external request, no layout
// shift. Exposed as the --font-display CSS variable on a wrapper below.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Note: P2-14 originally tried to skip AuthProvider on public pages
// to avoid the empty-session round-trip on cold caches. That broke
// prerender of /security and /eu/pricing because shared chrome
// (Header, Footer, etc.) calls useAuth() and bombs without the
// provider. The right shape is to keep AuthProvider wrapping
// everything but make the provider itself a no-op fetch on public
// routes - shipped in Phase 4 P2-14 reframe.

export default function App({ Component, pageProps }: AppProps) {
  // Tenant pre-auth pages (/[company_slug]/login etc.) ship their
  // branding row via getStaticProps. Forward it to the applier so the
  // very first paint shows the tenant's logo + palette.
  const initialBranding: InitialBranding | null =
    (pageProps as { initialBranding?: InitialBranding | null })?.initialBranding ?? null;

  // Phase 3 #3: register the driver portal service worker. We only
  // register when the user is currently on a /team-portal/driver/*
  // path so the SW never gets installed in an admin or client tab.
  // The browser scopes the SW to /team-portal/driver/ via the
  // registration scope, so even after install the SW only intercepts
  // requests inside that subtree.
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!router.pathname.startsWith("/team-portal/driver")) return;
    let cancelled = false;
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/team-portal/driver/",
        });
        if (cancelled) return;
        // Pull updates on each route change so the driver picks up
        // a deploy without having to fully close + reopen the tab.
        reg.update().catch(() => {});
      } catch (e) {
        console.warn("[sw] driver portal SW registration failed:", e);
      }
    };
    void register();
    return () => {
      cancelled = true;
    };
  }, [router.pathname]);

  // Post-deploy stale-bundle recovery. After a new deploy the old JS
  // chunk files are removed; a tab still holding the previous build
  // throws "ChunkLoadError" / "Loading chunk N failed" on the next
  // client-side navigation and the page goes blank. Catch it once and
  // do a single hard reload to pull the fresh build (a sessionStorage
  // guard prevents a reload loop if the failure is something else).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const RELOAD_KEY = "__chunk_reload_at";
    const looksLikeChunkError = (msg: string) =>
      /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|Importing a module script failed/i.test(msg);
    const recover = (msg: string) => {
      if (!looksLikeChunkError(msg)) return;
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      // Don't reload more than once per 10s - avoids a loop when the
      // error is genuine (not a stale chunk).
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => recover(e?.message || "");
    const onRejection = (e: PromiseRejectionEvent) =>
      recover(String((e?.reason && (e.reason.message || e.reason)) || ""));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <div className={playfair.variable}>
      <NoIndexMeta />
      <ThemeProvider>
        <AuthProvider>
          <TenantBrandingApplier initialBranding={initialBranding} />
          <RegionFilterProvider>
            <Component {...pageProps} />
            {/* Wave 70.26 - slim internal footer mounted globally
                so every admin / team-portal / client-portal page
                shows it, branded to the active tenant. Self-hides
                on marketing routes; per-page <Footer /> components
                self-hide on internal routes so we never double up. */}
            <GlobalInternalFooter />
            <CommandPalette />
            <MiddlewareErrorToast />
            {/* VersionWatcher (the "A new version is available" banner)
                unmounted per Raj, 2026-06-12 - it nagged on every
                deploy during active development. Component + the
                /api/version endpoint remain; remount here if stale
                bundles become a support problem again. */}
            <Toaster />
          </RegionFilterProvider>
        </AuthProvider>
      </ThemeProvider>
    </div>
  );
}
