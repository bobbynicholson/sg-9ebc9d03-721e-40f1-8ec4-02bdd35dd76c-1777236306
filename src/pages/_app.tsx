import { useRouter } from "next/router";
import type { AppProps, NextWebVitalsMetric } from "next/app";
import type { NextPage } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { CommandPalette } from "@/components/CommandPalette";
import { VersionWatcher } from "@/components/VersionWatcher";
import "@/styles/globals.css";

// Routes that don't need an authenticated user. AuthProvider runs
// `supabase.auth.getSession()` + a profile/company hydration query on
// mount; on a public marketing page that's wasted work + an empty-
// session round-trip on every cold cache. Skip wholesale [P2-14].
//
// Match by router.pathname (the unresolved Next.js path) so dynamic
// routes like /q/[token] and /pay/i/[token] still match without
// hardcoding tokens.
const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pricing$/,
  /^\/features(\/.*)?$/,
  /^\/blog(\/.*)?$/,
  /^\/page\/\[slug\]$/,
  /^\/contact$/,
  /^\/support$/,
  /^\/security$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/demo$/,
  /^\/uk(\/.*)?$/,
  /^\/us(\/.*)?$/,
  /^\/eu(\/.*)?$/,
  /^\/q\/\[token\]$/,
  /^\/pay\/i\/\[token\]$/,
  /^\/pay\/i\/\[token\]\/success$/,
  /^\/c\/order\/\[id\]$/,
  /^\/404$/,
];

type PageWithSkipAuth = NextPage & { skipAuth?: boolean };

function isPublicRoute(pathname: string, Component: PageWithSkipAuth): boolean {
  if (Component.skipAuth) return true;
  return PUBLIC_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const initialBranding: InitialBranding | null =
    (pageProps as { initialBranding?: InitialBranding | null })?.initialBranding ?? null;

  const skipAuth = isPublicRoute(router.pathname, Component as PageWithSkipAuth);

  const tree = (
    <BrandingProvider initialBranding={initialBranding}>
      <RegionFilterProvider>
        <Component {...pageProps} />
        <CommandPalette />
        <MiddlewareErrorToast />
        <VersionWatcher />
        <Toaster />
      </RegionFilterProvider>
    </BrandingProvider>
  );

  return (
    <>
      <NoIndexMeta />
      <ThemeProvider>
        {skipAuth ? tree : <AuthProvider>{tree}</AuthProvider>}
      </ThemeProvider>
    </>
  );
}

// Re-export so per-page opt-out (`Page.skipAuth = true`) is supported
// for any route that isn't already in the pattern list.
export type { PageWithSkipAuth };
export { NextWebVitalsMetric };
