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
        <BrandingProvider>
          <AuthProvider>
            <RegionFilterProvider>
              <Component {...pageProps} />
              <CommandPalette />
              <MiddlewareErrorToast />
              <VersionWatcher />
              <Toaster />
            </RegionFilterProvider>
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </>
  );
}
