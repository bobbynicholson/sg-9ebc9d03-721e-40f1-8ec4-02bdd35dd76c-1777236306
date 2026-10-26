import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Fraunces, Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantBrandingApplier } from "@/components/TenantBrandingApplier";
import { PortalTimeSync } from "@/components/PortalTimeSync";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { GlobalInternalFooter } from "@/components/GlobalInternalFooter";
import { AdminSetupSticky } from "@/components/admin/AdminSetupSticky";
import { PWAInstallPrompt } from "@/components/driver/PWAInstallPrompt";
import { PwaMetadata } from "@/components/pwa/PwaMetadata";
import { PwaRouteTransition } from "@/components/pwa/PwaRouteTransition";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { type PwaBranding, isCompanySlug } from "@/lib/pwa/metadata";
import { normalizeProductPath, isProductPath, pwaRouteInfo } from "@/lib/pwa/routes";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { LazyChatBot as ChatBot } from "@/components/chatbot/LazyChatBot";
import { useAuth } from "@/contexts/AuthContext";
import { indexChatPageSections, scrollToChatHash } from "@/lib/chatbot/sectionAnchors";
import "@/styles/globals.css";

const DeferredCommandPaletteChunk = dynamic(
  () => import("@/components/CommandPalette").then((module) => module.CommandPalette),
  { ssr: false, loading: () => null },
);

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

/**
 * The assistant belongs to the authenticated product shell, not to a short
 * list of hand-picked pages. A few legacy pages still mount their own
 * assistant; the DOM check keeps the transition from rendering two launchers
 * while those page-level mounts are gradually consolidated.
 */
function GlobalChatAssistant() {
  const router = useRouter();
  const { user } = useAuth();
  const [useGlobalAssistant, setUseGlobalAssistant] = useState(false);
  const path = (router.asPath || "").split(/[?#]/)[0].replace(/^\/[^/]+(?=\/(?:admin|team-portal|client-portal|account)(?:\/|$))/, "");
  const isProductRoute = ["/admin", "/team-portal", "/client-portal", "/account", "/super-admin"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  useEffect(() => {
    if (!user?.id || !isProductRoute || typeof document === "undefined") {
      setUseGlobalAssistant(false);
      return;
    }
    // Existing page-level instances are already committed by the time this
    // shell effect runs. If a future page adds one, the observer also catches
    // it before a second launcher is left behind.
    const sync = () => setUseGlobalAssistant(!document.querySelector("[data-chatbot-root]:not([data-chatbot-global])"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [user?.id, isProductRoute, path]);

  // Index semantic headings and marked business regions globally so legacy
  // product pages receive the same section-level navigation as newer pages
  // that mount PageWorkbench. Explicit data-chat-section refs remain the
  // stable names; ordinary headings receive deterministic local anchors.
  useEffect(() => {
    if (!isProductRoute || typeof document === "undefined") return;
    const syncSections = () => { indexChatPageSections(); };
    syncSections();
    const observer = new MutationObserver(syncSections);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isProductRoute, path]);

  // A hash can arrive before a tab/section has mounted during a client-side
  // navigation. Re-index and retry briefly so chatbot links land on the exact
  // page section even when the target is rendered asynchronously.
  useEffect(() => {
    if (!isProductRoute || typeof window === "undefined") return;
    let cancelled = false;
    let retryTimer: number | undefined;
    let attempts = 0;

    const clearRetry = () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    const syncAndScroll = () => {
      if (cancelled) return;
      indexChatPageSections();
      if (scrollToChatHash()) return;
      if (!window.location.hash || attempts >= 20) return;
      attempts += 1;
      retryTimer = window.setTimeout(syncAndScroll, 75);
    };
    const start = () => {
      clearRetry();
      attempts = 0;
      window.requestAnimationFrame(syncAndScroll);
    };

    start();
    router.events.on("routeChangeComplete", start);
    router.events.on("hashChangeComplete", start);
    window.addEventListener("hashchange", start);
    return () => {
      cancelled = true;
      clearRetry();
      router.events.off("routeChangeComplete", start);
      router.events.off("hashChangeComplete", start);
      window.removeEventListener("hashchange", start);
    };
  }, [isProductRoute, path, router]);

  if (!useGlobalAssistant || !user) return null;
  return <ChatBot global userRole={user.active_role || user.role} companyId={user.company_id || user.user_metadata?.company_id} />;
}

function GlobalPWAInstallPrompt({ initialBranding }: { initialBranding: InitialBranding | null }) {
  const router = useRouter();
  const { company } = useAuth();
  const liveBrand = useBrandingRow();
  const route = pwaRouteInfo(router.asPath || router.pathname || "");
  const querySlug = router.query.company_slug || (route.installPage ? router.query.company : undefined);
  // The URL is authoritative; a platform user can browse another tenant.
  const routeSlug = route.tenantSlug || (isCompanySlug(querySlug) ? querySlug : "");
  const platform = normalizeProductPath(router.asPath || "").startsWith("/admin/platform");
  const companyBrand: PwaBranding | null = company && (!routeSlug || company.slug === routeSlug) && !platform
    ? { id: company.id, slug: company.slug, companyName: company.company_name, logoUrl: company.logo_url, primaryColor: company.primary_color }
    : null;
  let branding: PwaBranding | null = initialBranding && (!routeSlug || initialBranding.slug === routeSlug) ? initialBranding : companyBrand;
  if (liveBrand && branding?.id === liveBrand.id) branding = { ...branding, ...liveBrand };
  if (routeSlug) branding = { ...branding, slug: routeSlug };
  if (!route.enabled) return null;
  return <>
    <PwaMetadata branding={branding} />
    {route.showPrompt && <PWAInstallPrompt appName={branding?.companyName || "CateringMS"} companySlug={branding?.slug} />}
  </>;
}

function DeferredCommandPalette() {
  const [enabled, setEnabled] = useState(false);
  const [initialOpen, setInitialOpen] = useState(false);
  const activatedRef = useRef(false);

  useEffect(() => {
    const activate = (open: boolean) => {
      if (activatedRef.current) return;
      activatedRef.current = true;
      setInitialOpen(open);
      setEnabled(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (activatedRef.current) return;
      const isMod = event.metaKey || event.ctrlKey;
      const isShortcut = isMod && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName);
      if (!isShortcut && !isSlash) return;
      event.preventDefault();
      activate(true);
    };
    const onCustomOpen = () => activate(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onCustomOpen as EventListener);
    // The palette is not needed for the first paint. Keep its existing
    // shortcuts available immediately, then load it after the page settles.
    const idleTimer = window.setTimeout(() => activate(false), 1200);
    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onCustomOpen as EventListener);
    };
  }, []);

  return enabled ? <DeferredCommandPaletteChunk initialOpen={initialOpen} /> : null;
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

  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <NoIndexMeta />
      <ThemeProvider>
        <AuthProvider>
          <TenantBrandingApplier initialBranding={initialBranding} />
          {/* Company time zone + 12/24-hour format for every page. */}
          <PortalTimeSync />
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
            <DeferredCommandPalette />
            <MiddlewareErrorToast />
            <GlobalChatAssistant />
            <GlobalPWAInstallPrompt initialBranding={initialBranding} />
            <PwaRouteTransition initialBranding={initialBranding} />
            <AdminSetupSticky />
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
