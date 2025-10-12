import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <DemoModeProvider>
        <AuthProvider>
          <Header />
          <Component {...pageProps} />
        </AuthProvider>
      </DemoModeProvider>
    </ThemeProvider>
  );
}