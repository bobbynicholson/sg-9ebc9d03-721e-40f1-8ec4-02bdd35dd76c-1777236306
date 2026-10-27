import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TenantBrandingApplier } from "@/components/TenantBrandingApplier";
import { PortalTimeSync } from "@/components/PortalTimeSync";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { RegionFilterProvider } from "@/contexts/RegionFilterContext";
import { Toaster } from "@/components/ui/toaster";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { GlobalInternalFooter } from "@/components/GlobalInternalFooter";
import { PwaMetadata } from "@/components/pwa/PwaMetadata";
import { PwaRouteTransition } from "@/components/pwa/PwaRouteTransition";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { type PwaBranding, isCompanySlug } from "@/lib/pwa/metadata";
import { normalizeProductPath, pwaRouteInfo } from "@/lib/pwa/routes";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { LazyChatBot as ChatBot } from "@/components/chatbot/LazyChatBot";
import { indexChatPageSections, scrollToChatHash } from "@/lib/chatbot/sectionAnchors";
import { DeferredCommandPalette } from "./DeferredCommandPalette";

// Both render nothing on the server and on the first client render (the
// install prompt starts dismissed; the setup sticky waits for auth), so
// loading them on demand keeps their code out of every page's bundle -
// public marketing pages included - without changing what anyone sees.
const PWAInstallPrompt = dynamic(
  () => import("@/components/driver/PWAInstallPrompt").then((module) => module.PWAInstallPrompt),
  { ssr: false, loading: () => null },
);
const AdminSetupSticky = dynamic(
  () => import("@/components/admin/AdminSetupSticky").then((module) => module.AdminSetupSticky),
  { ssr: false, loading: () => null },
);

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
    let scheduledFrame: number | undefined;
    const scheduleSync = () => {
      if (scheduledFrame !== undefined) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = undefined;
        syncSections();
      });
    };
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (scheduledFrame !== undefined) window.cancelAnimationFrame(scheduledFrame);
    };
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
  const liveBrandMatches = Boolean(liveBrand && !platform && (!routeSlug || liveBrand.slug === routeSlug) && (!branding?.id || branding.id === liveBrand.id));
  if (liveBrandMatches && liveBrand) {
    branding = { ...branding, ...liveBrand, slug: liveBrand.slug || branding?.slug || routeSlug };
  }
  if (routeSlug) branding = { ...branding, slug: routeSlug };
  if (!route.enabled) return null;
  return <>
    <PwaMetadata branding={branding} />
    {route.showPrompt && <PWAInstallPrompt appName={branding?.companyName || "CateringMS"} companySlug={branding?.slug} />}
  </>;
}

/**
 * The full app shell for every page that is not a public marketing page:
 * the real auth provider, tenant branding, company time zone, region filter,
 * internal footer, assistant, install prompt and toasts. Loaded as its own
 * chunk by _app (and still server-rendered), so marketing pages never ship it.
 */
export default function ProductShell({ children, initialBranding }: { children: ReactNode; initialBranding: InitialBranding | null }) {
  return (
      <AuthProvider>
        <TenantBrandingApplier initialBranding={initialBranding} />
        {/* Company time zone + 12/24-hour format for every page. */}
        <PortalTimeSync />
        <RegionFilterProvider>
          <AppErrorBoundary>
            {children}
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
  );
}
