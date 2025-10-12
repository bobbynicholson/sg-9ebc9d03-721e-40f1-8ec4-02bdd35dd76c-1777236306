import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { Header } from "@/components/Header";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <BrandingProvider>
        <DemoModeProvider>
          <AuthProvider>
            <Header />
            <Component {...pageProps} />
          </AuthProvider>
        </DemoModeProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}
