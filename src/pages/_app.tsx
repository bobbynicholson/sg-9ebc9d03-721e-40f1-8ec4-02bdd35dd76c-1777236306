import type { AppProps } from "next/app";
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
