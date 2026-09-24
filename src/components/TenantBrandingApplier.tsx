/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Top-level branding applier. Mounted once from `_app.tsx`, owns the
 * fetch + DOM apply + cache lifecycle for the active tenant. Exposes
 * no UI - consumers read the row via `useBrandingRow()`.
 *
 * Tenant pre-auth pages (e.g. /[company_slug]/login) ship the right
 * branding via getStaticProps; `_app.tsx` forwards the resulting prop
 * here as `initialBranding` so the very first paint shows the tenant's
 * logo and palette instead of the CateringMS default.
 */
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  applyBrandingToDOM,
  loadBrandFonts,
  type BrandingRow,
} from "@/lib/branding/applyBranding";
import {
  getBrandingRow,
  readBrandingCache,
  setBrandingRow,
  writeBrandingCache,
} from "@/lib/branding/store";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

const initialToRow = (b: InitialBranding): BrandingRow => ({
  id: b.id,
  companyName: b.companyName || null,
  logoUrl: b.logoUrl,
  primaryColor: b.primaryColor,
  secondaryColor: b.secondaryColor,
  accentColor: b.accentColor,
  fontBody: b.fontBody ?? null,
  fontDisplay: b.fontDisplay ?? null,
});

// Apply both halves of the theme together: colour CSS vars (sync) +
// the Google Fonts <link> for the chosen families. Every call site uses
// this so fonts can never drift out of sync with colours.
const paint = (row: BrandingRow | null): void => {
  applyBrandingToDOM(row);
  loadBrandFonts(row);
};

interface Props {
  initialBranding?: InitialBranding | null;
}

export function TenantBrandingApplier({ initialBranding }: Props) {
  const router = useRouter();
  const { user } = useAuth() as any;
  const companyId: string | null = user?.company_id ?? null;
  const tenantSlug = getTenantSlugFromPathname(router.asPath);

  // Apply seeded branding from getStaticProps on first mount so SSR
  // markup matches the first client paint on tenant pre-auth pages.
  useEffect(() => {
    if (!initialBranding) return;
    const row = initialToRow(initialBranding);
    setBrandingRow(row);
    paint(row);
    // Run once - subsequent updates flow via auth/companyId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate cache + fetch fresh whenever the tenant context resolves.
  useEffect(() => {
    let cancelled = false;

    // A tenant slug in the URL is authoritative, especially for super-admin
    // tenant browsing where user.company_id can still point at the platform's
    // default company. Resolve that slug before falling back to the signed-in
    // user's company so a deep link never paints the wrong palette first.
    if (tenantSlug) {
      (async () => {
        const { data, error } = await (supabase.rpc as any)(
          "get_company_branding",
          { p_slug: tenantSlug },
        );
        if (cancelled) return;
        if (error) {
          console.warn(
            "[TenantBrandingApplier] slug branding fetch failed:",
            error,
          );
          return;
        }
        const r = (Array.isArray(data) ? data[0] : data) as Record<
          string,
          string | null | undefined
        > | null;
        if (!r?.id) return;
        const row: BrandingRow = {
          id: r.id,
          companyName: r.company_name ?? null,
          logoUrl: r.logo_url ?? null,
          primaryColor: r.primary_color ?? null,
          secondaryColor: r.secondary_color ?? null,
          accentColor: null,
          fontBody: null,
          fontDisplay: null,
        };
        setBrandingRow(row);
        paint(row);
        writeBrandingCache(row);
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!companyId) {
      // Clear a previous tenant's colours when a platform owner returns to
      // a global page. Preserve only the SSR-seeded branding used by public
      // tenant login pages before an authenticated company exists.
      const seededId = initialBranding?.id || null;
      const currentId = getBrandingRow()?.id || null;
      if (!initialBranding || currentId !== seededId || user) {
        setBrandingRow(null);
        paint(null);
      }
      return;
    }

    const cached = readBrandingCache(companyId);
    if (cached) {
      setBrandingRow(cached);
      paint(cached);
    }

    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, company_name, logo_url, primary_color, secondary_color, accent_color, brand_font_body, brand_font_display",
        )
        .eq("id", companyId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.warn("[TenantBrandingApplier] fetch failed:", error);
        if (!getBrandingRow()) paint(null);
        return;
      }

      const r = data as Record<string, string | null | undefined> | null;
      if (!r) return;

      const row: BrandingRow = {
        id: r.id ?? companyId,
        companyName: r.company_name ?? null,
        logoUrl: r.logo_url ?? null,
        primaryColor: r.primary_color ?? null,
        secondaryColor: r.secondary_color ?? null,
        accentColor: r.accent_color ?? null,
        fontBody: r.brand_font_body ?? null,
        fontDisplay: r.brand_font_display ?? null,
      };
      setBrandingRow(row);
      paint(row);
      writeBrandingCache(row);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, initialBranding, tenantSlug, user]);

  // Live re-paint hook. White-label admin dispatches `branding:updated`
  // after a successful save (or with `null` to reset) so the running
  // page reflects the new palette without a reload.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BrandingRow | null>).detail ?? null;
      setBrandingRow(detail);
      paint(detail);
      if (detail) writeBrandingCache(detail);
    };
    window.addEventListener("branding:updated", handler);
    return () => window.removeEventListener("branding:updated", handler);
  }, []);

  return null;
}
