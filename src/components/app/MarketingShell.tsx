import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/authContextCore";
import { useAfterIdle } from "@/hooks/useAfterIdle";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { MiddlewareErrorToast } from "@/components/MiddlewareErrorToast";
import { MarketingAuthProvider } from "./MarketingAuthProvider";
import { DeferredCommandPalette } from "./DeferredCommandPalette";

// None of these render anything until after hydration, so they load after
// the page instead of in its first bundle (the first two once it is idle).
const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((module) => module.Toaster),
  { ssr: false, loading: () => null },
);
const PwaRouteTransition = dynamic(
  () => import("@/components/pwa/PwaRouteTransition").then((module) => module.PwaRouteTransition),
  { ssr: false, loading: () => null },
);
const AdminSetupSticky = dynamic(
  () => import("@/components/admin/AdminSetupSticky").then((module) => module.AdminSetupSticky),
  { ssr: false, loading: () => null },
);

/** The setup checklist only ever shows for a signed-in company admin. */
function SignedInExtras() {
  const { user } = useAuth();
  return user ? <AdminSetupSticky /> : null;
}

/**
 * Toasts and the route-change splash are mounted once the page is idle.
 * A toast raised before then is kept by the toast store and appears as soon
 * as the toaster mounts.
 */
function IdleWidgets() {
  const ready = useAfterIdle();
  if (!ready) return null;
  return (
    <>
      <PwaRouteTransition />
      <Toaster />
    </>
  );
}

/**
 * Light shell for public marketing pages (home, features, pricing, blog,
 * contact, ...). Same visible behaviour as the full app shell on these
 * routes - the portal-only widgets there all hide themselves on marketing
 * pages - without the Supabase client or portal code in the first load.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <MarketingAuthProvider>
      <AppErrorBoundary>
        {children}
      </AppErrorBoundary>
      <DeferredCommandPalette />
      <MiddlewareErrorToast />
      <SignedInExtras />
      <IdleWidgets />
    </MarketingAuthProvider>
  );
}
