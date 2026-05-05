import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ActiveTenantProvider } from "@/contexts/ActiveTenantContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { CommandPalette } from "@/components/CommandPalette";
import { VersionWatcher } from "@/components/VersionWatcher";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  // Tenant pre-auth pages (/[company_slug]/login etc.) ship their
  // branding row via getStaticProps. Forward it to BrandingProvider so
  // the provider seeds itself synchronously and pages render with the
  // tenant's logo + palette from the very first paint.
  const initialBranding: InitialBranding | null =
    (pageProps as { initialBranding?: InitialBranding | null })?.initialBranding ?? null;

  return (
    <>
      <NoIndexMeta />
      <ThemeProvider>
        {/* Auth wraps Branding so the branding context can read user.company_id
            and load that tenant's branding row. */}
        <AuthProvider>
          <BrandingProvider initialBranding={initialBranding}>
            <ActiveTenantProvider>
              <RegionFilterProvider>
                <Component {...pageProps} />
                <CommandPalette />
                <MiddlewareErrorToast />
                <VersionWatcher />
                <Toaster />
              </RegionFilterProvider>
            </ActiveTenantProvider>
          </BrandingProvider>
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
