import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { Toaster } from "@/components/ui/toaster";
import { GeoRedirectHandler } from "@/components/GeoRedirectHandler";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <DemoModeProvider>
        <AuthProvider>
          <BrandingProvider>
            <GeoRedirectHandler />
            <Component {...pageProps} />
            <Toaster />
          </BrandingProvider>
        </AuthProvider>
      </DemoModeProvider>
    </ThemeProvider>
  );
}
