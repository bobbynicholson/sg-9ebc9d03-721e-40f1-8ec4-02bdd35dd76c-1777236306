/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-tenant white-label branding.
 *
 * Source of truth: `companies` table columns
 *   - company_name -> organisation name shown to clients
 *   - logo_url     -> logo URL
 *   - primary_color, secondary_color, accent_color -> brand palette
 *
 * Cache: localStorage keyed by company_id. Read for instant first paint
 * before the database round-trip resolves; never read across tenants.
 *
 * Pre-auth tenant pages (e.g. /[company_slug]/login) ship the right
 * branding via getStaticProps -- _app.tsx forwards the resulting prop
 * to <BrandingProvider initialBranding={...}> so the very first paint
 * shows the tenant's logo and palette instead of the CateringMS default.
 * The marketing root and other unauth pages still fall back to
 * DEFAULT_BRANDING because they have no tenant context.
 */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhiteLabelBranding, BrandingContextType } from "@/types/whitelabel";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

const DEFAULT_BRANDING: WhiteLabelBranding = {
  id: "default",
  organizationName: "CateringMS",
  colors: {
    primary: "#2563eb",
    secondary: "#7c3aed",
    accent: "#f59e0b",
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const cacheKey = (companyId: string) => `cms.branding.${companyId}`;

// Convert "#f59e0b" / "#fff" -> "245 158 11". Returns null on bad input so
// the caller can fall back without poisoning the CSS variable.
const hexToRgbTriplet = (hex: string): string | null => {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
};

const applyBrandingToDOM = (b: WhiteLabelBranding) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Hex variables remain the source of truth for inline styles
  // (e.g. linear-gradient backgrounds in AdminNav).
  root.style.setProperty("--brand-primary", b.colors.primary);
  root.style.setProperty("--brand-secondary", b.colors.secondary);
  root.style.setProperty("--brand-accent", b.colors.accent);
  // RGB-triplet variants drive the Tailwind alpha-aware utilities
  // (bg-brand-primary/10, text-brand-secondary/80). Without these every
  // brand-* class would collapse to nothing once an alpha modifier is added.
  const primaryRgb   = hexToRgbTriplet(b.colors.primary)   ?? "37 99 235";
  const secondaryRgb = hexToRgbTriplet(b.colors.secondary) ?? "124 58 237";
  const accentRgb    = hexToRgbTriplet(b.colors.accent)    ?? "245 158 11";
  root.style.setProperty("--brand-primary-rgb", primaryRgb);
  root.style.setProperty("--brand-secondary-rgb", secondaryRgb);
  root.style.setProperty("--brand-accent-rgb", accentRgb);
};

const rowToBranding = (row: any): WhiteLabelBranding => ({
  id: row?.id || "default",
  organizationName: row?.company_name || DEFAULT_BRANDING.organizationName,
  logoUrl: row?.logo_url || undefined,
  colors: {
    primary: row?.primary_color || DEFAULT_BRANDING.colors.primary,
    secondary: row?.secondary_color || DEFAULT_BRANDING.colors.secondary,
    accent: row?.accent_color || DEFAULT_BRANDING.colors.accent,
  },
  createdAt: row?.created_at || new Date().toISOString(),
  updatedAt: row?.updated_at || new Date().toISOString(),
});

// Convert the SSG-fetched shape (InitialBranding from
// serverBrandingForSlug) to the context's WhiteLabelBranding so pre-auth
// pages can seed the provider before AuthContext resolves.
const initialToBranding = (b: InitialBranding): WhiteLabelBranding => {
  const now = new Date().toISOString();
  return {
    id: b.id,
    organizationName: b.companyName || DEFAULT_BRANDING.organizationName,
    logoUrl: b.logoUrl || undefined,
    colors: {
      primary: b.primaryColor || DEFAULT_BRANDING.colors.primary,
      secondary: b.secondaryColor || DEFAULT_BRANDING.colors.secondary,
      accent: b.accentColor || DEFAULT_BRANDING.colors.accent,
    },
    createdAt: now,
    updatedAt: now,
  };
};

interface BrandingProviderProps {
  children: ReactNode;
  /**
   * Optional seed from getStaticProps on tenant pre-auth pages. When
   * present we apply it synchronously on first render so the page
   * doesn't flash CateringMS defaults before auth resolves. Once the
   * user logs in and `useAuth().user.company_id` populates, the normal
   * auth-driven fetch takes over.
   */
  initialBranding?: InitialBranding | null;
}

export function BrandingProvider({ children, initialBranding }: BrandingProviderProps) {
  const { user } = useAuth() as any;
  const companyId: string | null = user?.company_id ?? null;

  // Seed synchronously so SSR markup matches the first client paint.
  // Falls back to null when there's no tenant context -- the auth-path
  // effect below resolves it to DEFAULT_BRANDING in that case.
  const seededBranding: WhiteLabelBranding | null = initialBranding
    ? initialToBranding(initialBranding)
    : null;

  const [branding, setBranding] = useState<WhiteLabelBranding | null>(seededBranding);
  const [loading, setLoading] = useState<boolean>(!seededBranding);
  const [saving, setSaving] = useState<boolean>(false);

  // Apply the SSG seed to the DOM on first client render. Inside an
  // effect because document doesn't exist during SSR.
  useEffect(() => {
    if (seededBranding) applyBrandingToDOM(seededBranding);
    // Run once per mount -- subsequent updates flow through setBranding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load branding when the user/company changes ─────────────────
  useEffect(() => {
    let cancelled = false;

    if (!companyId) {
      // No authenticated company. If the page seeded us via
      // initialBranding (tenant pre-auth pages) keep that paint and
      // don't reset to defaults. Otherwise it's a true unauth surface
      // (marketing, etc.) -- show defaults.
      if (seededBranding) {
        setLoading(false);
        return;
      }
      setBranding(DEFAULT_BRANDING);
      applyBrandingToDOM(DEFAULT_BRANDING);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fast path: hydrate from per-tenant localStorage cache before the
    // network call returns so first paint isn't a flash of defaults.
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(cacheKey(companyId));
        if (raw) {
          const cached = JSON.parse(raw) as WhiteLabelBranding;
          setBranding(cached);
          applyBrandingToDOM(cached);
        }
      } catch { /* noop */ }
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("id, company_name, logo_url, primary_color, secondary_color, accent_color, created_at, updated_at")
          .eq("id", companyId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.warn("[BrandingContext] fetch failed:", error);
          // Keep whatever we hydrated from cache; otherwise fall back.
          if (!branding) {
            setBranding(DEFAULT_BRANDING);
            applyBrandingToDOM(DEFAULT_BRANDING);
          }
          return;
        }

        const fresh = rowToBranding(data);
        setBranding(fresh);
        applyBrandingToDOM(fresh);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(cacheKey(companyId), JSON.stringify(fresh));
          } catch { /* quota; noop */ }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const persistCache = useCallback((b: WhiteLabelBranding) => {
    if (!companyId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(cacheKey(companyId), JSON.stringify(b));
    } catch { /* noop */ }
  }, [companyId]);

  // ── Save changes back to the companies table ────────────────────
  const updateBranding = useCallback(async (updates: Partial<WhiteLabelBranding>) => {
    if (!companyId) {
      console.warn("[BrandingContext] updateBranding called with no companyId; ignoring.");
      return;
    }
    setSaving(true);
    try {
      const merged: WhiteLabelBranding = {
        ...(branding ?? DEFAULT_BRANDING),
        ...updates,
        colors: {
          ...(branding?.colors ?? DEFAULT_BRANDING.colors),
          ...(updates.colors ?? {}),
        },
        updatedAt: new Date().toISOString(),
      };

      const dbPatch: Record<string, any> = {};
      if (updates.organizationName !== undefined) dbPatch.company_name = merged.organizationName;
      if (updates.logoUrl !== undefined)          dbPatch.logo_url = merged.logoUrl || null;
      if (updates.colors?.primary !== undefined)  dbPatch.primary_color = merged.colors.primary;
      if (updates.colors?.secondary !== undefined) dbPatch.secondary_color = merged.colors.secondary;
      if (updates.colors?.accent !== undefined)   dbPatch.accent_color = merged.colors.accent;

      if (Object.keys(dbPatch).length > 0) {
        const { error } = await supabase
          .from("companies")
          .update(dbPatch as any)
          .eq("id", companyId);
        if (error) throw error;
      }

      setBranding(merged);
      applyBrandingToDOM(merged);
      persistCache(merged);
    } finally {
      setSaving(false);
    }
  }, [companyId, branding, persistCache]);

  const resetBranding = useCallback(async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      // accent_color was added via a migration after the codebase's
      // generated Database types were regenerated, so the typed
      // .update() narrows it to never. Cast to any as the existing
      // path does.
      const { error } = await supabase
        .from("companies")
        .update({
          logo_url: null,
          primary_color: null,
          secondary_color: null,
          accent_color: null,
        } as any)
        .eq("id", companyId);
      if (error) throw error;

      setBranding(DEFAULT_BRANDING);
      applyBrandingToDOM(DEFAULT_BRANDING);
      if (typeof window !== "undefined") {
        try { window.localStorage.removeItem(cacheKey(companyId)); } catch { /* noop */ }
      }
    } finally {
      setSaving(false);
    }
  }, [companyId]);

  const isWhiteLabeled = !!branding
    && branding.id !== "default"
    && branding.organizationName !== DEFAULT_BRANDING.organizationName;

  return (
    <BrandingContext.Provider
      value={{
        branding,
        loading,
        saving,
        updateBranding,
        resetBranding,
        isWhiteLabeled,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}
