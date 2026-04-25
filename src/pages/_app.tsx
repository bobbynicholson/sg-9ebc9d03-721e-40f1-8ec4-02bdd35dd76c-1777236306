import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <NoIndexMeta />
      <ThemeProvider>
        <BrandingProvider>
          <AuthProvider>
            <Component {...pageProps} />
            <Toaster />
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </>
  );
}
