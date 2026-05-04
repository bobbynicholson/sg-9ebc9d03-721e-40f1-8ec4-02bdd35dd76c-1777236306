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
 * Public/unauth pages (marketing, login screens) get DEFAULT_BRANDING
 * because no company is resolved yet. Theming for those surfaces would
 * need a slug-based server-side fetch, which is a separate task.
 */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhiteLabelBranding, BrandingContextType } from "@/types/whitelabel";

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

const applyBrandingToDOM = (b: WhiteLabelBranding) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", b.colors.primary);
  root.style.setProperty("--brand-secondary", b.colors.secondary);
  root.style.setProperty("--brand-accent", b.colors.accent);
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

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth() as any;
  const companyId: string | null = user?.company_id ?? null;

  const [branding, setBranding] = useState<WhiteLabelBranding | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // ── Load branding when the user/company changes ─────────────────
  useEffect(() => {
    let cancelled = false;

    if (!companyId) {
      // Unauth or pre-auth state — show defaults, don't touch storage.
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
      const { error } = await supabase
        .from("companies")
        .update({
          logo_url: null,
          primary_color: null,
          secondary_color: null,
          accent_color: null,
        })
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
