import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Fraunces, Inter } from "next/font/google";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { normalizeProductPath, isProductPath, pwaRouteInfo } from "@/lib/pwa/routes";
import { isMarketingPath } from "@/lib/marketingRoutes";
import { MarketingShell } from "@/components/app/MarketingShell";
import "@/styles/globals.css";

// Two shells. Public marketing pages get a light one (no Supabase client,
// no portal widgets) so they load fast; every other page gets the full app
// shell, loaded as its own chunk and still server-rendered exactly as before.
// The import() must be written inline in dynamic() so Next records the
// chunk during server render and loads it before hydrating app pages.
const ProductShell = dynamic(() => import("@/components/app/ProductShell"));
const loadProductShell = () => import("@/components/app/ProductShell");

// Warm modern display serif for marketing headings (opt-in via Tailwind's
// `font-display`). Self-hosted by next/font - no external request, no layout
// shift. Exposed as the --font-display CSS variable on the wrapper below.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  // Upright only: no page sets display text in italic, and the italic file
  // was a third font download on every page.
  style: ["normal"],
  variable: "--font-display",
  display: "swap",
});

// Clean, neutral body sans for marketing surfaces (opt-in via `font-body`).
// Self-hosted by next/font. Pairs with Fraunces for a modern, warm, editorial
// voice - without changing the default app/dashboard font.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Note: P2-14 originally tried to skip AuthProvider on public pages
// to avoid the empty-session round-trip on cold caches. That broke
// prerender of /security and /eu/pricing because shared chrome
// (Header, Footer, etc.) calls useAuth() and bombs without the
// provider. The right shape is to keep AuthProvider wrapping
// everything but make the provider itself a no-op fetch on public
// routes - shipped in Phase 4 P2-14 reframe.

// Shared one-shot reload used by both stale-build recovery paths (the
// driver-portal service worker's controllerchange and the buildId
// liveness probe below). Guards: a sessionStorage timestamp stops
// reload loops; the reload is deferred while a camera capture
// round-trip is in progress (window.__cmsHoldSwReload, set by the POD
// dialog) or while the tab is hidden - reloading at those moments
// would eat a driver's unsaved photo. Deferred reloads retry on a 3s
// interval until the moment is safe.
const RELOAD_GUARD_KEY = "__sw_update_reload_at";
function reloadForNewBuild() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < 30_000) return; // one reload per 30s max
    const held = () =>
      Boolean((window as unknown as { __cmsHoldSwReload?: boolean }).__cmsHoldSwReload) ||
      document.visibilityState !== "visible";
    if (held()) {
      const retry = window.setInterval(() => {
        if (held()) return;
        window.clearInterval(retry);
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        window.location.reload();
      }, 3_000);
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
  } catch {
    /* never let recovery itself throw */
  }
}

