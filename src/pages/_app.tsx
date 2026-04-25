import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { PortalSwitcher } from "@/components/PortalSwitcher";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <BrandingProvider>
        <AuthProvider>
          <Component {...pageProps} />
          <Toaster />
          <PortalSwitcher />
        </AuthProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}
