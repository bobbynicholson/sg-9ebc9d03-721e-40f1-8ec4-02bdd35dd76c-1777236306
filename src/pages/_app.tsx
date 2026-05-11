import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantBrandingApplier } from "@/components/TenantBrandingApplier";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { CommandPalette } from "@/components/CommandPalette";
import { VersionWatcher } from "@/components/VersionWatcher";
import "@/styles/globals.css";

// Note: P2-14 originally tried to skip AuthProvider on public pages
// to avoid the empty-session round-trip on cold caches. That broke
// prerender of /security and /eu/pricing because shared chrome
// (Header, Footer, etc.) calls useAuth() and bombs without the
// provider. The right shape is to keep AuthProvider wrapping
// everything but make the provider itself a no-op fetch on public
// routes -- shipped in Phase 4 P2-14 reframe.

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

  return (
    <>
      <NoIndexMeta />
      <ThemeProvider>
        <AuthProvider>
          <TenantBrandingApplier initialBranding={initialBranding} />
          <RegionFilterProvider>
            <Component {...pageProps} />
            <CommandPalette />
            <MiddlewareErrorToast />
            <VersionWatcher />
            <Toaster />
          </RegionFilterProvider>
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
