/**
 * GlobalInternalFooter -- Wave 70.26
 *
 * Mounted once at the app root via _app.tsx. Detects the current
 * route via useRouter and renders the slim footer ONLY on internal
 * surfaces (/admin, /team-portal, /client-portal, /c, /account,
 * /subscription, /auth). Marketing routes render nothing here --
 * those pages mount their own marketing Footer.
 *
 * Why this exists: previously each page had to import + render
 * <Footer />. 30+ admin / staff pages never did, so the slim
 * footer never appeared on them. Bobby's brief: the slim footer
 * must show on EVERY backend admin page for ALL users, branded
 * to their tenant. Mounting globally guarantees coverage; the
 * per-page Footer component returns null on internal routes so
 * we don't double-render where pages already mount it.
 *
 * Branding pull: useBrandingRow() returns the active tenant's
 * companyName so a Spit Braai Delivery user sees "© 2026 Spit
 * Braai Delivery" rather than "© 2026 CateringMS". Falls back to
 * the platform name when no tenant context is resolved (e.g. the
 * super_admin platform views).
 */
import { useRouter } from "next/router";
import { SlimInternalFooter, classifyFooterRoute } from "@/components/Footer";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { isWhiteLabelRow } from "@/lib/branding/applyBranding";

export function GlobalInternalFooter() {
  const router = useRouter();
  const branding = useBrandingRow();
  const variant = classifyFooterRoute(router?.pathname || "/");

  if (variant !== "internal") return null;

  const displayName = branding?.companyName || "CateringMS";
  const isWhiteLabeled = isWhiteLabelRow(branding);

  return <SlimInternalFooter displayName={displayName} isWhiteLabeled={isWhiteLabeled} />;
}
