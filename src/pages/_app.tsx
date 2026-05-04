import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { CommandPalette } from "@/components/CommandPalette";
import { VersionWatcher } from "@/components/VersionWatcher";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <NoIndexMeta />
      <ThemeProvider>
        {/* Auth wraps Branding so the branding context can read user.company_id
            and load that tenant's branding row. */}
        <AuthProvider>
          <BrandingProvider>
            <RegionFilterProvider>
              <Component {...pageProps} />
              <CommandPalette />
              <MiddlewareErrorToast />
              <VersionWatcher />
              <Toaster />
            </RegionFilterProvider>
          </BrandingProvider>
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