export default function App({ Component, pageProps }: AppProps) {
  // Tenant pre-auth pages (/[company_slug]/login etc.) ship their
  // branding row via getStaticProps. Forward it to the applier so the
  // very first paint shows the tenant's logo + palette.
  const initialBranding: InitialBranding | null =
    (pageProps as { initialBranding?: InitialBranding | null })?.initialBranding ?? null;

  // Register the app service worker only on authenticated product
  // surfaces. Public marketing pages remain ordinary website pages, while
  // the installed CateringMS app can cover every role's workspace.
  const router = useRouter();
  const swRegistrationStarted = useRef(false);
  const swRegistrationInProgress = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || swRegistrationStarted.current || swRegistrationInProgress.current) return;
    if (!pwaRouteInfo(router.asPath || router.pathname || "").enabled) return;
    swRegistrationInProgress.current = true;

    // Register once when someone enters an app surface. Revalidating the
    // worker after every in-app navigation added background network work to
    // every page change without improving the visible data on that page.
    // A foreground check below and the browser's own navigation checks keep
    // installed apps current.
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        swRegistrationStarted.current = true;
        swRegistrationInProgress.current = false;
        const registration = await navigator.serviceWorker.getRegistration("/");
        registration?.update().catch(() => {});
      } catch (e) {
        swRegistrationInProgress.current = false;
        console.warn("[sw] app service worker registration failed:", e);
      }
    };
    void register();
  }, [router.asPath, router.pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      reloadForNewBuild();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker.getRegistration("/").then(registration => registration?.update()).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Long-lived-tab deploy detection for all app portals (Callum,
  // 2026-07-09). Phones can restore a week-old app tab without any
  // reload. Detection: this build's own /_next/static/<buildId>/
  // _buildManifest.js stops existing the moment a new deploy replaces
  // it (that 404 is the same mechanism behind the ChunkLoadError
  // recovery below), so a cheap liveness probe on tab-refocus tells us
  // the running bundle is stale. Probe result semantics: 404/410 (what
  // Vercel serves for a replaced build) or 400 (what `next start`
  // serves for the same miss) => new deploy => guarded reload;
  // anything else (200, 5xx, offline, captive portal) => do nothing.
  // Extra back-off on top of reloadForNewBuild's guard: one stale-heal
  // reload per 10 minutes per tab - a reload either fixes staleness or
  // nothing will, so repeats mean a false positive (e.g. a proxy
  // 400-ing static assets) and must never loop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const appPath = normalizeProductPath(router.asPath || router.pathname || "");
    if (!isProductPath(appPath) && !appPath.startsWith("/c/")) return;
    const buildId = (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__?.buildId;
    if (!buildId || buildId === "development") return;
    const STALE_RELOAD_KEY = "__stale_build_reload_at";
    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < 60_000) return; // at most once a minute
      lastCheck = Date.now();
      try {
        const res = await fetch(`/_next/static/${buildId}/_buildManifest.js`, { cache: "no-store" });
        if (res.status === 400 || res.status === 404 || res.status === 410) {
          const lastHeal = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || 0);
          if (Date.now() - lastHeal < 10 * 60_000) return;
          sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
          reloadForNewBuild();
        }
      } catch {
        /* offline or blocked - never reload on a failed probe */
      }
    };
    const onVis = () => { void check(); };
    document.addEventListener("visibilitychange", onVis);
    // Fallback ticker for tabs that stay visible for days on a
    // wall-mounted dispatch screen.
    const ticker = window.setInterval(() => { void check(); }, 15 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(ticker);
    };
  }, [router.pathname, router.asPath]);

  // Post-deploy stale-bundle recovery. After a new deploy the old JS
  // chunk files are removed; a tab still holding the previous build
  // throws "ChunkLoadError" / "Loading chunk N failed" on the next
  // client-side navigation and the page goes blank. Catch it once and
  // do a single hard reload to pull the fresh build (a sessionStorage
  // guard prevents a reload loop if the failure is something else).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const RELOAD_KEY = "__chunk_reload_at";
    const looksLikeChunkError = (msg: string) =>
      /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|Importing a module script failed/i.test(msg);
    const recover = (msg: string) => {
      if (!looksLikeChunkError(msg)) return;
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      // Don't reload more than once per 10s - avoids a loop when the
      // error is genuine (not a stale chunk).
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => recover(e?.message || "");
    const onRejection = (e: PromiseRejectionEvent) =>
      recover(String((e?.reason && (e.reason.message || e.reason)) || ""));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // On a marketing page, start downloading the app shell the moment a
  // visitor shows intent to leave for the app (hovering, focusing or
  // touching a link into it), and at the latest when that navigation
  // starts - so "Sign in" and friends render without waiting for it.
  const onMarketingPage = isMarketingPath(router.pathname);
  useEffect(() => {
    if (!onMarketingPage) return;
    const warm = () => { void loadProductShell().catch(() => {}); };
    const onIntent = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.origin !== window.location.origin || isMarketingPath(link.pathname)) return;
      warm();
    };
    const onRouteStart = (url: string) => {
      if (!isMarketingPath(url)) warm();
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("touchstart", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    router.events.on("routeChangeStart", onRouteStart);
    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("touchstart", onIntent);
      document.removeEventListener("focusin", onIntent);
      router.events.off("routeChangeStart", onRouteStart);
    };
  }, [onMarketingPage, router.events]);

  const page = <Component {...pageProps} />;
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <NoIndexMeta />
      <ThemeProvider>
        {onMarketingPage
          ? <MarketingShell>{page}</MarketingShell>
          : <ProductShell initialBranding={initialBranding}>{page}</ProductShell>}
      </ThemeProvider>
    </div>
  );
}
