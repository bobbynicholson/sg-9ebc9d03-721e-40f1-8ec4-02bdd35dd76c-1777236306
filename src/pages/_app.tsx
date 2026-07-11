import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Fraunces, Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantBrandingApplier } from "@/components/TenantBrandingApplier";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalInternalFooter } from "@/components/GlobalInternalFooter";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import "@/styles/globals.css";

// Warm modern display serif for marketing headings (opt-in via Tailwind's
// `font-display`). Self-hosted by next/font - no external request, no layout
// shift. Exposed as the --font-display CSS variable on the wrapper below.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
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

  // Phase 3 #3: register the driver portal service worker. We only
  // register when the user is currently on a /team-portal/driver/*
  // path so the SW never gets installed in an admin or client tab.
  // The browser scopes the SW to /team-portal/driver/ via the
  // registration scope, so even after install the SW only intercepts
  // requests inside that subtree.
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!router.pathname.startsWith("/team-portal/driver")) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    // Stale-PWA recovery (Callum, 2026-07-09): the driver portal kept
    // running a bundle from BEFORE a deploy - skipWaiting/claim swap
    // the worker, but nothing reloads the already-open page, and an
    // installed PWA restored from the app switcher never re-navigates.
    // So a driver could sit on week-old JS and "fixed" bugs stayed
    // broken on their phone. Recovery has two halves:
    //   1. Re-check for a new SW aggressively: on registration, on
    //      every route change, and every time the app returns to the
    //      foreground (that's the moment a parked PWA wakes up).
    //   2. When a new SW takes control (controllerchange), hard-reload
    //      ONCE via the shared reloadForNewBuild guard so the open
    //      page swaps onto the fresh build.
    // controllerchange also fires on the very first SW install (page
    // previously uncontrolled, clients.claim adopts it). Only reload
    // when a controller got REPLACED - i.e. an old SW gave way to a
    // new build. Tracked as a mutable flag, not a snapshot: after the
    // first claim this page IS controlled, so a deploy landing later
    // in the same session must still trigger the reload.
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
      registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/team-portal/driver/",
        });
        if (cancelled) return;
        registration = reg;
        // Pull updates on each route change so the driver picks up
        // a deploy without having to fully close + reopen the tab.
        reg.update().catch(() => {});
      } catch (e) {
        console.warn("[sw] driver portal SW registration failed:", e);
      }
    };
    void register();
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router.pathname]);

  // Long-lived-tab deploy detection for ALL app portals (Callum,
  // 2026-07-09). The service worker path above only covers documents
  // inside its /team-portal/driver/ scope - but on prod the portals
  // are usually browsed via tenant-slugged URLs
  // (/spit-braai-delivery/team-portal/...), which the SW does NOT
  // control, and phones happily restore a week-old tab without any
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
    const APP_PREFIXES = ["/team-portal", "/admin", "/client-portal", "/c/"];
    if (!APP_PREFIXES.some((p) => router.pathname.startsWith(p))) return;
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
  }, [router.pathname]);

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

  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <NoIndexMeta />
      <ThemeProvider>
        <AuthProvider>
          <TenantBrandingApplier initialBranding={initialBranding} />
          <RegionFilterProvider>
            <AppErrorBoundary>
              <Component {...pageProps} />
            </AppErrorBoundary>
            {/* Wave 70.26 - slim internal footer mounted globally
                so every admin / team-portal / client-portal page
                shows it, branded to the active tenant. Self-hides
                on marketing routes; per-page <Footer /> components
                self-hide on internal routes so we never double up. */}
            <GlobalInternalFooter />
            <CommandPalette />
            <MiddlewareErrorToast />
            {/* VersionWatcher (the "A new version is available" banner)
                unmounted per Raj, 2026-06-12 - it nagged on every
                deploy during active development. Component + the
                /api/version endpoint remain; remount here if stale
                bundles become a support problem again. */}
            <Toaster />
          </RegionFilterProvider>
        </AuthProvider>
      </ThemeProvider>
    </div>
  );
}
