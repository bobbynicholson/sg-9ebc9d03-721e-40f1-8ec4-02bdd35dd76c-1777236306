import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { Toaster } from "@/components/ui/toaster";
import { GeoRedirectHandler } from "@/components/GeoRedirectHandler";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DemoModeProvider>
          <BrandingProvider>
            <GeoRedirectHandler />
            <Component {...pageProps} />
            <Toaster />
          </BrandingProvider>
        </DemoModeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
